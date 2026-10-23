# Free assessment demo deployment

This is a deployment plan until actual public URLs and verification results are recorded. The public app must run the real FastAPI/SQLite backend and built React frontend, not a static substitute.

## Render Free configuration

- Docker web service, repository root, `./Dockerfile`.
- Free compute only, one instance, one Uvicorn worker.
- `PORT=8000`, `SALARY_DEMO_MODE=1`, `SALARY_DB=/data/salary.sqlite3`.
- Health path `/api/health`; leave Docker Command empty so the image seeds before serving.
- No persistent disk, paid database, custom domain, payment method or paid build tier.
- Confirm account usage/billing before launch. Stop if a payment method or paid resource is required.

## Explicit disposable-data exception

The durable-storage advice in `public-demo.md` applies to a persistent deployment. Render Free has an ephemeral filesystem: fictional edits can disappear on idle spin-down, restart or redeploy. It sleeps after about 15 minutes without traffic and can take about a minute to wake. Startup recreates the 10,000-row baseline when no database remains. This is intentionally a disposable evaluation demo, not durable HR storage. Its SQLite transactions still protect concurrent operations within a running instance; they cannot make ephemeral host storage persistent.

All visitors share bounded fictional state. An operator can restart/reset the disposable demo when its capacity is exhausted, but this must never be described as preserving a production audit trail. No real employees or payroll data belong here. Production use would require persistent storage, authentication, authorization, backups and further review.

Render's free instance allowance is shared across the workspace. Check existing services before launching; do not claim unlimited availability or zero possible account-wide charges merely because this service selects Free.

## Release verification

Verify public health/default limits, the 10,000 seed, directory filters, an exact-money creation/edit, history, archive/restore and CSV behavior. Reload in a new tab to verify a saved write survives a request/page refresh. Separately disclose and, if authorized, test the host restart reset; never equate page-refresh survival with restart durability. Record actual outcomes and deployment commit SHA.

References checked 23 October 2026:
- https://render.com/docs/free
- https://render.com/docs/docker
- https://render.com/docs/web-services

The included [video](demo/screenshot-walkthrough.mp4) is explicitly a screenshot walkthrough of genuine local UI captures, not a continuous live recording. See `demo-notes.md` for provenance.
