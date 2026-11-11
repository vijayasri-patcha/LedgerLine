**# LedgerLine — End-to-End Application Flow**



**\*\*Document:\*\*** Developer Flow Specification  

**\*\*Aligned documents:\*\*** \`LedgerLine_Requirements_v5.md\` and \`LedgerLine_System_Design_v2.md\`  

**\*\*Version:\*\*** 1.0  

**\*\*Status:\*\*** MVP implementation flow  

**\*\*Purpose:\*\*** Describe the expected end-to-end behaviour across browser, API, business services, database, ledger, audit, and reconciliation.



**---**



**## 1. How to use this document**



This document describes the expected sequence of actions and system responses. It is not permission to weaken or replace an SRS rule. The SRS is the source of truth for exact field names, endpoint contracts, error codes, limits, permissions and acceptance criteria. The System Design defines module boundaries and technical decisions. When a detail is not specified in the SRS or System Design, mark it as an implementation decision and record it before coding rather than guessing.



**### 1.1 Global rules that apply to every flow**



1\. Browser → HTTPS frontend/API. Browser never accesses the database directly.

2\. The backend derives user ID and role from validated authentication/session state. Never trust client-supplied role, user ID, balance or ownership.

3\. All monetary values are exact integer paise. API amounts are base-10 integer strings. UI shows INR with two decimal places and Indian grouping.

4\. Minimum financial operation is ₹1 (100 paise); maximum is ₹100 crore (100,000,000,000 paise). Enforce on the backend.

5\. Only \`POSTED\` committed financial operations exist in \`transactions\`. Rejected/failed requests belong in \`transaction_attempts\`.

6\. Every financial write uses the shared posting service and requires an \`Idempotency-Key\`.

7\. Every successful posting updates all relevant balance projections and inserts all ledger entries in one PostgreSQL transaction.

8\. A posted transaction has at least two ledger entries and total debits equal total credits per currency.

9\. Posted ledger entries cannot be edited or deleted through application paths; database permissions/triggers also block mutation.

10\. All important security and admin events are audited. Never log passwords, access/refresh tokens, secrets or unnecessary personal data.

11\. Frontend validation is for usability. Backend and database enforcement are authoritative.

12\. Simulated deposits/withdrawals are demonstrations, not real cash or payment-rail movement.



**## 2. Application entry and routing flow**



\`\`\`mermaid

flowchart TD

  A[User opens LedgerLine] --> B{Has active session?}

  B -- No --> C[Public landing / Login / Register]

  B -- Yes --> D[Validate access token and session]

  D --> E{Session active and user enabled?}

  E -- No --> F[Clear local auth state; show login]

  E -- Yes --> G{Role}

  G -- CUSTOMER --> H[Customer dashboard]

  G -- ADMIN --> I[Admin dashboard]

  G -- DEMO_OPERATOR --> J[Demo operator permitted demo task UI]

\`\`\`



The browser may remember a non-sensitive UI preference, but it must not store raw refresh tokens in local storage. Protected API calls must be authorised again by the backend.



**## 3. Customer registration flow**



**\*\*Actor:\*\*** New customer  

**\*\*Entry:\*\*** Register screen  

**\*\*API:\*\*** \`POST /api/v1/auth/register\`



\`\`\`mermaid

sequenceDiagram

  actor Customer

  participant UI as React UI

  participant API as Express API

  participant Auth as Auth Service

  participant DB as PostgreSQL

  Customer->>UI: Enter profile, email, password

  UI->>API: POST register

  API->>Auth: Validate registration

  Auth->>Auth: Validate required fields and password length 12-128

  Auth->>Auth: Reject role/privilege fields; assign CUSTOMER

  Auth->>DB: Check/insert unique email and password hash

  DB-->>Auth: User created or unique conflict

  Auth->>DB: Write registration audit event

  Auth-->>API: Safe customer profile

  API-->>UI: Success response

  UI-->>Customer: Registration successful; prompt login

\`\`\`



**### Expected behaviour**



1\. Customer enters required profile details, email and password.

2\. Frontend performs basic format/required checks, without trimming/truncating the password.

3\. Backend validates all fields and password length 12–128 characters.

4\. Backend rejects any client-supplied role or privilege field. Successful public registration always assigns \`CUSTOMER\`.

5\. Backend normalises email according to the documented implementation policy, checks uniqueness, hashes the password and creates the user.

6\. Unique email constraint handles concurrent duplicate registrations; only one insert succeeds.

7\. Record the required audit event without storing password or hash in event metadata.

8\. Return a safe profile response, never password hash.

9\. UI shows success and directs customer to login.



**### Failure branches**



\- Missing/malformed fields → validation error; no user created.

\- Password shorter than 12 or longer than 128 → validation error; no user created.

\- Duplicate email → conflict response; no duplicate user.

\- \`role=ADMIN\` or \`role=DEMO_OPERATOR\` in request → reject privilege field; never elevate.

\- Database/technical failure → safe server error and correlation ID; no partial user record.



**## 4. Restricted administrator and demo-operator provisioning**



This is an operational deployment flow, not a public UI or public API.



**### Initial administrator bootstrap**



1\. Deployment operator supplies credentials through a secure environment/secret mechanism.

2\. Run the restricted one-time bootstrap command.

3\. Command checks whether an \`ADMIN\` already exists.

4\. If none exists, hash password, create exactly one ADMIN, and write bootstrap audit event in the same database transaction.

5\. If an ADMIN already exists, refuse rerun and do not change the existing identity.

6\. Never expose this command as a public endpoint or allow public registration to invoke it.



**### Demo operator provisioning**



1\. Authorised deployment operator invokes restricted seed/provision process.

2\. Process creates or revokes only a dedicated \`DEMO_OPERATOR\` identity according to the approved process.

3\. Record provisioning/revocation audit event.

4\. Demo operator cannot use customer account functions; use a separate CUSTOMER account for customer journey demonstrations.



**## 5. Login flow**



**\*\*Actor:\*\*** Customer, Admin, or Demo Operator  

**\*\*API:\*\*** \`POST /api/v1/auth/login\`



\`\`\`mermaid

sequenceDiagram

  actor User

  participant UI as React UI

  participant API as Express API

  participant Auth as Auth Service

  participant DB as PostgreSQL

  User->>UI: Enter email and password

  UI->>API: POST login

  API->>Auth: Authenticate

  Auth->>DB: Find user and status

  Auth->>Auth: Verify password hash

  Auth->>DB: Create session and refresh-token history

  Auth-->>API: 15-min access JWT + refresh cookie

  API-->>UI: Safe user profile and access token response

  UI-->>User: Route according to role

\`\`\`



**### Expected behaviour**



1\. User submits email/password over HTTPS.

2\. Backend finds user and verifies \`ACTIVE\` status.

3\. Verify password against stored hash.

4\. If invalid, return a generic authentication failure; do not reveal whether email exists. Record security-relevant failure safely.

5\. If valid, create \`user_sessions\` record and token-history record.

6\. Issue 15-minute access JWT containing user ID, role and session ID (\`sid\`). Issue seven-day opaque refresh token and store only its hash.

7\. Set refresh token using the SRS-approved secure cookie attributes. Do not store raw refresh token in local storage.

8\. Return safe user profile and access token according to the API contract.

9\. Frontend routes CUSTOMER to customer dashboard, ADMIN to admin dashboard, and DEMO_OPERATOR to permitted demo UI.



**### Failure branches**



\- Invalid credentials → generic 401-style response, no session.

\- Disabled user → deny access.

\- Database failure → no partially active session.

\- Rate limit exceeded → reject and provide safe retry guidance.



**## 6. Protected request and session validation flow**



For every protected API:



1\. Read access token from the approved client mechanism.

2\. Verify signature, algorithm, issuer/audience if configured, expiry and required claims.

3\. Extract user ID, role and \`sid\` from verified claims.

4\. Load session by \`sid\`; verify it belongs to user, \`revoked_at IS NULL\`, not expired, and user is ACTIVE.

5\. If invalid, reject request and frontend clears auth state/routes to login.

6\. If valid, attach trusted principal to request context.

7\. Apply endpoint role permission and resource ownership checks.



Do not treat a valid JWT signature alone as sufficient because logout must immediately invalidate the current access JWT.



**## 7. Refresh-token rotation flow**



**\*\*API:\*\*** \`POST /api/v1/auth/refresh\`



1\. Browser sends refresh cookie to refresh endpoint.

2\. Backend hashes/looks up presented token and validates session expiry/revocation and active user.

3\. Lock relevant session/token-history rows to prevent concurrent refresh races.

4\. If token is CURRENT and valid, mark it ROTATED, create a new opaque refresh token/hash, update session current hash and create history record in one DB transaction.

5\. Issue a new 15-minute access JWT and set the new refresh cookie.

6\. If the presented token is already ROTATED and reused before expiry, revoke the entire token family/session, record security audit event, clear cookie, and require login again.

7\. If expired, revoked, unknown or user disabled, reject and require login.



A concurrent refresh using the same old token must not create two valid refresh-token branches. Test this with multiple requests/connections.



**## 8. Logout flow**



**\*\*API:\*\*** \`POST /api/v1/auth/logout\`



1\. User selects Logout.

2\. Frontend calls logout with current access token and refresh cookie.

3\. Backend identifies session from verified \`sid\`.

4\. Revoke current session/token family and record reason \`LOGOUT\`.

5\. Write audit event.

6\. Clear refresh cookie in response.

7\. Frontend clears access token and all user-specific in-memory state, then routes to login.

8\. Any later request using the old access JWT fails because session is revoked, even if JWT expiry time has not passed.



If the session is already revoked/expired, logout should still clear the browser cookie and return the documented safe result.



**## 9. Customer account creation flow**



**\*\*Actor:\*\*** CUSTOMER  

**\*\*API:\*\*** \`POST /api/v1/accounts\`



1\. Customer opens Create Account.

2\. Frontend sends account creation request; never sends initial balance.

3\. Backend validates active session and CUSTOMER role.

4\. Backend derives owner user ID from authenticated principal.

5\. Generate \`LL\` + 12 random decimal digits using a cryptographically secure random generator.

6\. Begin database transaction; insert account with INR, zero \`balance_minor\`, ACTIVE status; insert exactly one mapped credit-normal \`CUSTOMER_BALANCE\` ledger account.

7\. Unique account-number constraint handles collisions; regenerate/retry up to five times, then fail safely.

8\. Deferred database constraint confirms exactly one mapping before commit.

9\. Write audit event and commit.

10\. Return account details including account holder name from associated user profile, subject to read permissions.

11\. UI shows account number, status and zero balance.



**### Failure branches**



\- Duplicate/collision retries exhausted → fail account creation; no orphan account or ledger account.

\- Ledger mapping insertion fails → rollback account row too.

\- Client tries to supply another owner or non-zero opening balance → reject/ignore only as explicitly defined by SRS; never trust client-supplied owner/balance.



**## 10. Account list, detail and balance flow**



**\*\*APIs:\*\*** \`GET /api/v1/accounts\`, \`GET /api/v1/accounts/:accountId\`, \`GET /api/v1/accounts/:accountId/balance\`



1\. Validate active session.

2\. CUSTOMER may query only owned accounts; ADMIN may read only the permitted admin investigation view defined in SRS. DEMO_OPERATOR has no customer account access.

3\. Backend loads account and associated profile to return \`accountHolderName\` where permitted.

4\. Balance endpoint returns exact integer paise string and INR currency; UI formats as \`₹x,xx,xxx.xx\` style Indian grouping.

5\. Balance projection is returned as the current customer account balance. It must agree with ledger-derived balance; reconciliation independently verifies it.

6\. Not found and not owned responses must not leak private account information; follow SRS error behaviour.



**## 11. Transfer flow — successful path**



**\*\*Actor:\*\*** CUSTOMER  

**\*\*API:\*\*** \`POST /api/v1/transfers\`  

**\*\*Required header:\*\*** \`Idempotency-Key\`



\`\`\`mermaid

sequenceDiagram

  actor A as Customer A

  participant UI as React UI

  participant API as Express API

  participant P as Posting Service

  participant DB as PostgreSQL

  A->>UI: Enter receiver, amount, description

  UI->>UI: Validate UX fields; generate one key for this logical transfer

  UI->>API: POST transfer + Idempotency-Key

  API->>P: Trusted principal + validated request

  P->>DB: Begin transaction; reserve idempotency key

  P->>DB: Lock sender and receiver rows in stable order

  P->>P: Re-check ownership, status, currency, amount, balance

  P->>DB: Insert transaction header

  P->>DB: Update sender and receiver projections

  P->>DB: Insert debit and credit ledger entries

  P->>DB: Store POSTED idempotency outcome, attempt and audit

  P->>DB: Commit (deferred integrity checks run)

  DB-->>P: Commit successful

  P-->>API: Posted transaction response

  API-->>UI: POSTED + transaction ID

  UI-->>A: Show success and updated balances/history

\`\`\`



**### Detailed steps**



1\. Customer selects an owned ACTIVE sender account, enters a different receiver account, amount and optional description.

2\. Frontend performs convenience validation and generates a cryptographically random idempotency key for this logical operation. Persist the key with the pending UI operation so a network retry reuses it. A genuinely new transfer gets a new key.

3\. Frontend sends transfer request with \`Idempotency-Key\`.

4\. Backend validates session, CUSTOMER role, JSON schema, amount string, currency and required fields. Derive actor ID from session.

5\. Backend canonicalises semantic request fields and computes request fingerprint.

6\. Begin PostgreSQL transaction and reserve \`(principal_id, operation, idempotency_key)\` with \`RESERVED\` outcome.

7\. Handle unique-key race by loading existing record and applying replay/conflict rules (Section 12).

8\. Lock sender and receiver account rows in deterministic order.

9\. Re-check sender ownership, sender/receiver difference, both account statuses ACTIVE, same currency INR, amount within ₹1–₹100 crore, and sender has sufficient balance.

10\. Insert one \`TRANSFER\` transaction header with POSTED status.

11\. Decrease sender projection and increase receiver projection.

12\. Insert two entries: sender customer ledger DEBIT; receiver customer ledger CREDIT. Both use same amount and INR.

13\. Set idempotency record to POSTED and link transaction ID. Persist POSTED attempt and required audit event in the same transaction.

14\. Service validates balanced entries and updated projections. Deferred database triggers independently enforce cross-row rules at commit.

15\. Commit. Only after commit return success.

16\. Frontend displays transaction ID, amount, receiver, timestamp and updated balances; posted history refreshes.



**### Failure branches**



\- Sender does not own account → reject; no financial posting.

\- Sender = receiver → reject; no posting.

\- Receiver not found/ineligible/frozen/closed → reject; no posting.

\- Sender frozen/closed → reject; no posting.

\- Insufficient funds → store deterministic REJECTED idempotency outcome and BUSINESS_REJECTED attempt; no transaction header or ledger entries.

\- Invalid amount/currency → validation rejection; no reservation if rejected before idempotency processing, according to SRS.

\- Over ₹100 crore → reject and record required high-value-limit security/audit event.

\- Technical error before commit → rollback all financial changes and reservation; record PROCESSING_ERROR best-effort separately.

\- Commit uncertain to client due network timeout → UI must not generate a new key; retry with same key to retrieve original result.



**## 12. Idempotency and retry flow**



**\*\*Applies to:\*\*** transfers, withdrawals, simulated deposits, and any other financial write designated by SRS.



\`\`\`mermaid

flowchart TD

  A[Financial request + key] --> B[Canonicalise request and fingerprint]

  B --> C[Reserve unique principal + operation + key]

  C --> D{Key already exists?}

  D -- No --> E[Continue posting pipeline]

  D -- Yes --> F{Fingerprint same?}

  F -- No --> G[Record IDEMPOTENCY_CONFLICT attempt; return conflict]

  F -- Yes --> H{Stored outcome}

  H -- POSTED --> I[Record replay attempt; return original transaction outcome]

  H -- REJECTED --> J[Record replay attempt; return original rejection]

\`\`\`



Rules:



1\. Key scope is authenticated principal + operation + key.

2\. Same key and same fingerprint returns original stored business outcome. Do not create a second transaction or ledger posting.

3\. Same key and different fingerprint returns idempotency payload mismatch conflict and records a conflict attempt.

4\. A deterministic business rejection after reservation (such as insufficient funds) is stored as REJECTED and replayed even if account state later changes.

5\. Authentication failures and malformed requests rejected before idempotency processing do not reserve a key.

6\. Technical failure before commit rolls back the reservation; same key can safely be retried.

7\. No committed RESERVED or IN_PROGRESS record is allowed.

8\. Store safe canonical response only; never secrets. A replay may include \`idempotentReplay: true\` and a new correlation ID while preserving original business outcome semantics.

9\. Retain idempotency outcome at least as long as related transaction/attempt history; no automatic expiry in MVP.

10\. Frontend must reuse the key for transport retries and create a new key only for a genuinely new user action.



**## 13. Transfer rejection and request-attempt history flow**



1\. Backend receives an authenticated financial request.

2\. If it reaches request-attempt processing, record safe request metadata: principal, operation, parseable source/destination IDs, amount/currency if parseable, fingerprint, correlation ID, outcome and reason code.

3\. For deterministic business rejection after reservation, store REJECTED idempotency outcome and attempt together in the financial DB transaction.

4\. For validation rejection before reservation, persist \`VALIDATION_REJECTED\` attempt best-effort in a separate transaction where SRS permits.

5\. For technical failure after rollback, persist \`PROCESSING_ERROR\` best-effort in a separate transaction; if DB unavailable, structured logs only.

6\. Customer can list/read only own attempts. Admin can search system-wide attempts.

7\. Attempt details must not be shown as another posted transaction. If attempt links to transaction, show link/reference but do not count it as another posting.



**## 14. Simulated deposit flow**



**\*\*Actor:\*\*** ADMIN or dedicated DEMO_OPERATOR only  

**\*\*API:\*\*** \`POST /api/v1/deposits\`  

**\*\*Required header:\*\*** \`Idempotency-Key\`



1\. Actor authenticates and backend confirms role is ADMIN or DEMO_OPERATOR.

2\. Backend checks actual deployed environment. If PRODUCTION, hard-deny regardless of database flag.

3\. Backend reads \`DEMO_FUNDING_ENABLED\`; require true. If false, deny.

4\. Validate target customer account, INR, ACTIVE status, amount range and idempotency key.

5\. Customer cannot call this successfully. Admin/demo operator does not gain ownership or customer transfer permissions from this role.

6\. Shared posting service reserves idempotency key and locks target account.

7\. Re-check environment, flag, role and target account status inside the protected operation path so stale UI/config cannot bypass backend rules.

8\. Insert DEPOSIT transaction header.

9\. Increase customer account projection.

10\. Insert balanced entries: \`DEMO_CASH_CLEARING\` DEBIT; customer ledger CREDIT.

11\. Store POSTED idempotency outcome, attempt and audit event atomically; commit.

12\. Return transaction ID and result. UI labels it clearly as a simulated/demo deposit.



**### Failure branches**



\- CUSTOMER role → 403; no funding.

\- PRODUCTION environment → denied even if flag is true.

\- Flag disabled → denied.

\- Target account frozen/closed → rejected.

\- Amount invalid/over limit → rejected and required audit event for over-limit.

\- Retry uses same key rules as Section 12.



**## 15. Demo-funding settings flow**



**\*\*Actor:\*\*** ADMIN only  

**\*\*APIs:\*\*** \`GET /api/v1/admin/settings/demo-funding\`, \`PATCH /api/v1/admin/settings/demo-funding\`



1\. Admin opens settings screen.

2\. Backend verifies ADMIN role.

3\. GET returns active environment and current flag state; UI displays both.

4\. Admin chooses enable/disable and enters a mandatory reason.

5\. Frontend sends PATCH with new state and reason.

6\. Backend validates ADMIN, reason, and environment. Enable is allowed only in DEMO/TEST. Production hard-denies.

7\. Update \`system_settings\` and write audit event in the same database transaction.

8\. Return updated state; UI refreshes.

9\. Existing requests must still be checked against backend environment and current flag at processing time. Hiding/showing a button is not security enforcement.



**## 16. Withdrawal flow**



**\*\*Actor:\*\*** CUSTOMER  

**\*\*API:\*\*** \`POST /api/v1/withdrawals\`  

**\*\*Required header:\*\*** \`Idempotency-Key\`



1\. Customer selects an owned ACTIVE account and enters amount.

2\. Frontend generates one key for this logical withdrawal and reuses it for retries.

3\. Backend validates session, CUSTOMER role, ownership, amount, INR and key.

4\. Shared posting service reserves idempotency record and locks account row.

5\. Re-check account ACTIVE and sufficient balance after lock.

6\. If insufficient, store REJECTED outcome + BUSINESS_REJECTED attempt; no transaction or ledger entry.

7\. If sufficient, insert WITHDRAWAL transaction header; decrease customer projection.

8\. Insert customer ledger DEBIT and \`DEMO_CASH_CLEARING\` CREDIT for same amount.

9\. Store POSTED outcome, attempt and audit event; deferred constraints verify balance; commit.

10\. Return POSTED; UI updates balance and history.

11\. Replay/conflict/technical-failure behaviour is exactly Section 12.



**## 17. Transaction history and detail flow**



**\*\*Customer APIs:\*\*** \`GET /api/v1/transactions\`, \`GET /api/v1/transactions/:transactionId\`.



1\. Customer opens history.

2\. Backend validates session and restricts results to transactions involving accounts the customer is authorised to view.

3\. Apply SRS-supported filters, sorting and pagination. Use stable ordering with a deterministic tie-breaker.

4\. Return only posted financial transaction records; do not merge attempts into this list.

5\. Customer selects a transaction; backend rechecks permission and returns permitted transaction details and accounting summary.

6\. UI displays operation type, amount, status POSTED, timestamp, description and relevant account references.



A transaction ID is not an authorisation token. Guessing or changing an ID must not expose another customer's record.



**## 18. Customer transaction-attempt history flow**



**\*\*Customer APIs:\*\*** \`GET /api/v1/transaction-attempts\`, \`GET /api/v1/transaction-attempts/:attemptId\`.



1\. Customer opens request history/attempts.

2\. Backend returns only that principal's permitted attempt records.

3\. Support the SRS filters and pagination.

4\. Show outcomes distinctly: POSTED, BUSINESS_REJECTED, IDEMPOTENT_REPLAY, IDEMPOTENCY_CONFLICT, VALIDATION_REJECTED, PROCESSING_ERROR.

5\. If an attempt links to a transaction, provide a link to that transaction. Do not count attempt as another transaction.

6\. Do not expose raw request body, tokens, secrets or another user's data.



**## 19. Admin monitoring flow**



**\*\*APIs:\*\*** \`GET /api/v1/admin/transactions\`, \`GET /api/v1/admin/transaction-attempts\`.



1\. Admin opens one monitoring screen.

2\. Backend checks ADMIN role.

3\. Frontend requests posted transactions and request attempts from separate endpoints.

4\. Render two visibly separate panels/tabs/sections on the same screen:

   - Posted transactions: only committed \`transactions\`.

   - Request attempts: \`transaction_attempts\`, including rejections/replays/conflicts/errors.

5\. Each panel has its own filters and pagination state. Apply SRS-supported search fields and date ranges.

6\. Use stable newest-first ordering and stable ID tie-breaker as specified.

7\. Attempt linked to posted transaction must not be displayed/count as a second transaction.

8\. Admin may open permitted record detail. Every admin investigation action requiring audit must be audited.

9\. Customer and DEMO_OPERATOR receive forbidden response from admin endpoints.



**## 20. Account freeze/unfreeze flow**



**\*\*Actor:\*\*** ADMIN  

**\*\*API:\*\*** \`PATCH /api/v1/admin/accounts/:accountId/status\`



1\. Admin opens account details and selects Freeze or Unfreeze.

2\. Backend checks ADMIN role and validates requested state transition.

3\. Begin transaction and lock account row using same lock strategy as financial posting.

4\. Re-check current state and transition legality.

5\. Set status FROZEN or ACTIVE; write audit event in same transaction; commit.

6\. Return updated account state.

7\. Frozen account cannot send or receive. Unfreeze restores ACTIVE state only; it does not change balance or ledger.

8\. If a posting holds the row lock first, status change waits; if status transition commits first, later posting sees frozen status and rejects. No race may allow a frozen account to post.



**## 21. Account closure flow**



**\*\*Actor:\*\*** ADMIN only  

**\*\*API:\*\*** \`POST /api/v1/admin/accounts/:accountId/close\`



1\. Admin selects Close Account, enters a mandatory reason (1–250 characters; no secrets/credentials), and confirms.

2\. Frontend sends \`{ "reason": "..." }\`; backend checks ADMIN role.

3\. Begin DB transaction and acquire account row lock consistent with posting lock order.

4\. Re-check account is ACTIVE or FROZEN; CLOSED cannot be reopened/closed again as a new transition.

5\. Confirm customer ledger-derived balance is zero.

6\. Confirm \`accounts.balance_minor\` is zero.

7\. Confirm no in-progress financial posting/operation exists for the account under the chosen DB transaction/locking design.

8\. If any precondition fails, reject with documented error and do not change status.

9\. If all pass, set CLOSED and write audit event including the supplied reason; commit.

10\. Account and historical ledger remain stored. Closed account cannot send or receive. Customer self-close endpoint is not provided.



**## 22. Audit-log flow**



Audit events are written for the SRS-defined successful and security-relevant failed actions, including authentication outcomes, financial requests, account status changes, reconciliation and admin actions.



For each event capture actor when known, action, resource type/reference, timestamp, outcome and correlation ID. Include only safe metadata. Never log passwords, access/refresh tokens, secrets, full credentials or unnecessary personal data.



\- For a successful financial posting, audit event is written in the same DB transaction as the posting.

\- For deterministic business rejection, write the required attempt/audit result as specified by SRS.

\- For technical failure after rollback, best-effort audit/attempt in a separate transaction; if DB is unavailable, structured application log.

\- Ordinary customer operations cannot update/delete audit records.

\- Admin audit listing is server-side ADMIN-only.



**## 23. Reconciliation flow**



**\*\*Actor:\*\*** ADMIN only  

**\*\*APIs:\*\*** \`POST /api/v1/admin/reconciliation\`, \`GET /api/v1/admin/reconciliation\`, \`GET /api/v1/admin/reconciliation/:runId\`



\`\`\`mermaid

sequenceDiagram

  actor Admin

  participant API as Express API

  participant R as Reconciliation Service

  participant DB as PostgreSQL

  Admin->>API: POST reconciliation

  API->>R: Authorised request

  R->>DB: Create RUNNING run; commit

  R->>DB: Begin REPEATABLE READ, READ ONLY snapshot

  R->>DB: Run every check in same snapshot

  DB-->>R: Counts and discrepancy results

  R->>DB: Commit read-only snapshot

  R->>DB: Persist discrepancies, counts, COMPLETED and audit

  R-->>API: Run ID and summary

  API-->>Admin: Result summary

\`\`\`



**### Detailed sequence**



1\. Admin requests reconciliation.

2\. Backend validates active session and ADMIN role. CUSTOMER and DEMO_OPERATOR are denied.

3\. Create \`reconciliation_runs\` row with RUNNING status in a short write transaction and commit.

4\. Open one PostgreSQL \`REPEATABLE READ, READ ONLY\` transaction. Capture \`snapshot_started_at\` and consistency mode \`POSTGRES_REPEATABLE_READ_READ_ONLY\`.

5\. Execute all checks inside this same snapshot:

   - Every posted transaction has at least two entries.

   - Debit total equals credit total per posted transaction and currency.

   - Every customer account projection equals its customer ledger credits minus debits.

   - Every ledger account is included, including disabled accounts and \`DEMO_CASH_CLEARING\`.

   - Calculate normal-side balance for each system account; report unexpected negative/policy breaches.

   - Whole-ledger trial balance: total debits equal total credits per currency/scope.

   - Transfer/deposit/withdrawal entry patterns are correct.

   - Detect missing/duplicate entry lines.

   - Check references and currency consistency.

   - Check exactly one customer ledger mapping per customer account.

6\. Commit the read-only snapshot after all checks are calculated.

7\. In a separate write transaction, persist discrepancy rows, counts, status COMPLETED, completed timestamp and audit event.

8\. If run fails and DB is available, set FAILED, completion time and safe failure code. Do not leave a final run indefinitely RUNNING. Recovery process marks stale RUNNING records FAILED after crash according to bounded recovery policy.

9\. Return run ID, status, scope, currency, snapshot time, consistency mode, customer/system ledger account counts, transaction count, discrepancy count and summary.

10\. Admin can list past runs with status/date filters, pagination and stable newest-first ordering; select a run to fetch persisted detail/discrepancies.

11\. Reconciliation reports; it does not automatically repair or mutate ledger/account balances.

12\. The result represents the captured snapshot, not necessarily the latest database state when viewed later.



**## 24. Admin audit and settings screen flow**



Admin navigation includes:

\- Dashboard overview.

\- Monitoring (posted transactions + attempts in separate panels).

\- Accounts (freeze, unfreeze, close).

\- Audit logs.

\- Reconciliation history and run details.

\- Demo-funding settings (environment, flag state, mandatory reason for update).



Each admin API must independently enforce ADMIN role. Hiding navigation items is not sufficient.



**## 25. Error, timeout and retry UX**



1\. Validation errors are shown next to fields using safe API messages/error codes.

2\. Business rejection such as insufficient funds is shown as a completed rejected attempt, not a posted transaction.

3\. Idempotency mismatch is shown as a conflict; user must create a new logical operation/key if they intend a genuinely new request.

4\. If network times out after a financial POST, display outcome as unknown/pending confirmation—not failed. Retry the same payload with the same idempotency key or refresh attempt/history to resolve.

5\. Technical errors show correlation ID and safe retry guidance. The backend has rolled back before retry is offered; if commit outcome is uncertain, same-key retry resolves it.

6\. 401/session revoked routes to login after clearing user state. 403 shows permission denial. 404/validation/conflict/limit errors follow SRS error contract.

7\. Never automatically retry a financial request with a newly generated key.



**## 26. End-to-end acceptance journeys**



These journeys should be executable in a clean deployed/test environment and mapped to SRS test IDs.



**### Journey A — Normal transfer**

1\. Create Customer A and B.

2\. Create accounts; both start ₹0.

3\. Authorised demo operator/admin enables demo funding in DEMO/TEST with reason.

4\. Fund A ₹10,000 and B ₹5,000 through simulated deposits.

5\. A transfers ₹2,000 to B.

6\. Verify A ₹8,000, B ₹7,000; one POSTED transaction; two balanced ledger entries.



**### Journey B — Same request retry**

1\. Submit transfer with key K and payload P.

2\. Retry exact P with K.

3\. Both responses refer to same original business outcome/transaction ID.

4\. Verify only one posting and one balance change; retry attempt is separately visible.



**### Journey C — Same key, changed payload**

1\. Submit transfer with K and payload P.

2\. Reuse K with changed amount/receiver.

3\. Receive idempotency conflict.

4\. Verify no second transaction or ledger posting; conflict attempt exists.



**### Journey D — Rejected outcome replay**

1\. Attempt withdrawal with insufficient balance using K.

2\. Verify REJECTED outcome and attempt; no transaction header/ledger entries.

3\. Fund account through authorised demo operation.

4\. Retry original withdrawal with K.

5\. Original rejection is replayed; no withdrawal occurs.

6\. Submit genuinely new withdrawal with new key; it can be processed.



**### Journey E — Competing withdrawals**

1\. Account has ₹5,000.

2\. Concurrently submit ₹4,000 and ₹3,000 withdrawals with different keys.

3\. At most one succeeds; balance never negative; all ledger entries balance.



**### Journey F — Different concurrent transfers from same sender**

1\. Sender has ₹5,000.

2\. Concurrently submit ₹4,000 to receiver B and ₹3,000 to receiver C using different keys.

3\. At most one posts; sender never negative; receiver balances and ledger entries match.



**### Journey G — Unauthorised account access**

1\. Login as Customer B.

2\. Attempt to debit or inspect Customer A's account by changing account ID.

3\. Backend denies access; no financial change; security-relevant attempt/audit is recorded as required.



**### Journey H — Rollback**

1\. In TEST, inject failure after a chosen intermediate posting write but before commit.

2\. Verify transaction header, balance changes, ledger entries and idempotency reservation are all rolled back.

3\. Retry with same key; it safely processes once.



**### Journey I — Account lifecycle**

1\. Admin freezes account; verify it cannot send or receive.

2\. Admin unfreezes; verify ACTIVE state restored without balance changes.

3\. Attempt closure with non-zero balance; reject.

4\. Clear balance through valid posted operation; ensure no in-progress operation.

5\. Admin closes; verify historical records remain and account cannot send/receive.



**### Journey J — Demo-funding controls**

1\. CUSTOMER attempts deposit; denied.

2\. DEMO_OPERATOR or ADMIN attempts deposit in DEMO with flag off; denied.

3\. Admin enables flag with reason; authorised demo deposit succeeds.

4\. In PRODUCTION, deposit is denied even if flag record is incorrectly true.

5\. Verify every setting change and deposit is audited.



**### Journey K — Session lifecycle**

1\. Login and use protected endpoint successfully.

2\. Refresh; verify old refresh token becomes ROTATED and new token works.

3\. Reuse old rotated token; verify token family/session revoked and audit event created.

4\. Login again and logout; verify refresh cookie cleared and old access JWT fails immediately due session revocation.



**### Journey L — Reconciliation**

1\. Admin starts reconciliation.

2\. Verify run has RUNNING then terminal COMPLETED/FAILED state.

3\. Verify all checks use one REPEATABLE READ read-only snapshot.

4\. Verify customer and system account counts include \`DEMO_CASH_CLEARING\`.

5\. Verify run list filters/pagination/newest-first ordering and detail discrepancies.

6\. Customer and DEMO_OPERATOR cannot list or inspect runs.

7\. Introduce controlled test discrepancy and verify it is reported, not silently repaired.



**### Journey M — Admin monitoring and audit**

1\. Admin opens one monitoring screen.

2\. Verify posted transactions and attempts appear in separate panels, sourced from separate APIs.

3\. Apply filters and pagination independently.

4\. Verify an attempt linked to a transaction is not counted twice.

5\. Inspect audit records for authentication, financial, account lifecycle, settings and reconciliation actions.



**## 27. API contract and validation checklist**



The complete normative request/response examples and status/error mappings are in \`LedgerLine_Requirements_v5.md\`, Section 13.10. The AI developer must implement those contracts rather than infer a new contract from the flow narrative. At minimum, verify the following details during implementation:



\- All IDs are UUIDs; malformed IDs return \`400 VALIDATION_ERROR\`.

\- All list endpoints use \`page=1\` and \`limit=20\` defaults, maximum limit 100, newest-first ordering and stable ID tie-breakers. Date filters use ISO 8601 UTC with \`from\` inclusive and \`to\` exclusive; \`from\` must be earlier than \`to\`.

\- Transaction history supports the SRS filters for type, status, date range and account ID. Admin posted-transaction monitoring supports transaction ID, account ID, initiating user ID, type, posted status and date range.

\- Admin attempt monitoring supports attempt ID, requested source/destination account ID metadata, principal/user ID, operation, outcome and date range. Request account IDs are metadata only, not trusted foreign-key relationships.

\- Reconciliation history supports status, date range and currency filters, independent pagination, newest-first \`started_at\` order and stable \`id\` tie-breaker.

\- \`description\` is at most 250 characters. \`Idempotency-Key\` is 16–128 non-whitespace characters.

\- \`amountMinor\` must be a string of digits only, parsed exactly as integer paise. Reject JSON floating-point values, signs, whitespace, decimals and scientific notation. Only INR is supported in MVP.

\- \`reason\` for account status changes, account closure and demo-setting changes is mandatory, 1–250 characters, and must not contain secrets/credentials.

\- Common HTTP mapping: 200 retrieval/replay; 201 newly created resource/posting; 204 logout; 400 malformed/validation; 401 unauthenticated/session invalid; 403 authenticated but forbidden; 404 missing/concealed resource; 409 idempotency or state conflict; 422 deterministic business rejection; 429 rate limit; 500 unexpected error; 503 temporary service/database unavailability.

\- Financial POST replay preserves the original business HTTP status/body; same-key changed payload returns 409; technical retry uses the same key. A timeout is not evidence that a financial operation failed.

\- Exact response fields, endpoint-specific errors and all route permissions must match SRS Section 13.10. Do not treat illustrative response snippets elsewhere as permission to omit mandatory fields.



**## 28. Requirement-to-flow traceability**



\| SRS requirement group | Flow sections | Primary backend modules | Evidence |

\|---|---|---|---|

\| Registration/auth/session (FR-001–007, FR-002A) | 3–8 | auth, users, audit | registration, refresh, reuse, logout tests |

\| Accounts/balance/lifecycle (FR-008–020, FR-080) | 9–10, 20–21 | accounts, ledger, admin | ownership, mapping, freeze/close tests |

\| Transfer/deposit/withdrawal (FR-021–033) | 11, 14–16 | posting, transactions, ledger | accounting, role/environment, rollback tests |

\| Idempotency/attempts (FR-034–045) | 12–13, 25 | idempotency, transaction-attempts | replay, conflict, rejection replay tests |

\| Concurrency/atomicity (FR-046–051) | 11–12, 16, 26 | posting, accounts, ledger | multi-connection tests |

\| Ledger (FR-052–061) | 11, 14, 16, 23 | ledger, posting | deferred constraints, immutability, trial balance |

\| History (FR-062–067) | 17–18 | transactions, transaction-attempts | ownership, filters, pagination |

\| Audit/admin/demo (FR-068–073, FR-082, FR-084, FR-087–089) | 4, 14–15, 19–24 | admin, settings, audit | role, monitoring, settings, bootstrap tests |

\| Reconciliation (FR-073, FR-081, FR-085–086, FR-090) | 23 | reconciliation, ledger | snapshot, all-account, run list/detail tests |

\| INR formatting (FR-091) | 10, 11, 26 | frontend shared money formatter | exact paise/display tests |

\| Phase 2 reversal (FR-074–079) | Not in MVP | transactions, posting, ledger | implement only if promoted to scope |



**## 29. Developer implementation rules**



1\. Implement in dependency order: project setup/migrations → bootstrap/auth → accounts/ledger mapping → shared posting pipeline → idempotency/attempts → customer history → admin controls/monitoring → reconciliation → frontend integration → deployment.

2\. Do not create separate transfer/deposit/withdrawal posting implementations. Use one shared posting service with operation-specific policy and entry construction.

3\. Do not implement a screen before confirming its API contract and permission rules.

4\. Do not add undocumented endpoints or database columns without recording the decision and checking SRS impact.

5\. Do not mark a feature complete without automated tests and acceptance evidence.

6\. If a requirement appears ambiguous or contradictory, stop and ask the product owner; do not let the AI developer invent a business rule.

7\. Phase 2 features must be hidden/disabled and must not be represented as working MVP features.



**## 30. Open implementation decisions**



The AI developer/team must ask or record decisions for exact package versions, host provider, CORS domains, secret delivery, cookie domain/SameSite/CSRF configuration, password-hash parameters, JWT key management, pagination defaults/maxima where SRS leaves room, email normalisation policy, test failure-injection mechanism, and stale reconciliation-run recovery threshold. These choices must not change the SRS's business rules.



**## 31. Definition of end-to-end complete**



LedgerLine is ready for handoff/demo only when:



\- All MVP screens and APIs exist and match the SRS.

\- All roles and ownership checks are enforced server-side.

\- Session lifecycle and immediate logout revocation work.

\- All financial operations pass through the shared posting service.

\- Idempotency, concurrency, atomicity, ledger balance and immutability are enforced by service plus database.

\- Attempts are separate from posted transactions in data, API, UI and reporting.

\- Admin monitoring, account lifecycle, demo settings, audit and reconciliation history work.

\- Reconciliation checks every ledger account using one consistent snapshot.

\- All critical unit, integration, concurrency, failure and end-to-end tests pass.

\- Deployment uses secure environment configuration, migrations, bootstrap and backup/restore instructions.

\- The demo journeys in Section 26 can be repeated with synthetic data.
