-- SCRIPT DE CORRECCIÓN PARA GASTOS LOCALES Y SUBIDA DE FOTOS
-- Ejecuta este script en el Editor SQL de Supabase

-- 1. Asegurar que el bucket 'receipts' exista y sea público
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Políticas RLS para el bucket 'receipts' (Permitir subir fotos)
DROP POLICY IF EXISTS "Public Read Receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload Receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public Update Receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete Receipts" ON storage.objects;

CREATE POLICY "Public Read Receipts" ON storage.objects FOR SELECT TO public USING (bucket_id = 'receipts');
CREATE POLICY "Public Upload Receipts" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'receipts');
CREATE POLICY "Public Update Receipts" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'receipts');
CREATE POLICY "Public Delete Receipts" ON storage.objects FOR DELETE TO public USING (bucket_id = 'receipts');

-- 3. Asegurar que la tabla accounting_transactions tenga todas las columnas necesarias
ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS shared_receipt_id TEXT;
ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'APPROVED';
ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS expense_destination TEXT DEFAULT 'STORE';
ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false;
ALTER TABLE accounting_transactions ADD COLUMN IF NOT EXISTS search_text TEXT;

-- 4. Actualizar las restricciones de estado y origen para permitir 'PENDING' y 'STORE'
ALTER TABLE accounting_transactions DROP CONSTRAINT IF EXISTS accounting_transactions_status_check;
ALTER TABLE accounting_transactions DROP CONSTRAINT IF EXISTS accounting_transactions_source_check;

ALTER TABLE accounting_transactions 
ADD CONSTRAINT accounting_transactions_status_check 
CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED', 'CONSOLIDATED'));

ALTER TABLE accounting_transactions 
ADD CONSTRAINT accounting_transactions_source_check 
CHECK (source IN ('MANUAL', 'ORDER', 'STORE', 'BANK', 'FLOATING'));

-- 5. Asegurar políticas RLS permisivas para accounting_transactions
ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON accounting_transactions;
DROP POLICY IF EXISTS "Enable insert for all users" ON accounting_transactions;
DROP POLICY IF EXISTS "Enable update for all users" ON accounting_transactions;
DROP POLICY IF EXISTS "Enable delete for all users" ON accounting_transactions;
DROP POLICY IF EXISTS "Allow all access to transactions" ON accounting_transactions;

CREATE POLICY "Allow all access to transactions" ON accounting_transactions FOR ALL TO public USING (true);

-- 6. Asegurar políticas RLS permisivas para floating_expenses (usado en subida móvil)
ALTER TABLE floating_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Floating Expenses" ON floating_expenses;
DROP POLICY IF EXISTS "Public Insert Floating Expenses" ON floating_expenses;
DROP POLICY IF EXISTS "Public Delete Floating Expenses" ON floating_expenses;

CREATE POLICY "Public Access Floating Expenses" ON floating_expenses FOR SELECT TO public USING (true);
CREATE POLICY "Public Insert Floating Expenses" ON floating_expenses FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public Delete Floating Expenses" ON floating_expenses FOR DELETE TO public USING (true);
CREATE POLICY "Public Update Floating Expenses" ON floating_expenses FOR UPDATE TO public USING (true);

-- 7. Otorgar permisos a los roles
GRANT ALL ON accounting_transactions TO authenticated;
GRANT ALL ON accounting_transactions TO anon;
GRANT ALL ON floating_expenses TO authenticated;
GRANT ALL ON floating_expenses TO anon;
