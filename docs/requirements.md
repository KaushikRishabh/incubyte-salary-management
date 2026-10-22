# ACME salary management requirements

Written before implementation on 22 October 2026. This is the proposed product scope, not a claim of additional requirements from Incubyte.

## Goal and user
Give an HR manager a reliable alternative to spreadsheets for maintaining annual base salaries for 10,000 employees across countries and answering how ACME pays people. The assessment asks for an end-to-end application, a relational database, React UI, synthetic seed data, tests, incremental commits, deployment and a video demonstration.

## Scope and acceptance criteria
- Maintain employee identifier, name, department, job title, country, salary currency and annual gross base salary. Create and edit employees, and archive rather than destroy records. Required fields, supported currencies and positive monetary amounts are validated on the server.
- Search and filter active or archived employees by name/identifier, country, department and currency. Use server-side pagination with deterministic ordering; never send 10,000 rows just to render a page.
- Preserve salary change history with the previous and new values, effective date and change reason. Reject stale edits rather than silently overwrite another manager's changes. Current salary changes apply today or earlier; future-dated payroll scheduling is out of scope.
- Answer headcount, total, minimum, maximum and average annual base salary questions, grouped by currency and optionally country or department. Never add or compare different currencies as if equivalent. Label figures as annual base salary, not total compensation or payroll liability.
- Import validated CSV data atomically and export the current filtered dataset. Identify invalid rows before saving any of them; protect exported CSV cells against spreadsheet formula interpretation.
- Provide a deterministic, idempotent script creating 10,000 fictional employee records across countries and departments. All included data is synthetic. Unit and API tests cover validation, exact money handling, concurrency, history, import atomicity, filters and analytics.

## Deliberate exclusions and rationale
Payroll execution, taxes, benefits, bonuses, exchange-rate conversion and compensation fairness conclusions require business rules or external data not supplied in the brief. Multi-tenant administration, SSO and production identity management are excluded from this demonstrator; it is a single synthetic demo workspace and must not receive real employee data. No external AI service is embedded: AI is a development aid, not a substitute for exact salary arithmetic. Deletion is excluded in favour of reversible archiving and history. UI scope favours dependable salary workflows over elaborate visualization.

## Completion and open delivery items
Use Python/FastAPI, SQLite and React/TypeScript. Verify a fresh install, tests, build and real browser workflows against the seeded dataset. Record genuine development steps and AI assistance. Deployment, remote repository publication and sending the submission require separate user authorization. Deadline and expected time commitment have been requested from the recruiter; no deadline is invented.
