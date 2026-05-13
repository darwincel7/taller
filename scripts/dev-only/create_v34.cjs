const fs = require('fs');

const v33Full = fs.readFileSync('supabase/migrations/2026_05_13_v33_financial_dashboard.sql', 'utf8');

const viewStart = v33Full.indexOf('DROP VIEW IF EXISTS public.v_financial_events CASCADE;');
const rpcStart = v33Full.indexOf('DROP FUNCTION IF EXISTS public.get_financial_dashboard_v31');
const ending = v33Full.indexOf('COMMIT;', rpcStart);

const v31Stuff = v33Full.substring(viewStart, ending);

const recSQL = `
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
    AND method IN ('EXCHANGE', 'CAMBIAZO') AND movement_type LIKE '%_IN';

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
    AND ps.status = 'completed' AND (p_branch IS NULL OR ps.branch_id = p_branch)
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
`;

const finalSQL = "-- V34: ESTABILIZACION CONTABLE Y PRODUCCION\nBEGIN;\n" + v31Stuff + "\n" + recSQL + "\nCOMMIT;\n";

fs.writeFileSync('supabase/migrations/2026_05_13_v34_financial_only.sql', finalSQL);
console.log('Created 2026_05_13_v34_financial_only.sql successfully');
