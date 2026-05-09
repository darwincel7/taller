CREATE OR REPLACE VIEW public.v_sales_unified AS
-- A. Ventas desde el POS Rápido
SELECT 
    ps.id::text as source_id,
    ps.id::text as source_item_id,
    'POS' as source_type,
    NULL as order_id,
    ps.id::text as navigation_id,
    ps.created_at,
    COALESCE(ps.branch_id, 'T4') as branch,
    ps.seller_id::text as user_id,
    COALESCE(c.full_name, 'Venta al Publico') as customer_name,
    'Venta POS' as description,
    ps.total as gross_amount,
    COALESCE((SELECT sum(total_cost) FROM public.pos_sale_items WHERE sale_id = ps.id), 0) as cost_amount,
    ps.total - COALESCE((SELECT sum(total_cost) FROM public.pos_sale_items WHERE sale_id = ps.id), 0) as net_profit,
    COALESCE((SELECT cm.method FROM public.cash_movements cm WHERE cm.source_id = ps.id::text AND cm.method != 'OUT' LIMIT 1), 'CASH') as payment_method,
    COALESCE((SELECT sum(amount) FROM public.cash_movements cm WHERE cm.source_id = ps.id::text AND cm.method NOT IN ('CREDIT', 'EXCHANGE', 'CAMBIAZO')), 0) as cash_effect_amount,
    COALESCE(ps.total < 0 OR ps.status = 'refunded', false) as is_refund,
    EXISTS(SELECT 1 FROM public.cash_movements WHERE source_id = ps.id::text AND method = 'CREDIT') as is_credit,
    EXISTS(SELECT 1 FROM public.cash_movements WHERE source_id = ps.id::text AND method IN ('EXCHANGE', 'CAMBIAZO')) as is_cambiazo,
    ps.status
FROM 
    public.pos_sales ps
LEFT JOIN
    public.crm_contacts c ON ps.customer_id = c.id
WHERE 
    ps.status = 'completed'

UNION ALL

-- B. Pagos de Órdenes de Taller (Workshop Revenue y Refunds)
SELECT 
    op.id::text as source_id,
    op.id::text as source_item_id,
    CASE WHEN op.is_refund THEN 'WORKSHOP_REFUND' ELSE 'WORKSHOP' END as source_type,
    o.id::text as order_id,
    o.id::text as navigation_id,
    to_timestamp(op.created_at / 1000.0) as created_at,
    COALESCE(o."currentBranch", 'T4') as branch,
    op.cashier_id as user_id,
    COALESCE(o.customer->>'name', 'Cliente Taller') as customer_name,
    (CASE WHEN op.is_refund THEN 'Reembolso: ' ELSE 'Pago Taller: ' END) || COALESCE(o."deviceModel", 'Equipo') as description,
    op.amount as gross_amount,
    
    CASE WHEN op.is_refund THEN 0 
    ELSE
    ROUND(
        (
            COALESCE(o."partsCost", 0) 
            + 
            COALESCE((
                SELECT sum((e->>'amount')::numeric) 
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.expenses) = 'array' THEN o.expenses ELSE '[]'::jsonb END) e 
                WHERE e->>'amount' IS NOT NULL
            ), 0)
            + 
            COALESCE((SELECT SUM(ABS(amount)) FROM public.accounting_transactions WHERE order_id = o.id), 0)
        ) 
        * 
        (
            abs(op.amount) 
            / NULLIF(
                COALESCE(
                    NULLIF(o."totalAmount", 0), 
                    NULLIF(o."finalPrice", 0), 
                    NULLIF(o."estimatedCost", 0), 
                    (SELECT sum(amount) FROM public.order_payments WHERE order_id = o.id AND NOT is_refund) 
                ), 0
            )
        )
    , 2)
    END as cost_amount,

    op.amount - 
    (CASE WHEN op.is_refund THEN 0 
    ELSE
    ROUND(
        (
            COALESCE(o."partsCost", 0) 
            + 
            COALESCE((
                SELECT sum((e->>'amount')::numeric) 
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.expenses) = 'array' THEN o.expenses ELSE '[]'::jsonb END) e 
                WHERE e->>'amount' IS NOT NULL
            ), 0)
            + 
            COALESCE((SELECT SUM(ABS(amount)) FROM public.accounting_transactions WHERE order_id = o.id), 0)
        ) 
        * 
        (
            abs(op.amount) 
            / NULLIF(
                COALESCE(
                    NULLIF(o."totalAmount", 0), 
                    NULLIF(o."finalPrice", 0), 
                    NULLIF(o."estimatedCost", 0), 
                    (SELECT sum(amount) FROM public.order_payments WHERE order_id = o.id AND NOT is_refund)
                ), 0
            )
        )
    , 2)
    END) as net_profit,

    op.method as payment_method,
    
    CASE 
        WHEN op.method = 'CREDIT' THEN 0
        WHEN op.method IN ('EXCHANGE', 'CAMBIAZO') THEN 0
        WHEN op.is_refund THEN -abs(op.amount)
        ELSE op.amount
    END as cash_effect_amount,
    
    op.is_refund,
    op.method = 'CREDIT' as is_credit,
    op.method IN ('EXCHANGE', 'CAMBIAZO') as is_cambiazo,
    'completed' as status
FROM 
    public.order_payments op
JOIN 
    public.orders o ON op.order_id = o.id;

GRANT SELECT ON public.v_sales_unified TO authenticated;
GRANT SELECT ON public.v_sales_unified TO service_role;
