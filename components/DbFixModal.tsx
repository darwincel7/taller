
import React from 'react';
import { Database, Copy, X } from 'lucide-react';

const FULL_SQL = `-- ==============================================================================
-- SCRIPT CONSOLIDADO DE ACTUALIZACIÓN V19 (Idempotente + Transaccional)
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. ASEGURAR COLUMNAS EN TABLAS EXISTENTES
DO $$
BEGIN
    -- cash_movements (NUEVO: Soporte para cierre)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_movements' AND column_name = 'closing_id') THEN
        ALTER TABLE public.cash_movements ADD COLUMN closing_id uuid;
    END IF;

    -- cash_closings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_closings' AND column_name = 'notes') THEN
        ALTER TABLE public.cash_closings ADD COLUMN notes text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_closings' AND column_name = 'updated_at') THEN
        ALTER TABLE public.cash_closings ADD COLUMN updated_at timestamptz;
    END IF;

    -- order_payments
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_payments' AND column_name = 'edited_amount') THEN
        ALTER TABLE public.order_payments ADD COLUMN edited_amount numeric;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_payments' AND column_name = 'original_amount') THEN
        ALTER TABLE public.order_payments ADD COLUMN original_amount numeric;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_payments' AND column_name = 'is_edited') THEN
        ALTER TABLE public.order_payments ADD COLUMN is_edited boolean DEFAULT false;
    END IF;

    -- accounting_transactions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounting_transactions' AND column_name = 'closing_id') THEN
        ALTER TABLE public.accounting_transactions ADD COLUMN closing_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounting_transactions' AND column_name = 'readable_id') THEN
        ALTER TABLE public.accounting_transactions ADD COLUMN readable_id bigint;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounting_transactions' AND column_name = 'branch') THEN
        ALTER TABLE public.accounting_transactions ADD COLUMN branch text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounting_transactions' AND column_name = 'method') THEN
        ALTER TABLE public.accounting_transactions ADD COLUMN method text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounting_transactions' AND column_name = 'approval_status') THEN
        ALTER TABLE public.accounting_transactions ADD COLUMN approval_status text DEFAULT 'APPROVED';
    END IF;

    -- floating_expenses
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'floating_expenses' AND column_name = 'closing_id') THEN
        ALTER TABLE public.floating_expenses ADD COLUMN closing_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'floating_expenses' AND column_name = 'readable_id') THEN
        ALTER TABLE public.floating_expenses ADD COLUMN readable_id bigint;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'floating_expenses' AND column_name = 'approval_status') THEN
        ALTER TABLE public.floating_expenses ADD COLUMN approval_status text DEFAULT 'PENDING';
    END IF;
END $$;

-- 2. ACTUALIZAR get_payments_flat (UNIFICADO V19)
CREATE OR REPLACE FUNCTION public.get_payments_flat(
    p_start bigint DEFAULT NULL,
    p_end bigint DEFAULT NULL,
    p_cashier_id text DEFAULT NULL,
    p_branch text DEFAULT NULL,
    p_pending_only boolean DEFAULT false,
    p_closing_id text DEFAULT NULL
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
    order_model text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- A. Pagos de Órdenes (Talleres)
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
        COALESCE(o."currentBranch", 'T4') as branch,
        o.readable_id::bigint as order_readable_id,
        o."deviceModel"::text as order_model
    FROM
        public.order_payments op
    LEFT JOIN
        public.orders o ON op.order_id = o.id
    WHERE
        (p_closing_id IS NULL OR op.closing_id = p_closing_id)
        AND (NOT p_pending_only OR op.closing_id IS NULL)
        AND (p_start IS NULL OR op.created_at >= p_start)
        AND (p_end IS NULL OR op.created_at <= p_end)
        AND (p_cashier_id IS NULL OR op.cashier_id = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(o."currentBranch", 'T4') = p_branch)
        
    UNION ALL

    -- B. Movimientos de Caja Transaccionales (POS V2 - NUEVO)
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
        0::bigint as order_readable_id,
        CASE 
            WHEN cm.movement_type = 'SALE_IN' THEN 'Venta POS'
            WHEN cm.movement_type = 'CAMBIAZO_OUT' THEN 'Cambiazo POS'
            ELSE cm.reason
        END::text as order_model
    FROM
        public.cash_movements cm
    WHERE
        (p_closing_id IS NULL OR cm.closing_id::text = p_closing_id)
        AND (NOT p_pending_only OR cm.closing_id IS NULL)
        AND (p_start IS NULL OR (extract(epoch from cm.created_at) * 1000)::bigint >= p_start)
        AND (p_end IS NULL OR (extract(epoch from cm.created_at) * 1000)::bigint <= p_end)
        AND (p_cashier_id IS NULL OR cm.cashier_id = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(cm.branch, 'T4') = p_branch)
        
    UNION ALL
    
    -- C. Transacciones de Contabilidad (Gastos, Ventas Legacy)
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
        AND at.status = 'COMPLETED'
        AND (at.approval_status IS NULL OR at.approval_status != 'REJECTED')
        AND (at.description IS NULL OR at.description NOT LIKE 'Venta POS Directa%') -- Priorizar cash_movements v2
        AND (p_closing_id IS NULL OR at.closing_id = p_closing_id)
        AND (NOT p_pending_only OR at.closing_id IS NULL)
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
        'Gasto Flotante'::text as order_model
    FROM
        public.floating_expenses fe
    WHERE
        fe.description != 'RECEIPT_UPLOAD_TRIGGER'
        AND (fe.approval_status IS NULL OR fe.approval_status != 'REJECTED')
        AND (p_closing_id IS NULL OR fe.closing_id = p_closing_id)
        AND (NOT p_pending_only OR fe.closing_id IS NULL)
        AND (p_start IS NULL OR (extract(epoch from fe.created_at) * 1000)::bigint >= p_start)
        AND (p_end IS NULL OR (extract(epoch from fe.created_at) * 1000)::bigint <= p_end)
        AND (p_cashier_id IS NULL OR fe.created_by = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(fe.branch_id, 'T4') = p_branch)
        
    ORDER BY
        created_at DESC;
END;
$$;

-- 3. ACTUALIZAR perform_robust_closing (V19)
CREATE OR REPLACE FUNCTION public.perform_robust_closing(
    p_closing_id text,
    p_cashier_ids text,
    p_admin_id text,
    p_system_total numeric,
    p_actual_total numeric,
    p_difference numeric,
    p_timestamp bigint,
    p_notes text,
    p_payment_ids text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_count int := 0;
    v_updated_expenses_count int := 0;
    v_updated_floating_count int := 0;
    v_updated_ledger_count int := 0;
BEGIN
    INSERT INTO public.cash_closings (
        id, "cashierId", "adminId", "systemTotal", "actualTotal", difference, timestamp, notes
    ) VALUES (
        p_closing_id, p_cashier_ids, p_admin_id, p_system_total, p_actual_total, p_difference, p_timestamp, p_notes
    );

    UPDATE public.order_payments SET closing_id = p_closing_id WHERE id::text = ANY(p_payment_ids);
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    UPDATE public.accounting_transactions SET closing_id = p_closing_id WHERE id::text = ANY(p_payment_ids);
    GET DIAGNOSTICS v_updated_expenses_count = ROW_COUNT;

    UPDATE public.floating_expenses SET closing_id = p_closing_id WHERE id::text = ANY(p_payment_ids);
    GET DIAGNOSTICS v_updated_floating_count = ROW_COUNT;

    UPDATE public.cash_movements SET closing_id = p_closing_id::uuid WHERE id::text = ANY(p_payment_ids);
    GET DIAGNOSTICS v_updated_ledger_count = ROW_COUNT;

    RETURN json_build_object(
        'success', true,
        'updated_count', v_updated_count + v_updated_expenses_count + v_updated_floating_count + v_updated_ledger_count,
        'closing_id', p_closing_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. ACTUALIZAR get_closing_details (V19)
CREATE OR REPLACE FUNCTION public.get_closing_details(
    p_closing_id text
)
RETURNS TABLE(
    payment_id text,
    amount numeric,
    original_amount numeric,
    is_edited boolean,
    method text,
    created_at timestamptz,
    cashier_name text,
    order_id text,
    order_readable_id bigint,
    order_model text,
    order_branch text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- 1. Pagos de órdenes
    SELECT
        op.id::text,
        COALESCE(op.amount, 0)::numeric,
        COALESCE(op.original_amount, op.amount, 0)::numeric,
        COALESCE(op.is_edited, false),
        op.method::text,
        to_timestamp(op.created_at / 1000.0) as created_at,
        op.cashier_name::text,
        op.order_id::text,
        o.readable_id::bigint,
        o."deviceModel"::text,
        COALESCE(o."currentBranch", 'T4')::text
    FROM
        public.order_payments op
    LEFT JOIN
        public.orders o ON op.order_id = o.id
    WHERE
        op.closing_id = p_closing_id

    UNION ALL

    -- 2. Movimientos de Caja POS (V2)
    SELECT
        cm.id::text,
        cm.amount::numeric,
        cm.amount::numeric as original_amount,
        false as is_edited,
        cm.method::text,
        cm.created_at,
        'Cajero POS'::text as cashier_name,
        cm.source_id::text as order_id,
        0::bigint as order_readable_id,
        CASE 
            WHEN cm.movement_type = 'SALE_IN' THEN 'Venta POS'
            WHEN cm.movement_type = 'CAMBIAZO_OUT' THEN 'Cambiazo'
            ELSE cm.reason
        END::text as order_model,
        COALESCE(cm.branch, 'T4')::text as order_branch
    FROM
        public.cash_movements cm
    WHERE
        cm.closing_id::text = p_closing_id

    UNION ALL

    -- 3. Gastos contables (accounting_transactions)
    SELECT
        at.id::text,
        COALESCE(at.amount, 0)::numeric,
        COALESCE(at.amount, 0)::numeric as original_amount,
        false as is_edited,
        COALESCE(at.method, 'CASH')::text as method,
        at.created_at,
        (SELECT name FROM public.users WHERE id = at.created_by LIMIT 1)::text as cashier_name,
        'EXPENSE'::text as order_id,
        at.readable_id::bigint as order_readable_id,
        at.description::text as order_model,
        at.branch::text as order_branch
    FROM
        public.accounting_transactions at
    WHERE
        at.closing_id = p_closing_id
        AND (at.approval_status IS NULL OR at.approval_status != 'REJECTED')
        AND (at.description IS NULL OR at.description NOT LIKE 'Venta POS Directa%')

    UNION ALL

    -- 4. Gastos flotantes (floating_expenses)
    SELECT
        fe.id::text,
        -(COALESCE(fe.amount, 0))::numeric as amount,
        -(COALESCE(fe.amount, 0))::numeric as original_amount,
        false as is_edited,
        'CASH'::text as method,
        fe.created_at,
        (SELECT name FROM public.users WHERE id = fe.created_by LIMIT 1)::text as cashier_name,
        'GASTO_FLOTANTE'::text as order_id,
        fe.readable_id::bigint as order_readable_id,
        fe.description::text as order_model,
        'T4'::text as order_branch
    FROM
        public.floating_expenses fe
    WHERE
        fe.closing_id = p_closing_id
        AND (fe.approval_status IS NULL OR fe.approval_status != 'REJECTED')

    ORDER BY
        created_at DESC;
END;
$$;

-- 5. PERMISOS
GRANT EXECUTE ON FUNCTION public.get_payments_flat(bigint, bigint, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payments_flat(bigint, bigint, text, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.perform_robust_closing(text, text, text, numeric, numeric, numeric, bigint, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_robust_closing(text, text, text, numeric, numeric, numeric, bigint, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_closing_details(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_closing_details(text) TO service_role;
`;

export const DbFixModal = ({ onClose }: { onClose: () => void }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(FULL_SQL);
    alert("SQL V18 Copiado.\n\nEjecuta esto en Supabase SQL Editor para arreglar la conciliación de caja y gastos.");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in zoom-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 text-blue-600 mb-4 border-b border-blue-100 dark:border-blue-900 pb-2">
          <Database className="w-8 h-8" />
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Reparación de Base de Datos (V18)</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Añade soporte para gastos en la conciliación de caja y corrige errores.
            </p>
          </div>
        </div>
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-700 mb-6 font-mono text-xs text-green-400 overflow-x-auto max-h-64 overflow-y-auto">
          <pre>{FULL_SQL}</pre>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200">Cerrar</button>
          <button onClick={handleCopy} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 flex items-center justify-center gap-2">
            <Copy className="w-5 h-5"/> Copiar SQL V17
          </button>
        </div>
      </div>
    </div>
  );
};
