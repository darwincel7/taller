-- Update get_payments_flat to include FLOATING source
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
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- A. Pagos de Órdenes (Positivos) y Reembolsos (Negativos)
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
        AND (p_branch IS NULL OR COALESCE(o."currentBranch", 'T4') = p_branch)
        
    UNION ALL
    
    -- B. Gastos Locales y de Ordenes (Negativos)
    SELECT
        at.id,
        'GASTO_LOCAL' as order_id,
        -ABS(at.amount) as amount, -- Asegurar que sea negativo
        'CASH' as method,
        at.created_by as cashier_id,
        'Gasto Local' as cashier_name,
        true as is_refund, -- Marcar como reembolso para que reste
        extract(epoch from at.created_at) * 1000 as created_at,
        at.closing_id,
        'T4' as branch -- Asumimos T4 o se podría añadir branch a accounting_transactions
    FROM
        public.accounting_transactions at
    WHERE
        at.source IN ('STORE', 'ORDER', 'FLOATING')
        AND at.status = 'COMPLETED' -- Solo gastos aprobados/completados
        AND (p_start IS NULL OR extract(epoch from at.created_at) * 1000 >= p_start)
        AND (p_end IS NULL OR extract(epoch from at.created_at) * 1000 <= p_end)
        AND (p_cashier_id IS NULL OR at.created_by = p_cashier_id)
        AND (p_branch IS NULL OR 'T4' = p_branch)
        
    UNION ALL
    
    -- C. Gastos Flotantes (Negativos)
    SELECT
        fe.id,
        'GASTO_FLOTANTE' as order_id,
        -ABS(fe.amount) as amount, -- Asegurar que sea negativo
        'CASH' as method,
        fe.created_by as cashier_id,
        'Gasto Flotante' as cashier_name,
        true as is_refund, -- Marcar como reembolso para que reste
        extract(epoch from fe.created_at) * 1000 as created_at,
        fe.closing_id,
        COALESCE(fe.branch_id, 'T4') as branch
    FROM
        public.floating_expenses fe
    WHERE
        fe.description != 'RECEIPT_UPLOAD_TRIGGER'
        AND (p_start IS NULL OR extract(epoch from fe.created_at) * 1000 >= p_start)
        AND (p_end IS NULL OR extract(epoch from fe.created_at) * 1000 <= p_end)
        AND (p_cashier_id IS NULL OR fe.created_by = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(fe.branch_id, 'T4') = p_branch)
        
    ORDER BY
        created_at DESC;
END;
$$;
