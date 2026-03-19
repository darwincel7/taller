-- SCRIPT DE REPARACIÓN DEFINITIVA V2
-- Ejecuta este script para corregir el error "structure of query does not match function result type"
-- y asegurar que todas las columnas existan.

-- 1. ASEGURAR COLUMNAS (Idempotente)
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
END $$;

-- 2. CORREGIR FUNCIÓN get_closing_details
-- El error se debía a que created_at es timestamptz, no bigint.
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
    created_at timestamptz, -- CORREGIDO: Usar timestamptz en lugar de bigint
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
        op.method::text, -- Castear a text por si es enum
        op.created_at,   -- Supabase usa timestamptz por defecto
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

-- 3. ASEGURAR OTRAS FUNCIONES CRÍTICAS

-- edit_closed_payment
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

-- force_clear_pending_payments
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
GRANT EXECUTE ON FUNCTION public.edit_closed_payment(text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_closed_payment(text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.force_clear_pending_payments(text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_clear_pending_payments(text[], text) TO service_role;
