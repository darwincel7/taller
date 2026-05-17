import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

const sql = `
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
    branch text,
    order_readable_id bigint,
    order_model text,
    source_type text
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
        op.created_at as created_at,
        op.closing_id,
        COALESCE(o."currentBranch", 'T4') as branch,
        o.readable_id::bigint as order_readable_id,
        o."deviceModel"::text as order_model,
        'ORDER' as source_type
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

    -- B. NUEVOS MOVIMIENTOS DE CAJA TRANSACCIONALES (POS V2)
    -- Estos son los que vienen de la nueva tabla cash_movements
    SELECT
        cm.id,
        cm.source_id as order_id,
        cm.amount,
        cm.method,
        cm.cashier_id,
        'Cajero POS' as cashier_name,
        (cm.amount < 0) as is_refund,
        (extract(epoch from cm.created_at) * 1000)::bigint as created_at,
        cm.closing_id::text,
        COALESCE(cm.branch, 'T4') as branch,
        COALESCE(ps.readable_id, 0)::bigint as order_readable_id,
        CASE 
            WHEN cm.movement_type = 'SALE_IN' THEN 'Venta POS'
            WHEN cm.movement_type = 'CAMBIAZO_OUT' THEN 'Cambiazo POS'
            ELSE cm.reason
        END::text as order_model,
        'CASH_LEDGER' as source_type
    FROM
        public.cash_movements cm
    LEFT JOIN public.pos_sales ps ON cm.source_id = ps.id::text
    WHERE
        (p_start IS NULL OR (extract(epoch from cm.created_at) * 1000)::bigint >= p_start)
        AND (p_end IS NULL OR (extract(epoch from cm.created_at) * 1000)::bigint <= p_end)
        AND (p_cashier_id IS NULL OR cm.cashier_id = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(cm.branch, 'T4') = p_branch)
        
    UNION ALL
    
    -- C. Transacciones de Contabilidad (Gastos, Manuales, etc - FILTRADO para no duplicar POS)
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
        END::text as order_model,
        'ACCOUNTING' as source_type
    FROM
        public.accounting_transactions at
    WHERE
        at.source IN ('STORE', 'ORDER', 'FLOATING', 'MANUAL')
        AND at.status = 'COMPLETED'
        AND (at.description IS NULL OR at.description NOT LIKE 'Venta POS Directa%')
        AND (p_start IS NULL OR (extract(epoch from at.created_at) * 1000)::bigint >= p_start)
        AND (p_end IS NULL OR (extract(epoch from at.created_at) * 1000)::bigint <= p_end)
        AND (p_cashier_id IS NULL OR at.created_by = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(at.branch, 'T4') = p_branch)
        
    UNION ALL
    
    -- D. Gastos Flotantes (Negativos)
    SELECT
        fe.id,
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
        'Gasto Flotante'::text as order_model,
        'FLOATING' as source_type
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
`;

async function run() {
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  console.log(error || 'Success: ' + JSON.stringify(data));
}
run();
