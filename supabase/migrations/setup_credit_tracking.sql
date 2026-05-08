-- MIGRACIÓN PARA SEGUIMIENTO DE CRÉDITOS (PAGOS Y CONTACTOS)
-- Ejecuta este script en el Editor SQL de Supabase

-- 1. Crear tabla de pagos de créditos
CREATE TABLE IF NOT EXISTS credit_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_id UUID NOT NULL REFERENCES client_credits(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    payment_method TEXT NOT NULL,
    cashier_id TEXT NOT NULL,
    cashier_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Crear tabla de contactos de créditos
CREATE TABLE IF NOT EXISTS credit_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_id UUID NOT NULL REFERENCES client_credits(id) ON DELETE CASCADE,
    contact_method TEXT NOT NULL DEFAULT 'WHATSAPP',
    notes TEXT,
    cashier_id TEXT NOT NULL,
    cashier_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Habilitar RLS
ALTER TABLE credit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_contacts ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS (Permitir acceso total por ahora para desarrollo)
DROP POLICY IF EXISTS "Allow all access to credit_payments" ON credit_payments;
CREATE POLICY "Allow all access to credit_payments" ON credit_payments FOR ALL TO public USING (true);

DROP POLICY IF EXISTS "Allow all access to credit_contacts" ON credit_contacts;
CREATE POLICY "Allow all access to credit_contacts" ON credit_contacts FOR ALL TO public USING (true);

-- 5. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_credit_payments_credit_id ON credit_payments(credit_id);
CREATE INDEX IF NOT EXISTS idx_credit_contacts_credit_id ON credit_contacts(credit_id);

-- 6. Otorgar permisos
GRANT ALL ON credit_payments TO authenticated;
GRANT ALL ON credit_payments TO anon;
GRANT ALL ON credit_contacts TO authenticated;
GRANT ALL ON credit_contacts TO anon;
