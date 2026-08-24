-- RC1.6: optimistic concurrency guard for multi-item order editing.
-- Prevents a stale/partial editor from silently replacing the full order_items set.

create or replace function private.assert_order_items_snapshot(
  p_org uuid,
  p_order_id uuid,
  p_expected_items jsonb,
  p_include_price boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current jsonb;
  v_expected jsonb;
begin
  if p_order_id is null then return; end if;
  if p_expected_items is null or jsonb_typeof(p_expected_items) <> 'array' then
    raise exception 'expected order item snapshot required';
  end if;

  if p_include_price then
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', oi.product_id,
      'quantity', oi.quantity,
      'unit_price', oi.unit_price
    ) order by oi.product_id), '[]'::jsonb)
    into v_current
    from public.order_items oi
    where oi.organization_id = p_org and oi.order_id = p_order_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', x.product_id,
      'quantity', x.quantity,
      'unit_price', x.unit_price
    ) order by x.product_id), '[]'::jsonb)
    into v_expected
    from jsonb_to_recordset(p_expected_items) as x(product_id text, quantity numeric, unit_price numeric);
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', oi.product_id,
      'quantity', oi.quantity
    ) order by oi.product_id), '[]'::jsonb)
    into v_current
    from public.order_items oi
    where oi.organization_id = p_org and oi.order_id = p_order_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', x.product_id,
      'quantity', x.quantity
    ) order by x.product_id), '[]'::jsonb)
    into v_expected
    from jsonb_to_recordset(p_expected_items) as x(product_id text, quantity numeric);
  end if;

  if v_current is distinct from v_expected then
    raise exception 'order changed since editor was opened';
  end if;
end;
$$;

revoke all on function private.assert_order_items_snapshot(uuid,uuid,jsonb,boolean) from public, anon, authenticated;

create or replace function public.save_order_manager_rc_v2(
  p_idempotency_key uuid,
  p_order_id uuid,
  p_order_date date,
  p_client_id uuid,
  p_items jsonb,
  p_paid_amount numeric,
  p_status text,
  p_expected_items jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  select p.organization_id into v_org
  from public.profiles p
  where p.id = v_uid and p.active and p.organization_id is not null and p.role in ('owner','admin');
  if v_org is null then raise exception 'manager access required'; end if;
  if p_order_id is not null then
    perform 1 from public.orders o where o.id = p_order_id and o.organization_id = v_org for update;
    if not found then raise exception 'order not found'; end if;
    perform private.assert_order_items_snapshot(v_org, p_order_id, p_expected_items, true);
  end if;
  return public.save_order_manager_rc(p_idempotency_key,p_order_id,p_order_date,p_client_id,p_items,p_paid_amount,p_status);
end;
$$;

create or replace function public.save_order_operational_rc_v2(
  p_idempotency_key uuid,
  p_order_id uuid,
  p_order_date date,
  p_client_id uuid,
  p_items jsonb,
  p_status text,
  p_expected_items jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  select p.organization_id into v_org
  from public.profiles p
  where p.id = v_uid and p.active and p.organization_id is not null and p.role in ('owner','admin','staff');
  if v_org is null then raise exception 'active organization membership required'; end if;
  if p_order_id is not null then
    perform 1 from public.orders o where o.id = p_order_id and o.organization_id = v_org for update;
    if not found then raise exception 'order not found'; end if;
    perform private.assert_order_items_snapshot(v_org, p_order_id, p_expected_items, false);
  end if;
  return public.save_order_operational_rc(p_idempotency_key,p_order_id,p_order_date,p_client_id,p_items,p_status);
end;
$$;

revoke all on function public.save_order_manager_rc_v2(uuid,uuid,date,uuid,jsonb,numeric,text,jsonb) from public, anon;
revoke all on function public.save_order_operational_rc_v2(uuid,uuid,date,uuid,jsonb,text,jsonb) from public, anon;
grant execute on function public.save_order_manager_rc_v2(uuid,uuid,date,uuid,jsonb,numeric,text,jsonb) to authenticated;
grant execute on function public.save_order_operational_rc_v2(uuid,uuid,date,uuid,jsonb,text,jsonb) to authenticated;
