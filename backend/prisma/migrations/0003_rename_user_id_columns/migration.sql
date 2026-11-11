ALTER TABLE "transactions"
RENAME COLUMN "userId" TO "user_id";

ALTER TABLE "transaction_attempts"
RENAME COLUMN "userId" TO "user_id";

ALTER TABLE "reconciliation_runs"
RENAME COLUMN "userId" TO "user_id";
