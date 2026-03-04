-- 1. Asegurar que la columna existe
ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS closing_id text;

-- 2. Configurar RLS (Seguridad)
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

-- Política de LECTURA
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.order_payments;
CREATE POLICY "Enable read access for authenticated users" 
ON public.order_payments FOR SELECT TO authenticated USING (true);

-- Política de ACTUALIZACIÓN (CRUCIAL: Faltaba esta política para updates directos)
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.order_payments;
CREATE POLICY "Enable update for authenticated users" 
ON public.order_payments FOR UPDATE TO authenticated USING (true);

-- 3. Función de Cierre Robusta con Retorno de Diagnóstico
CREATE OR REPLACE FUNCTION public.perform_robust_closing(
    p_closing_id text,
    p_cashier_ids text,
    p_admin_id text,
    p_system_total numeric,
    p_actual_total numeric,
    p_difference numeric,
    p_timestamp bigint,
    p_payment_ids text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_count int;
BEGIN
    -- A. Insertar el registro del cierre
    INSERT INTO public.cash_closings (
        id, "cashierId", "adminId", "systemTotal", "actualTotal", difference, timestamp
    ) VALUES (
        p_closing_id, p_cashier_ids, p_admin_id, p_system_total, p_actual_total, p_difference, p_timestamp
    );

    -- B. Actualizar los pagos y contar cuántos se actualizaron realmente
    WITH updated_rows AS (
        UPDATE public.order_payments
        SET closing_id = p_closing_id
        WHERE id::text = ANY(p_payment_ids) -- Casting seguro
        RETURNING 1
    )
    SELECT count(*) INTO v_updated_count FROM updated_rows;

    -- C. Retornar resultado
    RETURN json_build_object(
        'success', true,
        'updated_count', v_updated_count,
        'closing_id', p_closing_id
    );

EXCEPTION WHEN OTHERS THEN
    -- Capturar cualquier error SQL y retornarlo
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- 4. Permisos
GRANT EXECUTE ON FUNCTION public.perform_robust_closing TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_robust_closing TO service_role;
