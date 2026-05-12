BEGIN;

DROP VIEW IF EXISTS public.v_financial_events CASCADE;
DROP FUNCTION IF EXISTS public.get_financial_dashboard_v31(timestamptz, timestamptz);

-- 1. Crear VISTA unificada
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
    false as is_cash, -- Flujo real medido por cash_movements
    true as is_revenue,
    false as is_expense,
    false as is_cogs,
    is_credit,
    is_cambiazo,
    jsonb_build_object('cost_amount', cost_amount, 'net_profit', net_profit, 'cash_effect_amount', cash_effect_amount) as metadata
FROM v_sales_unified
WHERE status = 'completed'

UNION ALL

-- COSTOS DIRECTOS DE VENTA (Agregarlo visual/explicito si se quiere usar como eventos separados)
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
WHERE status = 'completed' AND cost_amount > 0

UNION ALL

-- B. Movimientos de Efectivo (Flujo real de caja)
SELECT 
    id::text as event_id,
    created_at as event_date,
    'cash_movements' as source_table,
    source_id,
    movement_type as event_type, -- SALE_IN, EXPENSE_OUT, etc.
    reason as description,
    amount,
    method,
    branch,
    cashier_id as user_id,
    true as is_cash,
    false as is_revenue,
    false as is_expense,
    false as is_cogs,
    method = 'CREDIT' as is_credit,
    method IN ('EXCHANGE', 'CAMBIAZO') as is_cambiazo,
    metadata
FROM cash_movements
WHERE method NOT IN ('CREDIT', 'EXCHANGE', 'CAMBIAZO') -- solo dinero real y liquidable

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
    COALESCE(method, 'CASH') as method,
    branch,
    created_by as user_id,
    false as is_cash, -- el flujo lo maneja cash_movements
    false as is_revenue,
    true as is_expense,
    (order_id IS NOT NULL) as is_cogs, -- Si es de una orden, es costo directo
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
    false as is_revenue, -- ya se conto en v_sales_unified
    false as is_expense,
    false as is_cogs,
    true as is_credit,
    false as is_cambiazo,
    jsonb_build_object('status', status, 'client_name', client_name) as metadata
FROM client_credits;


-- 2. Crear RPC para consumir la VISTA
CREATE OR REPLACE FUNCTION public.get_financial_dashboard_v31(p_start_date timestamptz, p_end_date timestamptz)
RETURNS jsonb AS $$
DECLARE
    v_ventas_netas numeric;
    v_costo_venta_total numeric;
    v_costos_v_sales numeric;
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

    -- 2. Costo de Venta (sólo los reportados en v_sales_unified)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_costos_v_sales
    FROM v_financial_events
    WHERE event_type = 'COGS' AND source_table = 'v_sales_unified'
    AND event_date >= p_start_date AND event_date <= p_end_date;
    
    v_costo_venta_total := v_costos_v_sales;

    -- 3. Gastos Operativos Generales (Excluir los de orden porque ya están en COGS de v_sales_unified)
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

    -- 5. Cuentas por Cobrar (Pendientes) Totales en el periodo
    SELECT COALESCE(SUM(amount), 0)
    INTO v_creds_por_cobrar
    FROM v_financial_events
    WHERE source_table = 'client_credits' AND is_credit = true 
    AND (metadata->>'status' = 'PENDING' OR metadata->>'status' = 'pending')
    AND event_date >= p_start_date AND event_date <= p_end_date;

    -- 6. Compras inventario (Cambiazos recibidos, o movimientos de compra si existen)
    -- Por ahora sacaremos valor de cambiazos que no afectan caja
    SELECT COALESCE(SUM(amount), 0)
    INTO v_valor_cambiazos
    FROM v_financial_events
    WHERE source_table = 'cash_movements' AND movement_type = 'CAMBIAZO_IN'
    AND event_date >= p_start_date AND event_date <= p_end_date;
    
    v_compras_inventario := v_valor_cambiazos; -- Plus direct manual inventory purchases if handled

    -- 7. Extraer detalle de eventos del periodo
    SELECT jsonb_agg(row_to_json(e))
    INTO v_events
    FROM (
        SELECT * FROM v_financial_events
        WHERE event_date >= p_start_date AND event_date <= p_end_date
        ORDER BY event_date DESC
    ) e;

    -- 8. Distribución de Gastos (Categories de accounting)
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
            'egresosTotales', (v_gastos_operativos + COALESCE((SELECT abs(SUM(amount)) FROM cash_movements WHERE method='OUT'), 0)),
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

COMMIT;
