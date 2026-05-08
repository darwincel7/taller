-- 1. Agrega la columna is_duplicate a la tabla de transacciones
ALTER TABLE accounting_transactions 
ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false;

-- 2. Elimina el índice único anterior
DROP INDEX IF EXISTS idx_unique_vendor_invoice;

-- 3. Crea un nuevo índice único que ignora las facturas marcadas como duplicadas
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_vendor_invoice 
ON accounting_transactions (LOWER(TRIM(vendor)), LOWER(TRIM(invoice_number))) 
WHERE invoice_number IS NOT NULL AND invoice_number != '' AND is_duplicate = false;
