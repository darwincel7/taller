-- FIX: Storage Permissions for 'receipts' bucket
-- We are making these permissive to ensure uploads work for both authenticated and anonymous users in this dev environment.

-- 1. Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop existing restrictive policies on storage.objects for this bucket
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload Receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public Update Receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete Receipts" ON storage.objects;

-- 3. Create PERMISSIVE policies for the receipts bucket
-- Allow anyone to read
CREATE POLICY "Public Read Receipts"
ON storage.objects FOR SELECT
TO anon, authenticated
USING ( bucket_id = 'receipts' );

-- Allow anyone (anon + authenticated) to upload
CREATE POLICY "Public Upload Receipts"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK ( bucket_id = 'receipts' );

-- Allow anyone to update/delete
CREATE POLICY "Public Update Receipts"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING ( bucket_id = 'receipts' );

CREATE POLICY "Public Delete Receipts"
ON storage.objects FOR DELETE
TO anon, authenticated
USING ( bucket_id = 'receipts' );


-- FIX: Table Permissions for 'floating_expenses'
-- This is critical for the mobile photo upload feature
ALTER TABLE floating_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Floating Expenses" ON floating_expenses;
DROP POLICY IF EXISTS "Public Insert Floating Expenses" ON floating_expenses;
DROP POLICY IF EXISTS "Public Delete Floating Expenses" ON floating_expenses;

CREATE POLICY "Public Access Floating Expenses"
ON floating_expenses FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Public Insert Floating Expenses"
ON floating_expenses FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Public Delete Floating Expenses"
ON floating_expenses FOR DELETE
TO anon, authenticated
USING (true);

GRANT ALL ON floating_expenses TO authenticated;
GRANT ALL ON floating_expenses TO anon;
GRANT ALL ON floating_expenses TO service_role;


-- FIX: Table Permissions for 'accounting_transactions'
-- Ensure the table allows inserts from the application

ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Enable read access for all users" ON accounting_transactions;
DROP POLICY IF EXISTS "Enable insert for all users" ON accounting_transactions;
DROP POLICY IF EXISTS "Enable update for all users" ON accounting_transactions;
DROP POLICY IF EXISTS "Enable delete for all users" ON accounting_transactions;

-- Create permissive policies
CREATE POLICY "Enable read access for all users"
ON accounting_transactions FOR SELECT
USING (true);

CREATE POLICY "Enable insert for all users"
ON accounting_transactions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Enable update for all users"
ON accounting_transactions FOR UPDATE
USING (true);

CREATE POLICY "Enable delete for all users"
ON accounting_transactions FOR DELETE
USING (true);
