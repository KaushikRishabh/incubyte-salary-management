# Verification record

Verification performed on 22 October 2026 using the assistant's cloud workspace. This records executed checks, not promised results.

## Backend latest review

The final backend rerun on 22 October 2026 is captured in [backend-test-log.txt](backend-test-log.txt), recorded at 07:10:25 UTC.

- Python unittest suite: **63 tests passed**, including the full 10,000-record seed, idempotence, request concurrency, CSV atomicity and 21 tests added during the comment-and-review pass.
- Coverage.py with branch measurement: **97% combined statement/branch coverage** over application modules. Database, demo policy, upload middleware and service modules each measured 100%. The remaining gaps include defensive money-conversion branches, frontend-serving paths and CLI entry points; this is not proof of all production behavior. CLI entry points were exercised separately by the live probes below, outside the coverage run.
- Ruff lint and formatting passed for `backend` and `scripts`; `bash -n scripts/run-local.sh` passed.
- Review reproduced and fixed huge Content-Length values causing a server error, missing archive/restore audit-text validation, and startup/seed connections not being explicitly closed. Upload buffering now coalesces chunks instead of retaining one message dictionary per chunk; throttle timestamps are read under the same lock as queue insertion.
- New regression checks also cover commit failure rolling back before a success response, exact money boundaries, JPY-to-USD audit formatting, strict version tokens, duplicate status transitions, malformed/empty/BOM CSVs, rejection of a 10,001-row import, body-boundary/disconnect behavior, safe early error headers and missing frontend builds.
- Every application module, class and function has explanatory documentation. Test descriptions state the invariant being checked. The [backend code guide](backend-code-guide.md) maps the implementation and explains its limits.
- The TestClient still emits a non-failing Starlette deprecation warning for httpx. The actual warning is preserved in the log rather than hidden.

### Scripted live HTTP and CLI checks

**14 additional probes passed** against an actual loopback Uvicorn server and CLI subprocesses, not TestClient. The probe used a disposable 10,000-employee SQLite database with `SALARY_DEMO_MODE=1` and the unmodified defaults: **10,500 employee rows, 12,000 history rows, 30 write attempts in a rolling 60-second window**. These checks did not use the lower-capacity manual-browser fixture.

The probes verified health/default limits, the 10,000-row baseline, built HTML delivery, exact whole-yen creation, invalid audit-text rejection, eight competing edits with exactly one HTTP 200 and seven HTTP 409 responses, JPY-to-USD history precision, archive/restore, formula-safe CSV response contents, invalid-batch rollback, current headcount, a **5,100,001-byte** upload returning HTTP 413, fresh reset creation, and reset refusal with an existing backup's hash unchanged. The temporary server was stopped after the checks.

These are scripted transport/CLI checks, not manual browser interaction, a persistent end-to-end suite or a production load test. Full output is in the backend test log; manual browser findings are recorded separately below.

### Earlier backend results retained as history

The earlier verification installed the pinned dependencies in a clean Python 3.12 virtual environment and reported **42 passing backend tests with 92% coverage**. Its independent review found and fixed malformed CSV-header errors, integer-overflow inputs and a streamed-body limit bypass. Earlier raw output remains in `backend-test-results.txt`. Those figures describe that earlier stage, not the final 63-test result above.

## Performance sample
`benchmark-results.json` was produced by `scripts/benchmark.py` with a temporary seeded 10,000-employee database. Each endpoint was requested 50 times through TestClient in the same process. These include framework/database work, but not public-network latency, distributed concurrency or browser rendering. They are local measurements, not production capacity guarantees.

## Frontend and end-to-end checks
- Current React/Vitest: 46 tests passed (27 additional regressions), for 109 automated tests combined with the 63 backend tests. These tests mock network responses; they are not browser end-to-end tests. See frontend-test-log.txt. The earlier 19-test result below is historical.
- Strict TypeScript and Vite production build passed. Prettier check passed. Production npm dependency audit reported zero known vulnerabilities at verification time, not a guarantee of security.
- Actual Chromium browser against the built React app and real FastAPI/SQLite server: initial 10,000 count; combined India/Engineering filter (400); pagination; search reset to page 1; create synthetic employee; edit INR 2,400,000.50 to INR 2,600,000.75; history; archive (active results 0) and restore; invalid CSV row 3 rejection; corrected one-row import succeeds; department analytics with currencies separated. The resulting count was 10,002 after two QA creations.
- Live browser testing discovered SQLite worker-thread affinity errors that initial isolated tests missed. Connections are now request-owned with thread-affinity checking disabled because FastAPI can resume a synchronous dependency on different pool workers. Added connection-thread and 30-concurrent-read regressions. The real browser then loaded and completed the workflows above.
- Screenshots in `screenshots/` are genuine browser captures. Video is a clearly labelled screenshot walkthrough, not live recording. See `demo-notes.md`.
- Second actual-browser review: stale edit/archive/restore conflicts and recovery; pending-write locks and native Escape; numerical/date boundaries; duplicate-ID correction; 401-row real download; formula-safe CSV; atomic default employee-cap rejection; isolated history-cap/throttle errors; keyboard focus; controlled backend outage/retry. Actual download artifacts were inspected in this pass. See manual-review.md for steps, fixture differences and limitations.
- No continuous browser automation suite or mobile-device run was executed. The original 10,002-row browser pass above is historical; this review left 10,005 fictional QA rows, not shipped.

## Delivery limitations
- Dockerfile is supplied but Docker is not installed in the verification environment, so its build/runtime was not executed.
- No remote repository was created, no hosted deployment was performed and no recruiter submission was sent.
- Production authentication, permissions, backups and security review are intentionally outside the synthetic demo scope. Do not load real employee data.
- Candidate personal review and ability to explain the solution remain required before submission.

## Earlier public-demo hardening verification
At that stage, eight additional backend regressions passed: concurrent create caps, history-cap rollback, oversized import rollback, rejected-attempt throttle and read availability, fake-clock throttle recovery and bounded memory, persisted caps after app restart, normal-mode/configuration behavior, and non-overwriting reset preparation. The historical total was 61 automated tests, comprising 42 backend and 19 frontend tests. Demo policy module coverage was 100%; overall application coverage was 92%. These historical counts are superseded by the latest results above. Full deployment and container verification remain pending.

Independent hardening review also executed: 80 concurrent creates at a seven-row cap (7 creates, 73 rejections); 20 concurrent two-row imports at a six-row cap (3 successes, 17 full rejections); 50 competing edits at an eight-history-row cap; spoofed-IP throttle contention; recovery; normal-mode acceptance of 140 rows; and hash-preserving reset. No mutation/cap bypass was found. The review clarified that early malformed/oversized Content-Length header rejections occur before the application throttle; documentation now states this accurately.
