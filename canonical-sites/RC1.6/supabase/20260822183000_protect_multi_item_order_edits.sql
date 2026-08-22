-- Protect multi-item orders from legacy/single-line editors.
-- Multi-item editor v2 sends _expected_item_count in the first p_items element.
-- Legacy clients may still edit one-item orders, but cannot silently remove rows
-- from an existing multi-item order.

create or replace function public.save_order_manager_rc(
  p_idempotency_key uuid,
  p_order_id uuid,
  p_order_date date,
  p_client_id uuid,
  p_items jsonb,
  p_paid_amount numeric,
  p_status text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_existing_item_count integer := 0;
  v_expected_item_count integer;
  v_expected_raw text;
begin
  select p.organization_id into v_org
  from public.profiles p
  where p.id = v_uid and p.active and p.organization_id is not null and p.role in ('owner','admin');
  if v_org is null then raise exception 'manager access required'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order requires at least one item';
  end if;

  if p_order_id is not null then
    perform 1 from public.orders o
    where o.id = p_order_id and o.organization_id = v_org and o.deleted_at is null
    for update;
    if not found then raise exception 'order not found'; end if;

    select count(*)::integer into v_existing_item_count
    from public.order_items oi
    where oi.order_id = p_order_id and oi.organization_id = v_org;

    v_expected_raw := p_items -> 0 ->> '_expected_item_count';
    if v_expected_raw ~ '^[0-9]+$' then v_expected_item_count := v_expected_raw::integer; end if;

    if v_expected_item_count is null then
      if jsonb_array_length(p_items) < v_existing_item_count then
        raise exception 'multi-item order requires the current editor; refresh the app before changing this order';
      end if;
    elsif v_expected_item_count <> v_existing_item_count then
      raise exception 'order changed since it was opened; refresh and retry';
    end if;
  end if;

  return public.save_order_rc(p_idempotency_key,p_order_id,p_order_date,p_client_id,p_items,p_paid_amount,p_status);
end;
$$;

create or replace function public.save_order_operational_rc(
  p_idempotency_key uuid,
  p_order_id uuid,
  p_order_date date,
  p_client_id uuid,
  p_items jsonb,
  p_status text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_role text;
  v_old_status text;
  v_current_paid numeric := 0;
  v_effective_items jsonb := '[]'::jsonb;
  v_row record;
  v_price numeric;
  v_existing_item_count integer := 0;
  v_expected_item_count integer;
  v_expected_raw text;
begin
  select p.organization_id, p.role into v_org, v_role
  from public.profiles p
  where p.id = v_uid
    and p.active
    and p.organization_id is not null
    and p.role in ('owner','admin','staff');
  if v_org is null then raise exception 'active organization membership required'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order requires at least one item';
  end if;

  if p_order_id is null then
    if p_status <> 'Новый' then raise exception 'new staff order must start as Новый'; end if;
  else
    select o.status into v_old_status
    from public.orders o
    where o.id = p_order_id and o.organization_id = v_org
    for update;
    if not found then raise exception 'order not found'; end if;

    select count(*)::integer into v_existing_item_count
    from public.order_items oi
    where oi.order_id = p_order_id and oi.organization_id = v_org;

    v_expected_raw := p_items -> 0 ->> '_expected_item_count';
    if v_expected_raw ~ '^[0-9]+$' then v_expected_item_count := v_expected_raw::integer; end if;

    if v_expected_item_count is null then
      if jsonb_array_length(p_items) < v_existing_item_count then
        raise exception 'multi-item order requires the current editor; refresh the app before changing this order';
      end if;
    elsif v_expected_item_count <> v_existing_item_count then
      raise exception 'order changed since it was opened; refresh and retry';
    end if;

    if v_role = 'staff' and not (
      (v_old_status = 'Новый' and p_status in ('Новый','Подтверждён','Отменён')) or
      (v_old_status = 'Подтверждён' and p_status in ('Подтверждён','В производстве','Собирается','Готов','Отменён')) or
      (v_old_status = 'В производстве' and p_status in ('В производстве','Собирается','Готов','Отменён')) or
      (v_old_status = 'Собирается' and p_status in ('Собирается','Готов','Отменён')) or
      (v_old_status = 'Готов' and p_status in ('Готов','На доставке','Отменён')) or
      (v_old_status = 'На доставке' and p_status in ('На доставке','Доставлен')) or
      (v_old_status = 'Доставлен' and p_status in ('Доставлен','Выполнен')) or
      (v_old_status = 'Выполнен' and p_status = 'Выполнен') or
      (v_old_status = 'Отменён' and p_status = 'Отменён')
    ) then
      raise exception 'invalid staff order status transition';
    end if;
  end if;

  if (select count(*) from jsonb_to_recordset(p_items) as x(product_id text, quantity numeric))
     <> (select count(distinct product_id) from jsonb_to_recordset(p_items) as x(product_id text, quantity numeric)) then
    raise exception 'duplicate product in order items';
  end if;

  for v_row in
    select x.product_id, x.quantity
    from jsonb_to_recordset(p_items) as x(product_id text, quantity numeric)
    order by x.product_id
  loop
    if v_row.product_id is null or v_row.quantity is null or v_row.quantity <= 0 then
      raise exception 'invalid order item';
    end if;
    select coalesce(oi.unit_price, p.default_price) into v_price
    from public.products p
    left join public.order_items oi
      on oi.order_id = p_order_id and oi.product_id = p.id and oi.organization_id = v_org
    where p.id = v_row.product_id and p.organization_id = v_org and p.active
    for update of p;
    if v_price is null then raise exception 'active product not found'; end if;
    v_effective_items := v_effective_items || jsonb_build_array(
      jsonb_build_object('product_id', v_row.product_id, 'quantity', v_row.quantity, 'unit_price', v_price)
    );
  end loop;

  if p_order_id is not null then
    select coalesce(sum(case when f.entry_type='payment' then f.amount when f.entry_type='refund' then -f.amount else 0 end),0)
    into v_current_paid
    from public.financial_ledger f
    where f.organization_id = v_org and f.order_id = p_order_id;
  end if;

  return public.save_order_rc(
    p_idempotency_key,
    p_order_id,
    p_order_date,
    p_client_id,
    v_effective_items,
    v_current_paid,
    p_status
  );
end;
$$;
