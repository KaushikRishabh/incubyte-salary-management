# Bounded public-demo mode

This mode is **not production payroll security** and does not prevent hostile users from changing fictional records. Public launch still requires approval. No remote deployment has occurred.

## Enable and verify

Set `SALARY_DEMO_MODE=1` before starting the server. The supplied Dockerfile defaults to this safe demo mode and explicitly uses one worker. For local development, the default remains `0`; `PORT=8765 SALARY_DEMO_MODE=1 ./scripts/run-local.sh` starts the bounded version. Invalid mode values fail startup instead of silently disabling controls.

`GET /api/health` discloses `demo_limits_enabled` and the configured limits. A deployment is not ready if that field is false. Never put an unrestricted local-development server on a public interface.

Limits are fixed conservative demo defaults:
- 10,500 total employee rows, including archived employees. Starting with the required 10,000 seed leaves 500 new employees.
- 12,000 total history rows. Every successful create/edit/archive/restore consumes a history row, including imported employees. The baseline has 10,000 rows, leaving 2,000 successful changes.
- 30 mutation attempts per rolling 60 seconds across the entire application process. Application-validation failures count too. Invalid Content-Length and oversized declared-body headers are cheaply rejected by the outer safety-header check before this throttle, so those early rejects do not consume its quota. Spoofed forwarded IP headers cannot evade this global limit. Rejected attempts return HTTP429 with Retry-After; reads remain available.
- Existing request-byte, field-length, import-row, decimal and date bounds remain active.

Caps are checked after `BEGIN IMMEDIATE`, not in an unlocked preflight. Imports validate their entire batch and capacity before inserting. Capacity rejection is HTTP507 and no partial mutation is committed. Archived rows and historical rows are not silently purged to free capacity. The caps bound logical records, not an exact SQLite file-size quota; platform disk quotas and monitoring are still needed.

## Process and hosting constraints

Use one instance and one worker. The throttle is in process memory, so multiple processes multiply its budget. Restart clears its short-lived throttle window but does **not** erase the database or reset the persistent row caps. Do not rely on this application limiter as DDoS protection: TLS, edge request/read/concurrency limits and a storage quota belong at the host. A visitor can consume the shared write allowance, temporarily blocking other visitors. Restricted reviewer access is preferable when supported.

Use persistent SQLite storage, not an ephemeral deployment filesystem. All demo users share the same fictional database. No user isolation, authentication, actor identity, automatic reset or endpoint for remote reset is implemented. Do not enter real employee information, secrets or credentials.

## Safe operator-controlled reset

Do not delete or overwrite the old database. Stop the application so its database/WAL files are quiescent, then run from `backend/`:

```sh
SALARY_DEMO_MODE=1 ../.venv/bin/python -m app.reset_demo \
  --new-database /absolute/persistent/path/demo-reset-001.sqlite3 \
  --confirm-synthetic-only
```

Choose a new path that has never existed. The command refuses existing files and requires demo mode and the explicit synthetic-only flag. It creates a fresh deterministic 10,000-employee baseline. It never modifies the prior database. Keep the old database and any companion WAL/SHM files together as the recoverable previous state, then set `SALARY_DB` to the new path and restart with bounded mode and one worker. Verify health, initial count and a demo workflow. To recover the previous state, stop the server and point `SALARY_DB` back at the preserved database.

Repeated resets create retained database files, so the operator must manage backups and disk quota. No automatic deletion is performed. A failed preparation may leave a partial new file; use a different fresh path and investigate rather than overwriting it. Database paths are operator-selected local paths, never accepted from HTTP requests.

## Free disposable hosting

For the explicitly fictional, free assessment deployment, an ephemeral host can be used only with a clear reset/sleep warning. This is an exception to durable hosting, not a claim of persistence. See [free-demo-hosting.md](free-demo-hosting.md) for the Render configuration and exact limitations. Never use the disposable option for real data.
