import asyncio
import csv
import io
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from app.database import connect
from app.demo import DemoLimits, DemoWriteThrottle, configured_limits
from app.main import create_app
from app.reset_demo import prepare_reset
from app.service import FIELDS
from fastapi.testclient import TestClient
from test_salary import employee


class DemoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / "demo.sqlite3")

    def tearDown(self):
        self.temp.cleanup()

    def client(self, **limits):
        return TestClient(create_app(self.path, demo_limits=DemoLimits(**limits)))

    def test_employee_cap_serializes_concurrent_creates(self):
        with self.client(employees=2) as client:
            with ThreadPoolExecutor(max_workers=8) as pool:
                codes = list(
                    pool.map(
                        lambda i: (
                            client.post(
                                "/api/employees", json=employee(employee_code=f"T-{i}")
                            ).status_code
                        ),
                        range(8),
                    )
                )
            self.assertEqual(codes.count(201), 2)
            self.assertEqual(codes.count(507), 6)
            self.assertEqual(client.get("/api/employees").json()["total"], 2)

    def test_history_cap_blocks_edits_and_status_atomically(self):
        with self.client(history=2) as client:
            record = client.post("/api/employees", json=employee()).json()
            self.assertEqual(
                client.put(
                    "/api/employees/1", json=employee(version=record["version"], annual_salary="2")
                ).status_code,
                200,
            )
            for endpoint in ["archive", "restore"]:
                self.assertEqual(
                    client.post(
                        "/api/employees/1/" + endpoint, json={"version": 2, "reason": "QA test"}
                    ).status_code,
                    507,
                )
            self.assertEqual(
                client.put("/api/employees/1", json=employee(version=2)).status_code, 507
            )
            self.assertEqual(
                client.get("/api/employees").json()["items"][0]["annual_salary"], "2.00"
            )
            self.assertEqual(len(client.get("/api/employees/1/history").json()["items"]), 2)

    def test_import_over_cap_has_no_partial_records(self):
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows([employee(employee_code=f"I-{i}") for i in range(3)])
        with self.client(employees=2) as client:
            self.assertEqual(
                client.post("/api/employees/import", json={"csv": out.getvalue()}).status_code, 507
            )
            self.assertEqual(client.get("/api/employees").json()["total"], 0)

    def test_throttle_counts_invalid_attempts_but_reads_work(self):
        with self.client(writes=2) as client:
            self.assertEqual(client.post("/api/employees", json={}).status_code, 422)
            self.assertEqual(client.post("/unknown").status_code, 404)
            result = client.post(
                "/api/employees", json=employee(), headers={"X-Forwarded-For": "different"}
            )
            self.assertEqual(result.status_code, 429)
            self.assertEqual(result.headers["retry-after"], "60")
            self.assertEqual(client.get("/api/health").status_code, 200)

    def test_throttle_window_recovers_without_sleep_and_memory_is_bounded(self):
        now = [0]
        statuses = []

        async def downstream(scope, receive, send):
            await send({"type": "http.response.start", "status": 204, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        gate = DemoWriteThrottle(downstream, DemoLimits(writes=2), clock=lambda: now[0])

        async def run():
            async def receive():
                return {"type": "http.request", "body": b""}

            async def send(message):
                if message["type"] == "http.response.start":
                    statuses.append(message["status"])

            for _ in range(100):
                await gate({"type": "http", "method": "POST"}, receive, send)
            self.assertEqual(len(gate.attempts), 2)
            now[0] = 60
            await gate({"type": "http", "method": "POST"}, receive, send)

        asyncio.run(run())
        self.assertEqual(statuses[:3], [204, 204, 429])
        self.assertEqual(statuses[-1], 204)

    def test_restart_does_not_reset_persisted_capacity(self):
        with self.client(employees=1) as client:
            client.post("/api/employees", json=employee())
        with self.client(employees=1) as client:
            self.assertEqual(
                client.post("/api/employees", json=employee(employee_code="NEW")).status_code, 507
            )

    def test_normal_mode_preserved_and_configuration_validated(self):
        with patch.dict(os.environ, {"SALARY_DEMO_MODE": "0"}):
            self.assertIsNone(configured_limits())
            with TestClient(create_app(self.path)) as client:
                self.assertFalse(client.get("/api/health").json()["demo_limits_enabled"])
                for _ in range(35):
                    self.assertEqual(client.post("/unknown").status_code, 404)
        with patch.dict(os.environ, {"SALARY_DEMO_MODE": "wrong"}), self.assertRaises(ValueError):
            configured_limits()
        with self.assertRaises(ValueError):
            DemoLimits(writes=0)

    def test_reset_creates_baseline_without_overwriting_backup(self):
        old = Path(self.temp.name) / "old.sqlite3"
        old.write_bytes(b"unchanged backup")
        new = Path(self.temp.name) / "new.sqlite3"
        with patch.dict(os.environ, {"SALARY_DEMO_MODE": "0"}), self.assertRaises(ValueError):
            prepare_reset(new)
        with patch.dict(os.environ, {"SALARY_DEMO_MODE": "1"}):
            self.assertEqual(prepare_reset(new), 10000)
            with self.assertRaises(FileExistsError):
                prepare_reset(old)
            with self.assertRaises(FileExistsError):
                prepare_reset(new)
        self.assertEqual(old.read_bytes(), b"unchanged backup")
        with connect(str(new)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM employees").fetchone()[0], 10000)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM salary_history").fetchone()[0], 10000)
