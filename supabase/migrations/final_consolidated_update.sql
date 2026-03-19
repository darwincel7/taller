-- ==============================================================================
-- SCRIPT CONSOLIDADO DE ACTUALIZACIÓN (Idempotente)
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. ASEGURAR COLUMNAS EN TABLAS EXISTENTES
DO $$
BEGIN
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

    -- floating_expenses
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'floating_expenses' AND column_name = 'closing_id') THEN
        ALTER TABLE public.floating_expenses ADD COLUMN closing_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'floating_expenses' AND column_name = 'readable_id') THEN
        ALTER TABLE public.floating_expenses ADD COLUMN readable_id bigint;
    END IF;
END $$;

-- 2. CREAR SECUENCIAS Y TRIGGERS PARA READABLE_ID
-- Sequence for floating_expenses
CREATE SEQUENCE IF NOT EXISTS floating_expenses_readable_id_seq START 1000;

CREATE OR REPLACE FUNCTION public.assign_floating_expense_readable_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.readable_id IS NULL THEN
    NEW.readable_id := nextval('floating_expenses_readable_id_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_floating_expense_readable_id ON public.floating_expenses;
CREATE TRIGGER trg_assign_floating_expense_readable_id
BEFORE INSERT ON public.floating_expenses
FOR EACH ROW
EXECUTE FUNCTION public.assign_floating_expense_readable_id();

-- Sequence for accounting_transactions
CREATE SEQUENCE IF NOT EXISTS accounting_transactions_readable_id_seq START 5000;

CREATE OR REPLACE FUNCTION public.assign_accounting_transaction_readable_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.readable_id IS NULL THEN
    NEW.readable_id := nextval('accounting_transactions_readable_id_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_accounting_transaction_readable_id ON public.accounting_transactions;
CREATE TRIGGER trg_assign_accounting_transaction_readable_id
BEFORE INSERT ON public.accounting_transactions
FOR EACH ROW
EXECUTE FUNCTION public.assign_accounting_transaction_readable_id();

-- Actualizar registros existentes que no tengan readable_id
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.floating_expenses WHERE readable_id IS NULL LOOP
    UPDATE public.floating_expenses SET readable_id = nextval('floating_expenses_readable_id_seq') WHERE id = rec.id;
  END LOOP;
  
  FOR rec IN SELECT id FROM public.accounting_transactions WHERE readable_id IS NULL LOOP
    UPDATE public.accounting_transactions SET readable_id = nextval('accounting_transactions_readable_id_seq') WHERE id = rec.id;
  END LOOP;
END $$;


-- 3. ACTUALIZAR FUNCIONES (RPCs)
-- A. get_closing_details (Corregido para timestamptz)
DROP FUNCTION IF EXISTS public.get_closing_details(text);
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
    order_readable_id bigint,
    order_model text,
    order_branch text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        op.id::text,
        op.amount::numeric,
        op.original_amount::numeric,
        COALESCE(op.is_edited, false),
        op.method::text,
        op.created_at,
        op.cashier_name::text,
        o.readable_id::bigint,
        o."deviceModel"::text,
        COALESCE(o."currentBranch", 'T4')::text
    FROM
        public.order_payments op
    LEFT JOIN
        public.orders o ON op.order_id = o.id
    WHERE
        op.closing_id = p_closing_id
    ORDER BY
        op.created_at DESC;
END;
$$;

-- B. get_payments_flat (Actualizado con gastos y branch/method)
DROP FUNCTION IF EXISTS public.get_payments_flat(bigint, bigint, text, text);
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
    order_model text
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
        o."deviceModel"::text as order_model
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
        AND at.status = 'COMPLETED'
        AND (p_start IS NULL OR (extract(epoch from at.created_at) * 1000)::bigint >= p_start)
        AND (p_end IS NULL OR (extract(epoch from at.created_at) * 1000)::bigint <= p_end)
        AND (p_cashier_id IS NULL OR at.created_by = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(at.branch, 'T4') = p_branch)
        
    UNION ALL
    
    -- C. Gastos Flotantes (Negativos)
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
        AND (p_start IS NULL OR (extract(epoch from fe.created_at) * 1000)::bigint >= p_start)
        AND (p_end IS NULL OR (extract(epoch from fe.created_at) * 1000)::bigint <= p_end)
        AND (p_cashier_id IS NULL OR fe.created_by = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(fe.branch_id, 'T4') = p_branch)
        
    ORDER BY
        created_at DESC;
END;
$$;

-- C. perform_robust_closing (Actualizado para incluir gastos)
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
BEGIN
    INSERT INTO public.cash_closings (
        id, "cashierId", "adminId", "systemTotal", "actualTotal", difference, timestamp, notes
    ) VALUES (
        p_closing_id, p_cashier_ids, p_admin_id, p_system_total, p_actual_total, p_difference, p_timestamp, p_notes
    );

    WITH updated_rows AS (
        UPDATE public.order_payments
        SET closing_id = p_closing_id
        WHERE id::text = ANY(p_payment_ids)
        RETURNING 1
    )
    SELECT count(*) INTO v_updated_count FROM updated_rows;
    
    WITH updated_expenses AS (
        UPDATE public.accounting_transactions
        SET closing_id = p_closing_id
        WHERE id::text = ANY(p_payment_ids)
        RETURNING 1
    )
    SELECT count(*) INTO v_updated_expenses_count FROM updated_expenses;

    WITH updated_floating AS (
        UPDATE public.floating_expenses
        SET closing_id = p_closing_id
        WHERE id::text = ANY(p_payment_ids)
        RETURNING 1
    )
    SELECT count(*) INTO v_updated_floating_count FROM updated_floating;

    RETURN json_build_object(
        'success', true,
        'updated_count', v_updated_count + v_updated_expenses_count + v_updated_floating_count,
        'closing_id', p_closing_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- D. edit_closed_payment
CREATE OR REPLACE FUNCTION public.edit_closed_payment(
    p_payment_id text,
    p_new_amount numeric,
    p_admin_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_closing_id text;
    v_old_amount numeric;
    v_diff numeric;
    v_current_system_total numeric;
    v_current_actual_total numeric;
    v_payment_uuid uuid;
BEGIN
    BEGIN
        v_payment_uuid := p_payment_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', 'ID de pago inválido.');
    END;

    SELECT closing_id, amount INTO v_closing_id, v_old_amount
    FROM public.order_payments
    WHERE id = v_payment_uuid;

    IF v_closing_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Pago no encontrado o sin cierre.');
    END IF;

    v_diff := p_new_amount - v_old_amount;

    UPDATE public.order_payments
    SET 
        original_amount = COALESCE(original_amount, amount),
        amount = p_new_amount,
        is_edited = true,
        edited_amount = p_new_amount
    WHERE id = v_payment_uuid;

    SELECT "systemTotal", "actualTotal" INTO v_current_system_total, v_current_actual_total
    FROM public.cash_closings
    WHERE id = v_closing_id;

    UPDATE public.cash_closings
    SET 
        "systemTotal" = v_current_system_total + v_diff,
        difference = v_current_actual_total - (v_current_system_total + v_diff),
        updated_at = now()
    WHERE id = v_closing_id;

    RETURN json_build_object('success', true, 'closing_id', v_closing_id);
END;
$$;

-- E. force_clear_pending_payments
CREATE OR REPLACE FUNCTION public.force_clear_pending_payments(
    p_cashier_ids text[],
    p_admin_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_closing_id text;
    v_count int;
    v_total numeric;
    v_cashier_list text;
BEGIN
    v_closing_id := 'clear-' || extract(epoch from now())::bigint || '-' || array_to_string(p_cashier_ids, '_');
    v_cashier_list := array_to_string(p_cashier_ids, ',');

    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO v_total, v_count
    FROM public.order_payments
    WHERE cashier_id = ANY(p_cashier_ids)
    AND closing_id IS NULL;

    IF v_count = 0 THEN
        RETURN json_build_object('success', false, 'message', 'No hay pagos pendientes.');
    END IF;

    INSERT INTO public.cash_closings (
        id, "cashierId", "adminId", "systemTotal", "actualTotal", difference, timestamp, notes
    ) VALUES (
        v_closing_id, v_cashier_list, p_admin_id, v_total, v_total, 0, extract(epoch from now()) * 1000, 'Limpieza Manual (Forzado)'
    );

    UPDATE public.order_payments
    SET closing_id = v_closing_id
    WHERE cashier_id = ANY(p_cashier_ids)
    AND closing_id IS NULL;

    RETURN json_build_object('success', true, 'count', v_count, 'total', v_total);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. PERMISOS
GRANT EXECUTE ON FUNCTION public.get_closing_details(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_closing_details(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_payments_flat(bigint, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payments_flat(bigint, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.perform_robust_closing(text, text, text, numeric, numeric, numeric, bigint, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_robust_closing(text, text, text, numeric, numeric, numeric, bigint, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.edit_closed_payment(text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_closed_payment(text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.force_clear_pending_payments(text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_clear_pending_payments(text[], text) TO service_role;
