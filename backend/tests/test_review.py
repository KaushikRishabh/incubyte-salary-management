"""Regression coverage for boundary conditions found during the second code review.

These tests use disposable databases and in-process ASGI requests, not the local
demo dataset. Direct middleware probes make chunk boundaries and disconnects
deterministic instead of relying on a network server to reproduce them.
"""

import asyncio
import csv
import io
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from app.database import connect, initialize
from app.main import create_app
from app.middleware import BodySizeLimitMiddleware
from app.seed import seed
from app.service import FIELDS
from fastapi.testclient import TestClient
from test_salary import employee


class ReviewRegressionTests(unittest.TestCase):
    """Validate public error behavior and unchanged state after rejected writes."""

    def setUp(self):
        """Give each test its own disk database, preserving production data and test isolation."""
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / "review.sqlite3")
        self.client = TestClient(create_app(self.path))

    def tearDown(self):
        """Release test clients and temporary files after each independent scenario."""
        self.client.close()
        self.temp.cleanup()

    def test_status_reason_rejects_control_characters_without_mutating_history(self):
        """Archive/restore explanations must obey the same audit rules as edits."""
        created = self.client.post("/api/employees", json=employee()).json()
        base = f"/api/employees/{created['id']}"
        for reason in ["Bad\x00reason", "Bad\nreason", "Bad\treason"]:
            response = self.client.post(base + "/archive", json={"version": 1, "reason": reason})
            self.assertEqual(response.status_code, 422, response.text)
        rows = self.client.get("/api/employees").json()["items"]
        self.assertEqual(rows[0]["version"], 1)
        self.assertEqual(len(self.client.get(base + "/history").json()["items"]), 1)

    def test_extremely_large_content_length_is_413_not_server_error(self):
        """A numeric header must not trip Python's maximum integer-string length."""
        response = self.client.post(
            "/api/employees", json=employee(), headers={"Content-Length": "9" * 5000}
        )
        self.assertEqual(response.status_code, 413, response.text)
        self.assertEqual(self.client.get("/api/employees").json()["total"], 0)

    def test_invalid_content_lengths_are_client_errors(self):
        """Signed, fractional and nonnumeric header values are not byte lengths."""
        for value in ["-1", "+1", "1.0", "abc", ""]:
            response = self.client.post(
                "/api/employees", json=employee(), headers={"Content-Length": value}
            )
            self.assertEqual(response.status_code, 400, (value, response.text))

    def test_early_header_rejections_keep_security_and_no_cache_headers(self):
        """Rejecting before the route must not skip the outer response protections."""
        response = self.client.post("/api/employees", headers={"Content-Length": "invalid"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(response.headers["x-frame-options"], "DENY")
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_leading_zero_content_length_does_not_overflow(self):
        """Normalize leading zeros before comparing an otherwise small byte length."""
        response = self.client.get("/api/health", headers={"Content-Length": "0" * 5000})
        self.assertEqual(response.status_code, 200, response.text)

    def test_commit_failure_rolls_back_before_success_response(self):
        """Function-scoped dependency cleanup must finish before sending HTTP 201."""
        connection = connect(self.path)
        wrapped = Mock(wraps=connection)
        wrapped.commit.side_effect = sqlite3.OperationalError("private internal disk detail")
        with patch("app.main.connect", return_value=wrapped):
            response = self.client.post("/api/employees", json=employee())
        self.assertEqual(response.status_code, 503, response.text)
        self.assertNotIn("private internal", response.text)
        wrapped.rollback.assert_called_once()
        wrapped.close.assert_called_once()
        self.assertEqual(self.client.get("/api/employees").json()["total"], 0)

    def test_status_versions_are_strict_integers(self):
        """True, floats and strings must not impersonate an optimistic version token."""
        created = self.client.post("/api/employees", json=employee()).json()
        for version in [True, 1.0, "1", 0, -1]:
            response = self.client.post(
                f"/api/employees/{created['id']}/archive",
                json={"version": version, "reason": "Validation probe"},
            )
            self.assertEqual(response.status_code, 422, response.text)

    def test_duplicate_status_transition_is_conflict_without_new_history(self):
        """Retrying an already-applied archive is not a second successful event."""
        created = self.client.post("/api/employees", json=employee()).json()
        base = f"/api/employees/{created['id']}"
        self.assertEqual(
            self.client.post(
                base + "/archive", json={"version": 1, "reason": "Departure"}
            ).status_code,
            200,
        )
        repeated = self.client.post(
            base + "/archive", json={"version": 2, "reason": "Departure again"}
        )
        self.assertEqual(repeated.status_code, 409)
        self.assertEqual(self.client.get("/api/employees?status=all").json()["total"], 1)
        self.assertEqual(len(self.client.get(base + "/history").json()["items"]), 2)

    def test_currency_change_history_keeps_each_side_precision(self):
        """JPY integer units and USD cents must not be interpreted interchangeably."""
        created = self.client.post(
            "/api/employees", json=employee(currency="JPY", annual_salary="123")
        ).json()
        base = f"/api/employees/{created['id']}"
        edited = self.client.put(
            base, json=employee(version=1, currency="USD", annual_salary="1.23")
        )
        self.assertEqual(edited.status_code, 200, edited.text)
        event = self.client.get(base + "/history").json()["items"][0]
        self.assertEqual((event["old_currency"], event["old_salary"]), ("JPY", "123"))
        self.assertEqual((event["new_currency"], event["new_salary"]), ("USD", "1.23"))

    def test_csv_shape_and_empty_batch_are_422_and_atomic(self):
        """Missing/extra columns, malformed quoting and no rows are client errors."""
        header = ",".join(FIELDS) + "\n"
        for content in [header, header + "only,three,columns\n", header + '"unterminated']:
            response = self.client.post("/api/employees/import", json={"csv": content})
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.client.get("/api/employees").json()["total"], 0)

    def test_csv_utf8_bom_and_quoted_commas_are_supported(self):
        """Spreadsheet-style BOMs and quoted human labels preserve their contents."""
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerow(employee(name="Example, Ada"))
        response = self.client.post(
            "/api/employees/import", json={"csv": "\ufeff" + output.getvalue()}
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(
            self.client.get("/api/employees").json()["items"][0]["name"], "Example, Ada"
        )

    def test_import_row_limit_rejects_entire_batch(self):
        """The 10,001st row cannot leave the first 10,000 employees partially created."""
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(employee(employee_code=f"LIMIT-{i}") for i in range(10001))
        response = self.client.post("/api/employees/import", json={"csv": output.getvalue()})
        self.assertEqual(response.status_code, 422, response.text)
        self.assertIn("10,000", response.json()["detail"])
        self.assertEqual(self.client.get("/api/employees").json()["total"], 0)

    def test_frontend_missing_build_has_actionable_error(self):
        """A fresh checkout should return a useful 503 rather than an opaque failure."""
        with patch("app.main.Path.is_file", return_value=False):
            response = self.client.get("/")
        self.assertEqual(response.status_code, 503, response.text)
        self.assertIn("Frontend is not built", response.json()["detail"])

    def test_seed_rejects_out_of_scope_counts(self):
        """Operator tooling should not start a huge or empty seed by accident."""
        for count in [0, -1, 100001]:
            with self.assertRaises(ValueError):
                seed(self.path, count)

    def test_schema_initialization_closes_its_owned_connection(self):
        """A transaction context commits but does not itself close SQLite handles."""
        connection = connect(self.path)
        with patch("app.database.connect", return_value=connection):
            initialize(self.path)
        with self.assertRaises(sqlite3.ProgrammingError):
            connection.execute("SELECT 1")

    def test_seed_closes_its_owned_connection(self):
        """CLI/startup seeding must release its file handle after committing."""
        connection = connect(self.path)
        with patch("app.seed.connect", return_value=connection):
            self.assertEqual(seed(self.path, 1), 1)
        with self.assertRaises(sqlite3.ProgrammingError):
            connection.execute("SELECT 1")


class BodyBoundaryTests(unittest.TestCase):
    """Test the actual byte budget rather than trusting Content-Length metadata."""

    def run_middleware(self, incoming, *, limit=5, observe_disconnect=False):
        """Return downstream-observed chunks and response status for a tiny budget."""
        consumed, statuses = [], []
        queue = iter(incoming)

        async def receive():
            return next(queue, {"type": "http.disconnect"})

        async def send(message):
            if message["type"] == "http.response.start":
                statuses.append(message["status"])

        async def downstream(scope, receive, send):
            while True:
                message = await receive()
                consumed.append(message)
                if not message.get("more_body", False):
                    break
            if observe_disconnect:
                consumed.append(await receive())
            await send({"type": "http.response.start", "status": 204, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        middleware = BodySizeLimitMiddleware(downstream, max_bytes=limit)
        asyncio.run(middleware({"type": "http", "method": "POST"}, receive, send))
        return consumed, statuses

    def test_exact_byte_limit_replays_the_complete_body(self):
        """Splitting a valid request into tiny chunks must not change its contents."""
        chunks = [
            {"type": "http.request", "body": b"a", "more_body": True},
            {"type": "http.request", "body": b"bcde", "more_body": False},
        ]
        consumed, statuses = self.run_middleware(chunks)
        # Coalescing avoids retaining one dictionary per tiny network chunk.
        self.assertEqual(len(consumed), 1)
        self.assertEqual(b"".join(message["body"] for message in consumed), b"abcde")
        self.assertEqual(statuses, [204])

    def test_receive_after_replay_still_observes_disconnect(self):
        """The buffer must not hide the original ASGI disconnect notification."""
        consumed, statuses = self.run_middleware(
            [
                {"type": "http.request", "body": b"abc", "more_body": False},
                {"type": "http.disconnect"},
            ],
            observe_disconnect=True,
        )
        self.assertEqual(consumed[-1], {"type": "http.disconnect"})
        self.assertEqual(statuses, [204])

    def test_over_limit_chunks_never_reach_the_application(self):
        """Reject before parsing or writing any data, even if the last chunk spills."""
        consumed, statuses = self.run_middleware(
            [
                {"type": "http.request", "body": b"abc", "more_body": True},
                {"type": "http.request", "body": b"def", "more_body": False},
            ]
        )
        self.assertEqual(consumed, [])
        self.assertEqual(statuses, [413])

    def test_disconnect_abandons_incomplete_request(self):
        """A disconnected upload must not be treated as a complete, valid body."""
        consumed, statuses = self.run_middleware(
            [
                {"type": "http.request", "body": b"abc", "more_body": True},
                {"type": "http.disconnect"},
            ]
        )
        self.assertEqual(consumed, [])
        self.assertEqual(statuses, [])
