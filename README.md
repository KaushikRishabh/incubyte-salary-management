# ACME Salary Management

A Python + React salary-management demonstrator for the Incubyte engineering assessment. It maintains annual gross base salary records for 10,000 fictional employees, with exact monetary values, auditable changes and currency-separated reporting.

**Synthetic demo only. There is no user authentication or authorization. Do not enter real employee data, expose this to a private production network, or mistake it for a payroll system.**

## Quick start

Requirements: Python 3.12+, Node.js 22+ and npm. From the repository root:

```sh
./scripts/run-local.sh
```

Open http://127.0.0.1:8000. The script creates a local virtual environment, installs dependencies, builds the React app, creates the SQLite database and inserts 10,000 deterministic demo employees. Running it again does not duplicate or reset existing records. OpenAPI documentation is available at http://127.0.0.1:8000/docs.

For separate development servers:

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
cd backend
../.venv/bin/python -m app.seed
../.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` to port 8000. Set `SALARY_DB` to an absolute path to use a different SQLite database. The default is `backend/data/salary.sqlite3`.

## Main workflows

- Search employees by name or employee code; filter country, department, currency and status.
- Create employees and update their current salary with an effective date and explanation. Employee codes are immutable and case-insensitively unique.
- View change history. Concurrent edits require a refresh rather than overwriting newer work.
- Archive and restore employees without deleting their salary history.
- View headcount and salary totals, averages, minima and maxima separately for each currency. Group by country or department without mixing currencies.
- Import new employees atomically from a CSV template. Export a filtered, formula-safe report.

Money inputs are plain decimal strings, positive and no more than 1,000,000,000. USD, EUR, GBP and INR support two fractional digits; JPY supports none. Salary dates cannot be in the future or precede an employee's current effective date. Backdated changes update the current value immediately; there is no scheduled payroll engine.

## CSV format

Import is **create-only**, with these exact ordered columns:

```csv
employee_code,name,department,job_title,country,currency,annual_salary,effective_date,reason
EXAMPLE-001,Example Person,Engineering,Engineer,India,INR,1500000.00,2026-01-01,Initial migration
```

A maximum of 10,000 rows / 5 MB is accepted. Any invalid or duplicate row rejects the whole import, including its history writes. Export is a human-readable report with `status` and `version`, not a round-trip import file. Spreadsheet formula-like cells are escaped in exports.

## Verification

```sh
.venv/bin/ruff check backend
.venv/bin/ruff format --check backend
(cd backend && ../.venv/bin/python -m unittest discover -s tests -v)
(cd backend && ../.venv/bin/coverage run --rcfile=../pyproject.toml -m unittest discover -s tests && ../.venv/bin/coverage report --rcfile=../pyproject.toml)
(cd frontend && npm test && npm run build)
.venv/bin/python scripts/benchmark.py
```

See `docs/verification.md` for actual results and explicit unverified stages. Performance measurements are local in-process samples, not production SLAs.

## Container packaging

A multi-stage Dockerfile packages the built UI and Python API:

```sh
docker build -t acme-salary .
docker run --rm -p 127.0.0.1:8000:8000 -v acme-salary-data:/data acme-salary
```

Keep the database on a persistent volume. One service instance is the intended topology; SQLite is not a shared multi-instance database. Container packaging is not a deployed hosted service. See verification notes for whether the container build was actually executed.

## Engineering and assessment artifacts

- `docs/requirements.md`: scope written and committed before implementation.
- `docs/architecture.md`: design decisions, limits and alternatives.
- `docs/source-and-ai-record.md`: truthful assessment sourcing and AI assistance.
- `docs/walkthrough.md`: explanation and demo walkthrough for candidate review.
- `docs/verification.md`: checks actually run and remaining delivery gates.

The assistant generated and checked this implementation. The candidate must review it, make their own decisions and be prepared to explain the code. Remote repository publication, hosted deployment and the recruiter submission are separate approval-gated delivery steps, not implied by this local repository.

## Review artifacts

- `docs/requirements.pdf`: one-page scope (text committed before code).
- `docs/verification.md`: exact executed tests and known verification limits.
- `docs/source-and-ai-record.md`: honest AI assistance and review record.
- `docs/walkthrough.md`: explanation and live-demo script.
- `docs/screenshots/`: genuine captures from the running application.
- `docs/demo-notes.md`: screenshot video provenance and limitations.
- `docs/release-checklist.md`: remaining deployment and submission gates.

The delivery ZIP also contains a Git bundle preserving actual incremental commits and a labelled screenshot-walkthrough MP4. No real employee database is included; run the seed script.

For any future public demo, enable `SALARY_DEMO_MODE=1` and follow [the bounded-demo deployment and reset guide](docs/public-demo.md). Docker enables these caps by default; local development does not. No public launch is authorized by this configuration.
