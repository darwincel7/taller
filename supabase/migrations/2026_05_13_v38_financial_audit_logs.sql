-- Fix for v_sales_unified missing expenses on workshop

CREATE OR REPLACE VIEW public.v_sales_unified AS
-- A. Ventas desde el POS Rápido
SELECT 
    ps.id::text as source_id,
    'POS' as source_type,
    ps.created_at,
    COALESCE(ps.branch_id, 'T4') as branch,
    ps.seller_id::text as user_id,
    ps.total as gross_amount,
    COALESCE((SELECT sum(total_cost) FROM public.pos_sale_items WHERE sale_id = ps.id), 0) as cost_amount,
    ps.total - COALESCE((SELECT sum(total_cost) FROM public.pos_sale_items WHERE sale_id = ps.id), 0) as net_profit,
    'Venta POS' as description,
    ps.status,
    ps.metadata->>'received_via' as special_type,
    false as is_refund,
    NULL as order_id
FROM 
    public.pos_sales ps
WHERE 
    ps.status = 'completed'

UNION ALL

-- B. Pagos de Órdenes de Taller (Workshop Revenue)
SELECT 
    op.id::text as source_id,
    'WORKSHOP' as source_type,
    to_timestamp(op.created_at / 1000.0) as created_at,
    COALESCE(o."currentBranch", 'T4') as branch,
    op.cashier_id as user_id,
    op.amount as gross_amount,
    -- Estimar costo proporcional del ticket (incluye gastos externos del array + partsCost)
    CASE 
        WHEN COALESCE(o."finalPrice", 0) > 0 THEN 
            (op.amount / o."finalPrice") * (
                COALESCE(o."partsCost", 0) + 
                COALESCE(
                  (SELECT sum((e->>'amount')::numeric) 
                   FROM jsonb_array_elements(
                     CASE 
                       WHEN jsonb_typeof(o.expenses) = 'array' THEN o.expenses 
                       ELSE '[]'::jsonb 
                     END
                   ) AS e)
                , 0)
            )
        ELSE 0
    END as cost_amount,
    op.amount - (CASE WHEN COALESCE(o."finalPrice", 0) > 0 THEN 
        (op.amount / o."finalPrice") * (
            COALESCE(o."partsCost", 0) + 
            COALESCE(
              (SELECT sum((e->>'amount')::numeric) 
               FROM jsonb_array_elements(
                 CASE 
                   WHEN jsonb_typeof(o.expenses) = 'array' THEN o.expenses 
                   ELSE '[]'::jsonb 
                 END
               ) AS e)
            , 0)
        )
    ELSE 0 END) as net_profit,
    'Pago Taller: ' || COALESCE(o."deviceModel", 'Equipo') || ' (#' || o.readable_id || ')' as description,
    'completed' as status,
    NULL as special_type,
    false as is_refund,
    o.id as order_id
FROM 
    public.order_payments op
JOIN 
    public.orders o ON op.order_id = o.id
WHERE 
    NOT op.is_refund

UNION ALL

-- C. Reembolsos (Refunds)
SELECT 
    op.id::text as source_id,
    'WORKSHOP_REFUND' as source_type,
    to_timestamp(op.created_at / 1000.0) as created_at,
    COALESCE(o."currentBranch", 'T4') as branch,
    op.cashier_id as user_id,
    -abs(op.amount) as gross_amount, -- Es negativo para ventas
    CASE 
        WHEN COALESCE(o."finalPrice", 0) > 0 THEN 
            -(op.amount / o."finalPrice") * (
                COALESCE(o."partsCost", 0) + 
                COALESCE(
                  (SELECT sum((e->>'amount')::numeric) 
                   FROM jsonb_array_elements(
                     CASE 
                       WHEN jsonb_typeof(o.expenses) = 'array' THEN o.expenses 
                       ELSE '[]'::jsonb 
                     END
                   ) AS e)
                , 0)
            )
        ELSE 0
    END as cost_amount,
    -abs(op.amount) - (CASE WHEN COALESCE(o."finalPrice", 0) > 0 THEN 
        -(op.amount / o."finalPrice") * (
            COALESCE(o."partsCost", 0) + 
            COALESCE(
              (SELECT sum((e->>'amount')::numeric) 
               FROM jsonb_array_elements(
                 CASE 
                   WHEN jsonb_typeof(o.expenses) = 'array' THEN o.expenses 
                   ELSE '[]'::jsonb 
                 END
               ) AS e)
            , 0)
        )
    ELSE 0 END) as net_profit,
    'Reembolso Taller: ' || COALESCE(o."deviceModel", 'Equipo') || ' (#' || o.readable_id || ')' as description,
    'completed' as status,
    NULL as special_type,
    true as is_refund,
    o.id as order_id
FROM 
    public.order_payments op
JOIN 
    public.orders o ON op.order_id = o.id
WHERE 
    op.is_refund;

GRANT SELECT ON public.v_sales_unified TO authenticated;
GRANT SELECT ON public.v_sales_unified TO service_role;
