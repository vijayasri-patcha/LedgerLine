ALTER TABLE "transactions"
ADD COLUMN "userId" UUID;

ALTER TABLE "transactions"
ADD CONSTRAINT "transactions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transaction_attempts"
ADD COLUMN "userId" UUID;

ALTER TABLE "transaction_attempts"
ADD CONSTRAINT "transaction_attempts_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reconciliation_runs"
ADD COLUMN "userId" UUID;

ALTER TABLE "reconciliation_runs"
ADD CONSTRAINT "reconciliation_runs_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
