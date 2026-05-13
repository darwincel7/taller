-- supabase/migrations/2026_05_13_v35_security_finance_cleanup.sql
BEGIN;

DROP VIEW IF EXISTS public.v_financial_events CASCADE;
DROP FUNCTION IF EXISTS public.get_financial_dashboard_v31(timestamptz, timestamptz);

CREATE OR REPLACE VIEW public.v_financial_events AS
-- A. Ventas desde v_sales_unified (Ingresos y Costos)
SELECT 
    source_item_id as event_id,
    created_at as event_date,
    'v_sales_unified' as source_table,
    source_id,
    CASE WHEN is_refund THEN 'REFUND' ELSE 'SALE' END as event_type,
    description,
    gross_amount as amount,
    payment_method as method,
    branch,
    user_id,
    false as is_cash,
    true as is_revenue,
    false as is_expense,
    false as is_cogs,
    is_credit,
    is_cambiazo,
    jsonb_build_object('cost_amount', cost_amount, 'net_profit', net_profit, 'cash_effect_amount', cash_effect_amount) as metadata
FROM v_sales_unified
WHERE status IN ('completed', 'refunded')

UNION ALL

-- COSTOS DIRECTOS DE VENTA
SELECT 
    source_item_id || '_COGS' as event_id,
    created_at as event_date,
    'v_sales_unified' as source_table,
    source_id,
    'COGS' as event_type,
    'Costo Directo Venta/Taller' as description,
    cost_amount as amount,
    'NONE' as method,
    branch,
    user_id,
    false as is_cash,
    false as is_revenue,
    false as is_expense,
    true as is_cogs,
    false as is_credit,
    false as is_cambiazo,
    '{}'::jsonb as metadata
FROM v_sales_unified
WHERE status IN ('completed', 'refunded') AND cost_amount > 0

UNION ALL

-- B. Movimientos de Efectivo
SELECT 
    id::text as event_id,
    created_at as event_date,
    'cash_movements' as source_table,
    source_id,
    movement_type as event_type,
    reason as description,
    amount,
    method,
    branch,
    cashier_id as user_id,
    method NOT IN ('CREDIT', 'EXCHANGE', 'CAMBIAZO') as is_cash, -- only real money
    false as is_revenue,
    false as is_expense,
    false as is_cogs,
    method = 'CREDIT' as is_credit,
    method IN ('EXCHANGE', 'CAMBIAZO') as is_cambiazo,
    metadata
FROM cash_movements

UNION ALL

-- C. Gastos Operativos Contables
SELECT 
    id::text as event_id,
    transaction_date::timestamptz as event_date,
    'accounting_transactions' as source_table,
    order_id as source_id,
    'EXPENSE' as event_type,
    description,
    abs(amount) as amount,
    'CASH' as method,
    NULL as branch,
    created_by as user_id,
    false as is_cash,
    false as is_revenue,
    true as is_expense,
    (order_id IS NOT NULL) as is_cogs,
    false as is_credit,
    false as is_cambiazo,
    jsonb_build_object('category_id', category_id, 'is_direct_cost', (order_id IS NOT NULL)) as metadata
FROM accounting_transactions
WHERE status = 'COMPLETED'

UNION ALL

-- D. Floating Expenses Aprobados
SELECT 
    id::text as event_id,
    created_at::timestamptz as event_date,
    'floating_expenses' as source_table,
    id::text as source_id,
    'EXPENSE' as event_type,
    description,
    abs(amount) as amount,
    'CASH' as method,
    branch_id as branch,
    created_by as user_id,
    false as is_cash, 
    false as is_revenue,
    true as is_expense,
    false as is_cogs,
    false as is_credit,
    false as is_cambiazo,
    jsonb_build_object('approval_status', approval_status) as metadata
FROM floating_expenses
WHERE approval_status = 'APPROVED'

UNION ALL

-- E. Creditos y Cuentas por Cobrar
SELECT 
    id::text as event_id,
    created_at as event_date,
    'client_credits' as source_table,
    source_id,
    'CREDIT_OPEN' as event_type,
    notes as description,
    amount,
    'CREDIT' as method,
    branch_id as branch,
    contact_id::text as user_id,
    false as is_cash,
    false as is_revenue,
    false as is_expense,
    false as is_cogs,
    true as is_credit,
    false as is_cambiazo,
    jsonb_build_object('status', status, 'client_name', client_name) as metadata
FROM client_credits;


-- 2. CREATE get_financial_dashboard_v31
CREATE OR REPLACE FUNCTION public.get_financial_dashboard_v31(p_start_date timestamptz, p_end_date timestamptz)
RETURNS jsonb AS $$
DECLARE
    v_ventas_netas numeric;
    v_costo_venta_total numeric;
    v_gastos_operativos numeric;
    v_flujo_efectivo numeric;
    v_compras_inventario numeric;
    v_creds_por_cobrar numeric;
    v_valor_cambiazos numeric;
    
    v_events jsonb;
    v_expense_dist jsonb;
BEGIN

    -- 1. Ventas Netas (Ingresos reales)
    SELECT COALESCE(SUM(
        CASE WHEN event_type = 'REFUND' THEN -amount ELSE amount END
    ), 0)
    INTO v_ventas_netas
    FROM v_financial_events
    WHERE source_table = 'v_sales_unified' AND event_type IN ('SALE', 'REFUND')
    AND event_date >= p_start_date AND event_date <= p_end_date;

    -- 2. Costo de Venta
    SELECT COALESCE(SUM(amount), 0)
    INTO v_costo_venta_total
    FROM v_financial_events
    WHERE event_type = 'COGS' AND source_table = 'v_sales_unified'
    AND event_date >= p_start_date AND event_date <= p_end_date;

    -- 3. Gastos Operativos Generales
    SELECT COALESCE(SUM(amount), 0)
    INTO v_gastos_operativos
    FROM v_financial_events
    WHERE event_type = 'EXPENSE' AND NOT is_cogs
    AND event_date >= p_start_date AND event_date <= p_end_date;

    -- 4. Flujo de Efectivo
    SELECT COALESCE(SUM(
        CASE WHEN event_type LIKE '%_IN' OR event_type = 'INITIAL_CASH' THEN amount
             WHEN event_type LIKE '%_OUT' OR event_type = 'REFUND' OR event_type = 'EXPENSE_OUT' THEN -amount
             ELSE 0 END
    ), 0)
    INTO v_flujo_efectivo
    FROM v_financial_events
    WHERE source_table = 'cash_movements' AND is_cash = true
    AND event_date >= p_start_date AND event_date <= p_end_date;

    -- 5. Cuentas por Cobrar (Pendientes)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_creds_por_cobrar
    FROM v_financial_events
    WHERE source_table = 'client_credits' AND is_credit = true 
    AND (metadata->>'status' = 'PENDING' OR metadata->>'status' = 'pending')
    AND event_date >= p_start_date AND event_date <= p_end_date;

    -- 6. Compras inventario / Cambiazos
    SELECT COALESCE(SUM(amount), 0)
    INTO v_valor_cambiazos
    FROM v_financial_events
    WHERE source_table = 'cash_movements' AND event_type IN ('CAMBIAZO_IN', 'EXCHANGE_IN', 'CAMBIAZO')
    AND event_date >= p_start_date AND event_date <= p_end_date;
    
    v_compras_inventario := v_valor_cambiazos;

    -- 7. Extraer detalle
    SELECT jsonb_agg(row_to_json(e))
    INTO v_events
    FROM (
        SELECT * FROM v_financial_events
        WHERE event_date >= p_start_date AND event_date <= p_end_date
        ORDER BY event_date DESC
    ) e;

    -- 8. Distribución de Gastos
    SELECT jsonb_agg(jsonb_build_object('category_name', category_name, 'total_amount', total_amt))
    INTO v_expense_dist
    FROM (
        SELECT COALESCE(c.name, 'Gasto Flotante') as category_name, SUM(ABS(a.amount)) as total_amt
        FROM v_financial_events a
        LEFT JOIN accounting_categories c ON c.id::text = a.metadata->>'category_id'
        WHERE a.event_type = 'EXPENSE' AND NOT a.is_cogs
        AND a.event_date >= p_start_date AND a.event_date <= p_end_date
        GROUP BY c.name
        ORDER BY total_amt DESC
    ) dist;

    RETURN jsonb_build_object(
        'kpis', jsonb_build_object(
            'ventasNetas', v_ventas_netas,
            'costoVenta', v_costo_venta_total,
            'gastosOperativos', v_gastos_operativos,
            'egresosTotales', (v_gastos_operativos + COALESCE((SELECT abs(SUM(amount)) FROM cash_movements WHERE method='OUT' AND created_at >= p_start_date AND created_at <= p_end_date), 0)),
            'utilidadBruta', (v_ventas_netas - v_costo_venta_total),
            'utilidadOperativa', (v_ventas_netas - v_costo_venta_total - v_gastos_operativos),
            'flujoEfectivo', v_flujo_efectivo,
            'cuentasPorCobrar', v_creds_por_cobrar,
            'valorCambiazo', v_valor_cambiazos,
            'comprasInventario', v_compras_inventario
        ),
        'expenses_distribution', COALESCE(v_expense_dist, '[]'::jsonb),
        'events', COALESCE(v_events, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. FIX RECONCILIATION REPORT (Add 'refunded' and CAMBIAZO methods correctly)
DROP FUNCTION IF EXISTS public.financial_reconciliation_report(timestamptz, timestamptz, text);

CREATE OR REPLACE FUNCTION public.financial_reconciliation_report(
    p_start_date timestamptz, 
    p_end_date timestamptz,
    p_branch text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_total_sales numeric := 0;
    v_total_cash_in numeric := 0;
    v_total_cash_out numeric := 0;
    v_total_credits_opened numeric := 0;
    v_total_credits_paid numeric := 0;
    v_total_expenses numeric := 0;
    v_total_cambiazos numeric := 0;
    v_diferencia numeric := 0;
    v_status text := 'OK';
    v_unmatched_events jsonb := '[]'::jsonb;
BEGIN
    SELECT COALESCE(SUM(CASE WHEN is_refund THEN -gross_amount ELSE gross_amount END), 0)
    INTO v_total_sales
    FROM v_sales_unified
    WHERE created_at >= p_start_date AND created_at <= p_end_date
    AND (p_branch IS NULL OR branch = p_branch)
    AND status IN ('completed', 'refunded');

    SELECT 
        COALESCE(SUM(CASE WHEN method != 'OUT' AND movement_type NOT LIKE '%_OUT' AND movement_type != 'CASH_OUT' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN method = 'OUT' OR movement_type LIKE '%_OUT' OR movement_type = 'CASH_OUT' THEN amount ELSE 0 END), 0)
    INTO v_total_cash_in, v_total_cash_out
    FROM cash_movements
    WHERE created_at >= p_start_date AND created_at <= p_end_date
    AND (p_branch IS NULL OR branch = p_branch)
    AND method NOT IN ('CREDIT', 'EXCHANGE', 'CAMBIAZO');

    SELECT COALESCE(SUM(amount), 0) INTO v_total_credits_opened
    FROM client_credits
    WHERE created_at >= p_start_date AND created_at <= p_end_date
    AND (p_branch IS NULL OR branch_id = p_branch)
    AND (status = 'pending' OR status = 'PENDING');

    SELECT COALESCE(SUM(amount), 0) INTO v_total_credits_paid
    FROM cash_movements
    WHERE created_at >= p_start_date AND created_at <= p_end_date
    AND (p_branch IS NULL OR branch = p_branch)
    AND movement_type = 'CREDIT_PAYMENT';

    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total_expenses
    FROM (
        SELECT amount FROM accounting_transactions
        WHERE transaction_date >= p_start_date AND transaction_date <= p_end_date
        AND status = 'COMPLETED' AND (p_branch IS NULL OR branch = p_branch)
        UNION ALL
        SELECT amount FROM floating_expenses
        WHERE created_at >= p_start_date AND created_at <= p_end_date
        AND approval_status = 'APPROVED' AND (p_branch IS NULL OR branch_id = p_branch)
    ) as expenses;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_cambiazos
    FROM cash_movements
    WHERE created_at >= p_start_date AND created_at <= p_end_date
    AND (p_branch IS NULL OR branch = p_branch)
    AND method IN ('EXCHANGE', 'CAMBIAZO') AND movement_type LIKE '%_IN%';

    v_diferencia := v_total_sales - (v_total_cash_in + v_total_credits_opened + v_total_cambiazos);

    IF ABS(v_diferencia) <= 1 THEN v_status := 'OK';
    ELSIF ABS(v_diferencia) <= 100 THEN v_status := 'ADVERTENCIA';
    ELSE v_status := 'ERROR';
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'sale_id', ps.id,
        'total', ps.total,
        'missing_type', 'POS sin movimiento en caja'
    )) INTO v_unmatched_events
    FROM pos_sales ps
    WHERE ps.created_at >= p_start_date AND ps.created_at <= p_end_date
    AND ps.status IN ('completed', 'refunded') AND (p_branch IS NULL OR ps.branch_id = p_branch)
    AND NOT EXISTS (SELECT 1 FROM cash_movements cm WHERE cm.source_id = ps.id::text);

    RETURN jsonb_build_object(
        'status', v_status,
        'sales_unified_total', v_total_sales,
        'cash_in', v_total_cash_in,
        'cash_out', v_total_cash_out,
        'net_cash', v_total_cash_in - v_total_cash_out,
        'credits_opened', v_total_credits_opened,
        'credits_paid', v_total_credits_paid,
        'total_expenses', v_total_expenses,
        'total_cambiazos', v_total_cambiazos,
        'detected_difference', v_diferencia,
        'unmatched_events', COALESCE(v_unmatched_events, '[]'::jsonb),
        'diff_details', jsonb_build_object(
           'ventas_vs_caja', v_diferencia,
           'gastos', v_total_expenses
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
