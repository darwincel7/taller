-- Add missing columns to the orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "partRequests" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "pointRequest" JSONB DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "externalRepair" JSONB DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "returnRequest" JSONB DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "techMessage" JSONB DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "transferStatus" TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "transferTarget" TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "pending_assignment_to" UUID DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "approvalAckPending" BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "isValidated" BOOLEAN DEFAULT FALSE;

-- Ensure RLS policies allow updates to these columns (usually covered by generic update policy, but good to check)
-- No specific action needed if generic update policy exists.

-- Comment on columns for clarity
COMMENT ON COLUMN orders."partRequests" IS 'List of parts requested for this order';
COMMENT ON COLUMN orders."pointRequest" IS 'Points request details';
COMMENT ON COLUMN orders."externalRepair" IS 'External repair request details';
COMMENT ON COLUMN orders."returnRequest" IS 'Return request details';
COMMENT ON COLUMN orders."techMessage" IS 'Message between tech and admin';
