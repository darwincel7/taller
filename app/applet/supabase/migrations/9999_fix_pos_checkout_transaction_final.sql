-- RPC Transaccional Maestro para Venta POS
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
                'POS',
                v_sale_id::text,
                'Venta POS',
                p_payload->>'seller_id'
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
                     WHEN (v_item_json->>'price')::numeric >= COALESCE("totalAmount", COALESCE("finalPrice", COALESCE("estimatedCost", 0))) THEN 'Entregado' 
                     ELSE status 
                 END,
                 "completedAt" = CASE 
                     WHEN (v_item_json->>'price')::numeric >= COALESCE("totalAmount", COALESCE("finalPrice", COALESCE("estimatedCost", 0))) THEN extract(epoch from now())::bigint * 1000
                     ELSE "completedAt"
                 END
             WHERE id = v_item_json->>'id';
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
                    WHEN (v_payment_json->>'amount')::numeric < 0 THEN 'Reembolso POS rápida/venta'
                    WHEN (v_payment_json->>'method') = 'CAMBIAZO' THEN 'Pago con Cambiazo (Intercambio equipo)'
                    ELSE 'Pago Recibido en Venta POS'
                END
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', sqlerrm);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
