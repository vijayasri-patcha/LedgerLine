# LedgerLine

LedgerLine is a demonstration internal-ledger application. It is **not a bank** and does not move real money. Simulated deposits/withdrawals are test/demo operations only.

This repository follows the supplied LedgerLine SRS v5.0, Corrected System Design v2.0 and End-to-End Flow v1.0 as its implementation baseline. The SRS is authoritative where documents differ.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL
- Data access: Prisma plus parameterised PostgreSQL SQL for locks
- Password hashing: Argon2id
- Access: 15-minute JWT; seven-day rotating opaque refresh cookie

## No-Docker local setup

Install **Node.js 22 LTS or later** and **PostgreSQL 16 or later** locally. Ensure `psql` and `createdb` are on PATH.

### 1. Create database and least-privilege app user

Run as a PostgreSQL administrator (replace the password):

```sql
CREATE ROLE ledgerline_migrator LOGIN PASSWORD 'change-this-migration-password';
CREATE ROLE ledgerline_app LOGIN PASSWORD 'change-this-app-password';
CREATE DATABASE ledgerline OWNER ledgerline_migrator;
GRANT CONNECT ON DATABASE ledgerline TO ledgerline_app;
```

The initial migration is executed with the migration-owner connection. After migrations, grant application access:

```sql
GRANT USAGE ON SCHEMA public TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ledgerline_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledgerline_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ledgerline_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO ledgerline_app;
```

**Security note:** For a hardened deployment, use separate migration and runtime URLs and ensure the runtime role does not own tables. Do not grant DELETE/TRUNCATE on `ledger_entries`. The SQL migration installs append-only triggers; database owners/superusers can bypass application-level protections, so keep migration credentials private.

### 2. Configure backend

```bash
cd backend
cp .env.example .env
```

Set `DATABASE_URL` to the migration connection for the migration command. For local development you can temporarily use the migrator URL, but for normal operation set it to the `ledgerline_app` URL. Set `JWT_SECRET` to a cryptographically random secret of at least 32 characters. Set `COOKIE_SECURE=true` when using HTTPS.

Install and migrate:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

### 3. Bootstrap administrator

Set these environment variables in the shell (do not commit them):

```bash
export BOOTSTRAP_ADMIN_NAME='LedgerLine Admin'
export BOOTSTRAP_ADMIN_EMAIL='admin@example.test'
export BOOTSTRAP_ADMIN_PASSWORD='replace-with-a-long-passphrase'
npm run bootstrap-admin
```

The bootstrap command refuses to overwrite an existing administrator.

Optional demo operator:

```bash
export DEMO_OPERATOR_NAME='Demo Operator'
export DEMO_OPERATOR_EMAIL='demo@example.test'
export DEMO_OPERATOR_PASSWORD='replace-with-a-long-passphrase'
npm run provision-demo
```

### 4. Start API

```bash
npm run dev
```

API health check: `http://localhost:4000/health`.

### 5. Start frontend (second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

Optional frontend API URL: create `frontend/.env` with `VITE_API_URL=http://localhost:4000/api/v1`.

## Important API routes

- `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`, `/password-change`
- `GET /api/v1/auth/me`
- `POST /api/v1/accounts` (requires `Idempotency-Key`), `GET /api/v1/accounts`, `GET /api/v1/accounts/:accountId`, `GET /api/v1/accounts/:accountId/balance`
- `GET /api/v1/accounts/lookup?accountNumber=LL...`
- `POST /api/v1/transfers`, `/withdrawals`, `/deposits` (all financial writes require `Idempotency-Key`)
- `GET /api/v1/demo-funding/accounts` (ADMIN/DEMO_OPERATOR only)
- `GET /api/v1/transactions`, `/transaction-attempts`
- Admin: `/api/v1/admin/accounts`, `/transactions`, `/transaction-attempts`, `/audit-logs`, account status/closure, demo-funding settings and reconciliation.

All amounts are integer paise strings. Minimum ₹1 (100 paise); maximum ₹100 crore (100,000,000,000 paise). These limits are enforced server-side. UI formatting is INR with Indian grouping.

## Tests

```bash
cd backend
npm test
```

The included automated tests currently cover amount boundaries and deterministic fingerprint behaviour. The supplied SRS additionally requires real-PostgreSQL integration/concurrency/failure-injection tests; see `docs/IMPLEMENTATION_STATUS.md` for gaps. Do not treat this first implementation as production banking software.

## Demo funding

Deposits require ADMIN or DEMO_OPERATOR, `APP_ENV=DEMO` or `TEST`, and the database setting `DEMO_FUNDING_ENABLED=true` (managed by an admin in the Funding settings screen). The production environment is hard-denied regardless of the stored setting. Deposits are simulated ledger entries against `DEMO_CASH_CLEARING`; no real money moves.
