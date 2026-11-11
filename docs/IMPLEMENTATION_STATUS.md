# Implementation status and explicit limitations

This is a substantial runnable starter implementation based on the three supplied specifications, not a certified or production-ready financial system. Review every item below before a hackathon demo.

## Included

- React customer/admin UI foundations, login/register, account dashboard, account creation, transfer/withdrawal forms, posted transaction list, admin account search, monitoring panels and reconciliation page.
- Express API with customer registration/login, Argon2id password hashing, access JWT, opaque refresh cookie, refresh rotation with session row locking, reuse detection, logout revocation, `/auth/me`, and password change.
- Account creation with zero opening balance and customer ledger mapping; account details/balance and masked receiver account-number lookup.
- Shared transfer/deposit/withdrawal posting service, exact paise representation, idempotency records, ordered account row locks, ledger postings, transaction attempts and audit events.
- PostgreSQL schema migration, append-only ledger triggers, deferred transaction balance checks, deferred idempotency finalisation check, currency consistency trigger, seeded clearing account and demo-funding setting.
- Admin account search, freeze/unfreeze, closure, disable-user, audit, monitoring, demo-funding settings and reconciliation APIs.
- One-time admin bootstrap and dedicated demo-operator provisioning scripts.
- Local setup without Docker.

## Gaps to resolve before claiming full SRS acceptance

1. Complete the entire normative API contract catalogue and every filter/pagination/error field. Some history and admin endpoints currently use simplified fixed limits and do not implement all SRS filters or detail endpoints.
2. Add comprehensive real-PostgreSQL integration tests: duplicate-key races, different-key overspend, A→B/B→A opposing transfers, simultaneous refresh, rollback injection at every posting stage, trigger bypass attempts using a non-owner role, and consistent reconciliation snapshot under concurrent commits.
3. Add a dedicated `transaction_attempts` validation/technical-failure best-effort writer and make sure conflict attempts survive their own transaction rollback.
4. A unique-key race recovery/replay wrapper is now implemented for account and financial operations. It still requires real-PostgreSQL concurrency tests to verify deterministic behaviour under load.
5. Expand reconciliation to explicitly validate all SRS checks: system-account derived balances, all ledger mapping cardinalities, entry currency/reference integrity, expected operation patterns, missing/duplicate entries, and persisted snapshot identifier/time. Current implementation covers a subset.
6. Reconciliation should capture PostgreSQL snapshot identifier and timestamp inside the repeatable-read read-only transaction and persist the actual snapshot timestamp; strengthen this path with an integration test.
7. Add CSRF token strategy for cookie-authenticated refresh/logout routes. SameSite strict is a mitigation, not a replacement for a complete CSRF design in all deployment topologies.
8. Add user administration UI, account detail UI, account close reason/precondition UI, reconciliation run detail UI, attempt detail UI, and CSV export if scheduled. The demo funding settings UI and authorised simulated-deposit screen have been added.
9. Add full OpenAPI 3.1 schemas for every API, standard response/error catalogue, date filters and cursor/page metadata.
10. Add proper per-route and per-principal rate limits, request-size controls, security headers, structured log redaction and production secrets management.
11. Database hardening must be completed with separate migration/runtime roles. The migration owner must not be the application login. Verify grants against the exact database roles used in deployment; table owners and superusers can bypass ordinary grants/triggers.
12. The SRS says admin may inspect account/transaction data subject to permitted investigation. Implement a formal access/audit policy for every admin read and add required admin transaction detail and customer transaction detail routes.
13. Amount limit events are recorded as audit entries, but a full suspicious-event review workflow and all source-specific validation semantics remain to be completed.
14. Confirm the Prisma schema and SQL migration remain aligned after every schema change (`npx prisma validate`, `npx prisma generate`, `npx prisma migrate diff`).

## Decisions

- JWT role is deliberately omitted; role is reloaded from the database on every protected request.
- Ownership checks happen before committing any idempotency outcome. An ownership failure rolls back the reservation and is not replayed.
- Amount format/range validation occurs before reservation. Insufficient funds and other deterministic post-reservation business outcomes are stored and replayed.
- The app uses a modular monolith and local PostgreSQL; Docker is not required.


## Targeted repairs (10 November 2026)

See `docs/AUDIT_AND_REPAIRS.md` for the detailed audit and verification record. Simulated deposit UI and database-backed feature-flag enforcement, account-creation idempotency, exact rupee-to-paise conversion, strict financial payload shaping, financial idempotency race recovery, and terminal closed-account handling have been added. These changes have TypeScript build checks but still require live PostgreSQL integration and concurrency tests.
