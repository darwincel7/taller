BEGIN;

DROP VIEW IF EXISTS public.v_sales_unified CASCADE;

ALTER TABLE IF EXISTS pos_sales ALTER COLUMN seller_id TYPE text;

CREATE OR REPLACE FUNCTION pos_checkout_transaction(
    p_payload jsonb -- Contiene: customer_id, seller_id, items[], payments[], branch, discount, idempotency_key, metadata
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
    -- 1. Verificar idempotencia
    IF EXISTS (SELECT 1 FROM pos_sales WHERE idempotency_key = p_payload->>'idempotency_key') THEN
        RETURN jsonb_build_object(
            'success', true, 
            'message', 'Duplicate request handled', 
            'sale_id', (SELECT id FROM pos_sales WHERE idempotency_key = p_payload->>'idempotency_key')
        );
    END IF;

    -- 2. Resolver Customer
    v_customer_id := p_payload->>'customer_id';

    -- 3. Insertar Venta Principal
    INSERT INTO pos_sales (
        customer_id, seller_id, branch_id, 
        total, discount, idempotency_key, metadata,
        subtotal
    ) VALUES (
        (CASE WHEN v_customer_id IS NOT NULL AND v_customer_id != '' AND length(v_customer_id) = 36 THEN v_customer_id::uuid ELSE NULL END),
        p_payload->>'seller_id',
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
                     WHEN (v_item_json->>'price')::numeric >= (COALESCE("finalPrice", 0) - COALESCE((SELECT SUM((p->>'amount')::numeric) FROM jsonb_array_elements(payments) p), 0)) THEN 'Entregado' 
                     ELSE status 
                 END,
                 "completedAt" = CASE WHEN (v_item_json->>'price')::numeric >= (COALESCE("finalPrice", 0) - COALESCE((SELECT SUM((p->>'amount')::numeric) FROM jsonb_array_elements(payments) p), 0)) THEN extract(epoch from now())::bigint * 1000 ELSE "completedAt" END
             WHERE id = v_item_json->>'id';
        END IF;
    END LOOP;

    -- 5. Procesar Pagos y Movimiento de Caja 
    FOR v_payment_json IN SELECT * FROM jsonb_array_elements(p_payload->'payments')
    LOOP
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
            IF v_customer_id IS NOT NULL AND v_customer_id != '' AND length(v_customer_id) = 36 THEN
                INSERT INTO client_credits (
                    contact_id, amount, source_type, source_id, branch_id
                ) VALUES (
                    v_customer_id::uuid,
                    (v_payment_json->>'amount')::numeric,
                    'POS',
                    v_sale_id::text,
                    p_payload->>'branch'
                );
                
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
                'available', p_payload->>'seller_id'
            ) RETURNING id INTO v_item_id;

            INSERT INTO inventory_movements (
                item_id, movement_type, quantity, stock_before, stock_after, 
                unit_cost, reason, created_by, source_type, source_id
            ) VALUES (
                v_item_id, 'IN', 1, 0, 1, 
                (v_item_json->>'value')::numeric, 'Cambiazo', p_payload->>'seller_id', 'POS', v_sale_id::text
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


CREATE VIEW public.v_sales_unified AS
SELECT 
    ps.id::text as source_id,
    ps.id::text as source_item_id,
    'POS' as source_type,
    NULL as order_id,
    ps.id::text as navigation_id,
    ps.created_at,
    COALESCE(ps.branch_id, 'T4') as branch,
    ps.seller_id::text as user_id,
    COALESCE(c.full_name, 'Venta al Publico') as customer_name,
    'Venta POS' as description,
    ps.total as gross_amount,
    COALESCE((SELECT sum(total_cost) FROM public.pos_sale_items WHERE sale_id = ps.id), 0) as cost_amount,
    ps.total - COALESCE((SELECT sum(total_cost) FROM public.pos_sale_items WHERE sale_id = ps.id), 0) as net_profit,
    COALESCE((SELECT cm.method FROM public.cash_movements cm WHERE cm.source_id = ps.id::text AND cm.method != 'OUT' LIMIT 1), 'CASH') as payment_method,
    COALESCE((SELECT sum(amount) FROM public.cash_movements cm WHERE cm.source_id = ps.id::text AND cm.method NOT IN ('CREDIT', 'EXCHANGE', 'CAMBIAZO')), 0) as cash_effect_amount,
    COALESCE(ps.total < 0 OR ps.status = 'refunded', false) as is_refund,
    EXISTS(SELECT 1 FROM public.cash_movements WHERE source_id = ps.id::text AND method = 'CREDIT') as is_credit,
    EXISTS(SELECT 1 FROM public.cash_movements WHERE source_id = ps.id::text AND method IN ('EXCHANGE', 'CAMBIAZO')) as is_cambiazo,
    ps.status,
    ps.readable_id::text as readable_id
FROM 
    public.pos_sales ps
LEFT JOIN
    public.crm_contacts c ON ps.customer_id = c.id
WHERE 
    ps.status = 'completed'

UNION ALL

SELECT 
    op.id::text as source_id,
    op.id::text as source_item_id,
    CASE WHEN op.is_refund THEN 'WORKSHOP_REFUND' ELSE 'WORKSHOP' END as source_type,
    o.id::text as order_id,
    o.id::text as navigation_id,
    to_timestamp(op.created_at / 1000.0) as created_at,
    COALESCE(o."currentBranch", 'T4') as branch,
    op.cashier_id as user_id,
    COALESCE(o.customer->>'name', 'Cliente Taller') as customer_name,
    (CASE WHEN op.is_refund THEN 'Reembolso: ' ELSE 'Pago Taller: ' END) || COALESCE(o."deviceModel", 'Equipo') as description,
    op.amount as gross_amount,
    
    CASE WHEN op.is_refund THEN 0 
    ELSE
    ROUND(
        (
            COALESCE(o."partsCost", 0) 
            + 
            COALESCE((
                SELECT sum((e->>'amount')::numeric) 
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.expenses) = 'array' THEN o.expenses ELSE '[]'::jsonb END) e 
                WHERE e->>'amount' IS NOT NULL
            ), 0)
        ) 
        * 
        (
            abs(op.amount) 
            / NULLIF(
                COALESCE(
                    NULLIF(o."totalAmount", 0), 
                    NULLIF(o."finalPrice", 0), 
                    NULLIF(o."estimatedCost", 0), 
                    (SELECT sum(amount) FROM public.order_payments WHERE order_id = o.id AND NOT is_refund) 
                ), 0
            )
        )
    , 2)
    END as cost_amount,

    op.amount - 
    (CASE WHEN op.is_refund THEN 0 
    ELSE
    ROUND(
        (
            COALESCE(o."partsCost", 0) 
            + 
            COALESCE((
                SELECT sum((e->>'amount')::numeric) 
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.expenses) = 'array' THEN o.expenses ELSE '[]'::jsonb END) e 
                WHERE e->>'amount' IS NOT NULL
            ), 0)
        ) 
        * 
        (
            abs(op.amount) 
            / NULLIF(
                COALESCE(
                    NULLIF(o."totalAmount", 0), 
                    NULLIF(o."finalPrice", 0), 
                    NULLIF(o."estimatedCost", 0), 
                    (SELECT sum(amount) FROM public.order_payments WHERE order_id = o.id AND NOT is_refund)
                ), 0
            )
        )
    , 2)
    END) as net_profit,

    op.method as payment_method,
    
    CASE 
        WHEN op.method = 'CREDIT' THEN 0
        WHEN op.method IN ('EXCHANGE', 'CAMBIAZO') THEN 0
        WHEN op.is_refund THEN -abs(op.amount)
        ELSE op.amount
    END as cash_effect_amount,
    
    op.is_refund,
    op.method = 'CREDIT' as is_credit,
    op.method IN ('EXCHANGE', 'CAMBIAZO') as is_cambiazo,
    'completed' as status,
    o.readable_id::text as readable_id
FROM 
    public.order_payments op
JOIN 
    public.orders o ON op.order_id = o.id;

GRANT SELECT ON public.v_sales_unified TO authenticated;
GRANT SELECT ON public.v_sales_unified TO service_role;

COMMIT;
