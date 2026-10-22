# Second real-browser review

22 October 2026, assistant-operated Chromium on the cloud computer. This is a record of actual UI interactions, not API tests described as manual testing. The production React build communicated with FastAPI/SQLite on loopback port 8765. All names, amounts and changes were fictional. No real employee information or external publication was used.

## Main workspace
- Opened a fresh tab after an expired tab, loaded the existing 10,002-row QA database and read `/api/health` in a second browser tab. Bounded mode reported the real defaults: 10,500 employees,12,000 history entries,30 global writes per 60 seconds.
- Two tabs edited the same record. The second saved INR 2,700,000.29; the stale editor attempted 2,800,000.99 and received the conflict message with a disabled save. Closing/reopening showed the winner's exact amount. No silent overwrite.
- Rejected zero, negative, excessive precision and exponent-form amounts. Rejected amounts above 1,000,000,000. JPY rejected fractional amounts. A future 2030 date was blocked by Chromium's native max-date validation (22 October 2026).
- A fully populated create form rejected duplicate employee codeQA-DEMO-001 without locking the form. Changing the code toMANUAL-JPY-001 created a JPY 100 employee successfully.
- Japan+Engineering filter returned 401 rows. Page size 10 yielded 41 pages; Next displayed page 2. An impossible search showed zero results and page 1 of 1.
- Clicked Export CSV and inspected the actual downloaded artifact, not just an API response: 401 matching rows despite page size 10, all Japan/Engineering/JPY, including the newly created whole-yen salary.
- Imported 498 rows while 10,003 existed, exceeding the real 10,500 cap by one. The UI displayed capacity reached. Searching the batch prefix returned zero: no partial import.
- Imported two valid rows after reopening: a name beginning with '=' at USD 0.29, and literal `<b>Manual Markup</b>` at USD 1.01. Both succeeded; markup rendered as text, amounts remained exact. The subsequent actual downloaded three-row filtered CSV prefixed the formula-looking name with an apostrophe. Main QA count became 10,005; this database is not packaged.

## Reviewed-code regression checks
Restarted the server and reloaded both tabs after the fixes/build; the following exercised the revised code.
- Two tabs opened archive confirmations. The winner archived; the stale tab received 409, disabled its action, then refreshed on close. The archived filter showed the latest row and a restore action.
- Repeated the race for restore: the winner restored; stale restore received 409 and the close/reopen guidance. After closing and returning to Active, a new archive succeeded, proving the refreshed version was used instead of an endless conflict loop. Restored the fictional example afterward.
- Visually inspected the edit form after switching its body to a disabled fieldset: labels, columns, amount and date remained aligned; the lower reason/actions are reached with the dialog's own scroll area.
- Native keyboard checks: backward Tab from the initial close control remained in the dialog, subsequent Tab returned to Close; Escape closed a non-busy dialog and restored focus to its edit opener. This is a limited desktop keyboard check, not a screen-reader audit.
- Deliberately stopped the local backend while the loaded UI searched. It showed “We couldn’t load the records” and Retry. Restarted the server and clicked Retry; it returned the expected empty-result state rather than remaining stuck in error.

## Isolated bounded-mode fixture
A separate local database/server on port 8766 started with 10 seed rows. It used the same production application and built UI, but deliberately lowered capacity to 12 employees/13 history entries and two writes per window. Temporary middleware delayed writes so the otherwise-fast pending state could be observed. Initial window 30 seconds/delay 5 seconds was later changed to 300 seconds/delay 2 seconds for an observable repeated-attempt test. These are test-fixture values, not shipped defaults; no fixture script or database is included in the package.

- A real two-row UI CSV import succeeded, giving 12 employees and 12 history entries. During its response delay, CSV contents/file choice, Cancel, Close and submit were visibly disabled.
- An edit succeeded with exact INR 1,800,080.29, giving the 13th history entry. A later archive displayed capacity reached; the employee remained active. This tests history exhaustion separately from headcount growth.
- Three subsequent archive attempts through the UI produced a visible “Synthetic demo write limit reached” message. Failed cap attempts count toward the global throttle. Reads remained usable while writes were limited.
- During a delayed edit, all fields, Cancel, Close and Save were disabled. Pressing native Escape did not dismiss the unresolved dialog. When the throttle response arrived, the fields were re-enabled; Escape then closed it and returned focus to the edit opener.

## What this does not prove
No mobile-device, Safari/Firefox, screen-reader, hosted-network or container run was performed. File imports used the visible paste-CSV workflow; OS file-picker import was not manually repeated. Some race/error cases are covered by deterministic component/backend tests rather than every possible browser interleaving. TestClient and jsdom are not browser end-to-end tests. There is no continuous browser automation suite. The supplied video remains explicitly a screenshot walkthrough, not a live screen recording. Candidate review and explanation are still required.

After the 300-second fixture window elapsed naturally, another UI archive returned the persistent capacity error rather than the throttle error. This verified window recovery without clearing the database; the history cap remained enforced.
