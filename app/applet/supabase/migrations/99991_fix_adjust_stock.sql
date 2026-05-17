-- RPC: Ajuste de Inventario Auditado
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

    -- Note: El frontend pasa p_quantity como el número a sumar/restar.
    -- Si es OUT, debería restar, por lo tanto el frontend debe enviarlo negativo,
    -- o la función debería hacerlo aquí. Verifiquemos cómo lo hace el front.

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
