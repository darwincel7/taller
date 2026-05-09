
-- 1. Movimiento formal de inventario (Ledger)
CREATE TABLE IF NOT EXISTS inventory_movements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id uuid REFERENCES inventory_parts(id) ON DELETE CASCADE,
    movement_type text NOT NULL, -- IN, OUT, SALE, RETURN, ADJUSTMENT, TRANSFER, CAMBIAZO_IN
    quantity numeric NOT NULL,
    before_stock numeric NOT NULL,
    after_stock numeric NOT NULL,
    unit_cost numeric,
    unit_price numeric,
    source_type text, -- POS, ORDER, CAMBIAZO, MANUAL, RETURN
    source_id text,
    reason text,
    created_by text,
    created_at timestamptz DEFAULT now()
);

-- 2. Asegurar columnas necesarias en inventory_parts (Refuerzo)
ALTER TABLE inventory_parts ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE inventory_parts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE inventory_parts ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE inventory_parts ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'; -- active, archived, sold
ALTER TABLE inventory_parts ADD COLUMN IF NOT EXISTS item_type text; -- PART, DEVICE, ITEM
ALTER TABLE inventory_parts ADD COLUMN IF NOT EXISTS imei text;
ALTER TABLE inventory_parts ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE inventory_parts ADD COLUMN IF NOT EXISTS image_url text;

-- 3. Secuencia para readable_id (SKU/ID Atómico)
CREATE SEQUENCE IF NOT EXISTS inventory_readable_id_seq START 1000;

-- 4. RPC: Consumo Atómico de Inventario
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
    v_category jsonb;
BEGIN
    -- Bloquear la fila para evitar concurrencia
    SELECT stock, cost, price, category INTO v_current_stock, v_unit_cost, v_unit_price, v_category
    FROM inventory_parts 
    WHERE id = p_item_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item no existe';
    END IF;

    -- Validar stock suficiente
    IF v_current_stock < p_quantity THEN
        RAISE EXCEPTION 'Stock insuficiente para % (Disponible: %, Requerido: %)', p_item_id, v_current_stock, p_quantity;
    END IF;

    -- Actualizar stock
    UPDATE inventory_parts 
    SET stock = stock - p_quantity,
        updated_at = now()
    WHERE id = p_item_id;

    -- Insertar movimiento en el ledger
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

    -- Registrar auditoria
    INSERT INTO audit_logs (action, details, user_id, created_at)
    VALUES (
        'INVENTORY_EXTRACTION',
        format('Extracción ATÓMICA: %s x Item %s. %s', p_quantity, p_item_id, coalesce(p_order_details, '')),
        p_user_id,
        extract(epoch from now())::bigint * 1000
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: Ajuste de Inventario Auditado
CREATE OR REPLACE FUNCTION adjust_inventory_stock(
    p_item_id uuid,
    p_quantity numeric,
    p_movement_type text, -- IN, OUT, ADJUSTMENT
    p_reason text,
    p_user_id text
) 
RETURNS boolean AS $$
DECLARE
    v_current_stock numeric;
    v_unit_cost numeric;
BEGIN
    -- Bloquear la fila
    SELECT stock, cost INTO v_current_stock, v_unit_cost
    FROM inventory_parts 
    WHERE id = p_item_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item no existe';
    END IF;

    -- Actualizar stock
    UPDATE inventory_parts 
    SET stock = stock + p_quantity,
        updated_at = now()
    WHERE id = p_item_id;

    -- Insertar movimiento
    INSERT INTO inventory_movements (
        item_id, movement_type, quantity, 
        before_stock, after_stock, 
        unit_cost, reason, created_by
    ) VALUES (
        p_item_id, p_movement_type, p_quantity,
        v_current_stock, v_current_stock + p_quantity,
        v_unit_cost, p_reason, p_user_id
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Crear Item con SKU Atómico
CREATE OR REPLACE FUNCTION create_inventory_item(
    p_name text,
    p_stock numeric,
    p_cost numeric,
    p_price numeric,
    p_category text,
    p_user_id text,
    p_sku text DEFAULT NULL,
    p_image_url text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    v_new_id uuid;
    v_readable_id int;
    v_final_category jsonb;
BEGIN
    v_readable_id := nextval('inventory_readable_id_seq');
    
    -- Inyectar readable_id en el JSON de categoria si es posible
    BEGIN
        v_final_category := p_category::jsonb;
        v_final_category := v_final_category || jsonb_build_object('readable_id', v_readable_id);
    EXCEPTION WHEN others THEN
        v_final_category := jsonb_build_object('readable_id', v_readable_id);
    END;

    INSERT INTO inventory_parts (
        name, stock, cost, price, category, sku, image_url, created_at, updated_at
    ) VALUES (
        p_name, p_stock, p_cost, p_price, v_final_category::text, coalesce(p_sku, format('SKU-%s', v_readable_id)), p_image_url, now(), now()
    ) RETURNING id INTO v_new_id;

    -- Movimiento inicial
    INSERT INTO inventory_movements (
        item_id, movement_type, quantity, 
        before_stock, after_stock, 
        unit_cost, reason, created_by
    ) VALUES (
        v_new_id, 'IN', p_stock,
        0, p_stock,
        p_cost, 'Carga inicial de inventario', p_user_id
    );

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
