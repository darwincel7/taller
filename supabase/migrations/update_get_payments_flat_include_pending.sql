-- Update get_payments_flat to include PENDING expenses
-- Expenses that are pending approval still represent money that has left the cash register,
-- so they must be included in the cash register balance to avoid discrepancies.

CREATE OR REPLACE FUNCTION public.get_payments_flat(
    p_start bigint DEFAULT NULL,
    p_end bigint DEFAULT NULL,
    p_cashier_id text DEFAULT NULL,
    p_branch text DEFAULT NULL
)
RETURNS TABLE(
    id text, 
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
    -- A. Pagos de Órdenes
    SELECT
        op.id,
        op.order_id,
        op.amount,
        op.method,
        op.cashier_id,
        COALESCE(u.name, 'Cajero') as cashier_name,
        op.is_refund,
        (extract(epoch from op.created_at) * 1000)::bigint as created_at,
        op.closing_id,
        COALESCE(op.branch, 'T4') as branch,
        o.readable_id::bigint as order_readable_id,
        o.vehicle_model::text as order_model
    FROM
        public.order_payments op
    LEFT JOIN
        public.users u ON op.cashier_id = u.id
    LEFT JOIN
        public.orders o ON op.order_id = o.id
    WHERE
        (p_start IS NULL OR (extract(epoch from op.created_at) * 1000)::bigint >= p_start)
        AND (p_end IS NULL OR (extract(epoch from op.created_at) * 1000)::bigint <= p_end)
        AND (p_cashier_id IS NULL OR op.cashier_id = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(op.branch, 'T4') = p_branch)
        
    UNION ALL
    
    -- B. Transacciones de Contabilidad (Ventas de Tienda, Gastos, Manuales)
    SELECT
        at.id,
        CASE 
            WHEN at.source = 'STORE' AND at.amount > 0 THEN 'PRODUCT_SALE'
            WHEN at.source = 'MANUAL' THEN 'MANUAL_TX'
            ELSE 'GASTO_LOCAL' 
        END as order_id,
        at.amount as amount,
        COALESCE(at.method, 'CASH') as method,
        at.created_by as cashier_id,
        'Cajero' as cashier_name,
        (at.amount < 0) as is_refund,
        (extract(epoch from at.created_at) * 1000)::bigint as created_at,
        at.closing_id,
        COALESCE(at.branch, 'T4') as branch,
        at.readable_id::bigint as order_readable_id,
        CASE 
            WHEN at.source = 'STORE' AND at.amount > 0 THEN 'Venta Directa'
            WHEN at.source = 'MANUAL' THEN 'Transacción Manual'
            ELSE 'Gasto Local' 
        END::text as order_model
    FROM
        public.accounting_transactions at
    WHERE
        at.source IN ('STORE', 'ORDER', 'FLOATING', 'MANUAL')
        AND at.status IN ('COMPLETED', 'PENDING') -- INCLUDE PENDING EXPENSES!
        AND (p_start IS NULL OR (extract(epoch from at.created_at) * 1000)::bigint >= p_start)
        AND (p_end IS NULL OR (extract(epoch from at.created_at) * 1000)::bigint <= p_end)
        AND (p_cashier_id IS NULL OR at.created_by = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(at.branch, 'T4') = p_branch)
        
    UNION ALL
    
    -- C. Gastos Flotantes (Negativos)
    SELECT
        fe.id::text as id,
        'GASTO_FLOTANTE' as order_id,
        -ABS(fe.amount) as amount,
        'CASH' as method,
        fe.created_by as cashier_id,
        'Gasto Flotante' as cashier_name,
        true as is_refund,
        (extract(epoch from fe.created_at) * 1000)::bigint as created_at,
        fe.closing_id,
        COALESCE(fe.branch_id, 'T4') as branch,
        fe.readable_id::bigint as order_readable_id,
        'Gasto Flotante'::text as order_model
    FROM
        public.floating_expenses fe
    WHERE
        fe.description != 'RECEIPT_UPLOAD_TRIGGER'
        AND (p_start IS NULL OR (extract(epoch from fe.created_at) * 1000)::bigint >= p_start)
        AND (p_end IS NULL OR (extract(epoch from fe.created_at) * 1000)::bigint <= p_end)
        AND (p_cashier_id IS NULL OR fe.created_by = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(fe.branch_id, 'T4') = p_branch)
        
    ORDER BY
        created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payments_flat(bigint, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payments_flat(bigint, bigint, text, text) TO service_role;
