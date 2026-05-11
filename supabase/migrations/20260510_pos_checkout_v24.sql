BEGIN;

ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS deleted_by text;

ALTER TABLE public.cash_movements ALTER COLUMN closing_id TYPE text USING closing_id::text;
ALTER TABLE IF EXISTS public.inventory_movements ALTER COLUMN created_by TYPE text;

DROP FUNCTION IF EXISTS consume_inventory_item(uuid, numeric, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS consume_inventory_item(uuid, numeric, text, text, text, text, text);

CREATE OR REPLACE FUNCTION consume_inventory_item(
    p_item_id uuid,
    p_quantity numeric,
    p_source_type text,
    p_source_id text,
    p_reason text,
    p_user_id text,
    p_order_details text DEFAULT NULL
) 
RETURNS boolean AS $$
DECLARE
    v_current_stock numeric;
    v_unit_cost numeric;
    v_unit_price numeric;
BEGIN
    SELECT stock, cost, price INTO v_current_stock, v_unit_cost, v_unit_price
    FROM inventory_parts 
    WHERE id = p_item_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item de inventario no existe: %', p_item_id;
    END IF;

    IF v_current_stock < p_quantity THEN
        RAISE EXCEPTION 'Stock insuficiente para % (Disponible: %, Requerido: %)', p_item_id, v_current_stock, p_quantity;
    END IF;

    UPDATE inventory_parts 
    SET stock = stock - p_quantity,
        updated_at = now()
    WHERE id = p_item_id;

    INSERT INTO inventory_movements (
        item_id, movement_type, quantity, 
        before_stock, after_stock, 
        unit_cost, unit_price,
        source_type, source_id, reason, created_by
    ) VALUES (
        p_item_id, 'SALE', p_quantity,
        v_current_stock, v_current_stock - p_quantity,
        v_unit_cost, v_unit_price,
        p_source_type, p_source_id, p_reason, p_user_id
    );

    BEGIN
        INSERT INTO audit_logs (action, details, user_id, created_at)
        VALUES (
            'INVENTORY_EXTRACTION',
            format('Extracción ATÓMICA: %s x Item %s. %s', p_quantity, p_item_id, coalesce(p_order_details, '')),
            p_user_id,
            extract(epoch from now())::bigint * 1000
        );
    EXCEPTION WHEN others THEN
    END;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION pos_checkout_transaction(
    p_payload jsonb 
)
RETURNS jsonb AS $$
DECLARE
    v_sale_id uuid;
    v_item_json jsonb;
    v_payment_json jsonb;
    v_item_id uuid;
    v_customer_id text;
    v_real_item_cost numeric;
    v_actual_stock numeric;
BEGIN
    IF EXISTS (SELECT 1 FROM pos_sales WHERE idempotency_key = p_payload->>'idempotency_key') THEN
        RETURN jsonb_build_object(
            'success', true, 
            'message', 'Duplicate request handled', 
            'sale_id', (SELECT id FROM pos_sales WHERE idempotency_key = p_payload->>'idempotency_key')
        );
    END IF;

    v_customer_id := p_payload->>'customer_id';

    INSERT INTO pos_sales (
        customer_id, seller_id, branch_id, 
        total, discount, idempotency_key, metadata,
        subtotal, status, payment_status
    ) VALUES (
        (CASE WHEN v_customer_id IS NOT NULL AND v_customer_id != '' AND v_customer_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_customer_id::uuid ELSE NULL END),
        p_payload->>'seller_id',
        p_payload->>'branch',
        (p_payload->>'total')::numeric,
        (p_payload->>'discount')::numeric,
        p_payload->>'idempotency_key',
        CASE 
            WHEN p_payload->>'raw_customer_id' IS NOT NULL AND NOT (p_payload->>'raw_customer_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') 
            THEN COALESCE(p_payload->'metadata', '{}'::jsonb) || jsonb_build_object('raw_customer_id', p_payload->>'raw_customer_id', 'customer_name', p_payload->>'customer_name', 'customer_phone', p_payload->>'customer_phone')
            ELSE p_payload->'metadata' 
        END,
        COALESCE((p_payload->>'total')::numeric + (p_payload->>'discount')::numeric, (p_payload->>'total')::numeric),
        'completed',
        CASE WHEN (SELECT count(*) FROM jsonb_array_elements(p_payload->'payments') p WHERE p->>'method' = 'CREDIT') > 0 THEN 'partial' ELSE 'paid' END
    ) RETURNING id INTO v_sale_id;

    FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_payload->'items')
    LOOP
        v_real_item_cost := COALESCE((v_item_json->>'cost')::numeric, 0);
        
        IF (v_item_json->>'type') = 'PRODUCT' AND (v_item_json->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND NOT (v_item_json->>'id' LIKE 'PROD-%') THEN
            v_item_id := (v_item_json->>'id')::uuid;
            
            SELECT cost, stock INTO v_real_item_cost, v_actual_stock FROM inventory_parts WHERE id = v_item_id FOR UPDATE;
            
            IF NOT FOUND THEN
                 RAISE EXCEPTION 'Articulo de inventario no encontrado: %', v_item_json->>'name';
            END IF;

            IF v_actual_stock < (v_item_json->>'quantity')::numeric THEN
                RAISE EXCEPTION 'Stock insuficiente para %: disponible %, solicitado %', 
                    (v_item_json->>'name'), v_actual_stock, (v_item_json->>'quantity')::numeric;
            END IF;

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
            v_item_id := NULL;
        END IF;

        INSERT INTO pos_sale_items (
            sale_id, inventory_item_id, name, 
            quantity, unit_price, unit_cost,
            total_price, total_cost, profit, metadata
        ) VALUES (
            v_sale_id, v_item_id, v_item_json->>'name',
            (v_item_json->>'quantity')::numeric, (v_item_json->>'price')::numeric, v_real_item_cost,
            (v_item_json->>'quantity')::numeric * (v_item_json->>'price')::numeric,
            (v_item_json->>'quantity')::numeric * v_real_item_cost,
            ((v_item_json->>'quantity')::numeric * (v_item_json->>'price')::numeric) - ((v_item_json->>'quantity')::numeric * v_real_item_cost),
            jsonb_build_object('original_item_id', v_item_json->>'id', 'type', v_item_json->>'type')
        );

        IF (v_item_json->>'type') = 'ORDER' THEN
             UPDATE orders 
             SET 
                 status = CASE 
                     WHEN (v_item_json->>'price')::numeric >= (COALESCE("finalPrice", 0) - COALESCE((SELECT SUM((p->>'amount')::numeric) FROM jsonb_array_elements(payments) p), 0)) THEN 'Entregado' 
                     ELSE status 
                 END,
                 "completedAt" = CASE WHEN (v_item_json->>'price')::numeric >= (COALESCE("finalPrice", 0) - COALESCE((SELECT SUM((p->>'amount')::numeric) FROM jsonb_array_elements(payments) p), 0)) THEN extract(epoch from now())::bigint * 1000 ELSE "completedAt" END
             WHERE id = v_item_json->>'id';
        END IF;
    END LOOP;

    FOR v_payment_json IN SELECT * FROM jsonb_array_elements(p_payload->'payments')
    LOOP
        IF (v_payment_json->>'method') IN ('CASH', 'CARD', 'TRANSFER', 'OTHER') THEN
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
        ELSIF (v_payment_json->>'method') = 'CREDIT' THEN
            INSERT INTO client_credits (
                contact_id, amount, source_type, source_id, branch_id, status, type, notes
            ) VALUES (
                (CASE WHEN p_payload->>'raw_customer_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p_payload->>'raw_customer_id')::uuid ELSE NULL END),
                (v_payment_json->>'amount')::numeric,
                'POS',
                v_sale_id::text,
                p_payload->>'branch',
                'pending',
                'SALE_DEBT',
                'Crédito Venta POS. Cliente: ' || COALESCE(p_payload->>'customer_name', 'Desconocido')
            );
        END IF;
    END LOOP;

    IF p_payload ? 'received_items' THEN
        FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_payload->'received_items')
        LOOP
             INSERT INTO inventory_parts (
                name, stock, cost, price, category, status, created_by
            ) VALUES (
                v_item_json->>'name', 1, (v_item_json->>'value')::numeric, (v_item_json->>'value')::numeric,
                jsonb_build_object('received_via', 'EXCHANGE', 'sale_id', v_sale_id, 'details', v_item_json->'details'),
                'active', p_payload->>'seller_id'
            ) RETURNING id INTO v_item_id;

            INSERT INTO inventory_movements (
                item_id, movement_type, quantity, before_stock, after_stock, 
                unit_cost, reason, created_by, source_type, source_id
            ) VALUES (
                v_item_id, 'IN', 1, 0, 1, 
                (v_item_json->>'value')::numeric, 'Cambiazo POS', p_payload->>'seller_id', 'POS', v_sale_id::text
            );
            
             INSERT INTO cash_movements (
                movement_type, amount, method, branch, cashier_id, source_type, source_id, reason, metadata
            ) VALUES (
                'CAMBIAZO_IN', (v_item_json->>'value')::numeric, 'EXCHANGE', p_payload->>'branch', 
                p_payload->>'seller_id', 'POS', v_sale_id::text, 'Equipo recibido por canje', 
                jsonb_build_object('item_id', v_item_id)
            );
        END LOOP;
    END IF;

    BEGIN
        INSERT INTO audit_logs (action, details, user_id, created_at)
        VALUES (
            'POS_SALE_COMPLETED',
            format('Venta POS #%s finalizada.', v_sale_id),
            p_payload->>'seller_id',
            extract(epoch from now())::bigint * 1000
        );
    EXCEPTION WHEN others THEN
    END;

    RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);
EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
