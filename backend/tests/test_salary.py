import csv
import io
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.database import connect
from app.domain import minor_units, money
from app.main import create_app
from app.seed import seed
from app.service import FIELDS
from fastapi.testclient import TestClient


def employee(**changes):
    data = dict(
        employee_code="EMP-1",
        name="Ada Example",
        department="Engineering",
        job_title="Engineer",
        country="India",
        currency="INR",
        annual_salary="1200000.25",
        effective_date="2020-01-01",
        reason="Initial salary setup",
    )
    return {**data, **changes}


class MoneyTests(unittest.TestCase):
    def test_exact_decimal_round_trip(self):
        self.assertEqual(minor_units("0.29", "USD"), 29)
        self.assertEqual(money(29, "USD"), "0.29")

    def test_zero_decimal_currency(self):
        self.assertEqual(minor_units("100", "JPY"), 100)
        with self.assertRaises(ValueError):
            minor_units("100.5", "JPY")

    def test_invalid_money(self):
        for bad in [
            "0",
            "-1",
            "NaN",
            "Infinity",
            "1.001",
            "1000000001",
            "abc",
            "1e-1000000",
            "1.000000000000000000000000000001",
            "1_000",
        ]:
            with self.subTest(value=bad), self.assertRaises(ValueError):
                minor_units(bad, "USD")


class APITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / "test.sqlite3")
        self.client = TestClient(create_app(self.path))

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def create(self, **changes):
        response = self.client.post("/api/employees", json=employee(**changes))
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_create_and_persist(self):
        row = self.create()
        self.assertEqual(row["annual_salary"], "1200000.25")
        self.assertEqual(row["version"], 1)
        with TestClient(create_app(self.path)) as other:
            self.assertEqual(other.get("/api/employees").json()["total"], 1)

    def test_required_fields_and_unknown_fields(self):
        self.assertEqual(self.client.post("/api/employees", json={}).status_code, 422)
        self.assertEqual(
            self.client.post("/api/employees", json=employee(extra="x")).status_code, 422
        )

    def test_reject_empty_or_control_text(self):
        for name in [" ", "Bad\x00Name"]:
            self.assertEqual(
                self.client.post("/api/employees", json=employee(name=name)).status_code, 422
            )

    def test_reject_invalid_money_and_currency(self):
        for changes in [
            dict(annual_salary="NaN"),
            dict(annual_salary="0"),
            dict(currency="ZZZ"),
            dict(currency="JPY", annual_salary="1.25"),
        ]:
            self.assertEqual(
                self.client.post("/api/employees", json=employee(**changes)).status_code, 422
            )
        self.assertEqual(self.client.get("/api/employees").json()["total"], 0)

    def test_future_date_rejected(self):
        self.assertEqual(
            self.client.post(
                "/api/employees", json=employee(effective_date="2999-01-01")
            ).status_code,
            422,
        )

    def test_duplicate_code_case_insensitive(self):
        self.create()
        self.assertEqual(
            self.client.post("/api/employees", json=employee(employee_code="emp-1")).status_code,
            409,
        )

    def test_update_history(self):
        row = self.create()
        updated = self.client.put(
            f"/api/employees/{row['id']}",
            json=employee(annual_salary="1500000.55", reason="Annual review", version=1),
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["version"], 2)
        history = self.client.get(f"/api/employees/{row['id']}/history").json()["items"]
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["old_salary"], "1200000.25")
        self.assertEqual(history[0]["new_salary"], "1500000.55")
        self.assertEqual(history[0]["reason"], "Annual review")

    def test_stale_edit_does_not_overwrite(self):
        row = self.create()
        url = f"/api/employees/{row['id']}"
        self.client.put(url, json=employee(version=1, annual_salary="100"))
        self.assertEqual(
            self.client.put(url, json=employee(version=1, annual_salary="200")).status_code, 409
        )
        self.assertEqual(
            self.client.get("/api/employees").json()["items"][0]["annual_salary"], "100.00"
        )

    def test_parallel_updates_have_one_winner(self):
        row = self.create()

        def update(value):
            return self.client.put(
                f"/api/employees/{row['id']}", json=employee(version=1, annual_salary=value)
            ).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(update, ["100", "200"]))
        self.assertEqual(sorted(outcomes), [200, 409])

    def test_employee_code_immutable(self):
        row = self.create()
        self.assertEqual(
            self.client.put(
                f"/api/employees/{row['id']}", json=employee(version=1, employee_code="OTHER")
            ).status_code,
            422,
        )

    def test_effective_date_cannot_go_backwards(self):
        row = self.create()
        self.assertEqual(
            self.client.put(
                f"/api/employees/{row['id']}", json=employee(version=1, effective_date="2019-01-01")
            ).status_code,
            422,
        )

    def test_archive_restore_and_history(self):
        row = self.create()
        url = f"/api/employees/{row['id']}"
        self.assertEqual(
            self.client.post(
                url + "/archive", json={"version": 1, "reason": "Employee departed"}
            ).status_code,
            200,
        )
        self.assertEqual(self.client.get("/api/employees").json()["total"], 0)
        self.assertEqual(self.client.get("/api/employees?status=archived").json()["total"], 1)
        self.assertEqual(self.client.put(url, json=employee(version=2)).status_code, 409)
        self.assertEqual(
            self.client.post(
                url + "/restore", json={"version": 2, "reason": "Correcting archive"}
            ).status_code,
            200,
        )
        self.assertEqual(self.client.get("/api/employees").json()["total"], 1)
        self.assertEqual(len(self.client.get(url + "/history").json()["items"]), 3)

    def test_status_change_requires_current_version_and_reason(self):
        row = self.create()
        url = f"/api/employees/{row['id']}/archive"
        self.assertEqual(
            self.client.post(url, json={"version": 99, "reason": "Old edit"}).status_code, 409
        )
        self.assertEqual(self.client.post(url, json={"version": 1, "reason": ""}).status_code, 422)

    def test_missing_employee(self):
        self.assertEqual(self.client.get("/api/employees/999/history").status_code, 404)
        self.assertEqual(
            self.client.put("/api/employees/999", json=employee(version=1)).status_code, 404
        )

    def test_pagination_filters_search(self):
        seed(self.path, 50)
        first = self.client.get("/api/employees?page_size=7").json()
        second = self.client.get("/api/employees?page_size=7&page=2").json()
        self.assertEqual(first["total"], 50)
        self.assertEqual(len(first["items"]), 7)
        self.assertFalse({r["id"] for r in first["items"]} & {r["id"] for r in second["items"]})
        self.assertEqual(self.client.get("/api/employees?country=India").json()["total"], 10)
        self.assertEqual(self.client.get("/api/employees?q=DEMO-00001").json()["total"], 1)
        self.assertEqual(self.client.get("/api/employees?q=%25").json()["total"], 0)
        self.assertEqual(
            self.client.get("/api/employees", params={"country": "' OR 1=1--"}).json()["total"], 0
        )

    def test_query_validation(self):
        for query in ["page=0", "page_size=101", "status=unknown"]:
            self.assertEqual(self.client.get("/api/employees?" + query).status_code, 422)
        self.assertEqual(self.client.get("/api/analytics?group_by=salary_minor").status_code, 422)

    def test_analytics_exact_and_separate_currencies(self):
        self.create(currency="USD", annual_salary="0.29")
        self.create(employee_code="EMP-2", currency="USD", annual_salary="0.30")
        self.create(employee_code="EMP-3", currency="INR", annual_salary="100")
        result = self.client.get("/api/analytics").json()
        self.assertEqual(result["headcount"], 3)
        groups = {r["currency"]: r for r in result["groups"]}
        self.assertEqual(groups["USD"]["total_salary"], "0.59")
        self.assertEqual(groups["USD"]["average_salary"], "0.30")
        self.assertEqual(groups["USD"]["min_salary"], "0.29")
        self.assertEqual(groups["INR"]["total_salary"], "100.00")
        self.assertEqual(self.client.get("/api/analytics?currency=USD").json()["headcount"], 2)

    def test_analytics_group_by_department_preserves_currency(self):
        self.create(currency="USD", annual_salary="100")
        self.create(employee_code="EMP-2", currency="EUR", annual_salary="100")
        result = self.client.get("/api/analytics?group_by=department").json()
        self.assertEqual(len(result["groups"]), 2)
        self.assertEqual(result["groups"][0]["group"], "Engineering")

    def test_empty_analytics(self):
        self.assertEqual(self.client.get("/api/analytics").json(), {"groups": [], "headcount": 0})

    def csv_content(self, rows):
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
        return stream.getvalue()

    def test_atomic_import_success(self):
        content = self.csv_content([employee(), employee(employee_code="EMP-2")])
        response = self.client.post("/api/employees/import", json={"csv": content})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["created"], 2)

    def test_atomic_import_validation_rollback(self):
        content = self.csv_content(
            [employee(), employee(employee_code="EMP-2", annual_salary="bad")]
        )
        self.assertEqual(
            self.client.post("/api/employees/import", json={"csv": content}).status_code, 422
        )
        self.assertEqual(self.client.get("/api/employees").json()["total"], 0)

    def test_atomic_import_database_conflict_rollback(self):
        self.create()
        content = self.csv_content([employee(employee_code="EMP-2"), employee()])
        self.assertEqual(
            self.client.post("/api/employees/import", json={"csv": content}).status_code, 409
        )
        self.assertEqual(self.client.get("/api/employees").json()["total"], 1)
        with connect(self.path) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM salary_history").fetchone()[0], 1)

    def test_import_duplicate_and_header_validation(self):
        content = self.csv_content([employee(), employee(employee_code="emp-1")])
        self.assertEqual(
            self.client.post("/api/employees/import", json={"csv": content}).status_code, 422
        )
        self.assertEqual(
            self.client.post("/api/employees/import", json={"csv": "x,y\n1,2"}).status_code, 422
        )

    def test_export_filter_and_formula_safety(self):
        self.create(name="=SUM(A1:A2)")
        self.create(employee_code="EMP-2", country="Japan", currency="JPY", annual_salary="100")
        response = self.client.get("/api/employees/export.csv?country=India")
        self.assertEqual(response.status_code, 200)
        rows = list(csv.DictReader(io.StringIO(response.text)))
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["name"].startswith("'="))
        self.assertEqual(rows[0]["annual_salary"], "1200000.25")

    def test_seed_10000_idempotent(self):
        self.assertEqual(seed(self.path), 10000)
        self.assertEqual(seed(self.path), 0)
        self.assertEqual(self.client.get("/api/employees").json()["total"], 10000)
        self.assertEqual(self.client.get("/api/analytics").json()["headcount"], 10000)
        with connect(self.path) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM salary_history").fetchone()[0], 10000)

    def test_malformed_csv_header_is_client_error(self):
        for content in ['"employee_code,name\nanything', "x" * 131073]:
            response = self.client.post("/api/employees/import", json={"csv": content})
            self.assertEqual(response.status_code, 422, response.text)

    def test_out_of_range_identifiers_and_pages(self):
        for url in [
            "/api/employees?page=9223372036854775808",
            "/api/employees/9223372036854775808/history",
            "/api/employees/-1/history",
        ]:
            self.assertEqual(self.client.get(url).status_code, 422)

    def test_chunked_body_limit(self):
        raw = json.dumps(employee()).encode() + b" " * 5_100_001
        response = self.client.post(
            "/api/employees", headers={"content-type": "application/json"}, content=iter([raw])
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.client.get("/api/employees").json()["total"], 0)

    def test_options_and_health(self):
        self.create()
        self.assertEqual(self.client.get("/api/options").json()["countries"], ["India"])
        self.assertEqual(self.client.get("/api/health").json()["status"], "ok")
        self.assertEqual(self.client.get("/api/employees").headers["cache-control"], "no-store")


if __name__ == "__main__":
    unittest.main()
