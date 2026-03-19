-- Función de lectura de pagos MEJORADA y con tipos explícitos
CREATE OR REPLACE FUNCTION public.get_payments_flat(
    p_start bigint DEFAULT NULL,
    p_end bigint DEFAULT NULL,
    p_cashier_id text DEFAULT NULL,
    p_branch text DEFAULT NULL
)
RETURNS TABLE(
    payment_id text, -- ID explícito como texto
    order_id text,
    amount numeric,
    method text,
    cashier_id text,
    cashier_name text,
    is_refund boolean,
    created_at bigint,
    closing_id text,
    branch text,
    order_readable_id bigint,
    order_model text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        op.id::text AS payment_id, -- Casting a texto para evitar problemas
        op.order_id,
        op.amount,
        op.method,
        op.cashier_id,
        op.cashier_name,
        op.is_refund,
        op.created_at,
        op.closing_id,
        COALESCE(o."currentBranch", 'T4') as branch,
        o.readable_id as order_readable_id,
        o."deviceModel" as order_model
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

-- Permisos
GRANT EXECUTE ON FUNCTION public.get_payments_flat(bigint, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payments_flat(bigint, bigint, text, text) TO service_role;
