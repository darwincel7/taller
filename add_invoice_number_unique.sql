-- 1. Agrega la columna invoice_number a la tabla de transacciones
ALTER TABLE accounting_transactions 
ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- 2. Crea un índice único para evitar facturas duplicadas del mismo proveedor
-- Usamos LOWER y TRIM para evitar que diferencias de mayúsculas/minúsculas o espacios
-- permitan guardar un duplicado (ej. "Home Depot" vs "HOME DEPOT ")
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_vendor_invoice 
ON accounting_transactions (LOWER(TRIM(vendor)), LOWER(TRIM(invoice_number))) 
WHERE invoice_number IS NOT NULL AND invoice_number != '';
