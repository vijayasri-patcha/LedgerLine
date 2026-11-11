**# LedgerLine — Corrected System Design**



**\*\*Document:\*\*** System Design (implementation baseline)  

**\*\*Aligned SRS:\*\*** \`LedgerLine_Requirements_v5.md\`  

**\*\*Version:\*\*** 2.0  

**\*\*Status:\*\*** Proposed developer baseline; SRS remains the source of truth  

**\*\*Scope:\*\*** Seven-day hackathon MVP



**---**



**## 1. Purpose and authority**



This document translates the v5 SRS into a technical architecture. It does not replace or silently modify the SRS. If a conflict is discovered, stop and resolve it against the SRS before coding. All requirements labelled MVP or MVP-demo remain in scope; Phase 2 features must not be represented as completed MVP functionality.



LedgerLine is a demonstration internal-ledger application. Simulated deposits and withdrawals do not move real money. It is not a bank, payment processor, UPI/NEFT/RTGS integration, or regulated financial institution.



**## 2. Architecture decision**



Use a **\*\*modular monolith\*\***: one frontend application, one backend application, and one PostgreSQL database. Organise backend code by business module with explicit service boundaries. Do not split into microservices for this MVP.



**### 2.1 Technology baseline**



\| Layer | Decision | Notes |

\|---|---|---|

\| Frontend | React + TypeScript + Tailwind CSS | Customer and administrator experiences |

\| Backend | Node.js + Express.js + TypeScript | Versioned REST API |

\| Database | PostgreSQL | Authoritative financial and application store |

\| Data access | Prisma + parameterised SQL | Use SQL for PostgreSQL-specific locks/triggers/constraints where ORM support is insufficient |

\| Authentication | JWT access token + opaque rotating refresh token | 15-minute access token; seven-day refresh session |

\| Password hashing | Argon2id or bcrypt | Pick one, document parameters, and use consistently |

\| API documentation | OpenAPI / Swagger | Must match every SRS API contract |

\| Testing | Jest or Vitest + Supertest | Use a real PostgreSQL test database for concurrency and deferred-constraint tests |

\| Deployment | Static frontend hosting + backend hosting + managed PostgreSQL | HTTPS, secrets in environment/secret manager |



The team must choose exact package versions and hosting providers at project kickoff and record them in \`IMPLEMENTATION_DECISIONS.md\`. Do not change the SRS's business rules to fit a library.



**## 3. System context**



\`\`\`mermaid

flowchart TB

  C[Customer Browser] --> FE[React Customer UI]

  A[Administrator Browser] --> FE

  FE -->|HTTPS JSON REST| API[Express API]

  API --> MW[Authentication, Session, RBAC, Validation, Rate Limit]

  MW --> MOD[Modular Business Services]

  MOD --> DB[(PostgreSQL)]

  MOD --> LOG[Structured Application Logs]

  DB --> DBM[Persisted Audit, Attempts, Ledger, Reconciliation]

\`\`\`



The browser never connects directly to PostgreSQL. The backend derives identity from validated authentication state; it never trusts a client-supplied user ID, role, balance, or account ownership claim.



**## 4. Backend module boundaries**



\| Module | Responsibilities | Must not do |

\|---|---|---|

\| \`auth\` | Registration, login, access JWT, refresh rotation, logout, session validation, token-family reuse response | Assign privileged roles during public registration |

\| \`users\` | Customer profile and permitted profile reads | Expose password hashes or unrestricted user data |

\| \`accounts\` | Create/list/read accounts, account-holder name, balance reads, lifecycle operations | Directly alter balances for funding or transfers |

\| \`transactions\` | Financial operation orchestration and customer/admin transaction queries | Write ledger entries through separate ad-hoc paths |

\| \`posting\` | Single shared financial posting pipeline for transfer/deposit/withdrawal | Commit partial financial state |

\| \`idempotency\` | Scope key, canonical fingerprint, reservation, replay, conflict and outcome persistence | Commit a \`RESERVED\` outcome |

\| \`transaction-attempts\` | Persist safe request outcomes and operational attempts | Treat attempts as posted transactions |

\| \`ledger\` | Ledger-account catalogue, debit/credit entries, balance projection updates, integrity checks | Update/delete posted ledger entries |

\| \`reconciliation\` | Run orchestration, consistent snapshot checks, persisted run/detail queries | Repair or rewrite balances/ledger automatically |

\| \`audit\` | Security and administrative audit events | Store passwords, tokens, secrets or unnecessary personal data |

\| \`admin\` | Admin monitoring, account controls, demo settings, bootstrap-related support | Bypass the shared posting or audit services |

\| \`settings\` | Read/update demo funding flag with reason and environment guard | Enable funding in production |



**### 4.1 Dependency direction**



HTTP controllers call application services. Application services call domain services/repositories. The posting service coordinates idempotency, account locking, ledger posting, attempts and audit persistence. Controllers must not contain financial business logic. Frontend code must not implement authoritative permission, balance, or amount-limit decisions.



**## 5. Roles and access control**



The MVP uses one exclusive role per user: \`CUSTOMER\`, \`DEMO_OPERATOR\`, or \`ADMIN\`.



\- Public registration always creates \`CUSTOMER\`; reject role/privilege fields.

\- Initial \`ADMIN\` is created only by a restricted one-time bootstrap process with securely supplied credentials. Refuse a rerun if an administrator already exists; do not overwrite the existing administrator.

\- \`DEMO_OPERATOR\` is provisioned/revoked only through a restricted deployment seed/process. Provisioning and revocation are audited.

\- A demo operator is a dedicated role, not a customer role with extra permissions. Use a separate customer identity for customer workflows.

\- Customer access is limited to owned accounts and authorised transaction/attempt history.

\- Only \`ADMIN\` can freeze/unfreeze/close accounts, inspect system-wide monitoring/audit data, run reconciliation, and change demo settings.

\- Only \`ADMIN\` or \`DEMO_OPERATOR\` can initiate simulated deposits, and only in \`DEMO\`/\`TEST\` when the flag is enabled. Production must hard-deny deposits even if the database flag is incorrectly true.

\- A role does not imply ownership of any customer account. Admin visibility does not mean admin may debit customer accounts.



Enforce all permissions server-side on every request, including object-level ownership checks.



**## 6. Authentication and session design**



1\. Registration validates required profile fields, unique email, and password length 12–128 characters. Do not trim or truncate passwords. Public role input is rejected.

2\. Store only an Argon2id/bcrypt password hash. Never log credentials.

3\. Login verifies credentials and active user status. Create a \`user_sessions\` record and refresh-token history record. Issue a 15-minute access JWT containing user ID, role, session ID (\`sid\`), issue/expiry times, and a unique token ID where required by the implementation.

4\. Store only a hash of the opaque refresh token. Deliver it using the SRS-defined secure cookie settings; do not expose it to browser local storage or logs.

5\. Every protected API validates JWT signature/expiry and checks that the referenced session exists, is not revoked, has not expired, and belongs to an active user. This session lookup is necessary to satisfy immediate access-token invalidation on logout.

6\. Refresh validates the current refresh-token hash and session, marks the presented token \`ROTATED\`, creates a new opaque refresh token/hash, updates the session's current hash, and issues a new access token in one database transaction.

7\. If a previously rotated token is reused, revoke the entire token family/session and write a security audit event.

8\. Logout revokes the current session immediately, records the reason, clears the refresh cookie, and writes an audit event. Subsequent access-token requests fail the active-session check.

9\. Disabled users and expired/revoked sessions cannot access protected APIs.



**## 7. Data architecture**



PostgreSQL is the authoritative store. Prisma models and migrations must implement the SRS schema and constraints. The following logical entities are required:



\- Identity/session: \`users\`, \`user_sessions\`, \`refresh_token_history\`.

\- Customer accounts: \`accounts\`.

\- Accounting: \`ledger_accounts\`, \`transactions\`, \`ledger_entries\`.

\- Request safety/observability: \`idempotency_records\`, \`transaction_attempts\`, \`audit_logs\`.

\- Controlled demo configuration: \`system_settings\`.

\- Reconciliation: \`reconciliation_runs\`, \`reconciliation_discrepancies\`.



**### 7.1 Core relationships**



\`\`\`mermaid

erDiagram

  USERS ||--o{ USER_SESSIONS : has

  USER_SESSIONS ||--o{ REFRESH_TOKEN_HISTORY : rotates

  USERS ||--o{ ACCOUNTS : owns

  ACCOUNTS ||--|| LEDGER_ACCOUNTS : maps_to

  USERS ||--o{ TRANSACTIONS : initiates

  TRANSACTIONS ||--|{ LEDGER_ENTRIES : posts

  LEDGER_ACCOUNTS ||--o{ LEDGER_ENTRIES : records

  USERS ||--o{ IDEMPOTENCY_RECORDS : scopes

  USERS ||--o{ TRANSACTION_ATTEMPTS : makes

  IDEMPOTENCY_RECORDS ||--o{ TRANSACTION_ATTEMPTS : explains

  USERS ||--o{ AUDIT_LOGS : acts

  USERS ||--o{ RECONCILIATION_RUNS : initiates

  RECONCILIATION_RUNS ||--o{ RECONCILIATION_DISCREPANCIES : contains

\`\`\`



**### 7.2 Financial representation**



\- Currency is INR for MVP.

\- Persist amounts as PostgreSQL \`BIGINT\` integer paise. API monetary values are base-10 integer strings (\`amountMinor\`); do not use floating-point arithmetic.

\- Minimum operation: ₹1 = 100 paise. Maximum operation: ₹100 crore = 100,000,000,000 paise. Backend enforcement is mandatory.

\- UI displays INR with exactly two decimal places and Indian digit grouping, e.g. \`₹2,000.00\`.

\- New customer accounts start at zero.

\- Every customer account has exactly one credit-normal \`CUSTOMER_BALANCE\` ledger account.

\- Seed the debit-normal \`DEMO_CASH_CLEARING\` system account through a migration. It is the counterpart for simulated deposits and withdrawals.

\- Transfer: sender customer ledger DEBIT; receiver customer ledger CREDIT.

\- Deposit: \`DEMO_CASH_CLEARING\` DEBIT; customer ledger CREDIT.

\- Withdrawal: customer ledger DEBIT; \`DEMO_CASH_CLEARING\` CREDIT.

\- \`accounts.balance_minor\` is a projection/read model, not the source of truth. It must be updated atomically with ledger entries. Available balance equals posted ledger balance in the MVP.



**### 7.3 Mandatory database protections**



1\. Unique user email and unique account number.

2\. \`CHECK balance_minor >= 0\` for customer projections.

3\. Positive transaction and ledger-entry amounts.

4\. Unique \`(principal_id, operation, idempotency_key)\`.

5\. Deferred constraint trigger preventing committed \`RESERVED\` idempotency records.

6\. Deferred constraint trigger ensuring each posted transaction has at least two entries and debits equal credits per currency.

7\. Mandatory currency consistency across transaction, entry, and ledger account (composite FKs or deferred trigger).

8\. Unique customer-account-to-ledger-account mapping plus deferred commit-time check that each customer account has exactly one mapping.

9\. Application DB role has no \`UPDATE\`, \`DELETE\`, or \`TRUNCATE\` rights on \`ledger_entries\`; mandatory \`BEFORE UPDATE OR DELETE\` trigger rejects mutation. Migrations use a separate privileged role.

10\. Foreign keys, indexes, timestamp consistency, and least-privilege DB roles as defined in SRS.



Test each protection using the normal application credentials and a real PostgreSQL test database. An ORM model alone does not replace database enforcement.



**## 8. Shared financial posting service**



All financial writes use one application service, e.g. \`PostingService.execute(command)\`. Operation-specific controllers only authenticate, parse and pass a typed command. The service applies the same ordered stages:



1\. Authenticate and validate active session (middleware).

2\. Authorise operation and principal role; derive actor ID from session.

3\. Parse/canonicalise request and validate amount, currency, account IDs, account status, ownership and operation-specific rules.

4\. Require \`Idempotency-Key\`; derive operation scope and canonical request fingerprint.

5\. Start PostgreSQL transaction and reserve unique idempotency key. Handle uniqueness races by loading the existing record.

6\. If existing key + same fingerprint: return original stored POSTED or REJECTED business outcome; record a replay attempt. If same key + different fingerprint: return conflict; record conflict attempt. Never post again.

7\. Lock all involved customer account rows using \`SELECT ... FOR UPDATE\` in deterministic ID order. Account lifecycle changes use the same lock.

8\. Re-check ownership, status, sender funds and all business rules after locks are acquired.

9\. For a deterministic business rejection after reservation (e.g. insufficient funds), store REJECTED outcome and attempt; commit no financial transaction or ledger entries. A later retry with the same key replays that rejection, even if balance changes.

10\. For success, create transaction header, update affected account projections, insert the correct balanced ledger entries, set idempotency outcome POSTED, record attempt and audit event.

11\. Run service-level integrity checks; database deferred constraints independently re-check mandatory cross-row rules at commit.

12\. Commit. Only after commit may API return POSTED.

13\. On technical failure before commit, roll back all financial state and idempotency reservation. Record a PROCESSING_ERROR attempt/audit in a separate best-effort transaction; if DB unavailable, use structured logs. Retry with the same key may safely process again.



**### 8.1 Concurrency and locking**



Use PostgreSQL \`READ COMMITTED\` for the idempotency reservation and posting flow unless a tested alternative is approved. Lock sender/receiver account rows in deterministic order. Check sender balance after lock acquisition. Never rely on frontend checks, in-memory Node.js locks, or read-then-write without locking. Verify exactly one row changed for conditional debit alternatives. Transfers from the same sender with different idempotency keys must also be tested concurrently.



**### 8.2 Transaction attempts versus transactions**



\- \`transactions\` contains only committed posted financial headers.

\- \`transaction_attempts\` captures processed POSTED, BUSINESS_REJECTED, IDEMPOTENT_REPLAY, IDEMPOTENCY_CONFLICT, VALIDATION_REJECTED, and PROCESSING_ERROR outcomes.

\- Attempts are never counted as additional posted transactions.

\- Persist first processed attempt with idempotency outcome in the same transaction. Replay/conflict attempts are separately recorded. Authenticated validation failures may be recorded best-effort without reserving a key. Never store raw request bodies, credentials, tokens or secrets.



**## 9. Account lifecycle**



\- ACTIVE → FROZEN: Admin only.

\- FROZEN → ACTIVE: Admin only.

\- ACTIVE or FROZEN → CLOSED: Admin only, zero ledger balance, zero projection balance, and no in-progress financial posting.

\- CLOSED cannot be reopened in MVP.

\- Frozen/closed accounts cannot send or receive.

\- Every transition is audited.

\- Lifecycle operations acquire the same account row lock used by posting so status cannot change midway through a financial operation.

\- Closure retains account and historical ledger records; no customer self-close endpoint exists.



**## 10. Reconciliation architecture**



1\. Admin requests a reconciliation run.

2\. Authorise ADMIN and create a persisted \`RUNNING\` run record in a short write transaction.

3\. Open one PostgreSQL \`REPEATABLE READ, READ ONLY\` transaction and capture \`snapshot_started_at\` and \`POSTGRES_REPEATABLE_READ_READ_ONLY\`.

4\. In that one snapshot, check: per-transaction debit/credit equality and minimum entry count; customer projection versus customer ledger; every system ledger account including \`DEMO_CASH_CLEARING\`; whole-ledger trial balance; expected operation entry patterns; missing/duplicate entries; currency/reference integrity; customer-to-ledger mapping.

5\. Commit the read-only snapshot.

6\. In a separate write transaction, persist discrepancies and counts, mark run COMPLETED, set completion time, and write audit event. On failure, persist FAILED with safe failure code when DB is available.

7\. Admin can list runs with filters/pagination/newest-first stable ordering and retrieve run detail. Customer and DEMO_OPERATOR are forbidden.

8\. Reconciliation only reports discrepancies. It never silently repairs balances or rewrites ledger history.

9\. A stale RUNNING record after a crash must be marked FAILED by a bounded startup/admin recovery check before being presented as a final result.



**## 11. API and UI contract strategy**



The v5 SRS Section 13 is authoritative for endpoint paths, methods, request/response fields, permissions and error codes. Implement every MVP endpoint exactly; do not invent a second API convention. All endpoints use \`/api/v1/\`, JSON, server-side validation, standard errors, correlation IDs and HTTPS outside local development.



Required API groups:



\- Auth: register, login, refresh, logout.

\- Customer accounts: create, list, details (including \`accountHolderName\`), balance.

\- Customer financial operations: transfer, withdrawal; simulated deposit with role + environment + feature-flag gate.

\- Customer history: posted transactions and transaction attempts, with ownership, filters and pagination.

\- Admin monitoring: posted transactions and attempts on one screen but queried from separate endpoints and displayed in separate panels; independent pagination and SRS filters.

\- Admin controls: account freeze/unfreeze, account closure, audit logs, demo-funding GET/PATCH (PATCH requires reason), reconciliation POST/list/detail.

\- Phase 2 only: full reversal endpoint and behaviour.



**### 11.1 Frontend routes/screens**



Customer:

\- \`/register\`, \`/login\`.

\- \`/dashboard\` — accounts and balances.

\- \`/accounts/new\`, \`/accounts/:accountId\` — create/detail, holder name, status and balance.

\- \`/transfer\`, \`/withdraw\` — operation forms and result state.

\- \`/transactions\`, \`/transactions/:transactionId\` — posted history/details.

\- \`/attempts\`, \`/attempts/:attemptId\` — request outcomes.



Admin:

\- \`/admin/dashboard\`.

\- \`/admin/monitoring\` — separate posted transaction and attempt panels on one screen.

\- \`/admin/accounts\` and \`/admin/accounts/:accountId\` — freeze/unfreeze/close with precondition feedback.

\- \`/admin/audit-logs\`.

\- \`/admin/reconciliation\` and \`/admin/reconciliation/:runId\`.

\- \`/admin/settings/demo-funding\` — environment, current flag, reason-required update.



All screens must define loading, empty, success, validation-error, permission-denied, and server-error states. Frontend route guards improve UX only; backend permissions are authoritative.



**## 12. Error handling and observability**



\- Use stable SRS error codes and appropriate HTTP statuses; do not invent conflicting codes.

\- Every request receives/propagates a correlation ID. Return it in API errors and persist it in attempts/audit where specified.

\- Never log passwords, access/refresh tokens, secrets, full credentials or unnecessary personal data.

\- Distinguish validation rejection, business rejection, idempotency conflict, authorization failure, and technical processing error.

\- A timeout after a client sends a financial request is an unknown client-side outcome, not proof that posting failed. The client retries with the same idempotency key and displays the replayed result.



**## 13. Security baseline**



\- HTTPS in deployed environments.

\- Secure, HttpOnly, SameSite refresh cookie consistent with deployment topology; CSRF protection for cookie-authenticated refresh/logout routes where applicable.

\- Short-lived access JWT, session-aware revocation, refresh rotation and token reuse detection.

\- Password hash only; no secrets in logs.

\- Server-side RBAC and object-level ownership checks.

\- Input validation, parameterised queries, rate limiting and safe error messages.

\- Least-privilege database credentials; separate migration role.

\- Mandatory append-only ledger controls and audited admin changes.

\- Production hard-deny for demo funding regardless of feature-flag table state.



**## 14. Testing architecture and release gates**



Use unit tests for pure validation/accounting/fingerprint logic; API integration tests with PostgreSQL; multi-connection concurrency tests; failure injection; and end-to-end UI tests for critical journeys.



Measure the proposed SRS demo targets in the actual environment: core API P95 under one second under a documented 20-concurrent-user load (excluding cold starts), and at least 20 concurrent financial requests with no negative balances or duplicate postings. These are hackathon targets, not production guarantees.



Release gates must prove at least:

\- Registration password boundaries and public role rejection.

\- Login, refresh rotation, rotated-token reuse family revocation, logout immediate invalidation.

\- Account creation starts at zero and creates exactly one ledger mapping.

\- Account-holder name is returned under correct permissions.

\- Transfer, withdrawal and gated simulated deposit accounting patterns.

\- Same key/same payload POSTED replay; same key/same payload REJECTED replay; same key/different payload conflict.

\- Concurrent same-key requests produce at most one posting.

\- Concurrent withdrawals and two distinct transfers from one sender cannot overspend.

\- Injected posting failure leaves no partial state.

\- Cross-customer debit is rejected.

\- Frozen/closed accounts cannot send/receive; closure preconditions enforced.

\- Ledger update/delete/truncate denied using application DB credentials; unbalanced/one-line/currency-invalid postings rejected by deferred DB constraints.

\- Admin monitoring separates attempts from posted transactions and supports SRS filters/pagination.

\- Demo funding is role + environment + flag gated; production hard-denies; setting change requires reason and audit.

\- Reconciliation checks all customer/system accounts in one consistent snapshot; run list/detail permissions and persistence work.

\- INR display formatting preserves exact paise.



A feature is not done because its screen or endpoint exists. It is done only when its SRS acceptance criteria, database controls, permissions, failure behaviour, and tests pass.



**## 15. Deployment and operations**



\- Maintain \`.env.example\` with variable names and safe placeholders only. Never commit secrets.

\- Configure separate \`DATABASE_URL\` application credentials and privileged migration credentials.

\- Set explicit \`APP_ENV\` (\`DEVELOPMENT\`, \`TEST\`, \`DEMO\`, \`PRODUCTION\`). Production must hard-deny simulated deposits.

\- Run migrations through a controlled release step; seed system ledger accounts; run one-time admin bootstrap; provision demo operator only when required.

\- Configure CORS, cookie settings, HTTPS, rate limits and health endpoint.

\- Back up the demo database before presentation and document restore steps.

\- Do not log or expose connection strings, signing keys or refresh tokens.



**## 16. Explicitly out of MVP**



Real payment rails, multi-currency, external settlement, chargebacks, KYC/AML claims, interest/loans/overdrafts/fees, scheduled transfers, microservices, Kafka/event streaming, ML fraud scoring, automated retention jobs, cryptographic hash-chain/Merkle proof, and full reversals unless the team explicitly promotes a Phase 2 feature into scope.



**## 17. Decisions the team must record before coding**



1\. Exact Node, Express, React, TypeScript, Prisma, PostgreSQL and test-runner versions.

2\. Exact password hashing algorithm and parameters.

3\. Exact JWT signing algorithm/key handling and refresh cookie configuration.

4\. Exact API error envelope and SRS error-code mapping.

5\. Exact pagination defaults/maximums and filter parsing from SRS.

6\. Exact account-number generator implementation.

7\. Exact database deferred-trigger migration strategy and test approach.

8\. Hosting provider, environment variables, CORS origins, backup/restore method.

9\. Team member ownership for every module.



These are implementation choices, not permission to alter business requirements. Record choices in \`IMPLEMENTATION_DECISIONS.md\` and update OpenAPI, migrations, tests and docs together when a decision changes.



**## 18. Final assessment**



**\*\*Revised design assessment: 9.7/10.\*\*** The architecture is appropriate and the corrected design maps the v5 MVP requirements to modules, data, security controls, APIs, UI, processing, reconciliation and tests. The remaining score is reserved for implementation-specific decisions, organiser confirmation, and evidence from the deployed system. Do not claim a 10/10 implementation score until the acceptance tests and demo evidence pass.
