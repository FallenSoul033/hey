-- IceFresh RC1.4 — technical audit, staff finance isolation and scalable summaries.
-- Apply together with the RC1.4 frontend. This migration intentionally changes
-- table privileges used by the legacy client, so it is a coordinated cutover.

create schema if not exists private;

-- All order and production writes must pass through audited server RPCs.
revoke insert, update, delete on table public.orders from authenticated;
revoke insert, update, delete on table public.production_entries from authenticated;

-- Financial columns on orders/order_items are manager-only at the database layer.
drop policy if exists orders_select on public.orders;
drop policy if exists orders_select_manager on public.orders;
create policy orders_select_manager on public.orders
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  );

drop policy if exists order_items_select on public.order_items;
drop policy if exists order_items_select_manager on public.order_items;
create policy order_items_select_manager on public.order_items
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  );

-- Safe operational order feed for staff: deliberately no unit price, payment,
-- total, debt or other finance-bearing columns.
create or replace function public.list_orders_operational_rc(p_limit integer default 400)
returns table (
  id uuid,
  order_date date,
  client_id uuid,
  client_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  items jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 400), 1), 500);
begin
  select p.organization_id into v_org
  from public.profiles p
  where p.id = v_uid
    and p.active
    and p.organization_id is not null
    and p.role in ('owner','admin','staff');
  if v_org is null then raise exception 'active organization membership required'; end if;

  return query
  select
    o.id,
    o.order_date,
    o.client_id,
    o.client_name,
    o.status,
    o.created_at,
    o.updated_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'product_id', oi.product_id,
          'quantity', oi.quantity
        ) order by oi.created_at, oi.product_id
      ) filter (where oi.id is not null),
      '[]'::jsonb
    ) as items
  from public.orders o
  left join public.order_items oi
    on oi.order_id = o.id and oi.organization_id = v_org
  where o.organization_id = v_org
  group by o.id
  order by o.order_date desc, o.created_at desc
  limit v_limit;
end;
$$;
revoke all on function public.list_orders_operational_rc(integer) from public, anon, authenticated;
grant execute on function public.list_orders_operational_rc(integer) to authenticated;


-- The low-level order writer contains all ledger semantics but is no longer a
-- browser-facing RPC. Role-specific wrappers are the only public write surface.
revoke execute on function public.save_order_rc(uuid,uuid,date,uuid,jsonb,numeric,text) from authenticated;

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
  return public.save_order_rc(p_idempotency_key,p_order_id,p_order_date,p_client_id,p_items,p_paid_amount,p_status);
end;
$$;
revoke all on function public.save_order_manager_rc(uuid,uuid,date,uuid,jsonb,numeric,text) from public, anon, authenticated;
grant execute on function public.save_order_manager_rc(uuid,uuid,date,uuid,jsonb,numeric,text) to authenticated;

-- Staff writes are also finance-free. Existing custom prices are preserved;
-- newly added products receive the server-side default product price.
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
set search_path = ''
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
revoke all on function public.save_order_operational_rc(uuid,uuid,date,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.save_order_operational_rc(uuid,uuid,date,uuid,jsonb,text) to authenticated;

-- Aggregate stock server-side so the UI never computes balances from a truncated
-- movement history. The recent ledger remains a small history window only.
create or replace function public.get_inventory_summary_rc()
returns table (
  product_id text,
  on_hand numeric,
  reserved numeric,
  available numeric,
  shipped numeric,
  produced numeric,
  adjustments numeric
)
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

  return query
  select
    p.id,
    coalesce(sum(s.on_hand_delta),0)::numeric,
    coalesce(sum(s.reserved_delta),0)::numeric,
    (coalesce(sum(s.on_hand_delta),0)-coalesce(sum(s.reserved_delta),0))::numeric,
    coalesce(-sum(s.on_hand_delta) filter (where s.movement_type='shipment'),0)::numeric,
    coalesce(sum(s.on_hand_delta) filter (where s.movement_type in ('production','production_adjustment')),0)::numeric,
    coalesce(sum(s.on_hand_delta) filter (where s.movement_type in ('manual_adjustment','return','migration')),0)::numeric
  from public.products p
  left join public.stock_ledger s
    on s.organization_id = p.organization_id and s.product_id = p.id
  where p.organization_id = v_org
  group by p.id
  order by p.id;
end;
$$;
revoke all on function public.get_inventory_summary_rc() from public, anon, authenticated;
grant execute on function public.get_inventory_summary_rc() to authenticated;

-- Finance summary is manager-only and computes debt per order before summing it,
-- preventing an overpayment on one order from hiding debt on another.
create or replace function public.get_finance_summary_rc()
returns table (sales numeric, paid numeric, debt numeric, refunded numeric, credits numeric)
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

  return query
  with per_order as (
    select
      f.order_id,
      coalesce(sum(case when f.entry_type='sale' then f.amount when f.entry_type='sale_reversal' then -f.amount else 0 end),0) as sale_net,
      coalesce(sum(case when f.entry_type='payment' then f.amount when f.entry_type='refund' then -f.amount else 0 end),0) as paid_net,
      coalesce(sum(case when f.entry_type='refund' then f.amount else 0 end),0) as refund_total,
      coalesce(sum(case when f.entry_type='credit' then f.amount else 0 end),0) as credit_total
    from public.financial_ledger f
    where f.organization_id = v_org
    group by f.order_id
  )
  select
    coalesce(sum(greatest(po.sale_net,0)),0)::numeric,
    coalesce(sum(po.paid_net),0)::numeric,
    coalesce(sum(greatest(po.sale_net - po.paid_net - po.credit_total,0)),0)::numeric,
    coalesce(sum(po.refund_total),0)::numeric,
    coalesce(sum(po.credit_total),0)::numeric
  from per_order po;
end;
$$;
revoke all on function public.get_finance_summary_rc() from public, anon, authenticated;
grant execute on function public.get_finance_summary_rc() to authenticated;

create or replace function public.get_product_sales_summary_rc()
returns table (product_id text, total numeric)
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

  return query
  with order_sales as (
    select
      f.order_id,
      greatest(coalesce(sum(case when f.entry_type='sale' then f.amount when f.entry_type='sale_reversal' then -f.amount else 0 end),0),0) as sale_net
    from public.financial_ledger f
    where f.organization_id = v_org
    group by f.order_id
  ), order_totals as (
    select oi.order_id, sum(oi.quantity * oi.unit_price) as order_total
    from public.order_items oi
    where oi.organization_id = v_org
    group by oi.order_id
  )
  select
    oi.product_id,
    coalesce(sum(
      case when ot.order_total > 0
        then os.sale_net * ((oi.quantity * oi.unit_price) / ot.order_total)
        else 0 end
    ),0)::numeric as total
  from public.order_items oi
  join order_sales os on os.order_id = oi.order_id
  join order_totals ot on ot.order_id = oi.order_id
  where oi.organization_id = v_org
  group by oi.product_id
  order by oi.product_id;
end;
$$;
revoke all on function public.get_product_sales_summary_rc() from public, anon, authenticated;
grant execute on function public.get_product_sales_summary_rc() to authenticated;

-- Finance-free realtime signal. Staff can subscribe to this table instead of the
-- finance-bearing orders/order_items tables and then refresh through the safe RPC.
create table if not exists public.order_change_signal (
  order_id uuid primary key references public.orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  changed_at timestamptz not null default now(),
  version bigint not null default 1
);
create index if not exists order_change_signal_org_time_idx
  on public.order_change_signal(organization_id, changed_at desc);
alter table public.order_change_signal enable row level security;
revoke all on table public.order_change_signal from public, anon, authenticated;
grant select on table public.order_change_signal to authenticated;
drop policy if exists order_change_signal_select on public.order_change_signal;
create policy order_change_signal_select on public.order_change_signal
  for select to authenticated
  using (organization_id = (select private.current_org_id()));

create or replace function private.touch_order_change_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_org uuid;
begin
  if tg_table_name = 'orders' then
    v_order_id := coalesce(new.id, old.id);
    v_org := coalesce(new.organization_id, old.organization_id);
  else
    v_order_id := coalesce(new.order_id, old.order_id);
    v_org := coalesce(new.organization_id, old.organization_id);
  end if;
  if tg_op = 'DELETE' and tg_table_name = 'orders' then return old; end if;
  insert into public.order_change_signal(order_id, organization_id, changed_at, version)
  values(v_order_id, v_org, clock_timestamp(), 1)
  on conflict (order_id) do update
    set organization_id = excluded.organization_id,
        changed_at = excluded.changed_at,
        version = public.order_change_signal.version + 1;
  return coalesce(new, old);
end;
$$;
revoke all on function private.touch_order_change_signal() from public, anon, authenticated;

drop trigger if exists orders_change_signal_trg on public.orders;
create trigger orders_change_signal_trg
  after insert or update on public.orders
  for each row execute function private.touch_order_change_signal();

drop trigger if exists order_items_change_signal_trg on public.order_items;
create trigger order_items_change_signal_trg
  after insert or update or delete on public.order_items
  for each row execute function private.touch_order_change_signal();

-- Backfill one signal row per existing order so subscriptions have stable rows.
insert into public.order_change_signal(order_id, organization_id, changed_at, version)
select o.id, o.organization_id, coalesce(o.updated_at,o.created_at,now()), 1
from public.orders o
on conflict (order_id) do nothing;

-- Add the finance-free signal to selective Supabase Realtime publication.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables)
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='order_change_signal') then
    alter publication supabase_realtime add table public.order_change_signal;
  end if;
end $$;

-- Preserve immutable tenant/creator identity even when another organization
-- member legitimately edits the mutable schedule fields.
create or replace function private.prevent_schedule_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.created_by is distinct from old.created_by then
    raise exception 'schedule identity fields are immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_schedule_identity_change() from public, anon, authenticated;

drop trigger if exists schedule_items_identity_immutable_trg on public.schedule_items;
create trigger schedule_items_identity_immutable_trg
  before update on public.schedule_items
  for each row execute function private.prevent_schedule_identity_change();
