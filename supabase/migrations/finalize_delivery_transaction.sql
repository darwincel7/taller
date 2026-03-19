CREATE OR REPLACE FUNCTION finalize_delivery_transaction(
  p_order_id text,
  p_new_payments jsonb,
  p_history_logs jsonb,
  p_completed_at bigint
)
RETURNS SETOF orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_payment jsonb;
BEGIN
  -- 1. Lock row for update
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- 2. Validate Status
  IF v_status = 'Entregado' THEN
    RAISE EXCEPTION 'CRITICAL: La orden YA fue entregada.';
  END IF;

  IF v_status = 'Cancelado' THEN
    RAISE EXCEPTION 'No se puede entregar una orden cancelada.';
  END IF;

  -- 3. Insert Payments into order_payments table
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_new_payments)
  LOOP
    INSERT INTO order_payments (
      id,
      order_id,
      amount,
      method,
      cashier_id,
      cashier_name,
      is_refund,
      created_at
    ) VALUES (
      (v_payment->>'id')::uuid,
      p_order_id,
      (v_payment->>'amount')::numeric,
      (v_payment->>'method')::text,
      (v_payment->>'cashierId')::text,
      (v_payment->>'cashierName')::text,
      COALESCE((v_payment->>'isRefund')::boolean, false),
      (v_payment->>'date')::bigint
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- 4. Atomic Update and Return
  RETURN QUERY
  UPDATE orders
  SET
    -- payments field is NOT updated anymore (migrated to table)
    history = COALESCE(history, '[]'::jsonb) || p_history_logs,
    status = 'Entregado',
    "completedAt" = p_completed_at
  WHERE id = p_order_id
  RETURNING *;
END;
$$;
