# Candidate review and demo guide

This guide explains AI-generated work. It does not claim that the candidate has reviewed it yet. Before submitting, run it, inspect the code and tests, challenge the decisions and be able to explain each workflow in your own words.

## Five-minute demonstration

1. Open the application and note the synthetic-data banner and 10,000 seeded employees. Explain that the product replaces spreadsheet maintenance of annual base salaries, not payroll execution.
2. Filter India and Engineering, then search an employee code. Show that pagination stays on the server. Explain why counts and the page use the same read transaction.
3. Create a fictional employee with an INR salary and a reason. Open the record, update salary with a new reason, then open its history. Show both values and dates.
4. Demonstrate stale-edit protection with two tabs on the same employee: save in the first, then try to save the older version in the second. Explain the 409 response instead of a silent lost update.
5. Archive and restore a record. Show how the default active report excludes archived employees without erasing history.
6. Compare the separate currency totals and group by department. Explain why adding INR and USD directly would be a misleading business answer.
7. Import the example CSV with a unique employee code. Try a second invalid CSV and verify that no partial rows are saved. Export a filtered report.
8. Show the tests and actual incremental commits. Explain how AI accelerated implementation, the checks used to challenge it and the limitations that remain.

## Questions to be ready for

- Why SQLite? It keeps a 10,000-record demo easy to run; a measured concurrency need or multi-instance deployment would justify PostgreSQL.
- Why integer minor units? It avoids binary floating-point errors. Decimal handles average rounding. Currency precision is explicit.
- Why not currency conversion? No exchange-rate policy or source was supplied; separate currencies are truthful and useful.
- What happens on concurrent changes? A transaction and expected row version reject stale writes. The user refreshes and reconciles rather than forcing an overwrite.
- Is history a production audit log? No. Without identity, permissions and tamper protection it records changes, not an authenticated chain of accountability.
- What did AI do? The assistant read the brief, wrote the proposed requirements, generated implementation and tests, and ran verification. Describe your subsequent review and changes only after you have actually made them.
- What would you improve first? Identity/access control and safe deployment for real data; then explicit migrations/backups and any business rules confirmed with HR. Do not add complexity only to impress.

## Submission gates

Review source and AI records, verify the final code, authorize a remote repository and hosting destination, record or approve a truthful demo, then approve the final recruiter reply with the actual repository and deployed links. The assessment expects a hosted application and video; local code alone is not a complete submission.
