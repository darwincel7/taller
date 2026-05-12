-- v_financial_events_v31.sql

DO $$
BEGIN
    DROP VIEW IF EXISTS public.v_financial_events CASCADE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not drop v_financial_events';
END $$;

CREATE OR REPLACE VIEW public.v_financial_events AS

-- 1. VENTAS Y GANANCIAS (Ventas netas) desde v_sales_unified
SELECT 
    'SALE_' || id as event_id,
    created_at as event_date,
    origin as source_table,  -- 'POS' o 'WORKSHOP'
    id as source_id,
    'SALE' as event_type,
    'Venta #' || ticket_number as description,
    gross_amount as amount,
    payment_method as method,
    branch_name as branch,
    seller_name as user_id,
    payment_method IN ('CASH', 'EFECTIVO') as is_cash,
    TRUE as is_revenue,
    FALSE as is_expense,
    FALSE as is_cogs,
    is_credit,
    is_cambiazo,
    jsonb_build_object('ticket', ticket_number, 'cost', cost_amount, 'profit', profit_amount, 'client', client_name) as metadata
FROM public.v_sales_unified

UNION ALL

-- 2. COSTO DE MERCANCÍA VENDIDA (COGS) desde v_sales_unified
SELECT 
    'COGS_' || id as event_id,
    created_at as event_date,
    origin as source_table,
    id as source_id,
    'COGS' as event_type,
    'Costo Venta #' || ticket_number as description,
    -cost_amount as amount,  -- Negativo porque es costo
    'SYSTEM' as method,
    branch_name as branch,
    seller_name as user_id,
    FALSE as is_cash,
    FALSE as is_revenue,
    FALSE as is_expense,
    TRUE as is_cogs,
    FALSE as is_credit,
    is_cambiazo,
    jsonb_build_object('ticket', ticket_number, 'cost', cost_amount) as metadata
FROM public.v_sales_unified
WHERE cost_amount > 0

UNION ALL

-- 3. FLUJO DE CAJA (ENTRADAS Y SALIDAS EXPLICITAS) de cash_movements
-- Omitimos ventas o reembolsos de ventas manejados por SALE, ya que v_sales_unified los cubre.
SELECT 
    'CASH_' || id::text as event_id,
    created_at as event_date,
    'cash_movements' as source_table,
    id::text as source_id,
    CASE WHEN movement_type LIKE '%IN%' THEN 'CASH_IN' ELSE 'CASH_OUT' END as event_type,
    reason as description,
    amount,
    method,
    branch,
    cashier_id as user_id,
    TRUE as is_cash,
    CASE WHEN movement_type LIKE '%IN%' THEN TRUE ELSE FALSE END as is_revenue,
    CASE WHEN movement_type LIKE '%OUT%' THEN TRUE ELSE FALSE END as is_expense,
    FALSE as is_cogs,
    FALSE as is_credit,
    FALSE as is_cambiazo,
    metadata
FROM public.cash_movements
WHERE movement_type NOT IN ('SALE_IN', 'SALE_EXACT_IN', 'SALE_CHANGE_OUT', 'REFUND_OUT', 'CAMBIAZO_IN')

UNION ALL

-- 4. GASTOS CONTABLES CONSOLIDADOS O FLOTANTES NO ASOCIADOS A ORDENES / COMPRAS
SELECT 
    'ACC_' || id::text as event_id,
    COALESCE(created_at, transaction_date::timestamptz) as event_date,
    'accounting_transactions' as source_table,
    id::text as source_id,
    'EXPENSE' as event_type,
    description,
    -amount as amount,
    'UNKNOWN' as method,
    'ALL' as branch,
    'SYSTEM' as user_id,
    FALSE as is_cash,
    FALSE as is_revenue,
    TRUE as is_expense,
    FALSE as is_cogs,
    FALSE as is_credit,
    FALSE as is_cambiazo,
    jsonb_build_object('category_id', category_id, 'vendor', vendor) as metadata
FROM public.accounting_transactions
WHERE type = 'EXPENSE'

UNION ALL

-- 5. INGRESOS CONTABLES EXTERNOS (Ej. inversiones, ajustes manuales)
SELECT 
    'ACC_IN_' || id::text as event_id,
    COALESCE(created_at, transaction_date::timestamptz) as event_date,
    'accounting_transactions' as source_table,
    id::text as source_id,
    'REVENUE' as event_type,
    description,
    amount as amount,
    'UNKNOWN' as method,
    'ALL' as branch,
    'SYSTEM' as user_id,
    FALSE as is_cash,
    TRUE as is_revenue,
    FALSE as is_expense,
    FALSE as is_cogs,
    FALSE as is_credit,
    FALSE as is_cambiazo,
    jsonb_build_object('category_id', category_id, 'vendor', vendor) as metadata
FROM public.accounting_transactions
WHERE type = 'INCOME'

UNION ALL

-- 6. GASTOS FLOTANTES APROBADOS (QUE NO ESTÉN CONSOLIDADOS AÚN EN ACCOUNTING SI APLICA)
-- Asumimos que si existen en flotante y no han sido eliminados/movidos, son gastos reales del dia.
SELECT 
    'FLOAT_' || id::text as event_id,
    created_at as event_date,
    'floating_expenses' as source_table,
    id::text as source_id,
    'EXPENSE' as event_type,
    description,
    -amount as amount,
    'CASH' as method,
    branch_id as branch,
    created_by as user_id,
    TRUE as is_cash,
    FALSE as is_revenue,
    TRUE as is_expense,
    FALSE as is_cogs,
    FALSE as is_credit,
    FALSE as is_cambiazo,
    jsonb_build_object('receipt', receipt_url, 'shared_id', shared_receipt_id) as metadata
FROM public.floating_expenses;

GRANT SELECT ON public.v_financial_events TO anon, authenticated, service_role;
