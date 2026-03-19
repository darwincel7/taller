-- SCRIPT DE ACTUALIZACIÓN V10 (FIX RLS PAGOS)
create extension if not exists "pgcrypto";

-- 1. FUNCIÓN PARA OBTENER PAGOS DESGLOSADOS
create or replace function get_payments_flat(
    p_start bigint default null,
    p_end bigint default null,
    p_cashier_id text default null,
    p_branch text default null
)
returns table (
    payment_id text,
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
        p->>'id',
        (p->>'amount')::numeric,
        p->>'method',
        (p->>'date')::bigint,
        p->>'cashierId',
        p->>'cashierName',
        COALESCE((p->>'isRefund')::boolean, false),
        p->>'notes',
        o.id,
        o.readable_id,
        o."deviceModel",
        o.customer->>'name',
        o."currentBranch"
    from orders o,
    jsonb_to_recordset(o.payments) as p(id text, amount text, method text, date text, "cashierId" text, "cashierName" text, "isRefund" text, notes text)
    where 
        ((p->>'date')::bigint >= p_start or p_start is null)
        and ((p->>'date')::bigint <= p_end or p_end is null)
        and (p->>'cashierId' = p_cashier_id or p_cashier_id is null)
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
