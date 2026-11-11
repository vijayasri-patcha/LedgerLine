# THREATS.md — LedgerLine threat model

## 1. Scope and assumptions

LedgerLine is an assessment/demo banking-ledger application. It is not a real bank and must not process real money. This document identifies risks and controls to implement and test; it is **not** a certification that the controls are already present.

## 2. Assets to protect

- User credentials, session tokens and password-reset tokens.
- Customer identity and account details.
- Account balances and transaction history.
- Ledger entries and idempotency records.
- Transaction attempts, audit events and reconciliation results.
- Database credentials, environment variables and signing secrets.
- Administrative permissions and demo-funding configuration.

## 3. Trust boundaries

1. Browser to API: all browser input is untrusted.
2. API to database: validate data and preserve transaction integrity.
3. Customer to administrator: customer-supplied role or account identifiers must never grant privilege.
4. Demo/test to production: demo funding must be disabled in production.
5. Application to external services: credentials and returned data require protection and validation.

## 4. Threats, impact and required controls

| Threat | Possible impact | Required controls and tests |
|---|---|---|
| Unauthenticated API access | Private data or money-moving operations exposed | Require authentication on protected routes; test requests without a valid session/token. |
| Broken account-level authorisation (IDOR) | One customer reads or changes another customer's account | Derive the user identity from the authenticated session; check ownership server-side on every account operation; test with two users and altered account IDs. |
| Unauthorised simulated deposits | Fake balance creation | Permit only authorised `ADMIN` or `DEMO_OPERATOR` in `DEMO`/`TEST` when `DEMO_FUNDING_ENABLED=true`; reject ordinary customers and all production requests. Test each denial path. |
| Forged role or user identity | Privilege escalation | Never trust role/user fields from request bodies or query strings; load permissions from trusted server-side identity data. |
| Weak session/token handling | Account takeover | Use secure token/session handling, expiry, logout/revocation where applicable, secure cookie settings and safe password storage. |
| Duplicate request / replay | Same transfer or deposit posted more than once | Enforce idempotency on the server; same key and same payload should replay the result, while same key with a different payload should conflict. |
| Concurrent withdrawals | Overspending or negative balance | Use database transactions, appropriate locking/conditional updates and sufficient-funds checks; run concurrent withdrawal tests. |
| Partial financial update | Balance changes without matching ledger entries | Perform balance and ledger writes atomically; force a failure mid-operation and verify rollback. |
| Unbalanced or mutable ledger | Financial records become unreliable | Use append-only ledger entries; each posting must balance debits and credits and use a consistent currency; restrict update/delete paths. |
| Invalid amount or currency | Incorrect balances or precision errors | Validate positive integer paise, supported currency and configured limits; avoid floating-point arithmetic for money. |
| Missing audit events | Actions cannot be investigated | Record actor, action, target, timestamp, outcome and correlation/transaction identifier; protect audit records from ordinary users. |
| Reconciliation gap | Stored balances disagree with ledger totals | Provide reconciliation checks and visible discrepancy reporting; test balanced and intentionally mismatched data. |
| Frozen or closed account misuse | Transactions continue when prohibited | Enforce account status on the server; closure should require zero balance and no in-progress operation; closed accounts should be terminal if required by the specification. |
| Secret/configuration exposure | Database or service compromise | Keep secrets out of Git and logs; restrict access; rotate any exposed credential; use safe deployment configuration. |
| Browser or transport attack | Session theft, request forgery or script injection | Use HTTPS in deployment, suitable security headers, input/output handling, and CSRF protection where cookie authentication is used. |
| Brute force or API abuse | Account takeover or service disruption | Rate-limit sensitive endpoints, use safe login error messages, monitor repeated failures and apply sensible request limits. |

## 5. Financial invariants to verify

- Money is represented as integer paise (or another exact integer minor unit), not floating-point rupees.
- Each ledger posting has at least two entries and total debits equal total credits.
- Every entry in a posting uses the same currency.
- A transfer debits one eligible account and credits a different eligible account atomically.
- A withdrawal or transfer cannot overdraw an account.
- Failed operations leave no partial balance or ledger changes.
- Repeating an idempotent request cannot create a second posting.
- A customer can operate only on accounts they own and are permitted to use.

## 6. Minimum security test checklist

Mark a box only after running and recording the test result.

- [ ] Protected endpoint rejects a request without authentication.
- [ ] Customer A cannot read Customer B's account by changing an identifier.
- [ ] Customer A cannot transfer from Customer B's account.
- [ ] Customer cannot gain admin rights by changing request data.
- [ ] Ordinary customer cannot make a simulated deposit.
- [ ] Deposit is rejected when `DEMO_FUNDING_ENABLED` is false.
- [ ] Deposit is rejected outside `DEMO`/`TEST`, including production.
- [ ] Same idempotency key and same payload does not create a duplicate posting.
- [ ] Same idempotency key with a different payload is rejected.
- [ ] Concurrent withdrawals cannot overspend.
- [ ] A forced failure rolls back all balance and ledger writes.
- [ ] Ledger debit and credit totals balance after each tested operation.
- [ ] Audit records are created for successful and rejected sensitive actions as required.
- [ ] Reconciliation detects a deliberately introduced discrepancy.
- [ ] Closed/frozen account restrictions are enforced server-side.
- [ ] Repository and deployment configuration contain no real secrets.

## 7. Residual risk and honest reporting

A passing build or health endpoint does not prove security. Record the test command, date, result and relevant commit for each completed test. Any unchecked item remains unverified. Do not deploy this demo for real financial use.
