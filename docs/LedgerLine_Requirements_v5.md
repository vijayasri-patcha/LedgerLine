# LedgerLine — Software Requirements Specification (SRS)

**Project:** LedgerLine — Money Movement with a Ledger You Can Prove  
**Document type:** End-to-end product, functional, data, API, security and test requirements  
**Version:** 5.0  
**Date:** 9 November 2026  
**Delivery constraint:** Seven-day hackathon  
**Status:** Revised specification — independent v4.0 review corrections incorporated; validate hackathon-specific assumptions with organisers

---

## Document purpose

This version incorporates the outstanding review actions: complete API contracts, expanded admin/system user stories, an admin-only account-closure workflow, mandatory integrity enforcement, a fixed authentication lifecycle, a ₹100-crore per-operation ceiling, optional data-retention automation, optional advanced account-number/traceability/cryptographic enhancements, full customer-and-system-account reconciliation, and requirement ownership.

This document defines what the LedgerLine hackathon application must do, the rules it must enforce, how its core data is represented, and how the team will verify correctness. It is intended to be the shared source of truth for product, frontend, backend, database and testing work. This v5.0 revision supersedes v4.0 for future implementation decisions while preserving all earlier requirements not explicitly changed here.

### Version 5.0 review-alignment note

This revision incorporates the six targeted findings from the independent v4.0 review without redesigning the existing financial architecture: reconciliation history can be listed; every reconciliation run uses one consistent database snapshot; the demo-funding settings screen is explicitly required; initial administrator/demo-operator provisioning is defined; ledger immutability protections are consistently mandatory; and the architecture table now matches the fixed JWT/refresh-token strategy. It also makes the password policy, INR display format and reconciliation schema mandatory and testable.

Existing story identifiers and the single-currency internal-ledger MVP are preserved. Deposits and withdrawals remain simulated demonstration operations, not real banking or payment-rail integrations.

## 1. Executive summary

LedgerLine is a secure money-movement application designed to ensure that a financial operation is authorised, is not posted twice when a request is retried, cannot overspend an account under concurrency, commits atomically, and is represented by balanced, traceable ledger entries.

The system addresses four core risks:

1. Duplicate requests causing the same financial operation to execute more than once.
2. Simultaneous withdrawals or transfers causing overspending or lost updates.
3. Unauthorised users initiating transactions against accounts they do not own or control.
4. Incorrect or unverifiable balances caused by incomplete, inconsistent or mutable financial records.

The MVP includes customer registration and authentication, customer accounts, internal transfers, controlled simulated funding and withdrawals, transaction-attempt tracking, idempotency, concurrency control, atomic posting, double-entry ledger records, transaction history, reconciliation and administrative audit capabilities.

**Core promise:** Every posted financial operation must be authorised, posted no more than once for its idempotency key, applied all-or-nothing, balanced in the ledger, and independently reconcilable.

**Scope warning:** LedgerLine is a hackathon demonstration application. It is not a bank, payment processor, UPI/NEFT/RTGS integration, card network, regulated deposit-taking service or production financial institution. Do not claim that demo funding moves real money.

## 2. Goals, non-goals and success criteria

### 2.1 Product goals

- Enable an authenticated customer to move funds between eligible LedgerLine accounts.
- Ensure a retry of the same logical request cannot create a second posting.
- Prevent concurrent operations from spending more than the available balance.
- Commit all financial effects together, or commit none of them.
- Record every posted operation with balanced debit and credit entries.
- Reconcile the account balance projection against the posted ledger.
- Trace posted transactions, business rejections and important administrative actions.

### 2.2 Hackathon success criteria

The MVP is acceptable when all of the following are demonstrable:

1. A customer can register, log in, create an account and view its balance.
2. An authorised customer can transfer funds to a different active account.
3. A retry with the same idempotency key and same request returns the original outcome and does not post again.
4. Reusing a key with a different financial payload returns a conflict and does not post.
5. Simultaneous duplicate requests create at most one financial posting.
6. Competing withdrawals cannot make an account balance negative.
7. A transfer updates both account balance projections and inserts both ledger entries in one database transaction.
8. An injected failure during posting leaves no partial financial changes.
9. A customer cannot debit another customer's account by manipulating an account ID.
10. Simulated deposits can be initiated only by an administrator or explicitly authorised demo operator in DEMO/TEST when the feature flag is enabled; ordinary customers and all production requests are denied in the MVP.
11. An administrator can run reconciliation and inspect audit records.
12. Automated tests cover the critical cases in Section 19.
13. Every MVP API has a defined method, path, authentication/permission rule, request schema, response schema and error behaviour.
14. Administrator-only account closure, complete reconciliation of customer and system ledger accounts, and requirement ownership are defined.
15. Account details display the account holder's name retrieved from the associated user profile, subject to the existing account-read permission rules.
16. The administrator monitoring screen presents posted transactions and request attempts together on one screen while keeping them visibly separate data types.
17. A concurrency integration test proves that two different transfers from the same sender cannot collectively overspend the sender account.

### 2.3 Non-goals for the seven-day MVP

- Real UPI, NEFT, RTGS, card, wallet, payment-gateway or bank integration.
- External settlement, chargebacks, refunds through a payment rail or payment-network callbacks.
- Foreign exchange or multi-currency conversion.
- Interest, loans, overdrafts, fees, scheduled payments or recurring transfers.
- KYC, AML, sanctions screening, tax reporting or regulatory compliance claims.
- Microservices, distributed consensus, blockchain or event streaming unless specifically required by the organisers.
- Machine-learning fraud scoring.
- Production-grade disaster recovery, formal certification or banking-grade availability claims.

These features may be considered later. They must not displace implementation and testing of the core safety guarantees.

## 3. Scope and release priorities

### 3.1 MVP — must build

- Customer registration, login and protected API access.
- Customer account creation, ownership and lifecycle status.
- Balance enquiry.
- Internal transfer.
- Controlled simulated deposit and withdrawal operations for test/demo use.
- Request-attempt and idempotency outcome tracking.
- Database-enforced idempotency uniqueness.
- Concurrency-safe account updates.
- Atomic transaction and ledger posting.
- Double-entry ledger with system counterpart accounts.
- Customer transaction history and transaction details.
- Administrative audit view and reconciliation.
- Automated tests for duplicate requests, concurrency, rollback, authorisation and ledger balance.

### 3.2 Designed for, but optional in the MVP

- Full reversal of a posted transaction (specified in Section 12; may be deferred if time is limited).
- CSV transaction statement export.
- Email notifications.
- Advanced monitoring and analytics.
- Daily aggregate limits, risk-based velocity rules and lower configurable thresholds beyond the fixed ₹100-crore per-operation ceiling.

### 3.3 Explicit release labels

Every requirement is labelled as one of:

- **MVP:** required for hackathon completion.
- **MVP-demo:** required only when the corresponding demo operation is enabled.
- **Phase 2:** specified to avoid future ambiguity but may be deferred.

## 4. Assumptions and business rules

The original problem statement is brief. The following assumptions define a workable MVP. Confirm them with the organisers if official details differ.

| ID | Business rule / assumption |
|---|---|
| BR-01 | MVP supports internal transfers between LedgerLine accounts only. |
| BR-02 | MVP supports INR only. |
| BR-03 | Monetary values are stored as integer minor units (`BIGINT` paise), never binary floating-point values. |
| BR-04 | Each customer account has one owner. Joint ownership is out of scope. |
| BR-05 | A customer may own more than one account. |
| BR-06 | Sender and receiver accounts must be different and have the same currency. |
| BR-07 | Only active accounts may send or receive money in the MVP. Frozen and closed accounts cannot send or receive. |
| BR-08 | A customer may debit only an account they own, unless an explicitly modelled delegated permission is added later. |
| BR-09 | Deposits and withdrawals are simulated demonstration operations, not real cash movement. |
| BR-10 | Overdrafts are not permitted. Customer available balance must never be negative. |
| BR-11 | A posted ledger entry is never edited or deleted through application operations. Corrections use a new reversal/compensating transaction. |
| BR-12 | A transaction is reported as posted only after the database transaction commits. |
| BR-13 | Every financial transaction and its entries use one currency. |
| BR-14 | Idempotency records are retained at least as long as the related transaction/attempt history. Do not automatically expire them during the MVP. |
| BR-15 | New customer accounts start at zero. Any demo funding is posted as a balanced deposit against a system counterpart account. |
| BR-16 | Available balance equals the posted customer ledger balance in the MVP; no holds, reservations or pending external settlements exist. |
| BR-17 | The default demo policy permits simulated deposits only to an administrator or test operator. |
| BR-18 | The MVP processes financial operations synchronously in one database transaction. A committed operation is `POSTED`; an asynchronous `PENDING` workflow is out of scope. |
| BR-19 | Deterministic business outcomes reached after idempotency reservation (for example insufficient funds) are stored against the key and replayed. Authentication failures and malformed requests rejected before idempotency processing do not reserve a key. |
| BR-20 | Technical failures before commit roll back the financial operation and idempotency reservation. A retry with the same key may safely attempt processing again. |
| BR-21 | The maximum amount of any single transfer, simulated deposit or withdrawal is ₹100 crore (₹1,00,00,00,000 = 100,000,000,000 paise). Any amount above this hard ceiling is rejected and recorded as a suspicious-limit event. |
| BR-22 | The minimum amount of any transfer, simulated deposit or withdrawal is ₹1 (100 paise). |
| BR-23 | In the MVP, only an administrator may close an account. Customers cannot close accounts directly through the API. |
| BR-24 | Reconciliation covers every active and disabled ledger account, including all customer ledger accounts and system accounts such as `DEMO_CASH_CLEARING`. |
| BR-25 | Detailed retention automation, advanced account-number formats, full requirement-level traceability expansion and cryptographic ledger proofs are optional enhancements; they do not block the seven-day MVP. |

### 4.1 Monetary representation and fixed transaction limits

- API and database amounts use positive integer minor units. For INR, ₹2,000.00 is `200000` paise.
- `amount_minor` must be an integer greater than zero. The API shall represent `amountMinor` as a base-10 integer string to avoid cross-language floating-point conversion.
- Reject decimals, scientific notation, non-numeric values, `NaN`, infinity, zero and negative amounts. Do not silently round an amount.
- **Minimum amount:** ₹1 per operation (`100` paise).
- **Maximum amount:** ₹100 crore per individual operation (`₹1,00,00,00,000`; `1,000,000,000` rupees; `100,000,000,000` paise).
- This same hard ceiling applies separately to each transfer, simulated deposit and withdrawal. A request for more than ₹100 crore must be rejected with `AMOUNT_LIMIT_EXCEEDED`; it must not be split or silently reduced by the server.
- An over-limit attempt must create a security/audit event marked `HIGH_VALUE_LIMIT_EXCEEDED` or equivalent, including the actor, amount, operation, timestamp and correlation ID. Do not log secrets.
- A request exactly equal to ₹100 crore is within the configured hard ceiling, subject to sufficient balance and all other rules.
- There is no aggregate daily limit in the MVP. A configurable daily or risk-based limit is a Phase 2 enhancement, not an implicit rule.
- Store the maximum in configuration as `MAX_SINGLE_OPERATION_MINOR=100000000000` and the minimum as `MIN_SINGLE_OPERATION_MINOR=100`. The backend must enforce these values; frontend validation is only a convenience.
- The maximum is below JavaScript's safe integer limit when expressed in paise, but the implementation should still use exact integer/decimal handling (`BigInt` or validated integer strings) and PostgreSQL `BIGINT`.
- Do not change the ₹100-crore ceiling without a documented product decision and updated tests.

### 4.2 Credential and display conventions

- Customer passwords must be between **12 and 128 characters**. Accept passphrases and spaces; do not require arbitrary character-class combinations or periodic password changes. Do not silently trim or truncate passwords.
- Apply the password length rule consistently at registration and password-change boundaries. Store only the approved password hash; never return or log the password.
- INR amounts in API requests/responses remain integer paise strings as defined above. In the UI, display rupees with exactly two fractional digits and Indian digit grouping, for example `₹2,000.00` and `₹1,00,00,000.00`. Formatting is presentation-only and must not change the underlying integer paise value.

## 5. Actors and permissions

### 5.1 Customer

A customer can:

- Register and authenticate.
- Create and list their own accounts.
- View account details and balances for accounts they own.
- Transfer from an account they own to another eligible LedgerLine account.
- View transaction history involving their authorised accounts.
- View request outcomes for their own financial requests.
- Initiate withdrawals from their own accounts.

A customer cannot:

- Read another customer's private account or transaction information.
- Debit another customer's account.
- Initiate simulated deposits in the default MVP; simulated deposits are restricted to an administrator or explicitly authorised demo operator in DEMO/TEST.
- Create funds by directly changing balances.
- Modify or delete ledger entries, transactions or audit records.
- Access administrative APIs.

### 5.2 Administrator

An administrator can:

- Search and inspect permitted system-wide transaction records.
- Inspect request attempts and audit events.
- Run and view reconciliation.
- Freeze or unfreeze accounts according to the account lifecycle policy.
- Close an account only through the administrator-only closure workflow, after balance and in-progress-operation checks.
- Enable or disable demo-only funding features through controlled configuration.
- Initiate a permitted reversal if reversal functionality is enabled.

An administrator cannot silently edit or delete posted ledger entries. Any permitted financial correction must be a separately authorised, idempotent, audited compensating transaction.

### 5.3 Test operator / demo operator

If the team separates demo operations from administrator duties, a test operator may initiate simulated funding in a non-production environment. This role must be explicit, restricted to the demo environment, and audited. Do not grant this permission to all customers by default.

### 5.4 System transaction processor

The backend shall authenticate and authorise requests, validate input, enforce idempotency, lock or conditionally update accounts, post financial records atomically, update balance projections, record audit events and support reconciliation.

### 5.5 Deployment / bootstrap operator

An authorised deployment operator is responsible for the restricted one-time provisioning of the initial administrator and, when needed, a dedicated demo-operator account. This is an operational role, not a public application role. The operator uses a controlled deployment/seed command and secure secret delivery; there is no public registration or unauthenticated API for assigning privileged roles. Bootstrap activity must be recorded in the audit trail where the database is available.

### 5.6 Role-permission matrix

| Capability | Customer | Demo operator | Administrator |
|---|---:|---:|---:|
| Register/login and manage own profile | Yes | Yes | Yes |
| Create/list own accounts | Yes | No; demo operator is a separate exclusive MVP role | No through admin role alone |
| View own balances and transactions | Yes | No; use a separate customer account for customer workflows | Yes, for permitted admin investigation |
| Transfer from own account | Yes | No | No through admin role alone |
| Withdraw from own account | Yes | No | No through admin role alone |
| Simulated deposit | No by default | Yes, demo environment only | Yes, demo environment only |
| Freeze/unfreeze account | No | No | Yes |
| Close account | No | No | Yes, zero balance and no in-progress operation required |
| Run reconciliation | No | No | Yes |
| View system-wide audit/attempt records | No | No | Yes |
| Modify/delete posted ledger entries | No | No | No through normal application paths |
| Initiate full reversal | No | No | Yes, Phase 2 and audited |

The MVP uses one exclusive role per user: `CUSTOMER`, `DEMO_OPERATOR` or `ADMIN`. A `DEMO_OPERATOR` is a dedicated test identity and does not inherit customer account operations; a separate customer test identity must be used for customer workflows. An administrator's system-wide visibility is separate from permission to debit a customer account. No role grants ownership of an account.

## 6. Functional requirements

Requirement labels: **MVP**, **MVP-demo**, or **Phase 2**.

### 6.1 Registration and authentication

- **FR-001 (MVP):** The system shall allow a customer to register with required profile details and a unique email address.
- **FR-002 (MVP):** The system shall reject missing, malformed or duplicate registration information; public registration shall always assign `CUSTOMER` and shall reject a client-supplied `role` or privilege field.
- **FR-002A (MVP):** Passwords shall be 12–128 characters, shall not be silently trimmed or truncated, and may contain spaces/passphrases; no arbitrary character-class composition rule is required.
- **FR-003 (MVP):** The system shall store only a suitable password hash using bcrypt or Argon2id with appropriate parameters. Plain-text passwords shall never be stored or logged.
- **FR-004 (MVP):** The system shall verify credentials, create a server-side session record, issue a 15-minute JWT access token and set a rotating seven-day opaque refresh token in a secure HttpOnly cookie.
- **FR-005 (MVP):** Protected endpoints shall reject missing, invalid, expired or revoked authentication.
- **FR-006 (MVP):** Logout shall immediately revoke the current server-side session so all access JWTs containing that session ID are rejected on the next protected request, and shall clear the refresh-token cookie.
- **FR-007 (MVP):** The system shall rate-limit repeated authentication attempts and avoid account-enumeration disclosures.

### 6.2 Account management and lifecycle

- **FR-008 (MVP):** The system shall create a unique customer account identifier associated with the authenticated owner.
- **FR-009 (MVP):** New customer accounts shall start with zero balance and an associated customer ledger account.
- **FR-010 (MVP):** A customer shall list only accounts they own or are explicitly authorised to access.
- **FR-011 (MVP):** The system shall return account identifier, display account number, account-holder name, currency, status and balance to an authorised owner or administrator with permitted read access. The account-holder name shall be retrieved from the user profile associated with the account; do not trust a client-supplied name or maintain an independently editable duplicate as the source of truth.
- **FR-012 (MVP):** The system shall enforce account status on every financial operation. The transfer processor shall read/check account status while holding the same row lock used for the operation, or through an equivalent atomic condition, so a concurrent freeze cannot race with a debit/credit.
- **FR-013 (MVP):** Only an administrator may freeze or unfreeze an account, and every status change shall be audited. Status changes shall lock the account row using the same lock order/concurrency policy as financial operations. A transaction already holding the lock may complete before the freeze commits; operations beginning after the freeze commits must be rejected.
- **FR-014 (MVP):** A closed account shall be terminal in the MVP and shall not be reopened. Only an administrator may close it through `POST /api/v1/admin/accounts/{accountId}/close`. Closure requires zero ledger-derived balance, zero balance projection, no in-progress financial operation and an audit reason.
- **FR-015 (MVP):** A frozen or closed account shall not send or receive transfers in the MVP.
- **FR-016 (MVP):** Account numbers shall be generated with a database uniqueness constraint; collisions shall be handled safely without exposing internal identifiers. The basic MVP generation rule is defined in Section 11.2; enhanced checksum/branch formats are optional.

### 6.3 Balance enquiry

- **FR-017 (MVP):** The system shall return the account's balance only to an authorised owner or permitted administrator.
- **FR-018 (MVP):** The account balance projection shall be updated in the same database transaction as the corresponding ledger posting.
- **FR-019 (MVP):** The system shall calculate a ledger-derived customer balance and compare it with the stored account balance projection during reconciliation.
- **FR-020 (MVP):** The API shall identify the currency and express balances consistently in minor units or an explicitly documented display format.

### 6.4 Internal transfers

- **FR-021 (MVP):** An authenticated customer shall be able to request a transfer by specifying sender account, receiver account, amount, currency and optional description.
- **FR-022 (MVP):** The backend shall derive the actor from authenticated identity and verify that the actor owns the sender account. It shall not trust a frontend-supplied user ID or sender ID as proof of authority.
- **FR-023 (MVP):** The system shall verify that the receiver exists, is active and is eligible to receive the transfer.
- **FR-024 (MVP):** The system shall reject a transfer if the amount is invalid, the accounts are the same, currencies differ, either account is ineligible, the amount exceeds configured limits or the sender lacks available funds.
- **FR-025 (MVP):** The system shall create one posted financial transaction, update both account balance projections and insert corresponding debit and credit ledger entries within one database transaction.
- **FR-026 (MVP):** If any financial posting step fails, all financial changes in that posting transaction shall roll back.
- **FR-027 (MVP):** The system shall return a stable transaction ID and `POSTED` status only after commit.

### 6.5 Simulated deposits and withdrawals

- **FR-028 (MVP-demo):** The system shall support simulated deposits only for an authenticated `ADMIN` or explicitly authorised `DEMO_OPERATOR`, only when the deployment environment is `DEMO` or `TEST` and `DEMO_FUNDING_ENABLED=true`. Ordinary `CUSTOMER` users shall receive `403 FORBIDDEN` by default. Production must hard-disable simulated deposits regardless of the stored feature-flag value.
- **FR-029 (MVP-demo):** Every simulated deposit shall create a debit to a designated system funding/cash counterpart ledger account and a credit to the customer ledger account.
- **FR-030 (MVP):** An authorised customer shall be able to request a withdrawal from an account they own.
- **FR-031 (MVP):** Every withdrawal shall debit the customer ledger account and credit a designated system withdrawal/clearing counterpart account.
- **FR-032 (MVP):** Deposits and withdrawals shall use the same validation, idempotency, atomic posting, audit and ledger-balancing controls as transfers.
- **FR-033 (MVP):** Demo interfaces and documentation shall clearly identify simulated funding/withdrawals as non-real operations.

### 6.6 Transaction attempts and idempotency

- **FR-034 (MVP):** Every transfer, deposit and withdrawal request shall include an idempotency key.
- **FR-035 (MVP):** Idempotency shall be scoped by authenticated principal, operation name/version and client-provided key.
- **FR-036 (MVP):** A database unique constraint shall enforce one idempotency record per `(principal_id, operation, idempotency_key)` scope.
- **FR-037 (MVP):** The system shall calculate a deterministic request fingerprint from all semantically relevant request fields, including operation, account identifiers, amount, currency and any field that changes the operation's effect or stored response.
- **FR-038 (MVP):** Reusing a key with the same fingerprint shall return the original stored outcome and shall not execute a second financial operation.
- **FR-039 (MVP):** Reusing a key with a different fingerprint shall return a conflict and shall not create a new financial operation.
- **FR-040 (MVP):** Concurrent requests using the same scoped key shall result in at most one financial posting.
- **FR-041 (MVP):** Deterministic business outcomes reached after key reservation, including insufficient funds and account-ineligible rejection, shall be stored and replayed for the same key and fingerprint.
- **FR-042 (MVP):** Authentication failures and malformed requests rejected before the idempotency processing boundary shall not reserve an idempotency key.
- **FR-043 (MVP):** A technical failure before commit shall roll back the key reservation and financial posting. The same key may be retried safely because no committed financial effect exists.
- **FR-044 (MVP):** A request retried after the original commit but after a lost HTTP response shall return the original committed result.
- **FR-045 (MVP):** The system shall record request attempts and their outcomes separately from posted financial transactions.

### 6.7 Concurrency and atomicity

- **FR-046 (MVP):** The system shall prevent concurrent withdrawals/transfers from debiting more than the available balance.
- **FR-047 (MVP):** Conflicting account updates shall use database row locks (`SELECT ... FOR UPDATE`), atomic conditional updates or an equivalently safe database mechanism.
- **FR-048 (MVP):** When more than one account row is locked, locks shall be acquired in deterministic order, such as ascending internal account ID.
- **FR-049 (MVP):** Transaction header, account balance updates, ledger entries, final idempotency outcome and required success audit record shall commit or roll back together.
- **FR-050 (MVP):** The system shall handle deadlocks and transient database failures using bounded, safe retries where appropriate. Any retry shall preserve the same idempotency key and shall not duplicate a posting.
- **FR-051 (MVP):** In-memory locks or frontend button disabling shall not be treated as the primary concurrency control.

### 6.8 Ledger and accounting

- **FR-052 (MVP):** Every posted financial operation shall have one transaction header and two or more ledger entries.
- **FR-053 (MVP):** For each posted transaction and currency, total debits shall equal total credits.
- **FR-054 (MVP):** Ledger entry amounts shall be positive integer minor units; `DEBIT` or `CREDIT` shall represent direction.
- **FR-055 (MVP):** Each ledger entry shall reference its transaction and a defined ledger account.
- **FR-056 (MVP):** Customer accounts shall map to customer ledger accounts; simulated funding/withdrawals shall use designated system counterpart ledger accounts.
- **FR-057 (MVP):** Posted ledger entries shall be append-only through application permissions. Normal application credentials shall not have UPDATE or DELETE privileges on posted ledger rows.
- **FR-058 (MVP):** Database-level controls shall reject attempts to update/delete posted ledger entries. The application role must lack UPDATE/DELETE privileges, and a database trigger shall reject mutation attempts even if a different application code path is introduced. Privileged migrations use a separate role and must be audited.
- **FR-059 (MVP):** Corrections shall not alter historical entries. They shall use new compensating/reversal transactions.
- **FR-060 (MVP):** The system shall reconcile customer account balance projections against posted ledger entries.
- **FR-061 (MVP):** The system shall reconcile debit and credit totals per transaction and currency, reconcile the normal-side balance of every customer and system ledger account (including `DEMO_CASH_CLEARING`), and report discrepancies without silently changing records.

### 6.9 Transaction history and status

- **FR-062 (MVP):** A customer shall list only posted transactions involving accounts they are authorised to access.
- **FR-063 (MVP):** A customer shall be able to view request attempts/outcomes for their own financial requests, including deterministic rejections, without confusing them with posted transactions.
- **FR-064 (MVP):** Transaction details shall include ID, type, amount, currency, status, creation/posting time and permitted counterparty details.
- **FR-065 (MVP):** History shall support pagination, stable sorting and basic filters for date, type and status.
- **FR-066 (MVP):** A transaction shall be shown as `POSTED` only after the posting database transaction commits.
- **FR-067 (MVP):** The API shall distinguish business rejection from transient technical processing failure.

### 6.10 Audit and administration

- **FR-068 (MVP):** The system shall record successful and security-relevant failed events, including authentication outcomes, account status changes, financial requests, reconciliation and administrative actions.
- **FR-069 (MVP):** Audit events shall include actor where known, action, resource reference, timestamp, outcome and correlation/request ID.
- **FR-070 (MVP):** Passwords, access tokens, refresh tokens, secrets and unnecessary sensitive personal data shall never be logged.
- **FR-071 (MVP):** Normal customer operations shall not modify or delete audit records.
- **FR-072 (MVP):** Administrative endpoints shall enforce server-side administrator authorisation.
- **FR-073 (MVP):** An administrator shall be able to run reconciliation and inspect reconciliation results and discrepancies for all ledger accounts, including system counterpart accounts.
- **FR-080 (MVP):** The system shall expose an administrator-only account-closure endpoint with an exact request/response contract, zero-balance precondition, no-in-progress-operation precondition and mandatory audit record.
- **FR-081 (MVP):** Reconciliation shall include every ledger account regardless of whether it is customer-owned or system-owned, and shall explicitly check the `DEMO_CASH_CLEARING` account.
- **FR-082 (MVP):** The system shall provide an administrator-controlled demo-funding feature flag that can be enabled only in a non-production demo environment; the flag change shall be authenticated, authorised and audited.
- **FR-083 (MVP):** All MVP API endpoints shall have documented method, path, authentication, permission, request fields, response fields, validation rules and error codes as specified in Section 13.10.
- **FR-084 (MVP):** The system shall provide an administrator-only monitoring experience on one screen for posted transactions and request attempts, using separately labelled result panels and their respective data sources. It shall support the search filters and pagination rules in US-19 and API contracts 16–17, and shall not represent an attempt record as an additional posted transaction.
- **FR-085 (MVP):** Reconciliation shall execute every ledger, transaction and account-projection check within one consistent PostgreSQL `REPEATABLE READ`, read-only database snapshot (or an explicitly approved equivalent) so concurrent commits cannot create false discrepancies between queries in one run.
- **FR-086 (MVP):** The system shall provide an administrator-only collection API to list prior reconciliation runs with status/date filters, pagination and stable newest-first ordering, in addition to retrieving an individual run by ID.
- **FR-087 (MVP):** The initial `ADMIN` identity shall be provisioned only through a restricted one-time deployment bootstrap/seed process using securely supplied credentials; public registration shall never create or accept an administrator role.
- **FR-088 (MVP):** `DEMO_OPERATOR` identities shall be provisioned only through a restricted deployment seed/process; public registration shall never grant this role. Bootstrap and role-provisioning activity shall be auditable.
- **FR-089 (MVP):** The administrator UI shall provide a demo-funding settings section using the existing GET/PATCH settings APIs, show the active environment and current flag state, and require a reason for changes; backend environment restrictions remain authoritative.
- **FR-090 (MVP):** Reconciliation-run and discrepancy persistence fields required by the list/detail APIs shall be mandatory schema fields with defined types, nullability, constraints and indexes.
- **FR-091 (MVP):** INR monetary values shall be displayed with two fractional digits and Indian digit grouping (for example `₹2,000.00`) while API/database values remain exact integer paise.

### 6.11 Reversal of posted transactions

- **FR-074 (Phase 2):** The system may support full reversal of an eligible posted transaction through a new reversal transaction referencing the original.
- **FR-075 (Phase 2):** A full reversal shall invert the original debit/credit entries and update affected balance projections atomically.
- **FR-076 (Phase 2):** A unique constraint shall prevent more than one full reversal of the same original transaction.
- **FR-077 (Phase 2):** A reversal shall be authorised, audited and idempotent.
- **FR-078 (Phase 2):** A reversal shall not force a customer account below zero. If the funds are no longer available, the reversal shall be rejected and flagged for a separately governed resolution process.
- **FR-079 (Phase 2):** The original posted transaction shall remain visible and unchanged; the reversal shall be a new linked record.

## 7. User stories and acceptance criteria

User-story format: **As a [role], I want [capability], so that [benefit].** Acceptance criteria use observable system behaviour.

### Epic A — Access and account management

**US-01 — Register**  
As a new customer, I want to register so that I can use LedgerLine.

Acceptance criteria:
- Given valid, unused registration details, when I submit registration, then a customer record is created with role `CUSTOMER`.
- Given an email already in use, when I register, then the system rejects the duplicate.
- Password length is 12–128 characters; spaces/passphrases are accepted and passwords are not silently trimmed or truncated.
- A client-supplied role/privilege field is rejected; public registration cannot create an administrator or demo operator.
- Password storage contains a password hash, not the original password.

**US-02 — Log in and log out**  
As a registered customer, I want to authenticate and end my session so that access to my account is controlled.

Acceptance criteria:
- Valid credentials establish an authenticated session/token.
- Invalid credentials are rejected without disclosing whether the email exists.
- Missing, invalid, expired or revoked credentials cannot access protected APIs.
- Access JWT expires after 15 minutes; refresh token expires after 7 days and rotates on each use.
- Logout revokes the current session immediately; a previously issued access JWT for that session is rejected on its next protected request.
- Reuse of a rotated refresh token revokes its token family and produces an audit event.

**US-03 — Create and view accounts**  
As a customer, I want to create and view my accounts so that I can hold and manage LedgerLine funds.

Acceptance criteria:
- A new account is associated with the authenticated owner and starts at zero.
- Account number uniqueness is enforced by the database.
- A customer cannot list or view another customer's private account.
- The account-details view displays account number, account-holder name, currency, current/available balance, account status and creation date.
- The account-holder name is read from the user profile linked to the account; the API does not accept a name from the client.
- An administrator may view the same fields only where the administrator's read permission permits access.

**US-04 — View balance**  
As a customer, I want to view my account balance so that I know how much I can transfer or withdraw.

Acceptance criteria:
- The displayed amount includes currency and is formatted consistently.
- The MVP available balance equals the posted ledger-derived customer balance.
- Balance enquiry does not mutate financial data.

**US-05 — Freeze, unfreeze and close accounts**  
As an administrator, I want to control account status so that ineligible accounts cannot transact.

Acceptance criteria:
- Only an administrator can freeze, unfreeze or close an account in the MVP.
- Account closure uses the dedicated close-account API, requires zero balance and no in-progress operation, and is terminal.
- Every status transition is audited with actor and timestamp.
- Frozen/closed accounts cannot send or receive in the MVP.
- An account may be closed only with zero balance; closed is terminal in the MVP.

### Epic B — Financial operations

**US-06 — Transfer funds**  
As a customer, I want to transfer funds to another active account so that I can move money securely.

Acceptance criteria:
- The server verifies the caller, sender ownership, receiver eligibility, amount, currency and balance.
- A successful transfer reduces the sender and increases the receiver by exactly the same amount.
- The transfer creates a transaction header and balanced ledger entries.
- All posting changes commit together; an injected failure leaves no partial financial changes.
- Success is returned only after commit.

**US-07 — Simulate a deposit**  
As an authorised demo operator, I want to simulate funding so that I can test incoming money movement.

Acceptance criteria:
- Only an authenticated `ADMIN` or explicitly authorised `DEMO_OPERATOR` may initiate a simulated deposit.
- The request is accepted only when the deployment environment is `DEMO` or `TEST` and `DEMO_FUNDING_ENABLED=true`; production always rejects it.
- An ordinary `CUSTOMER` receives `403 FORBIDDEN` unless a separately approved customer-demo-funding policy is documented and enabled; that exception is not part of the default MVP.
- The frontend displays the deposit action only to permitted roles and clearly labels it as simulated; backend authorisation remains authoritative.
- A system counterpart debit and customer-account credit are posted atomically.
- The operation is idempotent and audited, including actor, target account, amount, environment and correlation ID.
- Integration tests prove that permitted demo operators succeed, ordinary customers fail, and every production request fails even if a feature-flag record is incorrectly set to true.

**US-08 — Withdraw funds**  
As a customer, I want to withdraw funds from my own account so that I can test outgoing money movement.

Acceptance criteria:
- The server verifies ownership, account status and positive amount.
- A withdrawal cannot exceed the available balance.
- The customer ledger account is debited and system withdrawal/clearing account credited atomically.
- Concurrent withdrawals cannot overdraw the account.

### Epic C — Request safety and traceability

**US-09 — Retry safely**  
As a customer, I want a retry to return the original result so that network interruption does not cause duplicate money movement.

Acceptance criteria:
- Same scoped key and same fingerprint returns the original outcome.
- Same key and different fingerprint returns conflict.
- A deterministic business rejection is replayed for the same key and fingerprint.
- Concurrent requests with the same key produce at most one financial posting.
- A retry after a committed operation with a lost response returns the original transaction result.

**US-10 — Understand failed requests**  
As a customer, I want to view the outcome of my financial requests so that I understand why an operation did not post.

Acceptance criteria:
- Deterministic business rejections are visible as request attempts, not as posted transactions.
- Rejected requests have a safe machine-readable reason code and human-readable message.
- Rejected requests have no ledger entries and do not change balances.
- Customers can see only their own request attempts.

**US-11 — Handle concurrent transactions**  
As a customer, I want simultaneous operations to preserve correct balances so that the same funds cannot be spent twice.

Acceptance criteria:
- Competing withdrawals whose combined total exceeds the starting balance cannot both post.
- Two different transfers from the same sender account, submitted concurrently with different idempotency keys and different receiver accounts, cannot collectively exceed the sender's starting balance.
- Account updates are protected by database locking or atomic conditional updates.
- No successful operation leaves a customer balance negative.
- A rejected concurrent operation must not credit its receiver or create posted ledger entries.
- Every successful concurrent transfer has complete, balanced ledger entries.
- Ledger-derived balances equal stored balance projections for the sender and all affected receivers after both requests finish.

### Epic D — Ledger, audit and reconciliation

**US-12 — Inspect a posted transaction**  
As a customer, I want to view a posted transaction so that I can verify its details.

Acceptance criteria:
- The transaction is retrievable by its stable ID when the customer is authorised.
- The displayed status agrees with committed database state.
- Amount, currency, time and permitted counterparty details are displayed.

**US-13 — Reconcile account balances and ledger**  
As an administrator, I want to reconcile account balances and ledger entries so that financial discrepancies are detected without false differences caused by concurrent postings.

Acceptance criteria:
- Debits and credits are compared per posted transaction and currency.
- Each customer account's ledger-derived balance is compared with its balance projection.
- Every customer and system ledger account is included, including `DEMO_CASH_CLEARING`.
- All reads used for one reconciliation result are evaluated within one consistent read-only `REPEATABLE READ` snapshot (or an explicitly approved equivalent).
- A transfer committed after the snapshot is established is consistently excluded from that run; it is included in a later run. A single run must not mix pre-commit and post-commit views across its queries.
- Discrepancies identify account/transaction references and differences.
- Reconciliation reports results but never silently changes historical entries.

**US-14 — Inspect audit activity**  
As an administrator, I want to inspect audit events so that important activity is traceable.

Acceptance criteria:
- Events include actor, action, timestamp, outcome, resource and correlation ID where available.
- Customers cannot access admin audit endpoints.
- Secrets and credentials are not logged.

**US-15 — Reverse a posted operation (Phase 2)**  
As an authorised administrator, I want to reverse an eligible posted operation so that an error can be corrected without editing historical records.

Acceptance criteria:
- The reversal references the original transaction.
- The reversal is a new balanced transaction with opposite entries.
- A unique constraint prevents a second full reversal.
- The reversal is atomic, authorised, idempotent and audited.
- Insufficient funds prevent a reversal that would make a customer balance negative.


**US-16 — Close an account**  
As an administrator, I want to close an eligible account so that an account that is no longer needed cannot be used for future financial operations.

Acceptance criteria:
- Only an authenticated administrator can call the close-account endpoint.
- The account must exist, be `ACTIVE` or `FROZEN`, have zero ledger-derived balance and zero balance projection, and have no in-progress financial operation.
- The account becomes `CLOSED` atomically with the audit event.
- A closed account cannot send or receive money and cannot be reopened in the MVP.
- A non-zero balance or in-progress operation returns a stable conflict/business error and leaves the account unchanged.

**US-17 — Review reconciliation runs**  
As an administrator, I want to inspect current and previous reconciliation runs so that I can investigate financial discrepancies over time.

Acceptance criteria:
- A run covers all customer and system ledger accounts, including `DEMO_CASH_CLEARING`.
- The result includes run ID, time range, scope, currency, consistency mode, total customer/system accounts and transactions checked, status and discrepancy details.
- Administrators can discover previous runs through a paginated collection API and open an individual run by its run ID.
- The collection supports status and date-range filters, newest-first sorting and a stable run-ID tie-breaker.
- A discrepancy identifies the affected ledger account or transaction, currency, expected value, actual value and difference.
- Every run evaluates all reconciliation queries against one consistent read-only database snapshot.
- Reconciliation never edits ledger history or automatically changes balances.

**US-18 — Inspect audit logs**  
As an administrator, I want to search audit logs so that I can trace financial, security and administrative activity.

Acceptance criteria:
- The administrator can filter by date range, actor, action, outcome and correlation ID.
- Audit records include actor when known, action, resource, timestamp, outcome and correlation ID.
- Passwords, tokens and secrets are absent from records.
- Customers and demo operators cannot read system-wide audit logs.

**US-19 — Search system transactions and request attempts**  
As an administrator, I want to monitor posted transactions and request attempts from one administration screen so that I can investigate successful, rejected and retried operations without confusing financial postings with request records.

Acceptance criteria:
- The administrator monitoring screen contains clearly labelled, separately identifiable `Posted transactions` and `Request attempts` panels or tabs on the same screen.
- The screen supports searching posted transactions by transaction ID, account ID, user ID, operation/type, posted status and date range.
- The screen supports searching request attempts by attempt ID, account ID, user ID, operation, attempt outcome/reason and date range.
- The same filter controls may be shared visually, but each panel applies only the filters relevant to its own data source.
- Results in each panel are paginated independently and sorted newest first with a stable ID tie-breaker; the UI must not imply that separate page streams are one globally merged page.
- Posted transactions are shown only from the `transactions` data set. Rejections, validation failures, idempotent replays/conflicts and processing attempts are shown from `transaction_attempts`.
- An attempt that resulted in a posted transaction may reference its transaction ID, but the UI must not count the attempt as a second posted transaction.
- Only administrators can access system-wide monitoring. Returned fields must not expose passwords, tokens, secrets or unnecessary personal data.

**US-20 — Control demo funding**  
As an administrator, I want to enable or disable simulated funding in the demo environment so that test money creation is controlled.

Acceptance criteria:
- The administrator dashboard contains a dedicated demo-funding settings section that displays the deployment environment and current setting.
- The screen uses the existing GET and PATCH demo-funding APIs; it does not implement a frontend-only override.
- An administrator must provide a reason when changing the setting.
- The setting can be enabled only when the deployment environment is explicitly `DEMO` or `TEST`.
- In `PRODUCTION`, the API cannot enable simulated funding and the feature remains disabled.
- Every setting change records actor, previous value, new value, timestamp and reason.
- Ordinary customers cannot call the simulated deposit endpoint unless a separately approved demo role/policy grants it.

**US-21 — Understand temporary processing failures**  
As a customer, I want a clear retryable response when the service or database is temporarily unavailable so that I do not mistake an uncommitted operation for a successful payment.

Acceptance criteria:
- The API does not return success unless the posting transaction committed.
- A transient failure returns a stable retryable error and correlation ID.
- The client retries the same logical request with the same idempotency key.
- If the original request actually committed before its response was lost, the retry returns the original outcome; otherwise it may be processed once.

**US-22 — Provision privileged demo access**  
As an authorised deployment operator, I want to provision the initial administrator and any required demo-operator identity through a restricted deployment process so that privileged access exists without allowing public privilege escalation.

Acceptance criteria:
- A one-time bootstrap command provisions the initial `ADMIN` only when no administrator already exists.
- Bootstrap credentials are supplied through a deployment secret manager or secure one-time input; no default password or privileged credential is hardcoded in source control or logs.
- The bootstrap command fails safely if an administrator already exists and does not reset an existing administrator's password or privileges on rerun.
- A dedicated `DEMO_OPERATOR`, when required, is provisioned only through a restricted deployment seed/process and is recorded in the audit trail.
- Public registration always creates `CUSTOMER`; a client-supplied `role` or privilege field is rejected.
- No public API permits a customer to assign or elevate their own role.

## 8. Transaction concepts and lifecycle

### 8.1 Keep three concepts separate

The database and UI must distinguish these objects:

| Concept | Meaning | Creates ledger entries? |
|---|---|---|
| Request attempt | One incoming API attempt and its outcome | No, by itself |
| Financial transaction | A successfully posted business operation | Yes |
| Ledger entry | One debit or credit line belonging to a financial transaction | It is the accounting record |

A rejected attempt is not a posted financial transaction. A duplicate replay is another request attempt referring to the original idempotency outcome; it is not a new financial transaction.

### 8.2 Status models

**Request-attempt outcomes** may include:

- `RECEIVED`
- `VALIDATION_REJECTED`
- `BUSINESS_REJECTED`
- `POSTED`
- `IDEMPOTENT_REPLAY`
- `IDEMPOTENCY_CONFLICT`
- `PROCESSING_ERROR`

**Idempotency outcome states** persisted after the processing transaction commits:

- `POSTED` — original operation committed and links to a financial transaction.
- `REJECTED` — deterministic business rejection was committed and has no financial transaction.

The `IN_PROGRESS` reservation exists only inside the uncommitted database transaction for the synchronous MVP. It must not remain committed as a permanent in-progress row after a process crash.

**Financial transaction records** in the MVP represent posted financial operations only. They have `POSTED` status and a posting timestamp. Rejected/failed requests belong in request-attempt records, not in the posted financial transaction table.

### 8.3 Deterministic business rejection versus technical failure

Deterministic business rejection examples:
- Insufficient funds.
- Sender account frozen.
- Receiver account closed.
- Sender does not own the account.
- Amount exceeds configured business limit.

When such an outcome is reached after a valid idempotency key has been reserved, commit the request attempt and idempotency outcome as `REJECTED`, but do not create a financial transaction or ledger entries.

Technical failure examples:
- Database connection lost.
- Deadlock not resolved after bounded retry.
- Unexpected application exception.

For a technical failure before commit, roll back the database transaction, including any uncommitted idempotency reservation and financial changes. Record a technical attempt/audit event separately on a best-effort basis after rollback. If the database itself is unavailable, use structured application logging. The same key may be retried because no committed financial effect exists.

### 8.4 Synchronous transfer processing sequence

1. Receive request over HTTPS.
2. Authenticate caller.
3. Validate request structure and required idempotency key format.
4. Derive actor identity from authenticated server context.
5. Canonicalise semantically relevant request fields and calculate request fingerprint.
6. Begin a database transaction.
7. Attempt to insert the scoped idempotency record using the database unique constraint.
8. If the key already exists, load the committed record:
   - Same fingerprint and `POSTED`: return original transaction result.
   - Same fingerprint and `REJECTED`: return original rejection.
   - Different fingerprint: return conflict; do not post.
   - Handle transaction isolation and concurrent insert waiting as described in Section 8.5.
9. If this request reserved the key, lock relevant account rows in deterministic order.
10. Verify account existence, owner, status, currency, amount limits and sufficient balance.
11. If a deterministic business rule fails, insert a `BUSINESS_REJECTED` attempt, store a safe rejection outcome on the idempotency record, commit this request outcome and return it. Do not insert a posted financial transaction or ledger entries.
12. If valid, insert the financial transaction header.
13. Update sender and receiver balance projections.
14. Insert sender debit and receiver credit ledger entries.
15. Verify debit total equals credit total for the transaction and currency.
16. Insert the request attempt as `POSTED` and update idempotency record to `POSTED`, storing safe response data and transaction reference.
17. Insert required success audit event.
18. Commit the database transaction.
19. Only after commit, return the successful response.

Any failure during financial posting must roll back the entire posting transaction. Do not return success before commit.

### 8.5 Safe idempotency concurrency strategy (PostgreSQL recommendation)

A naive `SELECT`-then-`INSERT` is unsafe because two requests can both observe no key before either inserts it.

Recommended strategy:

- Define a unique constraint on `(principal_id, operation, idempotency_key)`.
- Start the financial request's database transaction.
- Use `INSERT ... ON CONFLICT DO NOTHING RETURNING ...` (or a carefully handled unique-constraint approach) to reserve the key.
- If the insert succeeds, this request owns the uncommitted reservation and continues.
- If the insert does not succeed, load the existing committed record after PostgreSQL resolves the conflicting insert. Compare the stored fingerprint and return its stored outcome or a conflict.
- If the first request rolls back, its uncommitted key reservation disappears; another waiting request can reserve the key and process.
- If the first request commits, the waiting request observes the final stored `POSTED` or `REJECTED` result.

Do not catch a PostgreSQL uniqueness error and continue using an aborted transaction. Prefer `ON CONFLICT DO NOTHING` or use a savepoint/transaction restart as appropriate. Implement and integration-test the exact behaviour against the selected PostgreSQL version and isolation level.

For the MVP, reserve the idempotency key, perform the financial posting or deterministic business rejection, and store the final outcome in the same database transaction. This avoids a committed abandoned `IN_PROGRESS` row. Use PostgreSQL `READ COMMITTED` for the recommended `INSERT ... ON CONFLICT DO NOTHING` then `SELECT` flow, or explicitly handle snapshot visibility/serialization failures if another isolation level is selected. Retry serialization/deadlock failures only with bounded retries and the same idempotency key.

### 8.6 Request fingerprint and key rules

- Key format: opaque client-generated random value; UUIDv4 is suitable for the MVP.
- Suggested length: 16–128 characters.
- Scope: authenticated principal + operation/version + key.
- Fingerprint: hash of canonical JSON or a canonical field sequence containing all fields that affect financial effect or the stored response.
- Include account IDs, amount in minor units, currency, operation and relevant options.
- If description is stored as part of the resulting transaction, include it in the fingerprint or define it as non-semantic and immutable on first request. The recommended MVP is to include it.
- The frontend generates one key per logical operation and reuses it for network retries. A genuinely new operation receives a new key.
- Retain key outcomes at least as long as the corresponding transaction/attempt records; no auto-expiry during the MVP.

### 8.7 Concurrency control

Recommended PostgreSQL implementation (MVP): use PostgreSQL `READ COMMITTED` isolation for the described idempotency reservation flow unless the team has a tested reason to choose another level.

- Begin a database transaction.
- Lock all customer account rows involved using `SELECT ... FOR UPDATE`.
- Lock rows in a deterministic order (for example, ascending UUID text/binary order) to reduce deadlocks.
- Check sender funds after acquiring the lock.
- Update projections and insert ledger records before commit.
- Enforce `balance_minor >= 0` as a database check on customer account projections as defence in depth.
- Account freeze/unfreeze/close operations must acquire the same account row lock so account status transitions are serialised with financial operations.

An alternative is an atomic conditional debit:

```sql
UPDATE accounts
SET balance_minor = balance_minor - :amount_minor,
    updated_at = NOW()
WHERE id = :sender_account_id
  AND owner_user_id = :authenticated_user_id
  AND status = 'ACTIVE'
  AND balance_minor >= :amount_minor;
```

The application must verify exactly one row was updated. Receiver credit, ledger entries, transaction record and idempotency outcome must still be in the same database transaction.

Do not rely on frontend checks, a read-then-write sequence without locking, in-memory Node.js locks, or disabling a button as the primary safety mechanism.

## 9. Ledger and accounting model

### 9.1 Core ledger principles

- The ledger is the durable accounting record of posted money movements.
- The `transactions` table is the business-operation header; `ledger_entries` are its accounting lines.
- Every posted transaction must have at least two entries and balance per currency.
- Ledger entry amounts are positive integer minor units; direction is stored separately as `DEBIT` or `CREDIT`.
- Each entry references exactly one transaction and one ledger account.
- Posted entries are append-only through application and database permissions.
- Corrections are represented by new compensating/reversal transactions, never by editing the original entries.
- Customer account balance projections are updated in the same transaction as ledger posting.

### 9.2 Debit/credit convention for this MVP

For the customer account subledger:

- `CREDIT` increases the customer's balance.
- `DEBIT` decreases the customer's balance.
- Customer account normal side is `CREDIT`.

This is an explicit product convention for customer balances. It should not be generalised to every accounting account without considering account type and normal side.

For a generic ledger account, define `normal_side` as `DEBIT` or `CREDIT`. Its net balance is:

- Debit-normal account: total debits minus total credits.
- Credit-normal account: total credits minus total debits.

### 9.3 Ledger account catalogue

Create an explicit `ledger_accounts` table. Do not leave the relationship between customer accounts and ledger accounts as an implementation choice.

Minimum account categories:

- `CUSTOMER_BALANCE` — one credit-normal ledger account mapped to each customer account.
- `DEMO_CASH_CLEARING` — one controlled debit-normal system asset/clearing account used as the counterpart for both simulated deposits and withdrawals. Deposits debit it; withdrawals credit it. Reconciliation must always include this account and report its normal-side balance. This keeps demo funding/withdrawal accounting in one coherent counterpart account. It is not evidence of real cash settlement.

A customer-facing `accounts` row shall have exactly one corresponding customer ledger account. System ledger accounts are not owned or operated by ordinary customers.

### 9.4 Transfer example

Customer A sends ₹2,000 to Customer B.

| Ledger account | Entry | Amount |
|---|---|---:|
| Customer A balance account | Debit | 200,000 paise |
| Customer B balance account | Credit | 200,000 paise |
| **Totals** | **Debits = Credits** | **200,000 = 200,000** |

If A starts with ₹10,000 and B starts with ₹5,000, A ends with ₹8,000 and B ends with ₹7,000.

### 9.5 Simulated deposit example

A simulated deposit of ₹500:

| Ledger account | Entry | Amount |
|---|---|---:|
| `DEMO_CASH_CLEARING` (debit-normal) | Debit | 50,000 paise |
| Customer balance account | Credit | 50,000 paise |

This is an internally balanced demo entry. It does not prove that real external cash was received.

### 9.6 Simulated withdrawal example

A simulated withdrawal of ₹300:

| Ledger account | Entry | Amount |
|---|---|---:|
| Customer balance account | Debit | 30,000 paise |
| `DEMO_CASH_CLEARING` (debit-normal) | Credit | 30,000 paise |

This is an internally balanced demo entry. It does not prove that real external cash was paid.

### 9.7 Opening balances

- Newly created customer accounts start at zero.
- Do not populate `balance_minor` with an arbitrary non-zero value without corresponding ledger evidence.
- To seed demo funds, post a simulated deposit through the same posting service and counterpart account as normal demo funding.
- The balance projection and ledger entry must be created/updated atomically.
- Do not add the same opening amount both as an unposted column value and as a ledger entry.

### 9.8 Balance definitions

For MVP customer accounts:

- **Ledger balance:** credits minus debits from posted ledger entries for the customer's ledger account.
- **Account balance projection:** cached `balance_minor` maintained atomically with ledger postings.
- **Available balance:** equal to ledger balance in the MVP because there are no holds, reservations, overdrafts or pending external settlements.

Reconciliation must check:

`account.balance_minor = SUM(customer ledger credits) - SUM(customer ledger debits)`

The balance projection is a performance/read model, not an independent source of truth.

### 9.9 Reconciliation requirements — all ledger accounts are in scope

Reconciliation must enumerate **every row in `ledger_accounts`**, not only customer-owned accounts. This includes each `CUSTOMER_BALANCE` account and every system account, explicitly including `DEMO_CASH_CLEARING`. Disabled accounts remain in historical reconciliation because their posted ledger entries still matter.

**Consistent-snapshot requirement (MVP):** All reads for one run—including transaction totals, ledger-entry sums, customer balance projections, system-account balances and account-to-ledger mappings—shall execute inside one PostgreSQL read-only transaction using `REPEATABLE READ`. Do not run each check as a separate autocommit query. PostgreSQL establishes a stable MVCC snapshot for the transaction; every query in the run therefore sees the same committed database state even while transfers continue to commit. A posting committed after that snapshot is established is excluded consistently from that run and will be included in a later reconciliation.

Recommended orchestration:
1. Insert a `reconciliation_runs` row with `status = RUNNING` in a short write transaction and commit it.
2. Open a separate `REPEATABLE READ, READ ONLY` transaction. Capture `snapshot_started_at` and the consistency mode, then execute every reconciliation query in this one snapshot.
3. Commit the read-only snapshot transaction after all results have been calculated.
4. In a separate write transaction, persist the discrepancy rows and final counts, set the run to `COMPLETED`, record `completed_at`, and write the completion audit event. If the run fails and the database is available, persist `FAILED` with a safe error code.
5. The run record must make clear that its results describe the snapshot captured at `snapshot_started_at`, not necessarily the latest state at the time an administrator opens the report.

At minimum, each reconciliation run performs:

1. **Per-transaction balancing:** total debits equal total credits for each posted transaction and currency; each posted transaction has at least two entries.
2. **Customer-account projection reconciliation:** for every customer ledger account, `accounts.balance_minor` equals customer credits minus customer debits.
3. **System-account reconciliation:** compute the normal-side balance for every system ledger account. For debit-normal `DEMO_CASH_CLEARING`, expected ledger balance is total debits minus total credits. Report its balance and any unexpected negative balance or policy breach. Do not omit it because it has no customer-facing account projection.
4. **Whole-ledger trial balance:** total debits equal total credits across all ledger accounts per currency and scope.
5. **Expected-entry-pattern checks:** transfer, deposit and withdrawal transactions have the correct account types and entry directions; deposits/withdrawals use `DEMO_CASH_CLEARING` as specified.
6. **Missing/duplicate entry checks:** posted transactions have the required number/type of entries and no duplicate posting lines.
7. **Reference and currency integrity checks:** each entry references an existing posted transaction and valid ledger account; currencies agree across transaction, entry and ledger account.
8. **Customer-to-ledger mapping checks:** every customer account has exactly one customer ledger account and no customer ledger account maps to more than one customer account.

A reconciliation result shall include run ID, start/end time, `snapshot_started_at`, consistency mode (`POSTGRES_REPEATABLE_READ_READ_ONLY`), scope, currency, counts of customer and system ledger accounts checked, transaction count, pass/fail status, discrepancy list and correlation ID. Each discrepancy shall identify the affected ledger account (including system account code where relevant), transaction if relevant, expected value, actual value and difference. Reconciliation detects and reports issues; it must not silently rewrite history, delete entries or automatically adjust balances.

### 9.10 Optional cryptographic tamper-evidence enhancement

The MVP meaning of “ledger you can prove” is: posted entries are append-only through database permissions and triggers; every transaction balances; account/system-account balances reconcile; and discrepancies are reportable. This provides application/database integrity controls and accounting evidence, but it does **not** cryptographically prove that a privileged database owner could never alter historical data.

A cryptographic hash chain, signed checkpoints or Merkle-tree proof is **Phase 2 / optional** unless organisers explicitly require tamper evidence against privileged database modification. If added, specify canonical entry serialization, hash algorithm, chain/checkpoint storage, key management (for signatures), verification API/command, and tests for altered/deleted/reordered entries. Do not claim cryptographic immutability unless verification is implemented and demonstrated.

## 10. Reversal and correction policy

Reversal is **Phase 2** for the seven-day MVP, but its rules are defined here to prevent later unsafe implementation.

- Only a posted transaction can be reversed.
- The reversal is a new transaction with `type = REVERSAL` and a reference to the original transaction.
- A full reversal inserts entries opposite to the original debit/credit entries.
- The original transaction and original ledger entries remain unchanged.
- A database unique constraint on `reverses_transaction_id` prevents multiple full reversals.
- Reversal must have its own idempotency key, admin authorisation and audit event.
- Reversal must update affected balance projections in the same database transaction as reversal entries.
- A reversal must not make a customer account negative. For example, reversing a transfer requires the recipient to have enough available balance to return the funds. If not, reject and flag for separately governed resolution; do not force a negative balance.
- Partial reversal is out of scope unless explicitly specified and separately modelled.

## 11. Database design and constraints

Use PostgreSQL for the MVP. The following logical schema is normative at the entity/relationship level; exact ORM syntax may vary.

### 11.1 `users`

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | UUID PK | User identifier |
| `name` | VARCHAR, required | Display name |
| `email` | VARCHAR, unique, required | Login identity |
| `password_hash` | VARCHAR, required | Password hash |
| `role` | constrained text, `NOT NULL DEFAULT 'CUSTOMER'` | Exactly one of `CUSTOMER`, `ADMIN` or restricted `DEMO_OPERATOR` |
| `status` | constrained text | `ACTIVE`, `DISABLED` |
| `created_at` | TIMESTAMPTZ | Creation time |
| `updated_at` | TIMESTAMPTZ | Update time |

### 11.1A `user_sessions` — authentication lifecycle

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | UUID PK | Session ID (`sid`) referenced by access JWT |
| `user_id` | UUID FK to users | Session owner |
| `refresh_token_hash` | VARCHAR, unique | Hash of current refresh token; never store raw token |
| `token_family_id` | UUID | Refresh-token rotation family |
| `created_at` | TIMESTAMPTZ | Session creation |
| `expires_at` | TIMESTAMPTZ | Seven-day refresh expiry |
| `last_refreshed_at` | TIMESTAMPTZ | Last rotation time |
| `revoked_at` | TIMESTAMPTZ nullable | Logout/revocation time |
| `revocation_reason` | VARCHAR nullable | `LOGOUT`, `TOKEN_REUSE`, `USER_DISABLED`, etc. |

A session is active only when `revoked_at IS NULL`, `expires_at > NOW()` and its user is `ACTIVE`. Add indexes on `(user_id, revoked_at)` and `token_family_id`. The raw refresh token must never be persisted or logged.

### 11.1B `refresh_token_history` — refresh rotation and reuse detection

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | UUID PK | Token record ID |
| `session_id` | UUID FK to `user_sessions` | Session/token family |
| `token_hash` | VARCHAR, unique | SHA-256 hash of one refresh token; never raw token |
| `status` | constrained text | `CURRENT`, `ROTATED`, `REVOKED` |
| `issued_at` | TIMESTAMPTZ | Token issue time |
| `used_at` | TIMESTAMPTZ nullable | First successful use/rotation time |
| `expires_at` | TIMESTAMPTZ | Expiration time |

On refresh, mark the presented token `ROTATED`, create the next `CURRENT` token hash, and update `user_sessions.refresh_token_hash` in one database transaction. If a token already marked `ROTATED` is presented again before its expiry, revoke the session and every token in its family, then write a security audit event. Store no raw refresh token.

### 11.2 `accounts` — customer-facing accounts

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | UUID PK | Internal account ID |
| `account_number` | VARCHAR, unique, required | Display/reference number |
| `owner_user_id` | UUID FK to users | Account owner |
| `currency` | CHAR(3), required | `INR` for MVP |
| `balance_minor` | BIGINT, non-negative | Customer balance projection in paise |
| `status` | constrained text | `ACTIVE`, `FROZEN`, `CLOSED` |
| `created_at` | TIMESTAMPTZ | Creation time |
| `updated_at` | TIMESTAMPTZ | Update time |

Required constraints include `CHECK (balance_minor >= 0)` and a unique account number. The relationship to a customer ledger account is represented from `ledger_accounts.customer_account_id` (unique and non-null for customer ledger accounts), avoiding a circular foreign-key dependency. Account and mapped ledger-account currencies must match; enforce with a mandatory deferred database constraint trigger or equivalent composite foreign-key design, plus transaction-service validation and integration tests.

**Basic MVP account-number generation:** keep the internal UUID as the authoritative identifier. Generate a separate display account number in the format `LL` followed by 12 random decimal digits using a cryptographically secure random-number generator. Enforce `UNIQUE(account_number)` in PostgreSQL. If a collision occurs, generate a new value and retry up to five times; if all attempts collide, fail account creation safely and log a technical event. Never reuse an account number after closure. Advanced check digits, branch codes and externally standardised numbering are optional Phase 2 enhancements.

### 11.3 `ledger_accounts` — accounting accounts

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | UUID PK | Ledger account ID |
| `account_code` | VARCHAR, unique | Stable chart-of-accounts code |
| `account_name` | VARCHAR, required | Display name |
| `account_type` | constrained text | `CUSTOMER_BALANCE`, `DEMO_CASH_CLEARING` |
| `normal_side` | constrained text | `DEBIT` or `CREDIT` |
| `customer_account_id` | UUID nullable FK to accounts, unique when non-null | Customer mapping; null for system accounts |
| `currency` | CHAR(3), required | Ledger account currency |
| `status` | constrained text | `ACTIVE`, `DISABLED` |
| `created_at` | TIMESTAMPTZ | Creation time |

Create the customer `accounts` row and its `ledger_accounts` row in the same database transaction. `ledger_accounts.customer_account_id` must be unique for customer ledger accounts, which enforces at most one mapping; the account-creation service must ensure exactly one mapping exists before commit. A mandatory deferred constraint trigger shall reject a customer account committed without exactly one customer ledger account. This one-directional foreign key avoids a circular dependency. For `CUSTOMER_BALANCE`, enforce `normal_side = CREDIT`; for `DEMO_CASH_CLEARING`, enforce `normal_side = DEBIT`. System accounts are seeded by a migration and cannot be created by customers.

### 11.4 `transactions` — posted financial transaction headers only

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | UUID PK | Stable transaction ID |
| `type` | constrained text | `TRANSFER`, `DEPOSIT`, `WITHDRAWAL`, `REVERSAL` |
| `status` | constrained text | `POSTED` for MVP committed records |
| `amount_minor` | BIGINT positive | Operation amount in paise |
| `currency` | CHAR(3) | Transaction currency |
| `initiated_by_user_id` | UUID FK | Acting principal |
| `sender_account_id` | UUID nullable FK | Source customer account where applicable |
| `receiver_account_id` | UUID nullable FK | Destination customer account where applicable |
| `description` | VARCHAR optional | Operation description |
| `reverses_transaction_id` | UUID nullable FK | Original for reversal; Phase 2 |
| `created_at` | TIMESTAMPTZ | Record time |
| `posted_at` | TIMESTAMPTZ required | Posting/commit time |

Only committed financial operations are stored here. Rejected or failed request attempts are stored in `transaction_attempts`, not as `FAILED`/`REJECTED` financial transaction headers. Add checks for positive amounts and valid transaction types. If a full reversal is enabled, enforce one reversal per original through a unique constraint on non-null `reverses_transaction_id`.

### 11.5 `ledger_entries`

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | UUID PK | Entry ID |
| `transaction_id` | UUID FK, required | Source posted transaction |
| `ledger_account_id` | UUID FK, required | Affected ledger account |
| `entry_type` | constrained text | `DEBIT` or `CREDIT` |
| `amount_minor` | BIGINT positive | Amount in paise |
| `currency` | CHAR(3) | Currency |
| `line_number` | integer | Stable ordering within transaction |
| `created_at` | TIMESTAMPTZ | Posting time |

Required constraints/indexes:
- `CHECK (amount_minor > 0)`.
- Valid `entry_type`.
- Unique `(transaction_id, line_number)`.
- Index `(transaction_id)`.
- Index `(ledger_account_id, created_at, id)`.
- Enforce that entry currency equals both its transaction and ledger-account currency through a mandatory composite foreign-key or deferred database constraint-trigger design, plus posting-service validation.
- The posting service must verify at least two entries and balanced totals before commit. A mandatory PostgreSQL deferred constraint trigger shall repeat this check at commit; a normal row-level `CHECK` cannot validate a sum over multiple rows.
- Application database credentials shall not have `UPDATE`, `DELETE` or `TRUNCATE` privileges on `ledger_entries`. A **mandatory PostgreSQL `BEFORE UPDATE OR DELETE` trigger** shall raise an exception for any attempted mutation of ledger entries. Do not phrase this trigger as optional or merely recommended. The trigger and privilege restrictions shall be installed by a privileged migration role and verified using the normal application database credentials. `TRUNCATE` shall be denied by database privileges because row-level UPDATE/DELETE triggers do not prevent TRUNCATE.

### 11.6 `idempotency_records`

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | UUID PK | Record ID |
| `principal_id` | UUID / stable authenticated principal | Caller scope |
| `operation` | VARCHAR | Operation/version scope |
| `idempotency_key` | VARCHAR | Client key |
| `request_fingerprint` | VARCHAR required | Hash of canonical request |
| `outcome` | constrained text | `RESERVED` while uncommitted; `POSTED` or `REJECTED` before commit |
| `transaction_id` | nullable UUID FK | Set for `POSTED`, null for `REJECTED` |
| `response_code` | integer | Original safe HTTP status |
| `response_body` | JSONB | Safe replay response; no secrets |
| `created_at` | TIMESTAMPTZ | Reservation/creation time |
| `completed_at` | TIMESTAMPTZ | Final outcome time |

Required unique constraint: `UNIQUE (principal_id, operation, idempotency_key)`.

The row is inserted with `outcome = RESERVED` only inside the uncommitted synchronous processing transaction and receives its final `POSTED` or `REJECTED` outcome before commit. A committed `RESERVED` row is invalid and shall be prevented by a mandatory deferred constraint trigger. `POSTED` must reference exactly one posted transaction; `REJECTED` must not reference a financial transaction. No permanent `IN_PROGRESS` row may be committed in the MVP.

### 11.7 `transaction_attempts`

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | UUID PK | Attempt ID |
| `principal_id` | UUID nullable | Authenticated caller if known |
| `operation` | VARCHAR | Operation name/version |
| `idempotency_record_id` | UUID nullable FK | Associated idempotency result |
| `request_fingerprint` | VARCHAR nullable | Safe request fingerprint |
| `outcome` | constrained text | `BUSINESS_REJECTED`, `POSTED`, `IDEMPOTENT_REPLAY`, `IDEMPOTENCY_CONFLICT`, `VALIDATION_REJECTED`, `PROCESSING_ERROR` |
| `reason_code` | VARCHAR nullable | Stable safe error code |
| `transaction_id` | UUID nullable FK | Posted transaction if any |
| `requested_source_account_id` | UUID nullable, request metadata (no FK) | Source account identifier supplied in the request, when parseable; no FK so invalid/nonexistent IDs can still be investigated |
| `requested_destination_account_id` | UUID nullable, request metadata (no FK) | Destination account identifier supplied in the request, when parseable |
| `request_amount_minor` | BIGINT nullable | Requested amount, including values later rejected by business validation when representable |
| `request_currency` | CHAR(3) nullable | Requested currency, when parseable |
| `correlation_id` | VARCHAR required | Request trace ID |
| `created_at` | TIMESTAMPTZ | Attempt time |

Add indexes for `(created_at, id)`, `(principal_id, created_at)`, `(operation, outcome, created_at)`, and the requested source/destination account identifiers. These request-metadata columns are for audit/search only; they are not trusted foreign-key relationships and must not be used as proof of account ownership. Do not store raw request bodies, credentials or secrets.

For the MVP, persist the first processed attempt alongside its idempotency outcome in the same database transaction. For a replay/conflict attempt, insert a separate attempt record after reading the existing idempotency result. Authenticated malformed/validation-rejected financial requests may be recorded as `VALIDATION_REJECTED` attempts in a separate best-effort transaction even though no idempotency reservation is created; never persist passwords, tokens or raw secrets. For a technical failure after rollback, record the attempt/audit event in a separate best-effort transaction; if the database is unavailable, use structured application logs. Do not let failure logging change the financial outcome.

### 11.8A `system_settings` — controlled demo configuration

| Column | Type / rule | Purpose |
|---|---|---|
| `setting_key` | VARCHAR PK | For MVP: `DEMO_FUNDING_ENABLED` |
| `setting_value` | JSONB / constrained boolean | Current setting |
| `updated_by_user_id` | UUID FK to users | Administrator who changed it |
| `updated_at` | TIMESTAMPTZ | Change time |
| `reason` | VARCHAR required | Audit reason |

The setting may be enabled only when the deployed environment is `DEMO` or `TEST`. The production environment must hard-disable simulated deposits independently of this table. Every update must create an audit event in the same database transaction.

### 11.8 `audit_logs`

| Column | Type / rule | Purpose |
|---|---|---|
| `id` | UUID PK | Audit ID |
| `actor_user_id` | UUID nullable FK | Actor if authenticated |
| `action` | VARCHAR | Action name |
| `resource_type` | VARCHAR | Resource type |
| `resource_id` | UUID/string nullable | Resource reference |
| `outcome` | VARCHAR | Success/failure |
| `correlation_id` | VARCHAR | Request trace |
| `metadata` | JSONB filtered | Safe context only |
| `created_at` | TIMESTAMPTZ | Event time |

Never log passwords, tokens, secrets, full credentials or unnecessary personal information. Restrict update/delete access.

### 11.9 `reconciliation_runs` and `reconciliation_discrepancies`

Store reconciliation execution history so administrators can list prior runs and inspect individual results. The following fields are **mandatory MVP schema fields**, not suggestions.

`reconciliation_runs`:

| Column | Type / constraint | Purpose |
|---|---|---|
| `id` | UUID PK | Stable run ID |
| `initiated_by_user_id` | UUID FK to users, required | Administrator who started the run |
| `scope` | constrained text, required | MVP value `ALL_LEDGER_ACCOUNTS` |
| `currency` | CHAR(3), required | MVP value `INR` |
| `status` | constrained text, required | `RUNNING`, `COMPLETED` or `FAILED` |
| `started_at` | TIMESTAMPTZ, required | Run orchestration start |
| `snapshot_started_at` | TIMESTAMPTZ nullable only before snapshot acquisition; required for `COMPLETED` | Time associated with the consistent read snapshot |
| `consistency_mode` | constrained text, required | MVP value `POSTGRES_REPEATABLE_READ_READ_ONLY` |
| `completed_at` | TIMESTAMPTZ nullable until terminal state | Completion/failure time |
| `customer_ledger_accounts_checked` | BIGINT, required, default 0 | Customer ledger account count |
| `system_ledger_accounts_checked` | BIGINT, required, default 0 | System ledger account count |
| `transactions_checked` | BIGINT, required, default 0 | Posted transaction count checked |
| `discrepancies_found` | BIGINT, required, default 0 | Total discrepancy count |
| `failure_code` | VARCHAR nullable | Safe error code for failed run |
| `correlation_id` | VARCHAR, required | Request trace |

`reconciliation_discrepancies`:

| Column | Type / constraint | Purpose |
|---|---|---|
| `id` | UUID PK | Discrepancy ID |
| `run_id` | UUID FK, required | Parent reconciliation run |
| `discrepancy_type` | VARCHAR, required | Stable discrepancy category |
| `transaction_id` | UUID nullable FK | Related posted transaction, when applicable |
| `ledger_account_id` | UUID nullable FK | Related customer or system ledger account |
| `account_id` | UUID nullable FK | Customer-facing account, when applicable |
| `expected_value_minor` | BIGINT nullable | Expected amount in minor units |
| `actual_value_minor` | BIGINT nullable | Observed amount in minor units |
| `difference_minor` | BIGINT nullable | Difference in minor units |
| `currency` | CHAR(3), required | MVP value `INR` |
| `details` | JSONB, required, default `{}` | Safe structured diagnostic context |
| `created_at` | TIMESTAMPTZ, required | Record time |

Required indexes: `reconciliation_runs(started_at DESC, id DESC)`, `reconciliation_runs(status, started_at DESC, id DESC)`, and `reconciliation_discrepancies(run_id, created_at, id)`. Add check constraints for non-negative counts, supported status values and valid time ordering. A `COMPLETED` run must have `snapshot_started_at` and `completed_at`; a `FAILED` run must have `completed_at` and a safe `failure_code`; `RUNNING` is permitted only while a run is actively executing. The list API must be backed by these persisted fields; it must not reconstruct historical runs from logs. A stale `RUNNING` record left by a process crash must be marked `FAILED` by a bounded startup/admin recovery check before it is presented as a final result.

### 11.10 Database-wide requirements

- Use foreign keys, unique constraints, check constraints and indexes.
- Use `TIMESTAMPTZ`; store timestamps in UTC and return ISO 8601 timestamps.
- Use UUIDs or another non-guessable internal identifier.
- Use migrations checked into version control.
- Use a least-privilege application database role.
- Use a separate privileged migration role.
- Install and test mandatory deferred constraint triggers for customer-to-ledger mapping, per-transaction debit/credit balancing, currency consistency where composite foreign keys are not used, and prevention of committed `RESERVED` idempotency outcomes.
- No direct database access from the frontend.
- Use parameterised SQL/ORM queries.
- Back up the demo database before final presentation and document how to restore it.
- Do not delete posted transactions or ledger entries through ordinary application flows.

### 11.11 Mandatory financial-integrity enforcement matrix

The following controls are mandatory. The implementation team must not leave them as “if practical” suggestions.

| Integrity rule | Mandatory enforcement | Required proof/test |
|---|---|---|
| Unique user email | PostgreSQL `UNIQUE` constraint | Concurrent duplicate-registration test |
| Unique account number | PostgreSQL `UNIQUE` constraint | Collision/retry and duplicate insert test |
| Non-negative customer projection | PostgreSQL `CHECK (balance_minor >= 0)` plus row locking/conditional update | Concurrent withdrawals test |
| Positive transaction/entry amount | PostgreSQL `CHECK` constraints | Zero, negative and malformed amount tests |
| One customer ledger account per customer account | Unique constraint on `ledger_accounts.customer_account_id` plus deferred commit-time check that every customer account has exactly one mapping | Account creation transaction test; duplicate/missing mapping test |
| Currency consistency | Composite foreign keys or mandatory deferred database trigger across transaction, ledger entry and ledger account; service validation as defence in depth | Cross-currency insertion test must fail |
| Idempotency uniqueness | PostgreSQL unique constraint on `(principal_id, operation, idempotency_key)` | Concurrent same-key requests test |
| No committed `RESERVED` idempotency row | Mandatory deferred constraint trigger verifies final `POSTED` or `REJECTED` outcome at commit | Attempted commit with `RESERVED` must fail |
| At least two balanced entries per posted transaction | Mandatory posting-service check plus mandatory deferred constraint trigger that checks count and debit/credit totals per currency at commit | Deliberately unbalanced/one-line posting test must fail |
| Account balance projection agrees with customer ledger | Posting service updates projection and ledger in one transaction; reconciliation re-derives and compares | Failure-injection and reconciliation tests |
| Posted ledger immutability | Application role lacks UPDATE/DELETE; mandatory database trigger rejects modification; migrations use separate privileged role | Direct update/delete using application credentials must fail |
| Transaction and audit references | Foreign keys and constrained event/resource values where applicable | Orphan-reference tests |

Where PostgreSQL cannot express a cross-row rule with a standard `CHECK`, use a deferred constraint trigger. The posting service must still validate the same rule before commit. Integration tests are required for every row in this matrix. Database enforcement and service validation are complementary, not alternatives for the core ledger-posting rules.

## 12. Account lifecycle and balance policy

### 12.1 State transitions

| Current state | Allowed action | Next state | Permission |
|---|---|---|---|
| `ACTIVE` | Freeze | `FROZEN` | Admin |
| `FROZEN` | Unfreeze | `ACTIVE` | Admin |
| `ACTIVE` | Close | `CLOSED` | Admin only; zero balance and no in-progress operation required |
| `FROZEN` | Close | `CLOSED` | Admin only; zero balance and no in-progress operation required |
| `CLOSED` | Reopen | Not allowed in MVP | — |

Every transition is audited. Frozen and closed accounts cannot send or receive in the MVP. Only an administrator may close an account through `POST /api/v1/admin/accounts/{accountId}/close`. Closing requires zero customer ledger balance, zero account balance projection and no in-progress financial posting. The account and its historical ledger records remain stored. A customer may contact the administrator outside the application to request closure; no customer self-close endpoint is included in the MVP.

### 12.2 Balance meanings

| Term | MVP definition |
|---|---|
| Ledger balance | Net posted customer ledger credits minus debits |
| Account balance | Stored projection `accounts.balance_minor`, updated atomically with posting |
| Available balance | Equal to ledger balance because holds/reservations are out of scope |

The API and UI must use the terms consistently. Do not show an “available balance” different from ledger balance unless a reservation/hold feature is explicitly implemented.

## 13. API requirements

All APIs shall use a consistent version prefix, validate input server-side, enforce object-level authorisation, return standard errors and use HTTPS outside local development.

### 13.1 Authentication and account APIs

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register customer |
| `POST` | `/api/v1/auth/login` | Authenticate |
| `POST` | `/api/v1/auth/refresh` | Rotate the current refresh token and issue a new access JWT |
| `POST` | `/api/v1/auth/logout` | Revoke the current session immediately and clear the refresh cookie |
| `POST` | `/api/v1/accounts` | Create account |
| `GET` | `/api/v1/accounts` | List caller's accounts |
| `GET` | `/api/v1/accounts/:accountId` | Get authorised account details |
| `GET` | `/api/v1/accounts/:accountId/balance` | Get authorised balance |

### 13.2 Financial APIs

| Method | Endpoint | Required header | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/transfers` | `Idempotency-Key` | Internal transfer |
| `POST` | `/api/v1/deposits` | `Idempotency-Key` | Admin/test-authorised simulated deposit |
| `POST` | `/api/v1/withdrawals` | `Idempotency-Key` | Customer withdrawal |
| `GET` | `/api/v1/transactions` | Authentication | List posted transactions involving caller's accounts |
| `GET` | `/api/v1/transactions/:transactionId` | Authentication | Get authorised posted transaction |
| `GET` | `/api/v1/transaction-attempts` | Authentication | List caller's own request attempts/outcomes |
| `GET` | `/api/v1/transaction-attempts/:attemptId` | Authentication | Get authorised request attempt |

### 13.3 Administrative APIs

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/admin/transactions` | Search permitted system transaction records |
| `GET` | `/api/v1/admin/transaction-attempts` | Inspect attempts and deterministic rejections |
| `GET` | `/api/v1/admin/audit-logs` | View audit events |
| `PATCH` | `/api/v1/admin/accounts/:accountId/status` | Freeze/unfreeze account |
| `POST` | `/api/v1/admin/accounts/:accountId/close` | Close an account (admin only) |
| `GET` | `/api/v1/admin/settings/demo-funding` | View demo-funding switch |
| `PATCH` | `/api/v1/admin/settings/demo-funding` | Enable/disable demo funding in DEMO/TEST only |
| `POST` | `/api/v1/admin/reconciliation` | Run reconciliation |
| `GET` | `/api/v1/admin/reconciliation` | List previous reconciliation runs |
| `GET` | `/api/v1/admin/reconciliation/:runId` | View reconciliation result |
| `POST` | `/api/v1/admin/transactions/:transactionId/reversal` | Full reversal; Phase 2 |

Every admin endpoint must enforce role checks server-side. The API must not rely on the UI hiding admin controls.

### 13.4 Transfer request example

```http
POST /api/v1/transfers
Authorization: Bearer <access-token>
Idempotency-Key: 7c9c2c0b-unique-client-generated-key
Content-Type: application/json
```

```json
{
  "senderAccountId": "account-uuid-a",
  "receiverAccountId": "account-uuid-b",
  "amountMinor": "200000",
  "currency": "INR",
  "description": "Demo payment"
}
```

Server obligations:
- Derive caller identity from authentication.
- Verify sender ownership.
- Verify receiver eligibility.
- Validate amount/currency/limits.
- Enforce idempotency and concurrency rules.
- Never trust a client-supplied balance or user ID.

### 13.5 Successful response example

```json
{
  "success": true,
  "transaction": {
    "id": "transaction-uuid",
    "type": "TRANSFER",
    "status": "POSTED",
    "amountMinor": "200000",
    "currency": "INR",
    "createdAt": "2026-11-08T08:00:00Z",
    "postedAt": "2026-11-08T08:00:00Z"
  }
}
```

A replay returns the original stored business outcome and transaction ID (or original rejection reason). Store the canonical business response, not transport-specific values such as a prior correlation ID. Each HTTP retry gets its own request correlation ID and may include `idempotentReplay: true`; it must not imply a second posting. The replay should preserve the original business HTTP status/body semantics, such as `201` for an original posting or `422` for an original business rejection.

### 13.6 Business rejection response example

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "The account does not have sufficient available funds."
  },
  "attempt": {
    "id": "attempt-uuid",
    "outcome": "BUSINESS_REJECTED"
  },
  "correlationId": "request-correlation-id"
}
```

The same key and fingerprint shall replay this stored rejection even if the account balance later changes. The customer must use a new key for a genuinely new attempt.

### 13.7 Error response example

```json
{
  "success": false,
  "error": {
    "code": "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
    "message": "This idempotency key was already used with a different request."
  },
  "correlationId": "request-correlation-id"
}
```

Do not expose SQL errors, stack traces, internal secrets or sensitive account details.

### 13.8 HTTP status mapping

| HTTP status | Use |
|---|---|
| `200` | Successful retrieval or replay of an existing outcome |
| `201` | Newly posted transaction or created resource |
| `400` | Malformed request, missing/invalid required header or invalid format |
| `401` | Missing or invalid authentication |
| `403` | Authenticated caller lacks permission |
| `404` | Resource not found or deliberately concealed to avoid disclosure |
| `409` | Idempotency key reused with different payload or conflicting state |
| `422` | Valid request structure but deterministic business rule rejection |
| `429` | Rate limit exceeded |
| `500` | Unexpected internal failure |
| `503` | Temporary service/database unavailability |

For an idempotency replay, the system shall return the same stored business HTTP status and business response body as the original outcome. Include replay metadata separately without changing the original business result. Do not turn a stored insufficient-funds rejection into a success status. If a duplicate request waits on the unique-key reservation longer than the configured database/request timeout, return a controlled retryable `503` response with the same-key retry instruction; do not execute a second operation or invent a committed `IN_PROGRESS` result.

### 13.9 API validation and pagination defaults

- Required IDs must be valid UUIDs.
- `amountMinor` must be a base-10 string containing digits only, representing integer paise. Parse it exactly into PostgreSQL `BIGINT`; reject JSON floating-point numbers, signs, whitespace, decimal points and scientific notation.
- Currency must be exactly a supported ISO-style currency code; MVP supports `INR` only.
- `description` maximum length: 250 characters; reject longer values with `400 VALIDATION_ERROR`.
- Idempotency key: 16–128 characters; reject whitespace-only values.
- Transaction history default page size: 20; maximum: 100.
- Sort newest first, with stable secondary sort by transaction ID.
- Date filters use ISO 8601 timestamps and a documented inclusive/exclusive boundary convention.
- Return pagination metadata (`page`, `limit`, `total` or cursor metadata).
- Define a standard error-code catalogue and validate all input on the backend.

### 13.10 Complete MVP API contracts

The contracts below are normative for the MVP. All IDs are UUID strings. All timestamps are ISO 8601 UTC strings. All amounts are decimal strings in minor units (paise). Unless stated otherwise, successful JSON responses use `{ "success": true, "data": ... }`; errors use the common error envelope in Section 13.7. All authenticated routes require `Authorization: Bearer <access-token>`. Every route enforces object-level permissions server-side.

#### A. Authentication APIs

**1. `POST /api/v1/auth/register`** — Public.

Request:
```json
{ "name": "Asha Rao", "email": "asha@example.test", "password": "user-supplied-password" }
```

Rules: `name` 1–100 characters; email valid and normalised; password 12–128 characters (spaces/passphrases accepted; no silent trim/truncation); the API never returns the password or password hash. Public registration always assigns `role=CUSTOMER`. A request containing a client-supplied `role`, `isAdmin`, `permissions` or equivalent privilege field is rejected with `400 VALIDATION_ERROR`; the server never trusts client role assignment.

Success `201`:
```json
{ "success": true, "data": { "userId": "uuid", "name": "Asha Rao", "email": "asha@example.test", "role": "CUSTOMER", "status": "ACTIVE", "createdAt": "2026-11-08T10:00:00Z" } }
```

Errors: `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_REGISTERED`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`.

**2. `POST /api/v1/auth/login`** — Public.

Request:
```json
{ "email": "asha@example.test", "password": "user-supplied-password" }
```

Success `200` (also sets the refresh-token HttpOnly cookie):
```json
{ "success": true, "data": { "accessToken": "<jwt>", "tokenType": "Bearer", "expiresInSeconds": 900, "user": { "id": "uuid", "name": "Asha Rao", "email": "asha@example.test", "role": "CUSTOMER" } } }
```

Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`. Do not reveal whether the email or password was incorrect.

**3. `POST /api/v1/auth/refresh`** — Refresh cookie required; CSRF protection required.

Request body: empty. The current refresh token is sent only in the HttpOnly cookie.

Success `200` (rotates refresh cookie):
```json
{ "success": true, "data": { "accessToken": "<new-jwt>", "tokenType": "Bearer", "expiresInSeconds": 900 } }
```

Errors: `401 SESSION_EXPIRED`, `401 SESSION_REVOKED`, `401 REFRESH_TOKEN_REUSED`, `429 RATE_LIMITED`.

**4. `POST /api/v1/auth/logout`** — Authenticated; revokes the current session ID (`sid`) and clears refresh cookie.

Request body: empty.

Success `204`: no response body.

Errors: `401 AUTHENTICATION_REQUIRED`, `401 SESSION_REVOKED`. Logout of an already revoked session may return `204` to remain idempotent.

#### B. Customer account APIs

**5. `POST /api/v1/accounts`** — Authenticated customer.

Request:
```json
{ "currency": "INR" }
```

The owner is derived from the access token. Do not accept `ownerUserId` or an opening balance from the client.

Success `201`:
```json
{ "success": true, "data": { "accountId": "uuid", "accountNumber": "LL123456789012", "currency": "INR", "status": "ACTIVE", "balanceMinor": "0", "createdAt": "2026-11-08T10:00:00Z" } }
```

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`.

**6. `GET /api/v1/accounts?page=1&limit=20`** — Authenticated customer; returns only own accounts.

Request: query `page` (default 1, integer >= 1), `limit` (default 20, max 100).

Success `200`:
```json
{ "success": true, "data": { "items": [{ "accountId": "uuid", "accountNumber": "LL123456789012", "currency": "INR", "status": "ACTIVE", "balanceMinor": "200000" }], "pagination": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1 } } }
```

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`.

**7. `GET /api/v1/accounts/{accountId}`** — Authenticated owner or administrator with permitted read access.

Request: path `accountId` UUID. The server authorises the caller against the account record before returning details and obtains `accountHolderName` by joining the account's `owner_user_id` to the current `users.name` profile field. The client cannot supply or override the account-holder name.

Success `200` for an authorised owner or administrator:
```json
{ "success": true, "data": { "accountId": "uuid", "accountNumber": "LL123456789012", "accountHolderName": "Asha Rao", "currency": "INR", "status": "ACTIVE", "balanceMinor": "200000", "availableBalanceMinor": "200000", "createdAt": "2026-11-08T10:00:00Z" } }
```

The owner-facing response does not expose internal `ownerUserId`; if an administrator workflow needs that identifier, it may be returned only by a separately permission-checked admin response. The account-holder name is a profile display field, not proof of legal identity.

Errors: `400 VALIDATION_ERROR` for malformed UUID, `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 ACCOUNT_NOT_FOUND`.

**8. `GET /api/v1/accounts/{accountId}/balance`** — Authenticated owner or permitted administrator.

Request: path `accountId` UUID.

Success `200`:
```json
{ "success": true, "data": { "accountId": "uuid", "currency": "INR", "ledgerBalanceMinor": "200000", "accountBalanceMinor": "200000", "availableBalanceMinor": "200000", "asOf": "2026-11-08T10:00:00Z" } }
```

Errors: `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 ACCOUNT_NOT_FOUND`.

#### C. Financial write APIs

All three endpoints require `Idempotency-Key` (16–128 characters), authenticated identity, and the exact same key on retry of the same logical operation.

**9. `POST /api/v1/transfers`** — Authenticated customer; sender must be owned by caller.

Request:
```json
{ "senderAccountId": "uuid-a", "receiverAccountId": "uuid-b", "amountMinor": "200000", "currency": "INR", "description": "Invoice payment" }
```

Success `201`:
```json
{ "success": true, "data": { "transactionId": "uuid", "type": "TRANSFER", "status": "POSTED", "amountMinor": "200000", "currency": "INR", "senderAccountId": "uuid-a", "receiverAccountId": "uuid-b", "postedAt": "2026-11-08T10:00:00Z" }, "meta": { "idempotentReplay": false } }
```

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, `403 ACCOUNT_NOT_OWNED`, `404 ACCOUNT_NOT_FOUND`, `409 IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`, `409 TRANSACTION_CONFLICT`, `422 INSUFFICIENT_FUNDS`, `422 ACCOUNT_NOT_ACTIVE`, `422 SAME_ACCOUNT_TRANSFER`, `422 CURRENCY_MISMATCH`, `422 AMOUNT_LIMIT_EXCEEDED`, `429 RATE_LIMITED`, `503 PROCESSING_UNAVAILABLE`.

**10. `POST /api/v1/deposits`** — Administrator or DEMO_OPERATOR only, demo/test environment only, feature flag enabled.

Request:
```json
{ "accountId": "uuid", "amountMinor": "50000", "currency": "INR", "description": "Hackathon demo funding" }
```

Success `201`:
```json
{ "success": true, "data": { "transactionId": "uuid", "type": "DEPOSIT", "status": "POSTED", "amountMinor": "50000", "currency": "INR", "accountId": "uuid", "postedAt": "2026-11-08T10:00:00Z", "simulated": true }, "meta": { "idempotentReplay": false } }
```

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 ACCOUNT_NOT_FOUND`, `409 IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`, `422 ACCOUNT_NOT_ACTIVE`, `422 AMOUNT_LIMIT_EXCEEDED`, `403 FEATURE_DISABLED_ENVIRONMENT`, `403 DEMO_FUNDING_DISABLED`, `503 PROCESSING_UNAVAILABLE`.

**11. `POST /api/v1/withdrawals`** — Authenticated customer; account must be owned by caller.

Request:
```json
{ "accountId": "uuid", "amountMinor": "30000", "currency": "INR", "description": "Demo withdrawal" }
```

Success `201`:
```json
{ "success": true, "data": { "transactionId": "uuid", "type": "WITHDRAWAL", "status": "POSTED", "amountMinor": "30000", "currency": "INR", "accountId": "uuid", "postedAt": "2026-11-08T10:00:00Z", "simulated": true }, "meta": { "idempotentReplay": false } }
```

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, `403 ACCOUNT_NOT_OWNED`, `404 ACCOUNT_NOT_FOUND`, `409 IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`, `422 INSUFFICIENT_FUNDS`, `422 ACCOUNT_NOT_ACTIVE`, `422 AMOUNT_LIMIT_EXCEEDED`, `429 RATE_LIMITED`, `503 PROCESSING_UNAVAILABLE`.

For all financial writes, same-key/same-payload replay returns the original business status and body with `meta.idempotentReplay=true`. Same-key/different-payload returns `409 IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`. Amounts below ₹1 return `422 INVALID_AMOUNT`; amounts above ₹100 crore return `422 AMOUNT_LIMIT_EXCEEDED`. Any request above ₹100 crore also creates the required suspicious-limit audit event. A `503` is retryable with the same key; the client must not generate a new key for a retry of the same logical action.

#### D. Customer transaction and attempt read APIs

**12. `GET /api/v1/transactions?page=1&limit=20&type=TRANSFER&status=POSTED&from=...&to=...&accountId=...`** — Authenticated customer; only transactions involving caller-authorised accounts.

Query: `page` default 1; `limit` default 20, max 100; optional `type`, `status`, `from`, `to`, `accountId`. `from` is inclusive and `to` exclusive; both are ISO 8601 UTC timestamps.

Success `200`:
```json
{ "success": true, "data": { "items": [{ "transactionId": "uuid", "type": "TRANSFER", "status": "POSTED", "amountMinor": "200000", "currency": "INR", "createdAt": "2026-11-08T10:00:00Z", "postedAt": "2026-11-08T10:00:00Z" }], "pagination": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1 } } }
```

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`.

**13. `GET /api/v1/transactions/{transactionId}`** — Authenticated customer with access to at least one account involved in the transaction.

Success `200`:
```json
{ "success": true, "data": { "transactionId": "uuid", "type": "TRANSFER", "status": "POSTED", "amountMinor": "200000", "currency": "INR", "senderAccountId": "uuid-a", "receiverAccountId": "uuid-b", "description": "Invoice payment", "createdAt": "2026-11-08T10:00:00Z", "postedAt": "2026-11-08T10:00:00Z" } }
```

Errors: `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN` or `404 TRANSACTION_NOT_FOUND` according to the disclosure policy.

**14. `GET /api/v1/transaction-attempts?page=1&limit=20&outcome=BUSINESS_REJECTED&from=...&to=...`** — Authenticated customer; own attempts only.

Success `200`:
```json
{ "success": true, "data": { "items": [{ "attemptId": "uuid", "operation": "WITHDRAWAL", "outcome": "BUSINESS_REJECTED", "reasonCode": "INSUFFICIENT_FUNDS", "transactionId": null, "createdAt": "2026-11-08T10:00:00Z" }], "pagination": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1 } } }
```

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`.

**15. `GET /api/v1/transaction-attempts/{attemptId}`** — Authenticated owner of the attempt.

Success `200`:
```json
{ "success": true, "data": { "attemptId": "uuid", "operation": "WITHDRAWAL", "outcome": "BUSINESS_REJECTED", "reasonCode": "INSUFFICIENT_FUNDS", "transactionId": null, "correlationId": "uuid-or-string", "createdAt": "2026-11-08T10:00:00Z" } }
```

Errors: `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN` or `404 ATTEMPT_NOT_FOUND`.

#### E. Administrator APIs

**16. `GET /api/v1/admin/transactions?page=1&limit=20&transactionId=...&accountId=...&userId=...&type=...&status=POSTED&from=...&to=...`** — Administrator only; powers the `Posted transactions` panel on the administrator monitoring screen.

Query: `page` default 1; `limit` default 20, max 100; optional `transactionId`, `accountId` (matches sender or receiver), `userId` (initiating user), `type`, `status` (MVP value `POSTED`), `from` inclusive and `to` exclusive ISO 8601 UTC timestamps.

Success `200`: same paginated transaction item schema as endpoint 12, with permitted system-wide results. Each item includes transaction ID, operation/type, posted status, amount, currency, sender/receiver account IDs where applicable, initiating user ID where permitted, and created/posted timestamps. Results are newest first with stable transaction-ID tie-breaker. Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`.

**17. `GET /api/v1/admin/transaction-attempts?page=1&limit=20&attemptId=...&accountId=...&userId=...&operation=...&outcome=...&from=...&to=...`** — Administrator only; powers the `Request attempts` panel on the same administrator monitoring screen.

Query: `page` default 1; `limit` default 20, max 100; optional `attemptId`, `accountId` (matches requested source or destination account metadata), `userId` (principal), `operation`, `outcome` (including `BUSINESS_REJECTED`, `VALIDATION_REJECTED`, `IDEMPOTENT_REPLAY`, `IDEMPOTENCY_CONFLICT`, `PROCESSING_ERROR` and `POSTED`), `from` inclusive and `to` exclusive ISO 8601 UTC timestamps.

Success `200`: paginated attempt items using endpoint 14's schema, with `principalId`, requested source/destination account IDs, requested amount/currency when parseable, correlation ID, and linked transaction ID where one exists. These account/amount fields are request metadata and must not be treated as validated account relationships. Results are newest first with stable attempt-ID tie-breaker. Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`.

The administrator UI shall present endpoints 16 and 17 together on one monitoring screen while keeping their tables/pagination separate. A `POSTED` attempt may reference the posted transaction; do not display it as a second posted financial transaction.

**18. `GET /api/v1/admin/audit-logs?page=1&limit=20&actorUserId=...&action=...&outcome=...&correlationId=...&from=...&to=...`** — Administrator only.

Success `200`:
```json
{ "success": true, "data": { "items": [{ "auditId": "uuid", "actorUserId": "uuid", "action": "ACCOUNT_FROZEN", "resourceType": "ACCOUNT", "resourceId": "uuid", "outcome": "SUCCESS", "correlationId": "request-id", "createdAt": "2026-11-08T10:00:00Z" }], "pagination": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1 } } }
```

Errors: `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `400 VALIDATION_ERROR`.

**19. `PATCH /api/v1/admin/accounts/{accountId}/status`** — Administrator only.

Request:
```json
{ "status": "FROZEN", "reason": "Review requested by account owner" }
```

Allowed target values: `ACTIVE` or `FROZEN`; use the close endpoint for `CLOSED`. A `CLOSED` account cannot be reactivated in the MVP. Success `200`:
```json
{ "success": true, "data": { "accountId": "uuid", "previousStatus": "ACTIVE", "status": "FROZEN", "changedAt": "2026-11-08T10:00:00Z" } }
```

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 ACCOUNT_NOT_FOUND`, `409 TRANSACTION_CONFLICT` if conflicting account operation cannot be safely serialised.

**20. `POST /api/v1/admin/accounts/{accountId}/close`** — Administrator only. This is the only MVP account-closure endpoint.

Request:
```json
{ "reason": "Account closure approved" }
```

Success `200`:
```json
{ "success": true, "data": { "accountId": "uuid", "previousStatus": "ACTIVE", "status": "CLOSED", "closedAt": "2026-11-08T10:00:00Z", "closedBy": "admin-user-uuid" } }
```

Preconditions: account exists; status is `ACTIVE` or `FROZEN`; balance projection and ledger-derived balance are both zero; no in-progress operation holds or awaits processing for the account. The service locks the account row and uses the same lock ordering as financial operations. Account closure and audit record commit atomically.

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 ACCOUNT_NOT_FOUND`, `409 ACCOUNT_HAS_NONZERO_BALANCE`, `409 ACCOUNT_HAS_IN_PROGRESS_OPERATION`, `409 ACCOUNT_CLOSURE_NOT_ALLOWED`.

**21. `GET /api/v1/admin/settings/demo-funding`** — Administrator only.

Success `200`:
```json
{ "success": true, "data": { "environment": "DEMO", "enabled": true, "changedAt": "2026-11-08T10:00:00Z", "changedBy": "admin-user-uuid" } }
```

Errors: `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`.

**22. `PATCH /api/v1/admin/settings/demo-funding`** — Administrator only; may enable only in `DEMO` or `TEST` environment.

Request:
```json
{ "enabled": false, "reason": "Demo funding disabled after presentation" }
```

Success `200`:
```json
{ "success": true, "data": { "environment": "DEMO", "enabled": false, "changedAt": "2026-11-08T10:00:00Z", "changedBy": "admin-user-uuid" } }
```

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `403 FEATURE_DISABLED_ENVIRONMENT`. The setting change is stored and audited. In production, demo funding remains disabled regardless of request.

**23. `POST /api/v1/admin/reconciliation`** — Administrator only; synchronous MVP operation.

Request:
```json
{ "scope": "ALL_LEDGER_ACCOUNTS", "currency": "INR" }
```

`scope` must be `ALL_LEDGER_ACCOUNTS` for the MVP; the implementation must include customer and system accounts, including `DEMO_CASH_CLEARING`.

Success `201`:
```json
{ "success": true, "data": { "runId": "uuid", "scope": "ALL_LEDGER_ACCOUNTS", "currency": "INR", "status": "COMPLETED", "customerLedgerAccountsChecked": 12, "systemLedgerAccountsChecked": 1, "transactionsChecked": 150, "discrepanciesFound": 0, "consistencyMode": "POSTGRES_REPEATABLE_READ_READ_ONLY", "snapshotStartedAt": "2026-11-08T10:00:00Z", "startedAt": "2026-11-08T10:00:00Z", "completedAt": "2026-11-08T10:00:02Z" } }
```

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `503 PROCESSING_UNAVAILABLE`.

**24. `GET /api/v1/admin/reconciliation/{runId}`** — Administrator only.

Success `200`:
```json
{ "success": true, "data": { "runId": "uuid", "scope": "ALL_LEDGER_ACCOUNTS", "currency": "INR", "status": "COMPLETED", "customerLedgerAccountsChecked": 12, "systemLedgerAccountsChecked": 1, "transactionsChecked": 150, "discrepanciesFound": 0, "consistencyMode": "POSTGRES_REPEATABLE_READ_READ_ONLY", "snapshotStartedAt": "2026-11-08T10:00:00Z", "discrepancies": [], "startedAt": "2026-11-08T10:00:00Z", "completedAt": "2026-11-08T10:00:02Z" } }
```

Errors: `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`, `404 RECONCILIATION_RUN_NOT_FOUND`.

**25. `GET /api/v1/admin/reconciliation?page=1&limit=20&status=COMPLETED&from=...&to=...&currency=INR`** — Administrator only; lists previous reconciliation runs so an administrator can discover run IDs before opening individual details.

Query: `page` defaults to 1; `limit` defaults to 20 and maximum is 100; optional `status` is `RUNNING`, `COMPLETED` or `FAILED`; `from` is inclusive and `to` is exclusive ISO 8601 UTC timestamps; optional `currency` is `INR` in the MVP. Results are sorted newest first by `started_at DESC`, with `id DESC` as a stable tie-breaker. Pagination is independent from transaction/attempt pagination.

Success `200`:
```json
{ "success": true, "data": { "items": [{ "runId": "uuid", "scope": "ALL_LEDGER_ACCOUNTS", "currency": "INR", "status": "COMPLETED", "customerLedgerAccountsChecked": 12, "systemLedgerAccountsChecked": 1, "transactionsChecked": 150, "discrepanciesFound": 0, "consistencyMode": "POSTGRES_REPEATABLE_READ_READ_ONLY", "snapshotStartedAt": "2026-11-09T10:00:00Z", "startedAt": "2026-11-09T10:00:00Z", "completedAt": "2026-11-09T10:00:02Z" }], "pagination": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1 } } }
```

Errors: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED`, `403 FORBIDDEN`. Ordinary customers and demo operators must receive `403 FORBIDDEN`.

**26. `POST /api/v1/admin/transactions/{transactionId}/reversal`** — Phase 2 only; administrator, idempotency key required.

Request: `{ "reason": "Approved correction" }`.

Success: `201` with the new reversal transaction ID, original transaction ID, `type=REVERSAL`, `status=POSTED` and amount. Errors include `404 TRANSACTION_NOT_FOUND`, `409 ALREADY_REVERSED`, `422 INSUFFICIENT_FUNDS`, `403 FORBIDDEN` and idempotency errors. Do not expose this endpoint in the MVP until reversal functionality and tests are implemented.

#### F. Common API behaviour

- Pagination parameters: `page` defaults to 1; `limit` defaults to 20 and maximum is 100. Invalid values return `400 VALIDATION_ERROR`.
- Date filter convention: `from` inclusive, `to` exclusive, ISO 8601 UTC. `from` must be earlier than `to`.
- All list endpoints sort newest first, with stable secondary order by ID.
- Register the exact `GET /api/v1/admin/reconciliation` collection route separately from the `GET /api/v1/admin/reconciliation/{runId}` detail route; validate run IDs as UUIDs and return `400 VALIDATION_ERROR` for malformed values.
- All IDs are UUIDs; malformed IDs return `400 VALIDATION_ERROR`.
- `reason` fields on account status, account closure and demo-setting changes are required, 1–250 characters, and must not contain secrets or sensitive credentials.
- All financial amounts are strings of digits in paise; values outside `100` to `100000000000` are rejected. The server never accepts a client-supplied balance, user ID or status as proof of authority.
- Every response includes or is associated with a request correlation ID. Errors use `{ "success": false, "error": { "code": "...", "message": "..." }, "correlationId": "..." }`.
- Never expose stack traces, SQL errors, internal configuration or secrets.

## 14. Non-functional requirements with measurable targets

The following are proposed hackathon acceptance targets, not performance claims. Measure them in the actual demo environment and adjust if the organisers specify different targets.

| ID | Requirement | Proposed verification/target |
|---|---|---|
| NFR-001 Security | Authentication and object-level authorisation on protected resources | Automated tests prove unauthorised access is rejected |
| NFR-002 Financial consistency | Every posted transaction balances per currency | 100% of posted transaction test records pass balancing checks |
| NFR-003 Atomicity | Financial posting commits all required effects or none | Failure injection at each posting stage leaves no partial financial effects |
| NFR-004 Concurrency | Concurrent operations cannot overdraw or double-post | 20+ simultaneous test requests with zero negative balances/duplicate postings |
| NFR-005 Traceability | Every request and posted transaction has traceable IDs | Correlation ID and transaction/attempt IDs available in logs/API |
| NFR-006 Data integrity | Constraints prevent invalid references and negative balances | Constraint and reconciliation tests pass |
| NFR-007 Maintainability | Modules have clear responsibilities | Auth, accounts, transactions, idempotency, ledger, audit and reconciliation separated |
| NFR-008 Performance | Normal API calls respond promptly | Target P95 under 1 second for core API calls under a documented 20-concurrent-user demo load, excluding cold starts |
| NFR-009 Availability | Temporary dependency failures return controlled responses | Simulated database interruption does not produce false success |
| NFR-010 Recoverability | Demo data can be backed up and restored | Documented backup and restore exercise completed before presentation |
| NFR-011 Privacy | Only necessary data is collected and returned | API response and log review finds no secrets or unrelated private data |
| NFR-012 Observability | Failures can be investigated | Structured logs, error codes and correlation IDs available |
| NFR-013 Compatibility | Supported browsers and devices are documented | Core workflow verified on agreed demo browsers/resolutions |
| NFR-014 Usability | Financial status and simulated operations are understandable | User test/demo confirms no ambiguous success/pending state |

## 15. Security requirements

- Enforce HTTPS in deployed environments.

- Hash passwords using bcrypt or Argon2id with parameters appropriate to the runtime.
- **MVP authentication choice:** use JWT access tokens plus rotating opaque refresh tokens; do not leave the strategy selectable during implementation.
- Access JWT lifetime: 15 minutes. Required claims: `sub` (user ID), `sid` (session ID), `jti`, `iat` and `exp`. Sign with a strong secret of at least 256 bits stored outside source control.
- Refresh token: cryptographically random, at least 256 bits of entropy, stored only as a SHA-256 hash in `user_sessions`, delivered in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie in deployed environments.
- Refresh lifetime: 7 days from issuance. Every refresh rotates the refresh token and invalidates the previous token. Reuse of an already rotated token revokes the entire session family and creates a security audit event.
- Logout revokes the current `sid` in `user_sessions` immediately and clears the refresh cookie. Protected API middleware must check that the referenced session is active, so an access JWT from a logged-out session is rejected immediately rather than remaining usable for its 15-minute lifetime.
- Every protected request must also confirm the user is active and obtain the current role from the server-side user/session record; do not trust stale role claims in a JWT.
- Disabling a user revokes all their sessions. Expired, revoked or unknown sessions return `401`.
- CSRF protection must be applied to cookie-based refresh/logout routes according to the frontend deployment model; access tokens must not be stored in localStorage if the team can avoid it.
- Store signing keys and database credentials in environment secrets, never source control.
- Validate all inputs server-side and use parameterised database operations.
- Enforce authentication and object-level authorisation for every protected resource.
- Derive user identity from the authenticated server context.
- Rate-limit login, registration and financial write endpoints. Use sensible throttling rather than a permanent lockout that could be abused for denial of service.
- Avoid account enumeration through unnecessarily different login errors.
- Never log passwords, access tokens, refresh tokens, secrets or full credentials.
- Use least-privilege application and database roles.
- Restrict CORS to approved frontend origins.
- Protect admin operations with server-side role checks and audit records.
- Use non-guessable IDs, but never treat ID unpredictability as a replacement for authorisation.
- Separate demo and production configuration; simulated funding must be disabled outside the demo environment.
- Keep dependencies updated and remove unused packages.
- Restrict direct `UPDATE`, `DELETE` and `TRUNCATE` privileges on ledger and audit tables.
- A mandatory PostgreSQL `BEFORE UPDATE OR DELETE` trigger shall reject all changes to posted `ledger_entries`; this is a required control, not an optional enhancement. The application role must also lack `TRUNCATE` privilege.

### 15.1 Privileged-account bootstrap and role provisioning

- The first `ADMIN` user shall be created by a restricted one-time deployment command/seed, not through public registration or a public API.
- The deployment operator supplies the administrator email and a strong one-time password through a secret manager or secure one-time input. Do not commit credentials, use a predictable default password, print secrets, or include them in logs. The command hashes the password with the configured password hasher before insertion.
- The bootstrap command shall refuse to run if an `ADMIN` already exists. A rerun must not duplicate the administrator, reset credentials or silently modify roles. Any recovery/promotion after initial bootstrap is a separately controlled deployment operation with an audit record.
- Demo-operator grant/revocation shall use the same restricted deployment process; a user must not gain or retain `DEMO_OPERATOR` merely because a seed is rerun. Revoke by explicitly changing the role back to `CUSTOMER` or disabling the dedicated operator identity, and record the change.
- A `DEMO_OPERATOR` account, if required, shall be provisioned through a restricted deployment seed/process only. In the MVP there is no public role-assignment endpoint.
- Public registration always creates `CUSTOMER`; client-supplied role/permission fields are rejected. The database default for new public registrations shall be `CUSTOMER`.
- Bootstrap and role-provisioning audit events shall be inserted in the same database transaction as the user/role change, with `actor_user_id = NULL` and a safe deployment-operator marker in metadata, action (`INITIAL_ADMIN_PROVISIONED`, `DEMO_OPERATOR_PROVISIONED` or `DEMO_OPERATOR_REVOKED`), timestamp, outcome and correlation ID. If the database transaction fails, neither the privileged user change nor its audit row is committed. Audit logs must not contain credentials.
- The MVP role model is exclusive: one user has exactly one of `CUSTOMER`, `DEMO_OPERATOR` or `ADMIN`. A demo operator uses a dedicated identity and does not inherit customer operations.

## 16. Account, transaction and error catalogue

### 16.1 Account statuses

| Status | Meaning | MVP money movement |
|---|---|---|
| `ACTIVE` | Normal account | Send and receive allowed |
| `FROZEN` | Temporarily restricted | Send and receive blocked |
| `CLOSED` | Permanently closed in MVP | Send and receive blocked |

### 16.2 Posted transaction types

- `TRANSFER`
- `DEPOSIT`
- `WITHDRAWAL`
- `REVERSAL` (Phase 2)

### 16.3 Suggested stable error codes

- `VALIDATION_ERROR`
- `AUTHENTICATION_REQUIRED`
- `FORBIDDEN`
- `ACCOUNT_NOT_FOUND`
- `ACCOUNT_NOT_OWNED`
- `ACCOUNT_NOT_ACTIVE`
- `SAME_ACCOUNT_TRANSFER`
- `CURRENCY_MISMATCH`
- `INVALID_AMOUNT`
- `AMOUNT_LIMIT_EXCEEDED`
- `HIGH_VALUE_LIMIT_EXCEEDED`
- `ACCOUNT_CLOSURE_NOT_ALLOWED`
- `ACCOUNT_HAS_NONZERO_BALANCE`
- `ACCOUNT_HAS_IN_PROGRESS_OPERATION`
- `SESSION_EXPIRED`
- `SESSION_REVOKED`
- `REFRESH_TOKEN_REUSED`
- `FEATURE_DISABLED_ENVIRONMENT`
- `DEMO_FUNDING_DISABLED`
- `RECONCILIATION_FAILED`
- `INSUFFICIENT_FUNDS`
- `IDEMPOTENCY_KEY_REQUIRED`
- `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`
- `TRANSACTION_CONFLICT`
- `RATE_LIMITED`
- `PROCESSING_UNAVAILABLE`
- `INTERNAL_ERROR`

The API must return a safe user-facing message and a stable machine-readable code. Never expose database internals.

## 17. User interface requirements

### 17.1 Customer screens

1. Registration.
2. Login.
3. Customer dashboard.
4. Account list and account details.
5. Balance view.
6. Transfer form.
7. Withdrawal form.
8. Simulated deposit form only for permitted demo/admin/test users.
9. Posted transaction history.
10. Transaction detail.
11. Request-attempt history showing deterministic rejections and replay/conflict outcomes where appropriate.

### 17.2 Administrator screens

1. Admin dashboard.
2. **Unified transaction-monitoring screen** containing two clearly separated panels/tabs: `Posted transactions` (from the admin transactions API) and `Request attempts` (from the admin transaction-attempts API). The screen offers search by transaction/attempt ID, account ID, user ID, operation/type, posted status or attempt outcome, and date range. Each panel has its own pagination and newest-first ordering.
3. Transaction and request-attempt detail views, including the linked transaction reference when an attempt produced or replayed an existing posting.
4. Account status management.
5. **Reconciliation history screen** listing previous runs with status/date filters, newest-first sorting and pagination; selecting a row opens its run detail and discrepancies.
6. **Demo-funding settings section** showing environment and current enablement state, with an enable/disable action and mandatory reason field; it uses the existing GET/PATCH APIs and must not override server-side environment restrictions.
7. Audit log viewer.
8. Reversal screen only if Phase 2 feature is implemented.

### 17.3 UI behaviour

- Show currency and amounts clearly using INR with exactly two decimal places and Indian digit grouping, for example `₹2,000.00` or `₹1,00,00,000.00`. API/database amounts remain integer paise strings; UI formatting must not perform financial rounding.
- Disable accidental repeated submission for usability, but do not rely on UI disabling to prevent duplicates.
- Generate one idempotency key per logical operation and reuse it for retries of that operation.
- Generate a new key for a genuinely new attempt.
- Do not show success until server confirms commit.
- Do not display an ambiguous `PENDING` status in the synchronous MVP.
- Clearly distinguish a posted transaction from a rejected request attempt.
- On the administrator monitoring screen, display posted transactions and request attempts together on the same screen but in separately labelled data panels; do not merge their pagination or count a `POSTED` request-attempt row as an additional financial transaction.
- Mark simulated deposit/withdrawal operations as simulated.
- Show a stable transaction ID for posted operations and an attempt ID/reason for rejected operations.
- Do not expose another customer's private information.

## 18. Audit, retention and operational requirements

- Log customer registration/login outcomes, account creation/closure/status changes, financial request outcomes, admin actions, over-₹100-crore-limit attempts, demo-funding setting changes and reconciliation runs.
- Include correlation IDs across API logs and database-linked records.
- Do not place secrets or sensitive credentials in logs.
- During the hackathon MVP, retain all posted transactions, ledger entries, idempotency outcomes, transaction attempts and audit events for at least the full demo period; do not run automated deletion or cleanup on financial records.
- **Optional when time/resources permit:** define configurable retention periods for non-financial operational logs and temporary demo data, after checking organiser expectations and applicable policy. This work is not a blocker if the team has no time/resources; the safe MVP default is no automatic purge.
- Never delete posted ledger entries or posted transaction headers through a retention job. Do not expire an idempotency record while its associated transaction/attempt can still be retried or queried.
- Use a database backup before the final demo and verify a restore into a non-production environment.
- Keep development, test and demo configuration separate.
- Seed only synthetic demo users and accounts; do not use real personal or banking data.

## 19. Testing and quality assurance

Testing must prove financial correctness, not merely that endpoints return success codes.

### 19.1 Unit tests

- Amount validation and configured limits, including ₹1 minimum, exactly ₹100 crore accepted by limit validation, and ₹100 crore + ₹0.01 rejected and audited.
- Currency validation.
- Account status rules.
- Account ownership and role checks.
- Request canonicalisation and fingerprint generation.
- Idempotency outcome comparison.
- Debit/credit generation by operation type.
- Balance calculation by ledger account normal side.
- Error code and status mapping.

### 19.2 Integration tests

- Register/login/logout.
- Refresh rotates the refresh token; the previous token cannot be reused.
- Reuse of a rotated refresh token revokes the token family.
- Logout immediately invalidates the current session's access JWT.
- Create customer and account.
- Verify zero initial account balance and customer ledger mapping.
- Account-details API returns `accountHolderName` from the linked user profile and enforces owner/admin read permissions.
- Transfer between two eligible accounts.
- Simulated deposit succeeds only for `ADMIN` or authorised `DEMO_OPERATOR` when environment is `DEMO`/`TEST` and the feature flag is enabled.
- Ordinary customer deposit is rejected with `403 FORBIDDEN` by default.
- Simulated deposit is rejected in `PRODUCTION` even if a feature-flag record is incorrectly true.
- Withdrawal with sufficient and insufficient funds.
- Customer cannot debit another customer's account.
- Frozen/closed accounts cannot send or receive.
- Posted transaction has correct ledger entries.
- Rejected request appears in attempt history but not posted transaction history.
- Same idempotency key/payload replays original POSTED result.
- Same idempotency key/payload replays original REJECTED result.
- Same key/different payload returns conflict.
- Transaction history and attempt history enforce ownership.
- Admin endpoints reject customer role.
- Administrator monitoring screen queries both admin transaction and admin attempt APIs and displays their records in separate panels with independent pagination.
- Admin transaction search filters by transaction ID, account ID, user ID, operation/type, posted status and date range.
- Admin attempt search filters by attempt ID, account ID, user ID, operation, outcome and date range.
- Attempt rows linked to posted transactions are not counted/displayed as additional posted transactions.
- Only administrators can close accounts; non-zero balance and active-operation closure attempts are rejected.
- Audit and reconciliation records are created.
- Administrator can list previous reconciliation runs with status/date filters, pagination and stable newest-first ordering, then retrieve a selected run by ID.
- Customer and demo-operator roles receive `403 FORBIDDEN` from reconciliation-run list and detail APIs.
- Reconciliation-run schema persists all list/detail fields, including customer/system account counts, discrepancy count, currency, snapshot time and consistency mode.
- The demo-funding settings section loads state from the GET API and saves changes through the PATCH API with a mandatory reason; production remains disabled regardless of UI state.
- Public registration with `role=ADMIN` or `role=DEMO_OPERATOR` is rejected; successful public registration always creates `CUSTOMER`.
- The one-time administrator bootstrap creates exactly one ADMIN when none exists, hashes the supplied password, writes its audit event in the same database transaction, and refuses a rerun when an ADMIN already exists without modifying the existing account.
- Restricted demo-operator provisioning and revocation are audited and cannot be invoked through public registration or public APIs.
- The restricted demo-operator seed/process provisions only a dedicated `DEMO_OPERATOR` identity and records an audit event.
- Passwords below 12 or above 128 characters are rejected; 12-character and 128-character valid passwords are accepted without trimming/truncation.
- INR UI formatting shows two decimal places and Indian digit grouping while preserving the exact paise value.

### 19.3 Concurrency tests

**Test A — Competing withdrawals**

Initial balance: ₹5,000. Submit concurrently:
- Withdrawal A: ₹4,000 with key A.
- Withdrawal B: ₹3,000 with key B.

Expected:
- Exactly one request posts.
- The other is rejected for insufficient funds.
- Final balance is either ₹1,000 or ₹2,000.
- No negative balance.
- Ledger-derived balance equals stored projection.

**Test B — Different simultaneous transfers from the same sender**

Initial balances: Sender A = ₹5,000; Receiver B = ₹0; Receiver C = ₹0. Submit concurrently using separate database connections and different idempotency keys:
- Transfer A → B: ₹4,000 with key `TRANSFER-4K`.
- Transfer A → C: ₹3,000 with key `TRANSFER-3K`.

Expected:
- Exactly one transfer posts; the losing request is rejected for insufficient funds. Which request wins is intentionally nondeterministic.
- Sender A ends with either ₹1,000 or ₹2,000, never a negative balance.
- Only the receiver belonging to the successful transfer is credited; the rejected transfer's receiver remains at ₹0.
- Exactly one posted transaction and exactly one balanced debit/credit pair exist for these requests.
- The sender and both receiver balance projections match their ledger-derived balances after both requests finish.
- The test uses different idempotency keys so it proves account-level concurrency control, not merely duplicate-request protection.

**Test C — Simultaneous duplicate transfer**

Initial sender balance: ₹10,000. Send the same ₹2,000 transfer multiple times concurrently with one identical key and payload.

Expected:
- Exactly one posted financial transaction.
- Sender debited once.
- Receiver credited once.
- All replay responses refer to the same transaction ID/outcome.

**Test D — Same key, different payload**

Submit ₹1,000 with a key, then ₹2,000 with the same key.

Expected:
- First request receives its normal outcome.
- Second request returns conflict.
- No second financial transaction is posted.

**Test E — Rejected result replay**

1. Submit a withdrawal with insufficient funds using key K.
2. Add demo funds to the account through an authorised deposit.
3. Retry the exact withdrawal with key K.

Expected:
- The original insufficient-funds rejection is returned.
- No withdrawal is posted.
- A new logical withdrawal requires a new key.

**Test F — Database-level concurrency across app instances**

Run requests through two backend instances or separate database connections, where feasible.

Expected:
- Database uniqueness and row locking preserve idempotency and balance correctness without relying on one process's memory.

### 19.4 Failure-injection tests

Inject an error at each stage:
- After idempotency key insert but before account locking.
- After transaction header insertion.
- After sender projection update.
- After receiver projection update.
- After debit entry insertion but before credit entry insertion.
- After ledger inserts but before idempotency outcome update.
- Immediately before commit.
- After commit but before HTTP response delivery.

Expected:
- Any pre-commit technical failure leaves no partial financial posting and rolls back the uncommitted key reservation.
- A retry after pre-commit rollback can process safely.
- A retry after commit but lost response returns the original committed outcome.
- Deterministic business rejection is persisted as a rejection outcome but creates no financial transaction or ledger entries.

### 19.5 Reconciliation tests

**Test A — Run listing and access control**
- Create multiple reconciliation runs with different statuses/timestamps.
- List with default and explicit pagination, status filter and date range.
- Verify newest-first order with stable run-ID tie-breaker and correct pagination metadata.
- Verify a customer/demo operator cannot list or retrieve reconciliation runs.

**Test B — Consistent snapshot while transfers are committing**
- Start a reconciliation and wait until its `REPEATABLE READ READ ONLY` snapshot has been established.
- Commit one or more transfers after that snapshot is established while reconciliation continues.
- Verify that every query in the reconciliation run sees the same pre-transfer snapshot: the later transfers are excluded consistently from transaction totals, ledger sums and balance projections.
- Run a second reconciliation after those transfers commit and verify that the second run includes them.
- Confirm neither run reports false discrepancies caused solely by transaction timing.

For every test dataset:
- Sum debit and credit entries per posted transaction and currency.
- Derive every customer account balance from ledger entries.
- Compare derived balances with `accounts.balance_minor`.
- Verify expected entry patterns per transaction type.
- Verify rejected attempts have no posted financial entries.
- Intentionally corrupt a test fixture using a privileged test-only mechanism and confirm reconciliation flags the discrepancy. Never add a production API to modify ledger rows.

### 19.6 Security tests

- Customer A cannot read Customer B's account.
- Customer A cannot debit Customer B's account.
- Customer cannot access admin endpoints.
- Customer cannot invoke simulated funding when disabled.
- Invalid/expired token is rejected.
- Excessive login/write requests are rate-limited.
- A request exactly at ₹100 crore passes the amount-limit check; a request of ₹100 crore plus ₹0.01 is rejected and creates a `HIGH_VALUE_LIMIT_EXCEEDED` audit event without exposing secrets.
- Sensitive values do not appear in application logs or API error messages.
- The application role has no UPDATE/DELETE/TRUNCATE privilege on `ledger_entries`; direct attempts fail.
- In an isolated test database, a dedicated non-owner test role with UPDATE/DELETE rights but no trigger-management rights attempts to mutate ledger entries; the mandatory trigger rejects both UPDATE and DELETE. The test role cannot disable/drop the trigger or truncate the table.

## 20. Recommended architecture and implementation boundaries

Use a **modular monolith** for the seven-day hackathon. Do not split the transaction workflow into microservices.

### 20.1 Suggested technology stack

| Layer | Recommendation |
|---|---|
| Frontend | React |
| Styling | Tailwind CSS or Bootstrap |
| Backend | Node.js + Express, or Java Spring Boot if the team is stronger in Java |
| Database | PostgreSQL |
| ORM | Prisma/Sequelize or JPA; use explicit database locking where required |
| Authentication | 15-minute JWT access tokens with server-side session validation and rotating seven-day opaque refresh tokens, as defined in Section 15 |
| Password hashing | bcrypt or Argon2id |
| API testing | Postman |
| Automated testing | Jest/Vitest + Supertest, or JUnit/MockMvc for Spring Boot |
| API documentation | Swagger / OpenAPI |
| Version control | Git + GitHub |

Choose one backend stack. The critical posting path must live in one service/module and one database transaction.

### 20.2 Suggested backend modules

```text
src/
  modules/
    auth/
    users/
    accounts/
    transactions/
    transactionAttempts/
    idempotency/
    ledger/
    reconciliation/
    audit/
    admin/
  middleware/
    authenticate.js
    authorize.js
    validateRequest.js
    errorHandler.js
  database/
    migrations/
    connection.js
  common/
    errors/
    utils/
  app.js
  server.js
```

### 20.3 Module responsibilities

- `auth`: registration, login, session/token lifecycle.
- `accounts`: account creation, ownership, status and balance retrieval.
- `transactions`: transfer/deposit/withdrawal orchestration.
- `transactionAttempts`: request-attempt recording and customer-visible outcome history.
- `idempotency`: key reservation, fingerprint comparison and replay.
- `ledger`: chart of accounts, posting entries and balance verification.
- `reconciliation`: account/transaction balancing and stored reconciliation runs.
- `audit`: traceable event records.
- `admin`: role-protected monitoring and account controls.

## 21. Seven-day implementation plan

### Day 1 — Scope, data model and foundation

- Confirm organiser requirements and MVP assumptions.
- Finalise entity relationships, account/ledger mapping and transaction lifecycle.
- Create repository, branch strategy and issue board.
- Set up frontend, backend, PostgreSQL and migrations.
- Seed system ledger counterpart accounts.

**Deliverable:** Running application skeleton, schema and architecture/data-flow diagrams.

### Day 2 — Authentication and accounts

- Run the restricted one-time administrator bootstrap and verify no public role elevation is possible.
- Registration/login/logout.
- Password hashing and protected routes.
- Customer account creation with zero initial balance.
- Customer ledger account mapping.
- Account ownership, status and balance retrieval.

**Deliverable:** Authenticated customer can create and view their own account.

### Day 3 — Core financial posting

- Implement one shared posting service.
- Implement transfer.
- Implement withdrawal.
- Implement admin/test-authorised simulated deposit.
- Add amount/account validation, database transaction and rollback.

**Deliverable:** Single-request money movement works correctly with transaction and ledger records.

### Day 4 — Ledger and request outcomes

- Implement ledger account catalogue and double-entry posting.
- Implement transaction-attempt table.
- Separate posted transaction history from rejected attempt history.
- Add account and transaction reconciliation.
- Add transaction detail/history APIs.

**Deliverable:** Every posted operation balances; rejected attempts are traceable without ledger postings.

### Day 5 — Idempotency and concurrency

- Add scoped idempotency records and unique constraint.
- Add canonical request fingerprint.
- Implement cached POSTED and REJECTED outcomes.
- Implement conflict handling and concurrent duplicate tests.
- Add row locking/atomic conditional updates and deterministic lock order.

**Deliverable:** Duplicate requests and competing withdrawals cannot create duplicate postings or overspending.

### Day 6 — Security, admin and hardening

- Add account freeze/unfreeze controls.
- Add admin monitoring, demo-funding settings and reconciliation-history screens.
- Implement consistent-snapshot reconciliation and the reconciliation-run listing API.
- Add audit logs and verify the mandatory ledger immutability trigger/privileges.
- Add rate limiting and database role restrictions for ledger immutability.
- Run failure-injection, ownership, security and edge-case tests.
- Fix defects and verify backup/restore.

**Deliverable:** Security and integrity acceptance tests pass.

### Day 7 — Integration and demo

- Complete customer/admin UI.
- Integrate frontend and backend.
- Run full automated test suite.
- Deploy and verify secrets/environment configuration.
- Prepare demo data, architecture explanation and demo script.
- Document scope limitations and future work.

**Deliverable:** Working, tested demo with reproducible evidence for the core guarantees.

## 22. Hackathon demonstration script

Use synthetic test customers and controlled balances.

### Demo 1 — Normal transfer

- Customer A has ₹10,000; Customer B has ₹5,000.
- Transfer ₹2,000.
- Show A = ₹8,000 and B = ₹7,000.
- Show one posted transaction and its debit/credit ledger entries.

### Demo 2 — Duplicate prevention

- Submit the same transfer multiple times using the same key and payload.
- Show all retries return the same transaction ID/outcome.
- Prove balances changed only once.

### Demo 3 — Same key, changed request

- Reuse the key with a different amount.
- Show conflict and no additional posting.

### Demo 4 — Concurrent withdrawals

- Account has ₹5,000.
- Submit ₹4,000 and ₹3,000 withdrawals simultaneously with different keys.
- Show only one posts and the balance remains non-negative.

### Demo 5 — Rejected request replay

- Attempt an unaffordable withdrawal with key K.
- Fund the account through the authorised demo operation.
- Retry the same withdrawal with K.
- Show the original rejection is returned and no withdrawal posts.
- Submit a genuinely new attempt with a new key to demonstrate fresh processing.

### Demo 6 — Unauthorised access

- Log in as Customer B.
- Attempt to debit Customer A's account.
- Show backend rejection.

### Demo 7 — Ledger proof

- Inspect the transaction's ledger entries.
- Show total debit equals total credit.
- Run reconciliation.
- Show the account balance projection matches the ledger-derived balance.

### Demo 8 — Rollback

- In a test environment, inject a failure during posting.
- Show no partial balance or ledger changes remain.
- Retry with the same key and show safe processing.

## 23. Definition of Done

A feature is not complete merely because its UI or API exists.

A financial feature is done only when:

- Business rules are implemented on the server.
- Authentication and object-level ownership checks are enforced.
- Database constraints and indexes are in place.
- Financial posting is atomic.
- Idempotency is enforced for financial writes.
- Concurrency behaviour is tested against the database.
- Posted ledger entries balance.
- Account balance projection reconciles to the ledger.
- Rejected requests are distinguishable from posted financial transactions.
- Errors are handled without partial posting.
- Audit information is recorded where required.
- Automated tests pass.
- API and user-interface behaviour agree on status and retry semantics.

## 24. Requirements traceability matrix

This summary matrix links the core requirement groups to stories, APIs, data entities and verification. It is sufficient for the seven-day MVP planning baseline. A full row-by-row matrix for every FR/NFR/UI/security/operational requirement (including individual test IDs) is a recommended documentation enhancement, but is optional if the team lacks time/resources. Critical financial requirements must still have a named test case before implementation is marked done.

| Requirement group | User story | Main API(s) | Main data entities | Primary verification |
|---|---|---|---|---|
| Authentication and sessions (FR-001–007, FR-002A) | US-01, US-02 | `/auth/*` | `users`, `user_sessions`, `refresh_token_history`, `audit_logs` | Password length/role-assignment, refresh rotation and immediate logout revocation tests |
| FR-008–016 Accounts | US-03, US-05, US-16 | `/accounts`, `/accounts/{accountId}`, admin account status/close | `users`, `accounts`, `ledger_accounts`, `audit_logs` | Account-holder-name/profile join, owner/admin authorisation, uniqueness and lifecycle tests |
| FR-017–020 Balance | US-04 | `/accounts/:id/balance` | `accounts`, `ledger_entries` | Ledger-to-projection reconciliation |
| FR-021–027 Transfer | US-06 | `/transfers` | `transactions`, `accounts`, `ledger_entries` | Transfer and rollback integration tests |
| FR-028–033 Demo funding/withdrawal | US-07, US-08 | `/deposits`, `/withdrawals`, admin demo-funding setting | `users`, `system_settings`, `transaction_attempts`, `transactions`, `ledger_accounts`, `ledger_entries`, `audit_logs` | Role + environment + feature-flag tests, balancing and idempotency tests |
| FR-034–045 Idempotency/attempts | US-09, US-10 | Financial POSTs, `/transaction-attempts` | `idempotency_records`, `transaction_attempts` | Replay, mismatch, rejection replay, concurrent duplicate tests |
| FR-046–051 Concurrency | US-11 | Financial POSTs | `accounts`, `transactions`, `ledger_entries` | Concurrent withdrawal and two-different-transfers-from-one-sender multi-connection tests |
| FR-052–061, FR-085–086, FR-090 Ledger/reconciliation | US-12, US-13, US-17 | Financial POSTs, reconciliation POST, reconciliation collection/detail GET | `ledger_accounts`, `ledger_entries`, `transactions`, `accounts`, `reconciliation_runs`, `reconciliation_discrepancies` | Balance checks, all-account reconciliation, snapshot concurrency, run-list/filter/access-control tests |
| FR-062–067, FR-091 History/status and INR display | US-03, US-04, US-10, US-12, US-19 | `/accounts/{accountId}`, `/transactions`, `/transaction-attempts`, `/admin/transactions`, `/admin/transaction-attempts` | `users`, `accounts`, `transactions`, `transaction_attempts` | Account-holder-name permission test; INR display-format test; customer/admin history and monitoring search tests |
| FR-068–073, FR-080–089 Audit/admin/closure/demo control, monitoring and bootstrap | US-05, US-14, US-16–US-20, US-22 | `/admin/*`; restricted deployment bootstrap/seed | `audit_logs`, `users`, `reconciliation_runs`, `accounts`, `system_settings`, `transactions`, `transaction_attempts` | Role, closure, audit, funding-settings UI, monitoring, bootstrap and reconciliation tests |
| FR-074–079 Reversal | US-15 | Admin reversal endpoint | `transactions`, `ledger_entries` | Unique reversal, balance and idempotency tests (Phase 2) |

## 25. Requirement ownership and team responsibility

The team must assign an owner role to each major requirement area before implementation. Replace `TBD` with a team member's name/initials at kickoff. One person may hold multiple roles in a small hackathon team, but every row must have one accountable owner.

| Requirement area / IDs | Responsible role | Accountable team member | Supporting role | Expected deliverable |
|---|---|---|---|---|
| Authentication and sessions (FR-001–007, FR-002A) | Backend | TBD | Security/QA | Auth APIs, password policy, session table, expiry/revocation tests |
| Account creation and lifecycle (FR-008–016, FR-080) | Backend | TBD | Frontend, Database | Account APIs, close/freeze rules, lifecycle tests |
| Balance and amount limits (FR-017–020, BR-21–22) | Backend | TBD | Database, QA | Exact paise validation, ₹100-crore cap tests |
| Transfers/deposits/withdrawals (FR-021–033) | Backend | TBD | Database, Frontend | Financial posting service and UI integration |
| Idempotency and attempts (FR-034–045) | Backend + Database | TBD | QA | Unique key, fingerprint, replay and rejection handling |
| Concurrency and atomicity (FR-046–051) | Backend + Database | TBD | QA | Row locks, rollback and concurrent tests |
| Ledger schema and posting (FR-052–061) | Backend + Database | TBD | QA | Balanced entries, mandatory integrity controls |
| Transaction history and API contracts (FR-062–067, FR-083) | Backend | TBD | Frontend | OpenAPI/Swagger and history APIs |
| Audit/admin controls/demo funding (FR-068–073, FR-082) | Backend | TBD | Security, Frontend | Admin APIs, audit records, environment guard |
| Reconciliation all ledger accounts (FR-060–061, FR-073, FR-081) | Backend + Database | TBD | QA | Reconciliation reports for customer and system accounts |
| UI screens and user experience (FR-089, FR-091) | Frontend | TBD | Backend | Customer/admin screens, demo-funding settings, reconciliation history and INR display formatting |
| Reconciliation history/snapshot and demo-funding UI (FR-085–090) | Backend + Database; Frontend for settings/history screens | TBD | QA | List/detail APIs, consistent-snapshot tests, admin screens and access-control tests |
| Initial admin/demo-operator provisioning (US-22, FR-087–088) | DevOps/Release + Backend | TBD | Security/QA | Restricted bootstrap/seed command, secret handling and no-public-role-escalation tests |
| Automated tests and security review | QA/Test | TBD | Entire team | Unit, integration, concurrency, failure and auth tests |
| Deployment, environment and backup | DevOps/Release | TBD | Backend | Demo deployment, secrets, backup/restore evidence |
| Requirements coordination and traceability | Product/Team lead | TBD | All owners | SRS updates, ownership review, acceptance sign-off |

**Ownership rules:**
- The responsible role implements the requirement; the accountable member ensures it is completed and tested.
- A requirement is not complete until its owner links it to the relevant API/database component and test evidence.
- Changes to transaction limits, idempotency semantics, account closure permissions or ledger rules require agreement from the backend, database and product owners and must be reflected in this SRS.

## 26. Optional planning items and resource-aware decisions

The following are deliberately not blockers for the seven-day MVP:

1. **Advanced account-number generation:** The MVP uses the simple `LL` + 12 random digit format and a database unique constraint. Check digits, bank/branch coding or industry-standard formatting can be added later if an organiser requires it.
2. **Full requirement-level traceability:** The summary matrix in Section 24 is the MVP baseline. Expanding every low-level requirement into a separate row with individual test identifiers is optional if time/resources are unavailable; critical financial requirements still require tests.
3. **Cryptographic ledger proofs:** Hash chains, digital signatures or Merkle proofs are optional unless “prove” is explicitly interpreted by organisers as protection against privileged database tampering. MVP append-only database controls and full reconciliation remain mandatory.
4. **Retention automation:** The MVP does not need a scheduled retention/archival job. Keep financial records for the demonstration and do not automatically purge ledger-related records. Add non-financial log cleanup only when resources and an approved policy are available.
5. **Daily transaction limits and risk scoring:** Not included in MVP. The hard per-operation ₹100-crore ceiling is mandatory; a lower operational cap or daily aggregate risk policy may be added later.

## 27. Open decisions to confirm with organisers

The original problem statement does not specify every product detail. Confirm these items if official rules or judging criteria are available:

1. Is the scope internal ledger transfers only, or is an external payment integration expected?
2. Are deposits and withdrawals explicitly required, or are they optional supporting operations?
3. Is a specific language, framework or database mandatory?
4. Is INR sufficient, or are multiple currencies expected?
5. Is a customer/admin role model expected?
6. Are throughput, latency or availability targets specified by the organisers?
7. Does “ledger you can prove” require cryptographic tamper evidence beyond the mandatory append-only database controls, balanced entries and reconciliation? The MVP uses database permissions/triggers plus reconciliation; cryptographic hash chaining/Merkle verification is optional unless judges require it.
8. Are deployment, API documentation, demo video or source-code evaluation criteria specified?
9. Are there organiser-defined transaction limits or expected concurrency levels? Until confirmed, the MVP hard cap is ₹100 crore per individual transfer/deposit/withdrawal, with 20+ concurrent requests in the demo test target.
10. Is simulated funding acceptable for demonstrating money movement?

Until clarified, follow the assumptions and scope in this document and state them clearly in your project submission.

## 28. Version 5.0 review summary and rating

**Requirements-document rating: 9.7/10.** This is an editorial/engineering completeness assessment of the written SRS after the v4.0 independent review fixes; it is not a score for the eventual implementation. The remaining gap is final validation against organiser-specific judging criteria and implementation evidence.

| Assessment area | Score / 10 |
|---|---:|
| Problem scope and business rules | 9.5 |
| Functional requirements and user stories | 9.5 |
| Transaction, idempotency and concurrency design | 9.5 |
| Database integrity and ledger design | 9.5 |
| API contract completeness | 9.5 |
| Authentication and authorisation lifecycle | 9.5 |
| Reconciliation and auditability | 9.5 |
| Testing and measurable NFRs | 9.5 |
| Ownership and implementation planning | 9.0 |
| Optional/organiser-dependent decisions | 9.0 |

The remaining 0.5 point is reserved for stakeholder confirmation of hackathon judging criteria, assigning actual team member names in the ownership matrix, and validating the final UI/API integration in the team's environment. Optional cryptographic proof, advanced account-number formats and expanded retention automation do not block the MVP unless organisers explicitly require them.

## 29. Version history and change log

### Version 4.0 developer-review alignment (retained in v5.0)

The v4.0 revision made four targeted alignment updates without changing the core architecture or financial posting rules:

1. **Account details:** Updated US-03 and `GET /api/v1/accounts/{accountId}` to return `accountHolderName` from the linked user profile, with owner/admin read authorisation.
2. **Simulated deposits:** Confirmed the correct v3 story is US-07 (US-08 is withdrawal). Tightened US-07, FR-028, API permission wording, UI visibility and integration tests so only ADMIN or explicit DEMO_OPERATOR can fund in DEMO/TEST with the feature flag enabled; production and ordinary customers are denied by default.
3. **Concurrent transfers:** Expanded US-11 and added an explicit multi-connection integration test for two different outgoing transfers from the same sender, using different idempotency keys and different receivers.
4. **Administrator monitoring:** Expanded US-19 and the admin UI to show posted transactions and request attempts on one screen in separate panels, with the required filters, independent pagination, newest-first ordering and no double-counting of posted attempts. Expanded attempt request metadata so account-ID searches are possible without treating untrusted request IDs as foreign-key relationships.

**Story-number correction:** The reviewer report's labels do not align with v3 numbering. The changes were applied to the matching v3 story titles and IDs rather than renumbering existing stories: account details = US-03; deposit = US-07; concurrency = US-11; administrator monitoring = US-19. US-05 remains account lifecycle, US-08 remains withdrawal, and US-13 remains reconciliation.

**Scope decision:** All v4.0 developer-alignment changes remain intact. The v5.0 additions are targeted clarifications and controls; they do not redesign transfer processing, idempotency, database locking, ledger posting or the modular-monolith architecture.

### Version 5.0 independent-review corrections

1. Added `GET /api/v1/admin/reconciliation` to list prior reconciliation runs with status/date filters, pagination, newest-first ordering and a stable run-ID tie-breaker; retained the run-ID detail endpoint.
2. Made each reconciliation run use one PostgreSQL `REPEATABLE READ READ ONLY` snapshot for all ledger, transaction, customer projection and system-account checks; defined orchestration and persistence of run results.
3. Added explicit administrator UI requirements for reconciliation history and demo-funding settings, including reason capture and use of the existing GET/PATCH APIs.
4. Added a restricted one-time bootstrap process for the initial administrator and restricted provisioning for a dedicated demo operator; public registration always assigns `CUSTOMER` and rejects privilege fields.
5. Made the ledger immutability trigger unambiguously mandatory, denied `TRUNCATE` to the application role, and added corresponding security tests.
6. Aligned the architecture technology table with the fixed 15-minute JWT access token and seven-day rotating opaque refresh-token strategy.
7. Set the password policy to 12–128 characters and standardised INR UI formatting to two decimal places with Indian digit grouping.
8. Converted reconciliation-run/discrepancy fields from suggested to mandatory schema fields and added required indexes and constraints.
9. Added user-story acceptance criteria, functional requirements, API response fields, integration tests, concurrency/reconciliation tests, and implementation-plan tasks for these updates.

## 30. Final engineering priorities

The central value of LedgerLine is not the number of screens or endpoints. It is the ability to demonstrate that money movement is correct.

Build and prove these guarantees:

1. **Authorised:** Only a permitted customer can debit an account.
2. **Idempotent:** A retry of the same logical request returns its original outcome and cannot create a second posting.
3. **Concurrency-safe:** Simultaneous operations cannot overspend an account.
4. **Atomic:** All financial effects commit together or none do.
5. **Balanced:** Every posted financial transaction has equal total debits and credits per currency.
6. **Traceable:** Requests, posted transactions and ledger entries are linked and auditable.
7. **Reconciliable:** The stored customer balance projection agrees with the ledger-derived balance.
8. **Controlled:** Demo funding, account status changes and administrative actions are permission-restricted and audited.

A strong implementation is one that proves these guarantees with database constraints, automated integration tests, concurrent execution tests, failure injection and reconciliation—not one that simply demonstrates a transfer button.
