-- Normalización de Estados (Fix Ghost Orders)
-- Convierte cualquier 'DELIVERED' (legacy) a 'Entregado' (standard)

BEGIN;

-- 1. Actualizar estados en la tabla orders
UPDATE orders 
SET status = 'Entregado' 
WHERE status = 'DELIVERED';

-- 2. Actualizar logs históricos (JSONB) para consistencia (Opcional pero recomendado)
-- Esto busca dentro del array history y reemplaza status: "DELIVERED" por "Entregado"
-- Nota: Es una operación más pesada, si hay muchos datos se puede omitir.
UPDATE orders
SET history = (
  SELECT jsonb_agg(
    CASE 
      WHEN elem->>'status' = 'DELIVERED' THEN jsonb_set(elem, '{status}', '"Entregado"')
      ELSE elem 
    END
  )
  FROM jsonb_array_elements(history) elem
)
WHERE history::text LIKE '%"DELIVERED"%';

COMMIT;

-- Verificación
-- SELECT count(*) FROM orders WHERE status = 'DELIVERED'; -- Debería ser 0
