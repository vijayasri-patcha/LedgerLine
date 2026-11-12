# LedgerLine

## Live Demo

- **Frontend:** https://ledger-line-roan.vercel.app/
- **Backend API:** https://ledgeline-api.onrender.com
- **Health Check:** https://ledgeline-api.onrender.com/health

LedgerLine is a demonstration internal-ledger application. It is **not a bank** and does not move real money. Simulated deposits and withdrawals are test/demo operations only.

This repository follows the supplied LedgerLine SRS v5.0, Corrected System Design v2.0 and End-to-End Flow v1.0 as its implementation baseline. The SRS is authoritative where documents differ.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL
- Data access: Prisma plus parameterised PostgreSQL SQL for locks
- Password hashing: Argon2id
- Access: 15-minute JWT; seven-day rotating opaque refresh cookie

## Deployment

LedgerLine is deployed using:

- Frontend: Vercel
- Backend: Render
- Database: Neon PostgreSQL

**Production application:** https://ledger-line-roan.vercel.app/

## Local Setup

Install **Node.js 22 LTS or later** and **PostgreSQL 16 or later** locally. Ensure `psql` and `createdb` are on PATH.

### 1. Create Database and Application User

Run as a PostgreSQL administrator (replace the passwords):

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

ALTER DEFAULT PRIVILEGES FOR ROLE ledgerline_migrator IN SCHEMA public
GRANT SELECT, INSERT, UPDATE ON TABLES TO ledgerline_app;
```

**Security note:** For a hardened deployment, use separate migration and runtime URLs and ensure the runtime role does not own tables. Do not grant DELETE/TRUNCATE on `ledger_entries`. The SQL migration installs append-only triggers; database owners/superusers can bypass application-level protections, so keep migration credentials private.

### 2. Configure Backend

```bash
cd backend
cp .env.example .env
```

Set `DATABASE_URL` to the migration connection for the migration command. For normal application operation, use the `ledgerline_app` connection URL.

Set `JWT_SECRET` to a cryptographically random secret of at least 32 characters. Set `COOKIE_SECURE=true` when using HTTPS.

Install and migrate:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

### 3. Bootstrap Administrator

LedgerLine's initial administrator:

- **Administrator Name:** Vijaya Sri
- **Administrator Email:** Set your administrator email privately.

For Windows PowerShell, configure the environment variables:

```powershell
$env:BOOTSTRAP_ADMIN_NAME="your-admin-name"
$env:BOOTSTRAP_ADMIN_EMAIL="your-admin-email@example.com"
$env:BOOTSTRAP_ADMIN_PASSWORD="your-strong-password"

npm run bootstrap-admin
```

The bootstrap command refuses to overwrite an existing administrator.

**Important:** Never commit administrator passwords or other secrets to GitHub.

### 4. Optional Demo Operator

Set these environment variables in your shell:

```bash
export DEMO_OPERATOR_NAME='Demo Operator'
export DEMO_OPERATOR_EMAIL='demo@example.test'
export DEMO_OPERATOR_PASSWORD='replace-with-a-long-passphrase'

npm run provision-demo
```

### 5. Start Backend API

```bash
npm run dev
```

Local API health check:

http://localhost:4000/health

### 6. Start Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the application:

http://localhost:5173

Optional frontend API URL: create `frontend/.env` with:

```env
VITE_API_URL=http://localhost:4000/api/v1
```

For Vercel production deployment, configure:

```env
VITE_API_URL=https://ledgeline-api.onrender.com/api/v1
```

## Important API Routes

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/password-change`
- `GET /api/v1/auth/me`
- `POST /api/v1/accounts` (requires `Idempotency-Key`)
- `GET /api/v1/accounts`
- `GET /api/v1/accounts/:accountId`
- `GET /api/v1/accounts/:accountId/balance`
- `GET /api/v1/accounts/lookup?accountNumber=LL...`
- `POST /api/v1/transfers`
- `POST /api/v1/withdrawals`
- `POST /api/v1/deposits`

All financial writes require an `Idempotency-Key`.

Additional routes:

- `GET /api/v1/demo-funding/accounts` (ADMIN/DEMO_OPERATOR only)
- `GET /api/v1/transactions`
- `GET /api/v1/transaction-attempts`

Admin routes include:

- `/api/v1/admin/accounts`
- `/api/v1/admin/transactions`
- `/api/v1/admin/transaction-attempts`
- `/api/v1/admin/audit-logs`
- Account status and closure management
- Demo-funding settings and reconciliation

All amounts are integer paise strings. Minimum ₹1 (100 paise); maximum ₹100 crore (100,000,000,000 paise). These limits are enforced server-side. UI formatting is INR with Indian grouping.

## Tests

```bash
cd backend
npm test
```

The included automated tests currently cover amount boundaries and deterministic fingerprint behaviour.

The supplied SRS additionally requires real-PostgreSQL integration, concurrency and failure-injection tests. See `docs/IMPLEMENTATION_STATUS.md` for implementation gaps.

Do not treat this first implementation as production banking software.

## Demo Funding

Deposits require:

- ADMIN or DEMO_OPERATOR role.
- `APP_ENV=DEMO` or `TEST`.
- Database setting `DEMO_FUNDING_ENABLED=true`, managed by an admin in the Funding settings screen.

The production environment is hard-denied regardless of the stored setting.

Deposits are simulated ledger entries against `DEMO_CASH_CLEARING`. No real money moves.