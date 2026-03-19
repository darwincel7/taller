ALTER TABLE floating_expenses ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
ALTER TABLE accounting_transactions DROP CONSTRAINT IF EXISTS accounting_transactions_created_by_fkey;
ALTER TABLE accounting_transactions ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
