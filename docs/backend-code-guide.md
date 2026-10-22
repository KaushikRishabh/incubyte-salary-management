# Backend code guide

This guide helps the candidate trace the Python API, explain its design choices and identify its deliberate limits. Read it alongside the source comments and [verification record](verification.md). The project is an unauthenticated **fictional-data demonstrator**, not a production payroll system.

## Suggested reading order

1. `backend/app/domain.py`: what input is valid and how money is represented.
2. `backend/app/database.py`: the current-state and audit-history schema.
3. `backend/app/service.py`: business rules, SQL mutations and reports.
4. `backend/app/main.py`: HTTP routes, transactions and error responses.
5. `backend/app/middleware.py` and `demo.py`: upload and demo resource bounds.
6. `seed.py`, `reset_demo.py` and the tests: reproducible data, safe operations and evidence.

## Trace one salary edit

1. A PUT request supplies a complete employee payload and the version originally read by the editor.
2. The outer middleware validates Content-Length syntax and the size claim. The demo throttle, when enabled, reserves an attempt. The upload middleware independently counts the actual body bytes.
3. Pydantic validates shape, text bounds, supported currency, date and a strict integer version. Unknown properties are rejected.
4. The route obtains its own SQLite connection and executes `BEGIN IMMEDIATE`. This reserves the writer before inspecting capacity or existing state.
5. `update_employee` checks that the employee exists, is active, has the expected version, retains its employee code and does not move its effective date backwards. It converts the salary to integer minor units.
6. The service updates the employee, increments the version and appends history using the same transaction. It does not commit independently.
7. The function-scoped database dependency commits before a successful HTTP response is sent. On failure, it rolls back both employee and audit changes, then closes the connection.

A second editor holding the previous version receives HTTP 409 rather than overwriting the first editor. SQLite serializes writers; the version is still necessary because a request can arrive after an earlier edit has already committed.

## Module responsibilities

- **`domain.py`**: Pydantic input contracts and exact money conversion. Salaries enter as plain decimal strings, not JSON floats. USD/EUR/GBP/INR use two decimals; JPY uses none. Values must be positive and no greater than 1,000,000,000. Excess precision is rejected, not silently rounded. The shared text validator rejects low ASCII controls in profile fields and audit reasons.
- **`database.py`**: creates the version-1 schema and indexes, enables WAL, foreign keys and a 10-second busy timeout. `employees` stores current state; `salary_history` stores salary/event audit records. Employee codes are ASCII-only and case-insensitively unique. There is no schema-migration framework or delete endpoint.
- **`service.py`**: owns state-dependent rules, parameterized SQL, auditing, import/export and analytics. SQL identifiers come from fixed code/allowlists; user filter values are bound parameters. Search escapes LIKE wildcards so `%` and `_` are literal user input.
- **`main.py`**: assembles routes, validation dependencies, response headers, operational-error handling and the built React frontend. Importing `app.main` initializes its configured database schema. The factory accepts a different database path for isolated tests; importing `app` alone has no such side effect.
- **`middleware.py`**: buffers at most 5,100,000 actual request-body bytes for POST/PUT/PATCH, including chunked requests. A single coalesced buffer avoids retaining a dictionary for every tiny input chunk. An incomplete disconnected upload never reaches the route.
- **`demo.py`**: optional persisted row caps and a process-local rolling write-attempt window. Counts occur inside the writer reservation so simultaneous requests cannot spend the same capacity twice.
- **`seed.py`**: creates a deterministic baseline of 10,000 fictional employees by default. Existing codes are not overwritten and duplicate initial history is not added. Salary amounts and the 2026-01-01 baseline date are synthetic, not sourced employee information.
- **`reset_demo.py`**: creates a fresh baseline only at a new path, using exclusive file creation. Existing files and backups are never replaced. Operators must stop the server, change `SALARY_DB` and restart themselves. Failed preparation leaves the new file for inspection rather than deleting an old database.

## Money and reporting

The database stores minor units as integers: for example, USD `0.29` becomes `29`, while JPY `123` remains `123`. Decimal conversion returns fixed-precision strings. Integer SQL sums avoid floating-point accumulation; averages use Decimal and round half up only for display.

Reports always group by currency, even when the selected dimension is country or department. No exchange-rate model exists, so different currencies are never added into one monetary total. When a salary changes currency, history formats the old and new values using their own currency precision.

List, export and analytics share the same filter builder. A list's count and page are read within one transaction; different page requests can still see intervening changes. Export includes every filtered row rather than only the current page.

## CSV contract and atomicity

Import is create-only and requires the exact ordered header defined by `service.FIELDS`. It accepts a UTF-8 BOM, enforces at most 10,000 rows and validates all rows before insertion. A database conflict during insertion still rolls back the entire batch and its audit events.

CSV text is limited to 5,000,000 characters, while the complete encoded JSON request must fit the separate 5,100,000-byte body limit. Unicode and JSON escaping consume bytes, so the practical text capacity can be lower. Export is a human report with status/version, not an import template. Formula-like cells receive an apostrophe prefix to reduce spreadsheet-formula injection risk.

## Connections and concurrency

Each request owns one connection; connections are not shared across requests. FastAPI can resume synchronous dependency and endpoint work on different worker threads, so the SQLite connection disables same-thread checking. This permits thread handoff, not unrestricted concurrent use of one connection.

SQLite transaction contexts commit or roll back but do not close the handle. Initialization, seeding and request cleanup explicitly close their owned connections. The regression suite verifies both closure and commit-failure rollback before sending success.

## Limits and error responses

With `SALARY_DEMO_MODE=1`, defaults are 10,500 total employee rows, 12,000 history rows and 30 attempted writes per rolling 60 seconds. Archived employees still count; every successful create/edit/archive/restore consumes history. Imports must fit both remaining budgets. Restarting clears the process throttle but not stored row counts.

The throttle ignores spoofable proxy/IP headers and is global to one process. Validation failures and unknown write routes count; early malformed/oversized Content-Length rejections occur outside it. Denied throttle attempts are not retained. The intended topology is **one application worker**, not several independently throttled workers.

- HTTP 400: malformed Content-Length.
- HTTP 404: missing employee or unknown route.
- HTTP 409: duplicate code, stale version or conflicting employee state.
- HTTP 413: request body exceeds the byte budget.
- HTTP 422: invalid payload, date, salary or CSV.
- HTTP 429: demo write-attempt window is full, with a conservative Retry-After.
- HTTP 503: database operational failure or missing frontend build.
- HTTP 507: persisted demo capacity would be exceeded.

These bounds are not authentication, authorization, a DDoS defense or a guarantee against slow/simultaneous clients. Production data would require a different security and operational design.

## Scripts and configuration

- `scripts/run-local.sh`: fails on setup errors, creates/reuses `.venv`, installs runtime requirements, builds the frontend, seeds idempotently and starts Uvicorn on loopback. `PORT` overrides its default 8000. `exec` preserves shutdown-signal behavior.
- `scripts/benchmark.py`: measures 50 sequential TestClient requests per representative route against a temporary 10,000-row database. It reports median and nearest-rank p95, not a network or production-load guarantee. Importing `app.main` also initializes the configured default schema; benchmark employee seeding and samples use the temporary database.
- `Dockerfile`: builds React with Node in one stage, then copies its static assets into a Python image. Runs as a non-root account, enables demo mode and uses `/data/salary.sqlite3`; persist `/data` externally. Uses exactly one worker for the throttle. Docker build/runtime was not verified in this environment.
- `backend/requirements.txt`: pins direct runtime dependencies. `requirements-dev.txt` adds coverage and Ruff. Direct pins are not a complete transitive dependency lock.
- `pyproject.toml`: selects Python 3.12 Ruff rules, 100-character formatting and branch-aware coverage of `app`.
- `.dockerignore`: excludes Git metadata, local environments, Node modules, compiled assets/caches and local SQLite files from the build context. Docker generates its own frontend build.
- `.gitignore`: keeps local database files, dependencies, compiled output, `.env` and coverage artifacts out of version control. Ignore rules are not a substitute for reviewing packaged files.
- `SALARY_DB`: chooses the database path; use an absolute path for unambiguous operations. `SALARY_DEMO_MODE` accepts only `0` or `1`, with local development defaulting to `0`.

## What the tests demonstrate

`test_salary.py` exercises exact money, API validation, persistence, pagination, reports, CSV atomicity and real request-thread concurrency. `test_demo.py` uses tiny limits and a fake clock to verify capacity contention, throttle recovery and non-destructive reset. `test_review.py` captures the second review's boundary/resource regressions.

The final recorded run passed 63 tests at 97% combined statement/branch coverage. Fourteen separate real HTTP/CLI probes also passed using default demo limits. See [the raw log](backend-test-log.txt) for commands and output. Neither result means production readiness, complete coverage, Docker verification or that the candidate has personally reviewed the code.
