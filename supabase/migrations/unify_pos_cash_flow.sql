
-- ==============================================================================
-- UNIFICACIÓN DE FLUJO DE CAJA TRANSACCIONAL (Phase 4)
-- ==============================================================================

-- 1. ACTUALIZAR get_payments_flat PARA INCLUIR NUEVOS MOVIMIENTOS DE CAJA POS
-- Evitamos duplicar si el registro existe en accounting_transactions (Legacy)
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
    source_type text -- Nuevo campo para trazabilidad
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
        0::bigint as order_readable_id,
        CASE 
            WHEN cm.movement_type = 'SALE_IN' THEN 'Venta POS'
            WHEN cm.movement_type = 'CAMBIAZO_OUT' THEN 'Cambiazo POS'
            ELSE cm.reason
        END::text as order_model,
        'CASH_LEDGER' as source_type
    FROM
        public.cash_movements cm
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
        -- FILTRO CRÍTICO: No incluir ventas de tienda si ya están siendo manejadas por cash_movements (V2)
        -- Para compatibilidad, si la descripción NO contiene 'Venta POS Directa' (usado en V1) o si queremos priorizar V2:
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

-- 2. ACTUALIZAR perform_robust_closing PARA CERRAR cash_movements
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

    -- Cierre en order_payments
    WITH updated_rows AS (
        UPDATE public.order_payments
        SET closing_id = p_closing_id
        WHERE id::text = ANY(p_payment_ids)
        RETURNING 1
    )
    SELECT count(*) INTO v_updated_count FROM updated_rows;
    
    -- Cierre en accounting_transactions
    WITH updated_expenses AS (
        UPDATE public.accounting_transactions
        SET closing_id = p_closing_id
        WHERE id::text = ANY(p_payment_ids)
        RETURNING 1
    )
    SELECT count(*) INTO v_updated_expenses_count FROM updated_expenses;

    -- Cierre en floating_expenses
    WITH updated_floating AS (
        UPDATE public.floating_expenses
        SET closing_id = p_closing_id
        WHERE id::text = ANY(p_payment_ids)
        RETURNING 1
    )
    SELECT count(*) INTO v_updated_floating_count FROM updated_floating;

    -- NUEVO: Cierre en cash_movements (Ledger Transaccional POS)
    WITH updated_ledger AS (
        UPDATE public.cash_movements
        SET closing_id = p_closing_id::uuid
        WHERE id::text = ANY(p_payment_ids)
        RETURNING 1
    )
    SELECT count(*) INTO v_updated_ledger_count FROM updated_ledger;

    RETURN json_build_object(
        'success', true,
        'updated_count', v_updated_count + v_updated_expenses_count + v_updated_floating_count + v_updated_ledger_count,
        'closing_id', p_closing_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- 3. ACTUALIZAR get_closing_details PARA MOSTRAR DETALLES DE POS V2
CREATE OR REPLACE FUNCTION public.get_closing_details_v2(
    p_closing_id text
)
RETURNS TABLE(
    payment_id text,
    amount numeric,
    method text,
    created_at timestamptz,
    cashier_name text,
    order_readable_id bigint,
    order_model text,
    order_branch text,
    source_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- A. Pagos de Órdenes
    SELECT
        op.id::text,
        op.amount::numeric,
        op.method::text,
        op.created_at,
        op.cashier_name::text,
        o.readable_id::bigint,
        o."deviceModel"::text,
        COALESCE(o."currentBranch", 'T4')::text,
        'ORDER'::text as source_type
    FROM
        public.order_payments op
    LEFT JOIN
        public.orders o ON op.order_id = o.id
    WHERE
        op.closing_id = p_closing_id
        
    UNION ALL
    
    -- B. Movimientos de Caja POS
    SELECT
        cm.id::text,
        cm.amount::numeric,
        cm.method::text,
        cm.created_at,
        'POS'::text as cashier_name,
        0::bigint as order_readable_id,
        CASE 
            WHEN cm.movement_type = 'SALE_IN' THEN 'Venta POS'
            WHEN cm.movement_type = 'CAMBIAZO_OUT' THEN 'Cambiazo'
            ELSE cm.reason
        END::text as order_model,
        COALESCE(cm.branch, 'T4')::text as order_branch,
        'POS_LEDGER'::text as source_type
    FROM
        public.cash_movements cm
    WHERE
        cm.closing_id::text = p_closing_id
        
    ORDER BY
        created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_closing_details_v2(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_closing_details_v2(text) TO service_role;
