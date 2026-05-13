-- V33 Financial Reconciliation Report

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
    v_unmatched_events jsonb := '[]'::jsonb;
BEGIN

    -- 1. Total ventas segun v_sales_unified
    SELECT COALESCE(SUM(
        CASE WHEN is_refund THEN -net_profit ELSE gross_amount END
    ), 0)
    INTO v_total_sales
    FROM v_sales_unified
    WHERE created_at >= p_start_date AND created_at <= p_end_date
    AND (p_branch IS NULL OR branch = p_branch)
    AND status = 'completed';

    -- 2. Total de dinero real segun cash_movements
    SELECT 
        COALESCE(SUM(CASE WHEN method != 'OUT' AND movement_type NOT LIKE '%_OUT' AND movement_type != 'CASH_OUT' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN method = 'OUT' OR movement_type LIKE '%_OUT' OR movement_type = 'CASH_OUT' THEN amount ELSE 0 END), 0)
    INTO v_total_cash_in, v_total_cash_out
    FROM cash_movements
    WHERE created_at >= p_start_date AND created_at <= p_end_date
    AND (p_branch IS NULL OR branch = p_branch)
    AND method NOT IN ('CREDIT', 'EXCHANGE', 'CAMBIAZO'); -- Solo dinero real

    -- 3. Total de creditos (Abiertos)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_credits_opened
    FROM client_credits
    WHERE created_at >= p_start_date AND created_at <= p_end_date
    AND (p_branch IS NULL OR branch_id = p_branch)
    AND (status = 'pending' OR status = 'PENDING');

    -- Total creditos (Cobrados) - si es que hay un movement de cobro
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_credits_paid
    FROM cash_movements
    WHERE created_at >= p_start_date AND created_at <= p_end_date
    AND (p_branch IS NULL OR branch = p_branch)
    AND movement_type = 'CREDIT_PAYMENT';

    -- 4. Total de gastos (accounting_transactions y floating_expenses)
    SELECT COALESCE(SUM(ABS(amount)), 0)
    INTO v_total_expenses
    FROM (
        SELECT amount FROM accounting_transactions
        WHERE transaction_date >= p_start_date AND transaction_date <= p_end_date
        AND status = 'COMPLETED' AND (p_branch IS NULL OR branch = p_branch)
        UNION ALL
        SELECT amount FROM floating_expenses
        WHERE created_at >= p_start_date AND created_at <= p_end_date
        AND approval_status = 'APPROVED' AND (p_branch IS NULL OR branch_id = p_branch)
    ) as expenses;

    -- 5. Total de cambiazos recibidos
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_cambiazos
    FROM cash_movements
    WHERE created_at >= p_start_date AND created_at <= p_end_date
    AND (p_branch IS NULL OR branch = p_branch)
    AND method IN ('EXCHANGE', 'CAMBIAZO') AND movement_type LIKE '%_IN';

    -- Diferencia = (Ventas Netas - Gastos) vs (Flujo de Caja Real Neto + Creditos Abiertos)
    -- This is a simple reconciliation equation: 
    -- What we sold (v_total_sales) should equal to what entered our cache (v_total_cash_in) 
    -- minus what left (v_total_cash_out) ... etc.
    -- To keep it simple for the reporter:
    v_diferencia := v_total_sales - (v_total_cash_in + v_total_credits_opened + v_total_cambiazos);

    -- Unmatched events logic could be checking which pos_sales don't have matching cash_movements
    SELECT jsonb_agg(jsonb_build_object(
        'sale_id', ps.id,
        'total', ps.total,
        'missing_cash_movements', true
    ))
    INTO v_unmatched_events
    FROM pos_sales ps
    WHERE ps.created_at >= p_start_date AND ps.created_at <= p_end_date
    AND ps.status = 'completed'
    AND (p_branch IS NULL OR ps.branch_id = p_branch)
    AND NOT EXISTS (
        SELECT 1 FROM cash_movements cm WHERE cm.source_id = ps.id::text 
    );

    RETURN jsonb_build_object(
        'sales_unified_total', v_total_sales,
        'cash_in', v_total_cash_in,
        'cash_out', v_total_cash_out,
        'net_cash', v_total_cash_in - v_total_cash_out,
        'credits_opened', v_total_credits_opened,
        'credits_paid', v_total_credits_paid,
        'total_expenses', v_total_expenses,
        'total_cambiazos', v_total_cambiazos,
        'detected_difference', v_diferencia,
        'unmatched_events', COALESCE(v_unmatched_events, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
