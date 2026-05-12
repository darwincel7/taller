import React, { useState } from 'react';
import { Database, Copy, X, CheckCircle2, AlertTriangle } from 'lucide-react';

const SQL_MIGRATION = `
BEGIN;

-- 1. Create base tables just in case they are missing
CREATE TABLE IF NOT EXISTS inventory_parts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    stock numeric DEFAULT 0,
    cost numeric DEFAULT 0,
    price numeric DEFAULT 0,
    category jsonb,
    sku text,
    image_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    status text DEFAULT 'active',
    deleted_at timestamptz,
    deleted_by text,
    created_by text
);

CREATE TABLE IF NOT EXISTS crm_contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text,
    phone text,
    email text,
    type text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id uuid REFERENCES inventory_parts(id) ON DELETE CASCADE,
    movement_type text NOT NULL,
    quantity numeric NOT NULL,
    before_stock numeric NOT NULL,
    after_stock numeric NOT NULL,
    unit_cost numeric,
    unit_price numeric,
    source_type text,
    source_id text,
    reason text,
    created_by text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_sales (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    readable_id serial,
    customer_id uuid,
    seller_id text,
    branch_id text,
    subtotal numeric DEFAULT 0,
    discount numeric DEFAULT 0,
    tax numeric DEFAULT 0,
    total numeric NOT NULL,
    payment_status text DEFAULT 'paid',
    status text DEFAULT 'completed',
    metadata jsonb,
    idempotency_key text UNIQUE,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_sale_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id uuid REFERENCES pos_sales(id) ON DELETE CASCADE,
    inventory_item_id uuid,
    name text NOT NULL,
    quantity numeric NOT NULL,
    unit_price numeric NOT NULL,
    unit_cost numeric NOT NULL,
    total_price numeric NOT NULL,
    total_cost numeric NOT NULL,
    profit numeric NOT NULL,
    metadata jsonb
);

CREATE TABLE IF NOT EXISTS cash_movements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    movement_type text NOT NULL,
    amount numeric NOT NULL,
    method text NOT NULL,
    branch text,
    cashier_id text,
    source_type text,
    source_id text,
    closing_id text,
    reason text,
    metadata jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_credits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_id uuid,
    amount numeric DEFAULT 0,
    source_type text,
    source_id text,
    branch_id text,
    status text DEFAULT 'pending',
    type text,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 2. Drop dependent views
DROP VIEW IF EXISTS public.v_sales_unified CASCADE;

-- 3. Apply V25 Migrations (Adding missing columns if they already exist but lack them)
ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE public.inventory_parts ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.inventory_parts ALTER COLUMN created_by TYPE text USING created_by::text;

ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS before_stock numeric DEFAULT 0;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS after_stock numeric DEFAULT 0;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.inventory_movements ALTER COLUMN created_by TYPE text USING created_by::text;

ALTER TABLE public.pos_sale_items ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'paid';
ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';
ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.cash_movements ALTER COLUMN closing_id TYPE text USING closing_id::text;
ALTER TABLE public.cash_movements ALTER COLUMN cashier_id TYPE text USING cashier_id::text;

ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0;
ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS branch_id text;
ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS client_phone text;
ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS due_date timestamptz;
ALTER TABLE public.client_credits ADD COLUMN IF NOT EXISTS cashier_name text;
ALTER TABLE public.client_credits ALTER COLUMN client_name DROP NOT NULL;
ALTER TABLE public.client_credits ALTER COLUMN client_phone DROP NOT NULL;
ALTER TABLE public.client_credits ALTER COLUMN due_date DROP NOT NULL;
ALTER TABLE public.client_credits ALTER COLUMN cashier_name DROP NOT NULL;
ALTER TABLE public.client_credits ALTER COLUMN cashier_id DROP NOT NULL;
ALTER TABLE public.client_credits DROP CONSTRAINT IF EXISTS client_credits_status_check;

-- 4. Recreate dependent view
CREATE VIEW public.v_sales_unified AS
-- A. Ventas desde el POS Rápido
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

-- B. Pagos de Órdenes de Taller (Workshop Revenue y Refunds)
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

BEGIN;
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
    v_product_id uuid;
    v_item_id uuid;
    v_order_id uuid;
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
                contact_id, client_name, client_phone, due_date, amount, source_type, source_id, branch_id, status, type, notes
            ) VALUES (
                (CASE WHEN p_payload->>'raw_customer_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p_payload->>'raw_customer_id')::uuid ELSE NULL END),
                COALESCE(p_payload->>'customer_name', 'Cliente POS'),
                COALESCE(p_payload->>'customer_phone', '00000000'),
                (CASE WHEN p_payload->>'credit_due_date' IS NOT NULL AND p_payload->>'credit_due_date' != '' THEN (p_payload->>'credit_due_date')::timestamptz ELSE NULL END),
                (v_payment_json->>'amount')::numeric,
                'POS',
                v_sale_id::text,
                p_payload->>'branch',
                'PENDING',
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
                v_item_json->>'name', 0, 0, 0,
                jsonb_build_object('type', 'STORE_PRODUCT', 'brand', 'Generico', 'model', v_item_json->>'name'),
                'active', p_payload->>'seller_id'
             ) RETURNING id INTO v_product_id;

             INSERT INTO inventory_parts (
                name, stock, cost, price, category, status, created_by
            ) VALUES (
                v_item_json->>'name', 1, (v_item_json->>'value')::numeric, (v_item_json->>'value')::numeric,
                jsonb_build_object(
                    'type', 'STORE_ITEM',
                    'parentId', v_product_id,
                    'imei', v_item_json->'details'->>'imei',
                    'condition', v_item_json->'details'->>'deviceCondition',
                    'supplier_id', (CASE WHEN p_payload->>'raw_customer_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_payload->>'raw_customer_id' ELSE 'POS_CAMBIAZO' END),
                    'received_via', 'EXCHANGE',
                    'sale_id', v_sale_id,
                    'details', v_item_json->'details'
                ),
                'active', p_payload->>'seller_id'
            ) RETURNING id INTO v_item_id;

            INSERT INTO inventory_movements (
                item_id, movement_type, quantity, before_stock, after_stock, 
                unit_cost, reason, created_by, source_type, source_id
            ) VALUES (
                v_item_id, 'IN', 1, 0, 1, 
                (v_item_json->>'value')::numeric, 'Cambiazo POS', p_payload->>'seller_id', 'POS', v_sale_id::text
            );
            
            INSERT INTO orders (
                "customerId", customer, "deviceModel", status, "orderType",
                "totalAmount", "finalPrice", payments, "currentBranch", "cashierId",
                "purchaseCost", "devicePassword", "accessories", "deviceIssue", "devicePhoto", "deviceCondition", "imei",
                "history"
            ) VALUES (
                (CASE WHEN p_payload->>'raw_customer_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p_payload->>'raw_customer_id')::uuid ELSE NULL END),
                jsonb_build_object('name', COALESCE(p_payload->>'customer_name', 'Cliente POS'), 'phone', COALESCE(p_payload->>'customer_phone', '00000000')),
                v_item_json->>'name',
                'Pendiente',
                'RECIBIDOS',
                (v_item_json->>'value')::numeric,
                (v_item_json->>'value')::numeric,
                '[]'::jsonb,
                p_payload->>'branch',
                p_payload->>'seller_id',
                (v_item_json->>'value')::numeric,
                v_item_json->'details'->>'devicePassword',
                v_item_json->'details'->>'accessories',
                v_item_json->'details'->>'deviceIssue',
                v_item_json->'details'->>'devicePhoto',
                v_item_json->'details'->>'deviceCondition',
                v_item_json->'details'->>'imei',
                jsonb_build_array(
                    jsonb_build_object(
                        'id', gen_random_uuid(),
                        'action_type', 'ORDER_CREATED',
                        'note', 'Equipo recibido (Cambiazo). Valor a favor para el cliente: $' || (v_item_json->>'value')::numeric || '. Entregado a cambio de: ' || (SELECT string_agg(item->>'name' || ' ($' || (item->>'price')::text || ')', ', ') FROM jsonb_array_elements(p_payload->'cart') as item),
                        'technician', COALESCE(p_payload->>'seller_name', 'Vendedor POS'),
                        'date', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                        'is_internal', false
                    )
                )
            ) RETURNING id INTO v_order_id;
            
             INSERT INTO cash_movements (
                movement_type, amount, method, branch, cashier_id, source_type, source_id, reason, metadata
            ) VALUES (
                'CAMBIAZO_IN', (v_item_json->>'value')::numeric, 'EXCHANGE', p_payload->>'branch', 
                p_payload->>'seller_id', 'ORDER', v_order_id::text, 'Equipo recibido por canje', 
                jsonb_build_object('item_id', v_item_id, 'pos_sale_id', v_sale_id, 'order_id', v_order_id)
            );

            INSERT INTO accounting_transactions (
                amount, transaction_date, description, category_id, vendor, status, source, expense_destination, created_by, branch, order_id
            ) VALUES (
                -((v_item_json->>'value')::numeric),
                CURRENT_DATE,
                'Cambio equipo: ' || (v_item_json->>'name'),
                '47c20ad7-8947-46ce-8f27-7cfd7b13c2eb',
                COALESCE(p_payload->>'customer_name', 'Cliente POS'),
                'COMPLETED',
                'STORE',
                'STORE',
                p_payload->>'seller_id',
                p_payload->>'branch',
                v_order_id::text
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

BEGIN;
UPDATE public.client_credits SET status = 'PENDING' WHERE status = 'pending';
COMMIT;
`;

export const DbFixModal = ({ onClose }: { onClose: () => void }) => {
  const [copied, setCopied] = useState(false);

  const copySql = () => {
    navigator.clipboard.writeText(SQL_MIGRATION);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            <h2 className="font-bold text-slate-800 dark:text-white">Plan V26 - Crear Tablas y Migrar</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800/30 dark:text-amber-300 p-4 rounded-xl mb-6 text-sm">
            <h3 className="font-bold flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4"/> 
              Importante (V30) - Corrección Historial Cambiazo
            </h3>
            <p className="mb-2">Añadido el registro de por qué artículo(s) se intercambió y cuál fue el valor exacto del cambiazo en la historia de la orden para mayor rastro. Haz clic de nuevo para aplicar esta corrección.</p>
          </div>

          <div className="relative group">
            <button 
              onClick={copySql}
              className="absolute top-4 right-4 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition text-xs font-bold shadow-lg z-10"
            >
              {copied ? <><CheckCircle2 className="w-4 h-4" /> ¡COPIADO!</> : <><Copy className="w-4 h-4"/> COPIAR SQL COMPLETO</>}
            </button>
            <pre className="bg-slate-950 text-green-400 p-6 rounded-xl overflow-x-auto text-xs font-mono border border-slate-800 max-h-[400px]">
              {SQL_MIGRATION}
            </pre>
          </div>
        </div>
        
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-900/50">
          <button onClick={onClose} className="px-6 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
