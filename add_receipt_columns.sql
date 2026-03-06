-- Add receipt_url and search_text columns to accounting_transactions table
ALTER TABLE accounting_transactions
ADD COLUMN IF NOT EXISTS receipt_url TEXT,
ADD COLUMN IF NOT EXISTS search_text TEXT;

-- Create an index on search_text for faster searching (optional but recommended)
-- Note: GIN index is better for full text search, but simple ILIKE works with standard text
-- For now, we rely on ILIKE queries as implemented in the service.
