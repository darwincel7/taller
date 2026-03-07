-- 1. Crear Bucket para recibos
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas RLS para el bucket 'receipts'
-- Permitir lectura pública para usuarios autenticados
CREATE POLICY "Public Select Receipts" ON storage.objects
FOR SELECT USING (bucket_id = 'receipts');

-- Permitir inserción para usuarios autenticados
CREATE POLICY "Public Insert Receipts" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'receipts');

-- 3. Asegurar que la tabla tenga las columnas necesarias
ALTER TABLE accounting_transactions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED', 'CONSOLIDATED')),
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'ORDER', 'STORE'));
