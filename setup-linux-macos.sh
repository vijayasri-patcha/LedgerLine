#!/usr/bin/env bash
set -euo pipefail
command -v node >/dev/null || { echo 'Install Node.js 22+ first'; exit 1; }
command -v psql >/dev/null || { echo 'Install PostgreSQL 16+ and psql first'; exit 1; }
[ -f backend/.env ] || cp backend/.env.example backend/.env
(cd backend && npm install && npx prisma generate)
(cd frontend && npm install)
echo 'Dependencies installed. Create the PostgreSQL database, set backend/.env, then run: cd backend && npx prisma migrate deploy'
