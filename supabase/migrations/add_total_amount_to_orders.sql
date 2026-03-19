-- Add totalAmount column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "totalAmount" NUMERIC DEFAULT 0;

-- Add comment to the new column
COMMENT ON COLUMN orders."totalAmount" IS 'Total amount of the order (including parts and labor)';
