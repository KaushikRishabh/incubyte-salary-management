# How to understand this implementation

Start with `requirements.md` (the deliberately bounded product), then `architecture.md` (why these choices), `backend-code-guide.md` and `../frontend/README.md` (file-by-file explanations). Inline comments describe responsibilities and non-obvious constraints, not merely each line's syntax.

## Follow one salary edit
1. React owns the selected employee and form draft. The amount remains text, never a floating-point calculation. Currency determines permitted precision.
2. `EmployeeForm` validates immediate feedback and submits a version token plus a reason. While waiting, all editable fields and dismissal are disabled so the user cannot hide an unresolved write or confuse a newer draft with the submitted one.
3. `api.ts` sends same-origin JSON and translates HTTP/transport errors into readable failures. A 409 is not silently retried: close/reopen the refreshed record, then intentionally submit again.
4. FastAPI validates again. Domain conversion produces integer minor units. SQLite begins an immediate write transaction; the version, audit capacity, employee update and history insert succeed together or all roll back.
5. The request-scoped connection commits before a success response is sent. React refreshes the directory, options and totals, then shows the outcome. A canceled earlier read cannot overwrite a newer selection.

## Important distinctions
- Salary is annual gross base pay, not payroll, net pay or a payment operation.
- USD/EUR/GBP/INR store two decimal places; JPY stores whole yen. Aggregation never mixes currencies.
- An archive is reversible; an audit event is not edited. Employee IDs are immutable.
- CSV import creates only, validates every row, and commits atomically. Export is a filtered report, not a round-trip import template, and guards spreadsheet formula cells.
- Demo mode is global shared fictional state, not authentication or per-visitor isolation. Database caps persist; the one-process throttle does not. See `public-demo.md` before hosting.

## Configuration and generated files
`Dockerfile`, shell scripts, Python files, TypeScript/TSX, CSS, HTML and tests contain explanatory comments. Root ignore files exclude dependencies, state and secrets. Strict JSON manifests cannot safely contain comments, so their purpose is documented beside them in the frontend guide. The lockfile is generated dependency resolution, not hand-authored logic. The SVG/favicon and screenshots are visual assets; the PDF is the rendered requirements document. Test logs and benchmark JSON record actual runs rather than executable behavior.

## Suggested candidate walkthrough
Run the project and tests. Create one fictional employee; explain the string-to-minor-unit boundary. Open two editors and demonstrate the stale-write conflict. Explain why CSV validation and cap checks happen inside a transaction. Read a history event and trace currency-specific display. Finally explain SQLite/single-worker tradeoffs and the intentional absence of production authentication. Change anything you cannot defend before submitting. AI assistance must remain disclosed.
