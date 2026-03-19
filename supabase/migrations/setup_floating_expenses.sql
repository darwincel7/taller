-- Create floating_expenses table if it doesn't exist
CREATE TABLE IF NOT EXISTS floating_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    receipt_url TEXT,
    shared_receipt_id TEXT,
    created_by TEXT,
    branch_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE floating_expenses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure a clean state
DROP POLICY IF EXISTS "Public Access Floating Expenses" ON floating_expenses;
DROP POLICY IF EXISTS "Public Insert Floating Expenses" ON floating_expenses;
DROP POLICY IF EXISTS "Public Delete Floating Expenses" ON floating_expenses;
DROP POLICY IF EXISTS "Permitir inserción pública para fotos" ON floating_expenses;
DROP POLICY IF EXISTS "Permitir lectura pública para sincronización" ON floating_expenses;

-- Create permissive policies for the QR code feature
-- Allow anyone to read (to see them in the modal/dashboard)
CREATE POLICY "Public Access Floating Expenses"
ON floating_expenses FOR SELECT
TO anon, authenticated
USING (true);

-- Allow anyone to insert (for the mobile upload feature)
CREATE POLICY "Public Insert Floating Expenses"
ON floating_expenses FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Allow anyone to delete (when assigning to an order)
CREATE POLICY "Public Delete Floating Expenses"
ON floating_expenses FOR DELETE
TO anon, authenticated
USING (true);

-- Grant permissions explicitly
GRANT ALL ON floating_expenses TO authenticated;
GRANT ALL ON floating_expenses TO anon;
GRANT ALL ON floating_expenses TO service_role;
