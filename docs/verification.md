# Verification record

Verification performed on 22 October 2026 using the assistant's cloud workspace. This records executed checks, not promised results.

## Backend
- Clean Python 3.12 virtual environment: installed pinned runtime and development dependencies successfully.
- Python unittest suite: 34 tests passed, including a complete 10,000-record seed and idempotent second run.
- Coverage.py with branch measurement: 91% combined statement/branch coverage over application modules. This is not 100% coverage or proof of all production behavior.
- Ruff lint and formatting checks: passed for backend and benchmark script.
- Independent review confirmed exact monetary boundaries, overlapping import rollback and update/archive contention. It discovered malformed CSV-header errors, integer overflow inputs and a streamed-body limit bypass. All three were fixed, with regression tests; the original streamed exploit now returns 413 and creates no records. A small streamed request remains valid.
- FastAPI's current TestClient emits a non-failing Starlette deprecation warning for httpx. Tests still pass; this is recorded rather than hidden.

## Performance sample
`benchmark-results.json` was produced by `scripts/benchmark.py` with a temporary seeded 10,000-employee database. Each endpoint was requested 50 times through TestClient in the same process. These include framework/database work, but not public-network latency, distributed concurrency or browser rendering. They are local measurements, not production capacity guarantees.

## Frontend and end-to-end checks
- React/Vitest: 19 tests passed (14 UI flows and 5 formatting/API helpers). These tests mock network responses; they are not browser end-to-end tests.
- Strict TypeScript and Vite production build passed. Prettier check passed. Production npm dependency audit reported zero known vulnerabilities at verification time, not a guarantee of security.
- Actual Chromium browser against the built React app and real FastAPI/SQLite server: initial 10,000 count; combined India/Engineering filter (400); pagination; search reset to page 1; create synthetic employee; edit INR 2,400,000.50 to INR 2,600,000.75; history; archive (active results 0) and restore; invalid CSV row 3 rejection; corrected one-row import succeeds; department analytics with currencies separated. The resulting count was 10,002 after two QA creations.
- Live browser testing discovered SQLite worker-thread affinity errors that initial isolated tests missed. Connections are now request-owned with thread-affinity checking disabled because FastAPI can resume a synchronous dependency on different pool workers. Added connection-thread and 30-concurrent-read regressions. The real browser then loaded and completed the workflows above.
- Screenshots in `screenshots/` are genuine browser captures. Video is a clearly labelled screenshot walkthrough, not live recording. See `demo-notes.md`.
- No continuous browser automation suite or mobile-device run was executed. CSV export contents and formula escaping were API-tested; the browser file-download artifact was not inspected.

## Delivery limitations
- Dockerfile is supplied but Docker is not installed in the verification environment, so its build/runtime was not executed.
- No remote repository was created, no hosted deployment was performed and no recruiter submission was sent.
- Production authentication, permissions, backups and security review are intentionally outside the synthetic demo scope. Do not load real employee data.
- Candidate personal review and ability to explain the solution remain required before submission.
