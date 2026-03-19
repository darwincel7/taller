-- Función para LIMPIAR (Cerrar forzosamente) pagos pendientes de cajeros específicos
CREATE OR REPLACE FUNCTION public.force_clear_pending_payments(
    p_cashier_ids text[], -- Array de IDs de cajeros
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
    -- 1. Generar ID de cierre único
    v_closing_id := 'clear-' || extract(epoch from now())::bigint || '-' || array_to_string(p_cashier_ids, '_');
    v_cashier_list := array_to_string(p_cashier_ids, ',');

    -- 2. Calcular total de pagos pendientes para estos cajeros
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO v_total, v_count
    FROM public.order_payments
    WHERE cashier_id = ANY(p_cashier_ids)
    AND closing_id IS NULL;

    IF v_count = 0 THEN
        RETURN json_build_object('success', false, 'message', 'No hay pagos pendientes para los cajeros seleccionados.');
    END IF;

    -- 3. Crear registro de cierre "Limpieza Manual"
    INSERT INTO public.cash_closings (
        id, "cashierId", "adminId", "systemTotal", "actualTotal", difference, timestamp, notes
    ) VALUES (
        v_closing_id, v_cashier_list, p_admin_id, v_total, v_total, 0, extract(epoch from now()) * 1000, 'Limpieza Manual de Pendientes (Forzado)'
    );

    -- 4. Actualizar los pagos
    UPDATE public.order_payments
    SET closing_id = v_closing_id
    WHERE cashier_id = ANY(p_cashier_ids)
    AND closing_id IS NULL;

    RETURN json_build_object(
        'success', true, 
        'count', v_count, 
        'total', v_total,
        'closing_id', v_closing_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.force_clear_pending_payments(text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_clear_pending_payments(text[], text) TO service_role;
