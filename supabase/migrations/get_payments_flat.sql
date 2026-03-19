-- 1. Crear función RPC para obtener pagos desde la tabla order_payments
CREATE OR REPLACE FUNCTION get_payments_flat(
  p_start bigint DEFAULT NULL,
  p_end bigint DEFAULT NULL,
  p_cashier_id text DEFAULT NULL,
  p_branch text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  order_id text,
  amount numeric,
  method text,
  cashier_id text,
  cashier_name text,
  is_refund boolean,
  created_at bigint,
  closing_id text,
  branch text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    op.id,
    op.order_id,
    op.amount,
    op.method,
    op.cashier_id,
    op.cashier_name,
    op.is_refund,
    op.created_at,
    op.closing_id,
    o."currentBranch"
  FROM
    order_payments op
  LEFT JOIN
    orders o ON op.order_id = o.id
  WHERE
    (p_start IS NULL OR op.created_at >= p_start)
    AND (p_end IS NULL OR op.created_at <= p_end)
    AND (p_cashier_id IS NULL OR op.cashier_id = p_cashier_id)
    AND (p_branch IS NULL OR o."currentBranch" = p_branch)
  ORDER BY
    op.created_at DESC;
END;
$$;

-- 2. Otorgar permisos de ejecución
GRANT EXECUTE ON FUNCTION get_payments_flat(bigint, bigint, text, text) TO authenticated, anon, service_role;

-- 3. Configurar RLS para order_payments
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;

-- Eliminar política anterior si existe para evitar conflictos
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON order_payments;

-- Crear política de lectura abierta para usuarios autenticados
CREATE POLICY "Enable read access for authenticated users" ON order_payments
    FOR SELECT
    TO authenticated
    USING (true);
