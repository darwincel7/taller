-- SCRIPT DE CORRECCIÓN DE BASE DE DATOS PARA CONTABILIDAD
-- Ejecuta este script en el Editor SQL de Supabase para solucionar errores de columnas y restricciones.

-- 1. Agregar columna de búsqueda inteligente (Smart Search)
ALTER TABLE accounting_transactions 
ADD COLUMN IF NOT EXISTS search_text TEXT;

-- 2. Asegurar que las columnas de estado y origen existan y tengan las restricciones correctas
-- Primero eliminamos las restricciones antiguas si existen para evitar conflictos
ALTER TABLE accounting_transactions DROP CONSTRAINT IF EXISTS accounting_transactions_status_check;
ALTER TABLE accounting_transactions DROP CONSTRAINT IF EXISTS accounting_transactions_source_check;

-- Actualizamos los nombres de columnas si es necesario (unificando con el código)
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounting_transactions' AND column_name = 'source_department') THEN
        ALTER TABLE accounting_transactions RENAME COLUMN source_department TO source;
    END IF;
END $$;

-- Aplicamos las nuevas restricciones que cubren todos los casos del código
ALTER TABLE accounting_transactions 
ADD CONSTRAINT accounting_transactions_status_check 
CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED', 'CONSOLIDATED'));

ALTER TABLE accounting_transactions 
ADD CONSTRAINT accounting_transactions_source_check 
CHECK (source IN ('MANUAL', 'ORDER', 'STORE'));

-- 3. Crear índices para mejorar la velocidad de búsqueda
CREATE INDEX IF NOT EXISTS idx_accounting_search_text ON accounting_transactions USING gin(search_text tsvector_ops) WHERE search_text IS NOT NULL;
-- Nota: Si el GIN falla por configuración, un índice normal de texto ayuda:
CREATE INDEX IF NOT EXISTS idx_accounting_search_text_simple ON accounting_transactions(search_text);

-- 4. Asegurar que existan las categorías básicas si la tabla se limpió
INSERT INTO accounting_categories (name, type)
VALUES 
('Sueldos', 'EXPENSE'),
('Compras', 'EXPENSE'),
('Gastos Fijos', 'EXPENSE'),
('Gastos Variables', 'EXPENSE')
ON CONFLICT DO NOTHING;
