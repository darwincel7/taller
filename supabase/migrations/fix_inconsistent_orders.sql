-- SCRIPT V9: CORRECCIÓN AGRESIVA DE ÓRDENES "FANTASMA"

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
