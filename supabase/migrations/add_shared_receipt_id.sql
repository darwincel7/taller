-- Add shared_receipt_id to accounting_transactions
ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS shared_receipt_id TEXT;
