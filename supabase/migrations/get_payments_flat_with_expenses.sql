-- 1. Add closing_id to accounting_transactions and floating_expenses
ALTER TABLE public.accounting_transactions ADD COLUMN IF NOT EXISTS closing_id text;
ALTER TABLE public.floating_expenses ADD COLUMN IF NOT EXISTS closing_id text;

-- 2. Update get_payments_flat to include expenses
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
    branch text
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
        op.created_at,
        op.closing_id,
        COALESCE(o."currentBranch", 'T4') as branch
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
    
    -- B. Gastos Locales y de Ordenes (Negativos)
    SELECT
        at.id,
        'GASTO_LOCAL' as order_id,
        -ABS(at.amount) as amount, -- Asegurar que sea negativo
        COALESCE(at.method, 'CASH') as method,
        at.created_by as cashier_id,
        'Gasto Local' as cashier_name,
        true as is_refund, -- Marcar como reembolso para que reste
        extract(epoch from at.created_at) * 1000 as created_at,
        at.closing_id,
        COALESCE(at.branch, 'T4') as branch
    FROM
        public.accounting_transactions at
    WHERE
        at.source IN ('STORE', 'ORDER', 'FLOATING')
        AND at.status = 'COMPLETED' -- Solo gastos aprobados/completados
        AND (p_start IS NULL OR extract(epoch from at.created_at) * 1000 >= p_start)
        AND (p_end IS NULL OR extract(epoch from at.created_at) * 1000 <= p_end)
        AND (p_cashier_id IS NULL OR at.created_by = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(at.branch, 'T4') = p_branch)
        
    UNION ALL
    
    -- C. Gastos Flotantes (Negativos)
    SELECT
        fe.id,
        'GASTO_FLOTANTE' as order_id,
        -ABS(fe.amount) as amount, -- Asegurar que sea negativo
        'CASH' as method,
        fe.created_by as cashier_id,
        'Gasto Flotante' as cashier_name,
        true as is_refund, -- Marcar como reembolso para que reste
        extract(epoch from fe.created_at) * 1000 as created_at,
        fe.closing_id,
        COALESCE(fe.branch_id, 'T4') as branch
    FROM
        public.floating_expenses fe
    WHERE
        fe.description != 'RECEIPT_UPLOAD_TRIGGER'
        AND (p_start IS NULL OR extract(epoch from fe.created_at) * 1000 >= p_start)
        AND (p_end IS NULL OR extract(epoch from fe.created_at) * 1000 <= p_end)
        AND (p_cashier_id IS NULL OR fe.created_by = p_cashier_id)
        AND (p_branch IS NULL OR COALESCE(fe.branch_id, 'T4') = p_branch)
        
    ORDER BY
        created_at DESC;
END;
$$;

-- 3. Update perform_robust_closing to also close expenses
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
    -- A. Crear el registro del cierre
    INSERT INTO public.cash_closings (
        id, "cashierId", "adminId", "systemTotal", "actualTotal", difference, timestamp, notes
    ) VALUES (
        p_closing_id, p_cashier_ids, p_admin_id, p_system_total, p_actual_total, p_difference, p_timestamp, p_notes
    );

    -- B. Actualizar los pagos seleccionados
    WITH updated_rows AS (
        UPDATE public.order_payments
        SET closing_id = p_closing_id
        WHERE id::text = ANY(p_payment_ids)
        RETURNING 1
    )
    SELECT count(*) INTO v_updated_count FROM updated_rows;
    
    -- C. Actualizar los gastos seleccionados
    WITH updated_expenses AS (
        UPDATE public.accounting_transactions
        SET closing_id = p_closing_id
        WHERE id::text = ANY(p_payment_ids)
        RETURNING 1
    )
    SELECT count(*) INTO v_updated_expenses_count FROM updated_expenses;

    -- D. Actualizar los gastos flotantes seleccionados
    WITH updated_floating AS (
        UPDATE public.floating_expenses
        SET closing_id = p_closing_id
        WHERE id::text = ANY(p_payment_ids)
        RETURNING 1
    )
    SELECT count(*) INTO v_updated_floating_count FROM updated_floating;

    -- E. Retornar resultado
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
