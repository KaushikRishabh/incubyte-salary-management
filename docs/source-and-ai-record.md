# Source and AI assistance record

## Assessment source
Read the authenticated email from Titiksha Singh at Incubyte, received 22 October 2026, and all three pages of the linked “Salary Management Assessment- Candidates.docx” in the normal read-only cloud Word viewer. The email's SPF, DKIM and DMARC checks passed. The Word viewer opened without signing in. A direct non-browser request returned an access error, so it was not used as the specification.

Verified requirements: salary management for 10,000 multinational employees, HR manager persona, requirements document before code, backend and UI, preferred role language, relational database, React/Next, seed script, functional deployment, video demo, agentic AI use, meaningful deterministic unit tests, incremental commits, approach artifacts and repository-link reply.

The brief deliberately leaves feature selection to the candidate. Requirements in requirements.md are explicit proposed scope, not quotations or hidden assumptions about payroll policy.

## Authorship and workflow
This implementation was generated and checked with OpenAI's coding assistant at the candidate's request. The assistant read the specification, proposed the product scope, and wrote implementation, tests and documentation. The candidate has not yet personally reviewed or explained this code. Do not claim that this was independently authored by the candidate or that their review has occurred.

The candidate should run the project, inspect the key decisions and test results, change anything they disagree with and be able to explain the code before submission. Commit history records actual increments, without backdating or fabricated intermediate work. No recruiter submission or remote publication is authorized by creating local code.

## Initial development instruction
Implement the actual Incubyte assessment on the assistant's computer after reading the authenticated specification; include runnable setup, tests, truthful AI-assistance records and an explanation. Do not invent personal authorship or test results, publish a remote repository, deploy paid services, create credentials or submit without approval.

## Decisions before code
Use SQLite for a small single-service demo, integer minor units for money, separate currency aggregates, optimistic row versions, transactional CSV import and reversible archive. No real employee data or external AI calls are needed.

## Development and review record
- Scope committed before implementation, then backend/domain tests, numerical hardening and setup docs, requirements PDF, CSV and input-bound fixes, streamed-body bounds, and React implementation with live integration fix. These are actual commits, not fabricated TDD history. Some tests were written alongside implementation rather than demonstrably red-first.
- Frontend development instruction: implement the documented React/TypeScript salary workspace against the established API; include filtering, pagination, edits, history, archive/restore, CSV workflows, accessibility, synthetic-data warnings and tests.
- Independent review instruction: exercise monetary boundaries, malformed requests, CSV atomicity, concurrent writes and input/resource limits; report reproducible defects rather than just style changes.
- Review found malformed CSV headers, SQLite integer overflows and a streamed body-limit bypass. Regression tests accompanied fixes. Browser integration then found a worker-thread lifecycle bug, which was fixed and retested rather than hidden.
- Exact final executed checks and limitations are in verification.md. No personal candidate review, remote deployment or final submission has been claimed.

## Post-delivery readiness hardening
After the first local artifact, added opt-in public-demo caps/throttles and a non-destructive operator reset preparer. The Dockerfile defaults to bounded mode. Added eight deterministic backend regressions and requested an independent adversarial review. This is a real subsequent increment, not a claim those safeguards existed in the earlier package. No deployment authorization was inferred.

## Candidate-requested explanatory review
The candidate subsequently requested: “I want u to go through the codebase and add comments explaining everything. Also review the code and test thoroughly again manually.” The assistant added purpose/invariant/transaction/state/error explanations across authored source and tests, with companion guides for strict JSON/generated files. Comments do not imply candidate authorship.

A separate backend/frontend review found and fixed huge Content-Length handling, invalid audit-reason controls, connection cleanup, upload-buffer overhead, concurrent throttle timestamp ordering, stale archive/restore retry state, canceled-response races, pending-form edits, detached-opener focus restoration, request-header preservation, unreadable JSON errors and malformed display amounts. Regression coverage grew from 61 to 109 automated tests. This is a genuine later review, not fabricated earlier history. Real browser verification is separately recorded in manual-review.md, including controlled fixture differences and remaining gaps.
