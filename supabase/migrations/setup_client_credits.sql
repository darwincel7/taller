-- MIGRACIÓN PARA CRÉDITOS DE CLIENTES (FIAO)
-- Ejecuta este script en el Editor SQL de Supabase

-- 1. Crear tabla de créditos de clientes
CREATE TABLE IF NOT EXISTS client_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT,
    customer_id TEXT, -- ID del cliente (CUST-XXXXX)
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    cashier_id TEXT NOT NULL,
    cashier_name TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
    notification_sent BOOLEAN DEFAULT false,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ensure paid_at exists if table was already created
ALTER TABLE client_credits ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;

-- 2. Habilitar RLS
ALTER TABLE client_credits ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS (Permitir acceso total por ahora para desarrollo)
DROP POLICY IF EXISTS "Allow all access to credits" ON client_credits;
CREATE POLICY "Allow all access to credits" ON client_credits FOR ALL TO public USING (true);

-- 4. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_client_credits_due_date ON client_credits(due_date);
CREATE INDEX IF NOT EXISTS idx_client_credits_status ON client_credits(status);
CREATE INDEX IF NOT EXISTS idx_client_credits_order_id ON client_credits(order_id);

-- 5. Otorgar permisos
GRANT ALL ON client_credits TO authenticated;
GRANT ALL ON client_credits TO anon;
