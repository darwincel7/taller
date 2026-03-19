-- 1. Agregar columna 'notes' a cash_closings si no existe
ALTER TABLE public.cash_closings ADD COLUMN IF NOT EXISTS notes text;

-- 2. Agregar columna 'updated_at' a cash_closings si no existe
ALTER TABLE public.cash_closings ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- 3. Agregar columna 'edited_amount' a order_payments para rastrear ediciones
ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS edited_amount numeric;
ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS original_amount numeric;
ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false;

-- 4. Función para obtener detalles de un cierre (pagos asociados)
CREATE OR REPLACE FUNCTION public.get_closing_details(
    p_closing_id text
)
RETURNS TABLE(
    payment_id text,
    amount numeric,
    original_amount numeric,
    is_edited boolean,
    method text,
    created_at bigint,
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
        op.amount,
        op.original_amount,
        COALESCE(op.is_edited, false),
        op.method,
        op.created_at,
        op.cashier_name,
        o.readable_id,
        o."deviceModel",
        COALESCE(o."currentBranch", 'T4')
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

-- 5. Función para EDITAR un pago dentro de un cierre y recalcular el total
CREATE OR REPLACE FUNCTION public.edit_closed_payment(
    p_payment_id uuid,
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
BEGIN
    -- Obtener datos actuales del pago
    SELECT closing_id, amount INTO v_closing_id, v_old_amount
    FROM public.order_payments
    WHERE id = p_payment_id;

    IF v_closing_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'El pago no pertenece a un cierre o no existe.');
    END IF;

    -- Calcular diferencia
    v_diff := p_new_amount - v_old_amount;

    -- Actualizar pago
    UPDATE public.order_payments
    SET 
        original_amount = COALESCE(original_amount, amount),
        amount = p_new_amount,
        is_edited = true,
        edited_amount = p_new_amount
    WHERE id = p_payment_id;

    -- Obtener totales actuales del cierre para recalcular
    SELECT "systemTotal", "actualTotal" INTO v_current_system_total, v_current_actual_total
    FROM public.cash_closings
    WHERE id = v_closing_id;

    -- Actualizar total del cierre
    -- Solo systemTotal cambia. ActualTotal (billetes físicos) se mantiene. Diferencia se recalcula.
    UPDATE public.cash_closings
    SET 
        "systemTotal" = v_current_system_total + v_diff,
        difference = v_current_actual_total - (v_current_system_total + v_diff),
        updated_at = now()
    WHERE id = v_closing_id;

    RETURN json_build_object('success', true, 'closing_id', v_closing_id);
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.get_closing_details(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_closing_details(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.edit_closed_payment(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_closed_payment(uuid, numeric, text) TO service_role;
