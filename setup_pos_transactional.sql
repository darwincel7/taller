
-- 1. Tablas Reforzadas para POS y Caja (Phase 2)
CREATE TABLE IF NOT EXISTS pos_sales (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    readable_id serial, -- No confundir con ID de orden de taller, esta es de POS rápida
    customer_id uuid REFERENCES crm_contacts(id),
    seller_id uuid,
    branch_id text,
    subtotal numeric DEFAULT 0,
    discount numeric DEFAULT 0,
    tax numeric DEFAULT 0,
    total numeric NOT NULL,
    payment_status text DEFAULT 'paid', -- paid, partial, pending
    status text DEFAULT 'completed', -- completed, cancelled, returned
    metadata jsonb,
    idempotency_key text UNIQUE, -- Evita duplicados por doble click
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_sale_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id uuid REFERENCES pos_sales(id) ON DELETE CASCADE,
    inventory_item_id uuid REFERENCES inventory_parts(id),
    name text NOT NULL,
    quantity numeric NOT NULL,
    unit_price numeric NOT NULL,
    unit_cost numeric NOT NULL, -- Captura el costo al momento de la venta para ganancia real
    total_price numeric NOT NULL,
    total_cost numeric NOT NULL,
    profit numeric NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_movements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    movement_type text NOT NULL, -- SALE_IN, EXPENSE_OUT, REFUND_OUT, CAMBIAZO_OUT, CREDIT_IN, INITIAL_CASH
    amount numeric NOT NULL,
    method text NOT NULL, -- cash, transfer, card, credit
    branch text,
    cashier_id text,
    source_type text, -- POS, ORDER, EXPENSE
    source_id text,
    closing_id uuid, -- Para cortes de caja
    reason text,
    metadata jsonb,
    created_at timestamptz DEFAULT now()
);

-- 2. RPC Transaccional Maestro para Venta POS
CREATE OR REPLACE FUNCTION pos_checkout_transaction(
    p_payload jsonb -- Contiene: customer_id, seller_id, items[], payments[], branch, discount, idempotency_key
)
RETURNS jsonb AS $$
DECLARE
    v_sale_id uuid;
    v_item record;
    v_payment record;
    v_total numeric := 0;
    v_total_cost numeric := 0;
    v_item_json jsonb;
    v_payment_json jsonb;
BEGIN
    -- 1. Verificar idempotencia
    IF EXISTS (SELECT 1 FROM pos_sales WHERE idempotency_key = p_payload->>'idempotency_key') THEN
        RETURN jsonb_build_object('success', true, 'message', 'Duplicate request handled', 'sale_id', (SELECT id FROM pos_sales WHERE idempotency_key = p_payload->>'idempotency_key'));
    END IF;

    -- 2. Calcular Totales antes de insertar
    -- (Opcional: validaciones de stock aquí si no se confía en el frontend)

    -- 3. Insertar Venta
    INSERT INTO pos_sales (
        customer_id, seller_id, branch_id, 
        total, discount, idempotency_key, metadata
    ) VALUES (
        (p_payload->>'customer_id')::uuid,
        (p_payload->>'seller_id')::uuid,
        p_payload->>'branch',
        (p_payload->>'total')::numeric,
        (p_payload->>'discount')::numeric,
        p_payload->>'idempotency_key',
        p_payload->'metadata'
    ) RETURNING id INTO v_sale_id;

    -- 4. Procesar Items e Inventario
    FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_payload->'items')
    LOOP
        -- Consumir inventario (Usa la RPC atómica del paso anterior)
        PERFORM consume_inventory_item(
            (v_item_json->>'id')::uuid,
            (v_item_json->>'quantity')::numeric,
            'POS',
            v_sale_id::text,
            'Venta POS',
            p_payload->>'seller_id'
        );

        -- Insertar linea de venta capturando costos actuales
        INSERT INTO pos_sale_items (
            sale_id, inventory_item_id, name, 
            quantity, unit_price, unit_cost,
            total_price, total_cost, profit
        )
        SELECT 
            v_sale_id, (v_item_json->>'id')::uuid, v_item_json->>'name',
            (v_item_json->>'quantity')::numeric, (v_item_json->>'price')::numeric, cost,
            (v_item_json->>'quantity')::numeric * (v_item_json->>'price')::numeric,
            (v_item_json->>'quantity')::numeric * cost,
            ((v_item_json->>'quantity')::numeric * (v_item_json->>'price')::numeric) - ((v_item_json->>'quantity')::numeric * cost)
        FROM inventory_parts WHERE id = (v_item_json->>'id')::uuid;
    END LOOP;

    -- 5. Procesar Pagos y Movimiento de Caja
    FOR v_payment_json IN SELECT * FROM jsonb_array_elements(p_payload->'payments')
    LOOP
        INSERT INTO cash_movements (
            movement_type, amount, method, 
            branch, cashier_id, source_type, source_id, reason
        ) VALUES (
            'SALE_IN',
            (v_payment_json->>'amount')::numeric,
            v_payment_json->>'method',
            p_payload->>'branch',
            p_payload->>'seller_id',
            'POS',
            v_sale_id::text,
            'Cobro Venta POS'
        );
    END LOOP;

    -- 6. Integración con Órdenes de Reparación y Contabilidad
    FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_payload->'items')
    LOOP
        IF (v_item_json->>'type') = 'ORDER' THEN
            -- Actualizar pagos y estado en la tabla de órdenes tradicional
            UPDATE orders 
            SET 
                payments = coalesce(payments, '[]'::jsonb) || p_payload->'payments',
                status = CASE 
                    WHEN (p_payload->>'total')::numeric >= COALESCE(totalAmount, finalPrice, estimatedCost, 0) THEN 'delivered' 
                    ELSE status 
                END,
                updated_at = extract(epoch from now())::bigint * 1000
            WHERE id = v_item_json->>'id';
        END IF;

        -- Registrar en contabilidad legacy (Accounting Transactions)
        -- Solo para productos/servicios vendidos directamente (no órdenes, que ya tienen su flujo)
        IF (v_item_json->>'type') = 'PRODUCT' THEN
            INSERT INTO accounting_transactions (
                amount, description, transaction_date, 
                created_by, status, source, branch, method
            ) VALUES (
                (v_item_json->>'total_price')::numeric, 
                'Venta POS Directa: ' || (v_item_json->>'name'), 
                now(),
                p_payload->>'seller_id', 
                'COMPLETED', 'STORE', 
                p_payload->>'branch', 
                (p_payload->'payments'->0->>'method')
            );
        END IF;
    END LOOP;

    -- 7. Log de Auditoría Maestro
    INSERT INTO audit_logs (action, details, user_id, created_at)
    VALUES (
        'POS_SALE_COMPLETED',
        format('Venta Finalizada. Total: $%s, Items: %s', p_payload->>'total', jsonb_array_length(p_payload->'items')),
        p_payload->>'seller_id',
        extract(epoch from now())::bigint * 1000
    );

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);
EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Checkout Error: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
