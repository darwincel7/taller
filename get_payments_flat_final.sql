-- 1. Limpiar versiones anteriores de la función para evitar conflictos de firma
DROP FUNCTION IF EXISTS public.get_payments_flat(bigint, bigint);
DROP FUNCTION IF EXISTS public.get_payments_flat(bigint, bigint, text, text);

-- 2. Crear la función RPC definitiva
CREATE OR REPLACE FUNCTION public.get_payments_flat(
    p_start bigint DEFAULT NULL,
    p_end bigint DEFAULT NULL,
    p_cashier_id text DEFAULT NULL,
    p_branch text DEFAULT NULL
)
RETURNS TABLE(
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
SECURITY DEFINER -- Ejecutar con permisos de definidor para evitar problemas de acceso
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
        COALESCE(o."currentBranch", 'T4') as branch
    FROM
        public.order_payments op
    LEFT JOIN
        public.orders o ON op.order_id = o.id
    WHERE
        (p_start IS NULL OR op.created_at >= p_start)
        AND (p_end IS NULL OR op.created_at <= p_end)
        AND (p_cashier_id IS NULL OR op.cashier_id = p_cashier_id)
        AND (p_branch IS NULL OR o."currentBranch" = p_branch)
    ORDER BY
        op.created_at DESC;
END;
$$;

-- 3. Asignar permisos de ejecución
GRANT EXECUTE ON FUNCTION public.get_payments_flat(bigint, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payments_flat(bigint, bigint, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_payments_flat(bigint, bigint, text, text) TO service_role;

-- 4. Configurar RLS en la tabla order_payments (Seguridad)
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

-- Eliminar política previa si existe y crear la nueva
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.order_payments;

CREATE POLICY "Enable read access for authenticated users" 
ON public.order_payments
FOR SELECT
TO authenticated
USING (true);
