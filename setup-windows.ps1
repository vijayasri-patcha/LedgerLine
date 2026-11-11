$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22+ first.' }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw 'Install PostgreSQL 16+ and add psql to PATH.' }
if (-not (Test-Path 'backend/.env')) { Copy-Item 'backend/.env.example' 'backend/.env' }
Push-Location backend; npm install; npx prisma generate; Pop-Location
Push-Location frontend; npm install; Pop-Location
Write-Host 'Dependencies installed. Create the PostgreSQL database, edit backend/.env, then run: cd backend; npx prisma migrate deploy'
