# LedgerLine targeted audit and repair notes

Date: 10 November 2026  
Basis: uploaded `ledgerline(1).zip` and the repository's `LedgerLine_Requirements_v5.md`.

## Repairs made

1. **Simulated deposit UI**
   - Added a deposit screen for `ADMIN` and `DEMO_OPERATOR`.
   - Added an active-account selector for authorised funding operators.
   - Added an admin Funding Settings screen to enable/disable demo funding.
   - Customers do not receive a deposit link, and the backend still enforces role authorization.

2. **One authoritative demo-funding switch**
   - Deposit processing now checks `APP_ENV` (`DEMO` or `TEST`) and the database `DEMO_FUNDING_ENABLED` setting.
   - This fixes the mismatch where the admin settings page read the database setting but the deposit endpoint read a separate environment variable.
   - Production is rejected regardless of the stored setting.

3. **Duplicate account submissions**
   - Account creation now requires an `Idempotency-Key` and stores the result in the existing idempotency table.
   - A retry using the same key replays the original account instead of creating another.
   - The UI disables the create button while processing and reuses the same key after an uncertain network failure.
   - Different keys can still create multiple legitimate accounts, as required by BR-05.

4. **Financial form payload and amount handling**
   - Transfer/withdrawal forms now send only fields accepted by the strict backend schema. Previously, the UI also sent its `rupees` form-only field, which caused strict Zod validation to reject the request.
   - Rupees are converted to paise using decimal-string/`BigInt` arithmetic rather than floating-point multiplication.
   - The ₹1 minimum and ₹100-crore maximum are fixed server-side rather than being overrideable above/below the SRS limits through environment variables.
   - Transfer/withdrawal/deposit retries reuse an idempotency key for an unchanged request and prevent rapid double-submit.

5. **Financial idempotency race**
   - Added a unique-key race recovery path: when concurrent requests collide on the idempotency unique constraint, the losing request reloads and replays the committed result.
   - Same-key/different-payload conflicts are recorded as attempts outside the rolled-back transaction.

6. **Account lifecycle**
   - Closed accounts can no longer be reactivated through the status endpoint.
   - Account status/closure precondition failures now return explicit 404/409 responses rather than falling through to a generic 500.
   - Demo-funding setting changes and their audit records now commit together.

7. **Safe archive handling**
   - The repaired ZIP excludes `.env`, `node_modules`, generated build output and `.git`.
   - `.env.example` and lockfiles are retained. No uploaded secret values were read or copied into the repaired archive.

## Verification performed

- Backend TypeScript build: **passed** (`npm run build`).
- Frontend TypeScript project check: **passed** (`npx tsc -b --pretty false`).
- Full Vite bundle and Vitest suite could not be executed in this Linux review environment because the uploaded `node_modules` contained Windows-specific optional native binaries. This is an environment limitation, not a passing test result.
- No live Neon database integration/concurrency tests were run.
- No database migrations were added or applied by this repair.

## Remaining SRS work — do not claim full acceptance yet

The repository's own `IMPLEMENTATION_STATUS.md` identifies additional work that remains:

- Full API contract coverage, filters, pagination, error catalogue and OpenAPI schemas.
- Real-PostgreSQL integration tests for duplicate-key races, concurrent overspend, opposing transfers, rollback injection, trigger enforcement and reconciliation snapshots.
- Best-effort recording of validation/technical failures that occur before or during rollback.
- Complete reconciliation checks for system-account balances, mapping cardinalities, entry currency/reference integrity, expected operation patterns and missing/duplicate entries.
- PostgreSQL snapshot identifier/time capture and consistent snapshot verification.
- A complete CSRF strategy for cookie-authenticated refresh/logout routes.
- Remaining admin UI for user administration, account detail/closure workflows, reconciliation-run detail, attempt detail and CSV export where required.
- Per-route/per-principal rate limits, request-size controls, structured log redaction and production secret management.
- Separate migration/runtime database roles and verification that the runtime role cannot bypass ledger protections.
- Formal audited policy for every privileged admin read.
- Full suspicious-event review workflow and integration tests for the complete acceptance catalogue.

This is a targeted repair for the reported missing deposit, validation, and duplicate-account problems. It is not a production banking system and is not a declaration that every SRS requirement has passed acceptance testing.
