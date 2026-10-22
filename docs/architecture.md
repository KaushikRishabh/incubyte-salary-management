# Architecture and decisions

## System
The React/TypeScript browser client calls a FastAPI JSON API. In production-build mode the same Python service serves the compiled UI, avoiding a separate cross-origin API deployment. SQLite stores employees and their history in a local persistent file. The seed process generates only fictional records and needs no external service or credentials.

The code separates validation and exact monetary formatting (`domain.py`), connections and schema (`database.py`), transactional operations (`service.py`), HTTP routes (`main.py`) and deterministic generation (`seed.py`). This is a deliberately small modular monolith, not microservices.

## Money and comparability
Amounts are validated as plain decimal strings and stored in integer minor units. Binary floating-point is never used for persisted monetary values or server aggregates. JPY has zero decimal places; USD, GBP, EUR and INR have two. Averages use Decimal and half-up rounding at the display currency precision. Integer totals remain exact.

Reports always group by currency, even when the visible grouping is department or country. There is no sum across currencies. An exchange-rate conversion would need a rate provider, effective timestamp, source currency and a policy for historical restatements; none is fabricated.

## Integrity and audit
Each mutation starts `BEGIN IMMEDIATE`, validates the current row and writes employee state plus history in one transaction. The database dependency has function scope, so commit or rollback finishes before the HTTP response is sent. SQLite's foreign keys and check constraints back up application validation.

A monotonically increasing employee version rejects stale updates and archive/restore requests with HTTP 409. SQLite serializes writers; after acquiring the write transaction, the second editor sees the newer version. Readers use WAL mode. The list endpoint reads count and page in one transaction for a consistent response.

History retains old and new salary/currency, reason, effective date, event and UTC recording time. Profile changes and archive/restore also produce events. There is no verified human actor identity in this demo, because it has no authentication. Adding an arbitrary actor name would create misleading audit evidence. Production audit must bind each event to an authenticated principal and implement access control, retention and tamper protection.

Archive is reversible and excludes employees from the default active view and reports. No destructive delete endpoint is exposed. A date can be earlier than today, but cannot precede that employee's current effective date. Changes become current immediately; scheduled changes and historical as-of reports are deliberately absent.

## Import, export and security boundaries
CSV is bounded, parsed and validated before writes. Database conflicts also roll back the entire transaction. Import creates new employees only, avoiding accidental mass overwrite semantics. Export is a report rather than an import template; potentially executable spreadsheet cell prefixes are escaped.

SQL values are parameterized. The analytics grouping is mapped through a fixed allowlist. Search wildcard characters are escaped. API responses use no-store caching and basic defensive headers. The app never embeds an AI API key or sends salary data to an AI service.

This is a single synthetic-data workspace, not a production HR system. Authentication, role-based authorization, rate limits, encrypted backups, organizational policy, compliance review and hardened hosting are required before handling real salaries. Local startup binds to loopback. A public demonstration must use fictional data only and should be isolated/resettable. Shared demo users could change that dataset; it is not confidential or authoritative.

## Scale and trade-offs
Ten thousand employees fit comfortably in SQLite. Server pagination caps pages at 100 rows. Indexes support status/currency/country/department filters and stable name/id ordering. A contains search can scan rows; the benchmark records this cost honestly. SQLite simplifies setup and deployment but limits concurrent writers and multi-instance scaling. PostgreSQL and an appropriate full-text/search index would be reasonable next steps if measured load or deployment topology requires them.

The current schema has version 1 and startup creation for a fresh installation, not a migration framework. Existing production schema evolution would require explicit tested migrations. No asynchronous queue, cache or external service is added without a requirement for it.
