
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

-- 2. RPC Transaccional Maestro para Venta POS (VERSION ROBUSTA V19)
CREATE OR REPLACE FUNCTION pos_checkout_transaction(
    p_payload jsonb -- Contiene: customer_id, seller_id, items[], payments[], branch, discount, idempotency_key, metadata
)
RETURNS jsonb AS $$
DECLARE
    v_sale_id uuid;
    v_item_json jsonb;
    v_payment_json jsonb;
    v_item_id uuid;
    v_customer_id uuid;
    v_real_item_cost numeric;
    v_actual_stock numeric;
BEGIN
    -- 1. Verificar idempotencia
    IF EXISTS (SELECT 1 FROM pos_sales WHERE idempotency_key = p_payload->>'idempotency_key') THEN
        RETURN jsonb_build_object(
            'success', true, 
            'message', 'Duplicate request handled', 
            'sale_id', (SELECT id FROM pos_sales WHERE idempotency_key = p_payload->>'idempotency_key')
        );
    END IF;

    -- 2. Resolver Customer (Safe UUID handling)
    v_customer_id := NULLIF(p_payload->>'customer_id', '')::uuid;
    -- Si no hay ID pero hay datos en metadata, podríamos buscar/crear crm_contacts aquí (Phase 2 logic)

    -- 3. Insertar Venta Principal
    INSERT INTO pos_sales (
        customer_id, seller_id, branch_id, 
        total, discount, idempotency_key, metadata,
        subtotal
    ) VALUES (
        v_customer_id,
        (p_payload->>'seller_id')::uuid,
        p_payload->>'branch',
        (p_payload->>'total')::numeric,
        (p_payload->>'discount')::numeric,
        p_payload->>'idempotency_key',
        p_payload->'metadata',
        COALESCE((p_payload->>'total')::numeric + (p_payload->>'discount')::numeric, (p_payload->>'total')::numeric)
    ) RETURNING id INTO v_sale_id;

    -- 4. Procesar Items (Manejo inteligente de tipos)
    FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_payload->'items')
    LOOP
        v_real_item_cost := COALESCE((v_item_json->>'cost')::numeric, 0);
        
        -- Caso A: Producto de Inventario Real
        IF (v_item_json->>'type') = 'PRODUCT' AND (v_item_json->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_item_id := (v_item_json->>'id')::uuid;
            
            -- Obtener costo y stock actual
            SELECT cost, stock INTO v_real_item_cost, v_actual_stock FROM inventory_parts WHERE id = v_item_id FOR UPDATE;
            
            -- Validar Stock
            IF v_actual_stock < (v_item_json->>'quantity')::numeric THEN
                RAISE EXCEPTION 'Stock insuficiente para %: disponible %, solicitado %', 
                    (v_item_json->>'name'), v_actual_stock, (v_item_json->>'quantity')::numeric;
            END IF;

            -- Descontar Inventario formalmente
            PERFORM consume_inventory_item(
                v_item_id,
                (v_item_json->>'quantity')::numeric,
                'POS'::text,
                v_sale_id::text,
                'Venta POS'::text,
                (p_payload->>'seller_id')::text,
                NULL::text
            );
        ELSE
            -- Caso B: Venta Rápida / Manual / Orden / Crédito
            v_item_id := NULL;
        END IF;

        -- Insertar linea de venta con costo capturado
        INSERT INTO pos_sale_items (
            sale_id, inventory_item_id, name, 
            quantity, unit_price, unit_cost,
            total_price, total_cost, profit
        ) VALUES (
            v_sale_id, v_item_id, v_item_json->>'name',
            (v_item_json->>'quantity')::numeric, (v_item_json->>'price')::numeric, v_real_item_cost,
            (v_item_json->>'quantity')::numeric * (v_item_json->>'price')::numeric,
            (v_item_json->>'quantity')::numeric * v_real_item_cost,
            ((v_item_json->>'quantity')::numeric * (v_item_json->>'price')::numeric) - ((v_item_json->>'quantity')::numeric * v_real_item_cost)
        );

        -- Lógica extra para Órdenes
        IF (v_item_json->>'type') = 'ORDER' THEN
             UPDATE orders 
             SET 
                 status = CASE 
                     WHEN (v_item_json->>'price')::numeric >= COALESCE("finalPrice", 0) THEN 'Entregado' 
                     ELSE status 
                 END,
                 "completedAt" = CASE WHEN (v_item_json->>'price')::numeric >= COALESCE("finalPrice", 0) THEN extract(epoch from now())::bigint * 1000 ELSE "completedAt" END
             WHERE id = v_item_json->>'id';
             -- Los pagos de órdenes ya se registran en cash_movements en el paso 5.
        END IF;
    END LOOP;

    -- 5. Procesar Pagos y Movimiento de Caja (Phase 3)
    FOR v_payment_json IN SELECT * FROM jsonb_array_elements(p_payload->'payments')
    LOOP
        -- Solo crear movimiento de caja si el método NO es CREDIT (Phase 3)
        IF (v_payment_json->>'method') != 'CREDIT' THEN
            INSERT INTO cash_movements (
                movement_type, amount, method, 
                branch, cashier_id, source_type, source_id, reason
            ) VALUES (
                CASE 
                    WHEN (v_payment_json->>'amount')::numeric < 0 THEN 'REFUND_OUT'
                    ELSE 'SALE_IN'
                END,
                (v_payment_json->>'amount')::numeric,
                v_payment_json->>'method',
                p_payload->>'branch',
                p_payload->>'seller_id',
                'POS',
                v_sale_id::text,
                CASE 
                    WHEN (v_payment_json->>'amount')::numeric < 0 THEN 'Reembolso POS'
                    ELSE 'Venta POS'
                END
            );
        ELSE
            -- Manejo de Crédito (Phase 3)
            -- Actualizar client_credits o insertar en tabla de deuda
            IF v_customer_id IS NOT NULL THEN
                INSERT INTO client_credits (
                    contact_id, amount, source_type, source_id, branch_id
                ) VALUES (
                    v_customer_id,
                    (v_payment_json->>'amount')::numeric,
                    'POS',
                    v_sale_id::text,
                    p_payload->>'branch'
                );
                
                -- Actualizar estado de pago de la venta
                UPDATE pos_sales SET payment_status = 'partial' WHERE id = v_sale_id;
            END IF;
        END IF;
    END LOOP;

    -- 6. Procesar Equipos Recibidos (Cambiazo)
    IF p_payload ? 'received_items' THEN
        FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_payload->'received_items')
        LOOP
             INSERT INTO inventory_parts (
                name, stock, cost, price, category, status, created_by
            ) VALUES (
                v_item_json->>'name', 1, (v_item_json->>'value')::numeric, (v_item_json->>'value')::numeric,
                jsonb_build_object('received_via', 'EXCHANGE', 'sale_id', v_sale_id),
                'available', (p_payload->>'seller_id')::uuid
            ) RETURNING id INTO v_item_id;

            INSERT INTO inventory_movements (
                item_id, movement_type, quantity, stock_before, stock_after, 
                unit_cost, reason, created_by, source_type, source_id
            ) VALUES (
                v_item_id, 'IN', 1, 0, 1, 
                (v_item_json->>'value')::numeric, 'Cambiazo', (p_payload->>'seller_id')::uuid, 'POS', v_sale_id::text
            );
            
            -- El equipo recibido TAMBIÉN se registra en cash_movements como un movimiento tipo CAMBIAZO_IN
            -- pero con efecto neto 0 en caja física (metadata marcará que fue especie)
            INSERT INTO cash_movements (
                movement_type, amount, method, branch, cashier_id, source_type, source_id, reason, metadata
            ) VALUES (
                'CAMBIAZO_IN', (v_item_json->>'value')::numeric, 'EXCHANGE', p_payload->>'branch', 
                p_payload->>'seller_id', 'POS', v_sale_id::text, 'Equipo recibido por canje', 
                jsonb_build_object('item_id', v_item_id)
            );
        END LOOP;
    END IF;

    -- 7. Auditoría
    INSERT INTO audit_logs (action, details, user_id, created_at)
    VALUES (
        'POS_SALE_COMPLETED',
        format('Venta POS #%s finalizada.', v_sale_id),
        p_payload->>'seller_id',
        extract(epoch from now())::bigint * 1000
    );

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);
EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

