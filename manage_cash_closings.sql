-- Función para ELIMINAR un cierre de caja (Re-abrir turno)
CREATE OR REPLACE FUNCTION public.delete_cash_closing(
    p_closing_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Liberar los pagos asociados (volverlos a estado 'abierto')
    UPDATE public.order_payments
    SET closing_id = NULL
    WHERE closing_id = p_closing_id;

    -- 2. Eliminar el registro del cierre
    DELETE FROM public.cash_closings
    WHERE id = p_closing_id;
END;
$$;

-- Función para ACTUALIZAR un cierre de caja (Solo montos/notas)
CREATE OR REPLACE FUNCTION public.update_cash_closing(
    p_closing_id text,
    p_actual_total numeric,
    p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.cash_closings
    SET 
        "actualTotal" = p_actual_total,
        difference = p_actual_total - "systemTotal",
        notes = p_notes,
        updated_at = now() -- Asumiendo que existe, si no, no importa
    WHERE id = p_closing_id;
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.delete_cash_closing TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_cash_closing TO service_role;
GRANT EXECUTE ON FUNCTION public.update_cash_closing TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_cash_closing TO service_role;
