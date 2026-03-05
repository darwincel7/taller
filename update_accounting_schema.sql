-- Add new columns to accounting_transactions
ALTER TABLE accounting_transactions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'ORDER', 'STORE')),
ADD COLUMN IF NOT EXISTS order_id TEXT, -- Changed to TEXT to match existing ID types in app (usually UUID strings but stored as text in some legacy apps, sticking to UUID if possible but TEXT is safer for existing apps unless confirmed)
ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounting_status ON accounting_transactions(status);
CREATE INDEX IF NOT EXISTS idx_accounting_source ON accounting_transactions(source);
CREATE INDEX IF NOT EXISTS idx_accounting_order_id ON accounting_transactions(order_id);

-- Add RLS policy for admin only on sensitive operations if needed, 
-- but for now we keep the existing "Allow all" and handle auth in app logic as requested,
-- or we can refine it. The user asked for "Security Extrema" in the Dashboard VIEW, 
-- but for DB, we should probably ensure technicians can INSERT but not DELETE/UPDATE consolidated items.

-- Let's stick to the requested ALTER TABLE commands.
