-- SCRIPT DE ACTUALIZACIÓN V13 (FULL FIX: RLS + TYPES + CAJA)
create extension if not exists "pgcrypto";

-- 1. FUNCIÓN PARA OBTENER PAGOS DESGLOSADOS (LEYENDO DE TABLA REAL)
create or replace function get_payments_flat(
    p_start bigint default null,
    p_end bigint default null,
    p_cashier_id text default null,
    p_branch text default null
)
returns table (
    payment_id uuid,
    amount numeric,
    method text,
    date bigint,
    cashier_id text,
    cashier_name text,
    is_refund boolean,
    notes text,
    order_id text,
    order_readable_id int,
    order_model text,
    order_customer text,
    order_branch text
)
language plpgsql
as $$
begin
    return query
    select
        op.id,
        op.amount,
        op.method,
        op.created_at,
        op.cashier_id,
        op.cashier_name,
        op.is_refund,
        ''::text as notes,
        o.id,
        o.readable_id,
        o."deviceModel",
        o.customer->>'name',
        o."currentBranch"
    from order_payments op
    join orders o on o.id = op.order_id
    where 
        (op.created_at >= p_start or p_start is null)
        and (op.created_at <= p_end or p_end is null)
        and (op.cashier_id = p_cashier_id or p_cashier_id is null)
        and (o."currentBranch" = p_branch or p_branch is null);
end;
$$;

-- 2. FUNCIÓN MEJORADA PARA KPI DASHBOARD
create or replace function get_dashboard_stats_v2()
returns json
language plpgsql
as $$
declare
    total_orders int;
    total_revenue numeric;
    total_pending int;
    total_in_repair int;
    total_store int;
    revenue_today numeric;
    revenue_month numeric;
    start_of_day bigint := extract(epoch from date_trunc('day', now())) * 1000;
    start_of_month bigint := extract(epoch from date_trunc('month', now())) * 1000;
begin
    -- Conteos Generales
    select count(*) into total_orders from orders;
    select count(*) into total_pending from orders where status = 'Pendiente';
    select count(*) into total_in_repair from orders where status = 'En Reparación';
    select count(*) into total_store from orders where "orderType" = 'RECIBIDOS' and status != 'Entregado';

    -- Ingresos Totales Históricos (Solo Reparado/Entregado)
    select coalesce(sum("finalPrice"), 0) into total_revenue 
    from orders where status in ('Reparado', 'Entregado');

    -- Ingresos Hoy (Basado en fecha de completado o creación si es venta)
    select coalesce(sum("finalPrice"), 0) into revenue_today 
    from orders 
    where status in ('Reparado', 'Entregado') 
    and (("completedAt" >= start_of_day) or ("createdAt" >= start_of_day and "orderType" = 'RECIBIDOS'));

    -- Ingresos Mes
    select coalesce(sum("finalPrice"), 0) into revenue_month 
    from orders 
    where status in ('Reparado', 'Entregado') 
    and (("completedAt" >= start_of_month) or ("createdAt" >= start_of_month and "orderType" = 'RECIBIDOS'));

    return json_build_object(
        'total', total_orders,
        'pending', total_pending,
        'inRepair', total_in_repair,
        'storeStock', total_store,
        'revenue', total_revenue,
        'revenueToday', revenue_today,
        'revenueMonth', revenue_month
    );
end;
$$;

-- 3. CORRECCIÓN AGRESIVA DE ÓRDENES "FANTASMA" (V9)
create or replace function fix_inconsistent_delivered_orders()
returns jsonb
language plpgsql
as $$
declare
    v_count int := 0;
    v_updated_ids text[];
begin
    with fixed_orders as (
        update orders
        set status = 'Entregado', "completedAt" = coalesce("completedAt", extract(epoch from now()) * 1000)
        where 
            -- Solo corregir si NO está en un estado final
            status not in ('Entregado', 'DELIVERED', 'RETURNED', 'Cancelado')
            and (
                exists (
                    select 1 
                    from jsonb_array_elements(coalesce(history, '[]'::jsonb)) as log
                    where 
                        -- Criterios ampliados para detectar entregas
                        log->>'action_type' = 'ORDER_DELIVERED'
                        or log->>'status' in ('RETURNED', 'DELIVERED', 'Entregado')
                        or log->>'note' ilike '%entregad%'
                        or log->>'note' ilike '%delivered%'
                        or log->>'note' ilike '%salida%'
                )
            )
        returning id
    )
    select count(*), array_agg(id) into v_count, v_updated_ids from fixed_orders;

    return json_build_object(
        'fixed_count', v_count,
        'fixed_ids', coalesce(v_updated_ids, '{}'::text[])
    );
end;
$$;

-- Ejecutar corrección inmediatamente
select fix_inconsistent_delivered_orders();

-- 4. FIX PERMISOS TABLA DE PAGOS (RLS)
alter table if exists order_payments enable row level security;

drop policy if exists "Enable access to authenticated" on order_payments;

create policy "Enable access to authenticated"
on order_payments
for all
to authenticated
using (true)
with check (true);

grant all on order_payments to authenticated;
grant all on order_payments to service_role;

-- 5. FIX TRANSACCIÓN DE ENTREGA (SECURITY DEFINER + FIX TIMESTAMP)
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
    history = COALESCE(history, '[]'::jsonb) || p_history_logs,
    status = 'Entregado',
    "completedAt" = p_completed_at
  WHERE id = p_order_id
  RETURNING *;
END;
$$;
