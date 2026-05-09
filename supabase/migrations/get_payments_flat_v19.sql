-- ==============================================================================
-- RPC UNIFICADA DE PAGOS Y MOVIMIENTOS (V19)
-- Fuente de verdad para Caja y Arqueos
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_payments_flat(
    p_start bigint DEFAULT NULL,
    p_end bigint DEFAULT NULL,
    p_cashier_id text DEFAULT NULL,
    p_branch text DEFAULT NULL,
    p_pending_only boolean DEFAULT false,
    p_closing_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id text,
    order_id text,
    amount numeric,
    method text,
    cashier_id text,
    cashier_name text,
    is_refund boolean,
    created_at bigint,
    closing_id uuid,
    branch text,
    order_readable_id bigint,
    order_model text,
    source_type text
) AS $$
BEGIN
    RETURN QUERY
    -- 1. Pagos de Órdenes de Taller
    SELECT 
        op.id::text,
        op.order_id::text,
        op.amount,
        op.method,
        op.cashier_id,
        COALESCE(op.cashier_name, 'Cajero'),
        op.is_refund,
        op.created_at,
        op.closing_id,
        COALESCE(o."currentBranch", 'T4'),
        o.readable_id,
        COALESCE(o."deviceModel", 'Orden de Taller'),
        'WORKSHOP' as source_type
    FROM 
        public.order_payments op
    JOIN 
        public.orders o ON op.order_id = o.id
    WHERE 
        (p_start IS NULL OR op.created_at >= p_start) AND
        (p_end IS NULL OR op.created_at <= p_end) AND
        (p_cashier_id IS NULL OR op.cashier_id = p_cashier_id) AND
        (p_branch IS NULL OR o."currentBranch" = p_branch) AND
        (NOT p_pending_only OR op.closing_id IS NULL) AND
        (p_closing_id IS NULL OR op.closing_id = p_closing_id)

    UNION ALL

    -- 2. Movimientos de Caja Directos (POS, Gastos, Manuales)
    -- Excluimos los de tipo 'ORDER' porque ya vienen en el bloque anterior
    SELECT 
        cm.id::text,
        COALESCE(cm.source_id, 'CASH_TX'),
        cm.amount,
        cm.method,
        cm.cashier_id,
        COALESCE(u.name, 'Sistema'),
        (cm.amount < 0 AND cm.movement_type != 'CAMBIAZO_IN'),
        (extract(epoch from cm.created_at) * 1000)::bigint,
        cm.closing_id,
        cm.branch,
        0 as order_readable_id,
        COALESCE(cm.reason, 'Movimiento de Caja'),
        cm.source_type
    FROM 
        public.cash_movements cm
    LEFT JOIN 
        public.users u ON cm.cashier_id = u.id::text
    WHERE 
        (cm.source_type IS NULL OR cm.source_type != 'ORDER') AND
        (p_start IS NULL OR (extract(epoch from cm.created_at) * 1000) >= p_start) AND
        (p_end IS NULL OR (extract(epoch from cm.created_at) * 1000) <= p_end) AND
        (p_cashier_id IS NULL OR cm.cashier_id = p_cashier_id) AND
        (p_branch IS NULL OR cm.branch = p_branch) AND
        (NOT p_pending_only OR cm.closing_id IS NULL) AND
        (p_closing_id IS NULL OR cm.closing_id = p_closing_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
