-- IceFresh Release Candidate 1 integrity migration.
-- Replaces the v12 alpha stock/finance model before production deployment.
-- Goals:
--   * multi-item orders;
--   * separate physical stock (on_hand) from reservations;
--   * recognise sales only after fulfilment;
--   * payments and refunds are separate immutable financial events;
--   * idempotent server-side writes;
--   * immutable audit/stock/finance ledgers;
--   * durable notification outbox;
--   * disable self-service creation of extra IceFresh organisations.

create schema if not exists private;

-- Prevent accidental creation of a second IceFresh tenant from the browser.
-- Existing organisations are not deleted by this migration.
revoke execute on function public.create_organization(text, text) from authenticated;

-- Hard preflight: IceFresh is currently a single-tenant deployment. Refuse to
-- change accounting rules while duplicate IceFresh organisations exist. This is
-- intentionally fail-closed so an operator must resolve the duplicate explicitly.
do $$
begin
  if (select count(*) from public.organizations where lower(btrim(name)) = 'icefresh') > 1 then
    raise exception 'RC1 preflight failed: duplicate IceFresh organizations detected';
  end if;
end $$;

alter table public.website_requests
  add column if not exists processed_order_id uuid references public.orders(id) on delete set null;
create index if not exists website_requests_processed_order_idx
  on public.website_requests(organization_id, processed_order_id)
  where processed_order_id is not null;

create table if not exists private.operation_requests (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  operation_type text not null check (char_length(operation_type) between 2 and 80),
  idempotency_key uuid not null,
  request_fingerprint text not null check (char_length(request_fingerprint) = 32),
  result jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (organization_id, operation_type, idempotency_key)
);
revoke all on table private.operation_requests from public, anon, authenticated;

-- Multi-item order model. Legacy product_id/quantity/unit_price columns on orders are
-- retained for compatibility during RC, but order_items becomes the source of truth.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);
create index if not exists order_items_org_order_idx on public.order_items(organization_id, order_id);
create index if not exists order_items_org_product_idx on public.order_items(organization_id, product_id);
alter table public.order_items enable row level security;
revoke all on table public.order_items from public, anon, authenticated;
grant select on table public.order_items to authenticated;
create policy order_items_select on public.order_items
  for select to authenticated
  using (organization_id = (select private.current_org_id()));

-- Physical stock and reservations are deliberately separate dimensions.
create table if not exists public.stock_ledger (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  on_hand_delta numeric(12,2) not null default 0,
  reserved_delta numeric(12,2) not null default 0,
  movement_type text not null check (movement_type in (
    'production', 'production_adjustment', 'reservation', 'reservation_release',
    'shipment', 'return', 'manual_adjustment', 'migration'
  )),
  source_type text not null check (source_type in ('production','order','adjustment','migration','return')),
  source_id uuid,
  operation_key uuid not null,
  entry_key text not null check (char_length(entry_key) between 8 and 220),
  description text not null default '' check (char_length(description) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  check (on_hand_delta <> 0 or reserved_delta <> 0),
  unique (organization_id, entry_key)
);
create index if not exists stock_ledger_org_product_time_idx on public.stock_ledger(organization_id, product_id, occurred_at desc);
create index if not exists stock_ledger_source_idx on public.stock_ledger(organization_id, source_type, source_id) where source_id is not null;
alter table public.stock_ledger enable row level security;
revoke all on table public.stock_ledger from public, anon, authenticated;
grant select on table public.stock_ledger to authenticated;
create policy stock_ledger_select on public.stock_ledger
  for select to authenticated
  using (organization_id = (select private.current_org_id()));

create or replace view public.stock_balances
with (security_invoker = true)
as
select
  organization_id,
  product_id,
  coalesce(sum(on_hand_delta),0)::numeric(12,2) as on_hand,
  coalesce(sum(reserved_delta),0)::numeric(12,2) as reserved,
  (coalesce(sum(on_hand_delta),0)-coalesce(sum(reserved_delta),0))::numeric(12,2) as available
from public.stock_ledger
group by organization_id, product_id;
revoke all on public.stock_balances from public, anon, authenticated;
grant select on public.stock_balances to authenticated;

-- Immutable financial events. Positive payment means money received; refund is stored
-- as a positive amount with separate entry_type and subtracted in reporting.
create table if not exists public.financial_ledger (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  entry_type text not null check (entry_type in ('sale','sale_reversal','payment','refund','credit')),
  amount numeric(14,2) not null check (amount > 0),
  operation_key uuid not null,
  entry_key text not null check (char_length(entry_key) between 8 and 220),
  description text not null default '' check (char_length(description) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  unique (organization_id, entry_key)
);
create index if not exists financial_ledger_org_order_time_idx on public.financial_ledger(organization_id, order_id, occurred_at desc);
alter table public.financial_ledger enable row level security;
revoke all on table public.financial_ledger from public, anon, authenticated;
grant select on table public.financial_ledger to authenticated;
create policy financial_ledger_select on public.financial_ledger
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_manager()));

create table if not exists public.operation_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  severity text not null default 'info' check (severity in ('info','warning','error')),
  event_type text not null check (char_length(event_type) between 2 and 100),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id uuid,
  message text not null check (char_length(message) between 2 and 500),
  details jsonb not null default '{}'::jsonb,
  request_id uuid not null default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index if not exists operation_events_org_time_idx on public.operation_events(organization_id, occurred_at desc);
alter table public.operation_events enable row level security;
revoke all on table public.operation_events from public, anon, authenticated;
grant select on table public.operation_events to authenticated;
create policy operation_events_select on public.operation_events
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_manager()));

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','webhook')),
  recipient text not null check (char_length(btrim(recipient)) between 3 and 320),
  event_type text not null check (char_length(event_type) between 2 and 100),
  aggregate_type text not null check (char_length(aggregate_type) between 2 and 80),
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','dead_letter')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  entry_key text not null check (char_length(entry_key) between 8 and 220),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (organization_id, entry_key)
);
create index if not exists notification_events_delivery_idx on public.notification_events(status,next_attempt_at,created_at) where status in ('pending','failed');
create index if not exists notification_events_org_time_idx on public.notification_events(organization_id,created_at desc);
alter table public.notification_events enable row level security;
revoke all on table public.notification_events from public, anon, authenticated;
grant select on table public.notification_events to authenticated;
create policy notification_events_select on public.notification_events
  for select to authenticated
  using (organization_id = (select private.current_org_id()) and (select private.is_manager()));

create or replace function private.reject_immutable_change()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'ledger entries are immutable'; end; $$;
revoke all on function private.reject_immutable_change() from public, anon, authenticated;

drop trigger if exists stock_ledger_immutable on public.stock_ledger;
create trigger stock_ledger_immutable before update or delete on public.stock_ledger
for each row execute function private.reject_immutable_change();
drop trigger if exists financial_ledger_immutable on public.financial_ledger;
create trigger financial_ledger_immutable before update or delete on public.financial_ledger
for each row execute function private.reject_immutable_change();
drop trigger if exists operation_events_immutable on public.operation_events;
create trigger operation_events_immutable before update or delete on public.operation_events
for each row execute function private.reject_immutable_change();

create or replace function private.validate_business_actor(p_organization_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  select role into v_role from public.profiles
  where id=(select auth.uid()) and organization_id=p_organization_id and active
    and role in ('owner','admin','staff');
  if v_role is null then raise exception 'active organization membership required'; end if;
  return v_role;
end; $$;
revoke all on function private.validate_business_actor(uuid) from public, anon, authenticated;

create or replace function private.current_stock(p_org uuid, p_product text)
returns table(on_hand numeric, reserved numeric, available numeric)
language sql stable set search_path = '' as $$
  select
    coalesce(sum(s.on_hand_delta),0),
    coalesce(sum(s.reserved_delta),0),
    coalesce(sum(s.on_hand_delta),0)-coalesce(sum(s.reserved_delta),0)
  from public.stock_ledger s
  where s.organization_id=p_org and s.product_id=p_product;
$$;
revoke all on function private.current_stock(uuid,text) from public, anon, authenticated;

-- Existing single-line data is converted to order_items and stock/finance opening events.
insert into public.order_items(organization_id,order_id,product_id,quantity,unit_price)
select organization_id,id,product_id,quantity,unit_price from public.orders
where product_id is not null and quantity > 0
on conflict (order_id,product_id) do nothing;

insert into public.stock_ledger(
  organization_id,product_id,on_hand_delta,reserved_delta,movement_type,source_type,source_id,
  operation_key,entry_key,description,created_by,occurred_at
)
select organization_id,product_id,quantity,0,'migration','migration',id,
       gen_random_uuid(),'rc1:migration:production:'||id::text,
       'Перенос существующего производства в физический остаток',created_by,created_at
from public.production_entries
on conflict (organization_id,entry_key) do nothing;

-- Existing confirmed/preparation orders reserve stock. A merely new order does
-- not reserve anything, matching save_order_rc semantics.
insert into public.stock_ledger(
  organization_id,product_id,on_hand_delta,reserved_delta,movement_type,source_type,source_id,
  operation_key,entry_key,description,created_by,occurred_at
)
select oi.organization_id,oi.product_id,0,oi.quantity,'reservation','order',oi.order_id,
       gen_random_uuid(),'rc1:migration:reservation:'||oi.id::text,
       'Перенос подтверждённого заказа в резерв',o.created_by,o.created_at
from public.order_items oi join public.orders o on o.id=oi.order_id
where o.status in ('Подтверждён','В производстве','Собирается','Готов')
on conflict (organization_id,entry_key) do nothing;

-- Orders already handed to delivery or completed have physically left on-hand
-- stock. Revenue is still recognised only for delivered/completed statuses below.
insert into public.stock_ledger(
  organization_id,product_id,on_hand_delta,reserved_delta,movement_type,source_type,source_id,
  operation_key,entry_key,description,created_by,occurred_at
)
select oi.organization_id,oi.product_id,-oi.quantity,0,'shipment','order',oi.order_id,
       gen_random_uuid(),'rc1:migration:shipment:'||oi.id::text,
       'Перенос ранее отгруженного заказа как физической отгрузки',o.created_by,o.updated_at
from public.order_items oi join public.orders o on o.id=oi.order_id
where o.status in ('На доставке','Доставлен','Выполнен')
on conflict (organization_id,entry_key) do nothing;

insert into public.financial_ledger(organization_id,order_id,entry_type,amount,operation_key,entry_key,description,created_by,occurred_at)
select o.organization_id,o.id,'sale',sum(oi.quantity*oi.unit_price),gen_random_uuid(),
       'rc1:migration:sale:'||o.id::text,'Перенос ранее выполненного заказа как реализации',o.created_by,o.updated_at
from public.orders o join public.order_items oi on oi.order_id=o.id
where o.status in ('Доставлен','Выполнен')
group by o.id,o.organization_id,o.created_by,o.updated_at
having sum(oi.quantity*oi.unit_price) > 0
on conflict (organization_id,entry_key) do nothing;

insert into public.financial_ledger(organization_id,order_id,entry_type,amount,operation_key,entry_key,description,created_by,occurred_at)
select organization_id,id,'payment',paid_amount,gen_random_uuid(),'rc1:migration:payment:'||id::text,
       'Перенос ранее полученной оплаты',created_by,updated_at
from public.orders where paid_amount > 0
on conflict (organization_id,entry_key) do nothing;

-- Expand order statuses. Drop whichever generated check was previously installed.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid='public.orders'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%status%'
  loop execute format('alter table public.orders drop constraint %I',c.conname); end loop;
  alter table public.orders add constraint orders_status_rc1_check check (status in (
    'Новый','Подтверждён','В производстве','Собирается','Готов','На доставке','Доставлен','Выполнен','Отменён'
  ));
end $$;

-- Direct writes to core transactional documents are disabled for browser users.
revoke insert,update,delete on public.orders from authenticated;
revoke insert,update,delete on public.order_items from authenticated;
revoke insert,update,delete on public.production_entries from authenticated;

create or replace function private.reserve_operation(
  p_org uuid,p_type text,p_key uuid,p_fingerprint text,p_user uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing private.operation_requests%rowtype;
begin
  insert into private.operation_requests(organization_id,operation_type,idempotency_key,request_fingerprint,created_by)
  values(p_org,p_type,p_key,p_fingerprint,p_user)
  on conflict do nothing;
  select * into v_existing from private.operation_requests
  where organization_id=p_org and operation_type=p_type and idempotency_key=p_key for update;
  if v_existing.request_fingerprint <> p_fingerprint then raise exception 'idempotency key reused with different payload'; end if;
  return v_existing.result;
end; $$;
revoke all on function private.reserve_operation(uuid,text,uuid,text,uuid) from public,anon,authenticated;

create or replace function private.complete_operation(p_org uuid,p_type text,p_key uuid,p_result jsonb)
returns void language sql security definer set search_path='' as $$
 update private.operation_requests set result=p_result,completed_at=now()
 where organization_id=p_org and operation_type=p_type and idempotency_key=p_key;
$$;
revoke all on function private.complete_operation(uuid,text,uuid,jsonb) from public,anon,authenticated;

-- RC1 order writer: multi-item, atomic reservation/shipment semantics, cumulative payment intake.
create or replace function public.save_order_rc(
  p_idempotency_key uuid,
  p_order_id uuid,
  p_order_date date,
  p_client_id uuid,
  p_items jsonb,
  p_paid_amount numeric,
  p_status text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_actor_role text;
  v_client_name text;
  v_order_id uuid := p_order_id;
  v_old_status text;
  v_old_total numeric := 0;
  v_new_total numeric := 0;
  v_current_paid numeric := 0;
  v_payment_delta numeric := 0;
  v_first_product text;
  v_first_qty numeric;
  v_first_price numeric;
  v_row record;
  v_stock record;
  v_old_item record;
  v_result jsonb;
  v_fingerprint text;
  v_old_shipped boolean := false;
  v_new_shipped boolean := false;
  v_old_reserved boolean := false;
  v_new_reserved boolean := false;
  v_old_sale boolean := false;
  v_new_sale boolean := false;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select organization_id, role into v_org, v_actor_role from public.profiles
   where id=v_uid and active and organization_id is not null and role in ('owner','admin','staff');
  if v_org is null then raise exception 'active organization membership required'; end if;
  perform private.validate_business_actor(v_org);
  if p_status not in ('Новый','Подтверждён','В производстве','Собирается','Готов','На доставке','Доставлен','Выполнен','Отменён') then
    raise exception 'invalid order status';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'order requires at least one item'; end if;
  if p_paid_amount is null or p_paid_amount < 0 then raise exception 'invalid paid amount'; end if;

  v_fingerprint := encode(extensions.digest(concat_ws('|',coalesce(p_order_id::text,''),p_order_date::text,p_client_id::text,p_items::text,p_paid_amount::text,p_status), 'sha256'), 'hex');
  v_result := private.reserve_operation(v_org,'save_order_rc',p_idempotency_key,v_fingerprint,v_uid);
  if v_result is not null then return (v_result->>'order_id')::uuid; end if;

  select name into v_client_name from public.clients where id=p_client_id and organization_id=v_org;
  if v_client_name is null then raise exception 'client not found in organization'; end if;

  if v_order_id is not null then
    select status into v_old_status from public.orders where id=v_order_id and organization_id=v_org for update;
    if not found then raise exception 'order not found'; end if;
    v_old_shipped := v_old_status in ('На доставке','Доставлен','Выполнен');
    v_old_reserved := v_old_status in ('Подтверждён','В производстве','Собирается','Готов');
    v_old_sale := v_old_status in ('Доставлен','Выполнен');
    if v_old_shipped then
      -- Shipment has already changed physical stock. Items are immutable afterwards.
      if exists(
        select 1 from public.order_items oi
        full join jsonb_to_recordset(p_items) as j(product_id text,quantity numeric,unit_price numeric)
          on j.product_id=oi.product_id and oi.order_id=v_order_id
        where coalesce(oi.quantity,-1) <> coalesce(j.quantity,-1)
           or coalesce(oi.unit_price,-1) <> coalesce(j.unit_price,-1)
           or oi.product_id is null or j.product_id is null
      ) then raise exception 'shipped order items are immutable; use return or correction'; end if;
      if p_status in ('Новый','Подтверждён','В производстве','Собирается','Готов','Отменён') then
        raise exception 'shipped order cannot return to an earlier status';
      end if;
    end if;
  else
    v_old_status := null;
  end if;

  -- Validate and lock all requested products in deterministic order.
  for v_row in
    select product_id,quantity,unit_price from jsonb_to_recordset(p_items)
      as x(product_id text,quantity numeric,unit_price numeric)
    order by product_id
  loop
    if v_row.quantity is null or v_row.quantity <= 0 or v_row.unit_price is null or v_row.unit_price < 0 then raise exception 'invalid order item'; end if;
    perform 1 from public.products where id=v_row.product_id and organization_id=v_org and active for update;
    if not found then raise exception 'active product not found'; end if;
    if v_first_product is null then v_first_product:=v_row.product_id; v_first_qty:=v_row.quantity; v_first_price:=v_row.unit_price; end if;
    v_new_total := v_new_total + v_row.quantity*v_row.unit_price;
  end loop;
  if (select count(*) from jsonb_to_recordset(p_items) as x(product_id text,quantity numeric,unit_price numeric))
     <> (select count(distinct product_id) from jsonb_to_recordset(p_items) as x(product_id text,quantity numeric,unit_price numeric)) then
    raise exception 'duplicate product in order items';
  end if;
  if p_paid_amount > v_new_total then raise exception 'paid amount cannot exceed order total'; end if;

  if v_order_id is null then
    insert into public.orders(organization_id,order_date,client_id,client_name,product_id,quantity,unit_price,paid_amount,status,created_by)
    values(v_org,p_order_date,p_client_id,v_client_name,v_first_product,v_first_qty,v_first_price,0,p_status,v_uid)
    returning id into v_order_id;
  else
    update public.orders set order_date=p_order_date,client_id=p_client_id,client_name=v_client_name,
      product_id=v_first_product,quantity=v_first_qty,unit_price=v_first_price,status=p_status,updated_at=now()
    where id=v_order_id;
  end if;

  select coalesce(sum(quantity*unit_price),0) into v_old_total from public.order_items where order_id=v_order_id;

  if not v_old_shipped then
    -- Remove old reservation before replacing items.
    if v_old_reserved then
      for v_old_item in select * from public.order_items where order_id=v_order_id loop
        insert into public.stock_ledger(organization_id,product_id,reserved_delta,movement_type,source_type,source_id,operation_key,entry_key,description,created_by)
        values(v_org,v_old_item.product_id,-v_old_item.quantity,'reservation_release','order',v_order_id,p_idempotency_key,
          'order:'||v_order_id||':release-old:'||v_old_item.id||':'||p_idempotency_key,'Освобождение предыдущего резерва при изменении заказа',v_uid);
      end loop;
    end if;
    delete from public.order_items where order_id=v_order_id;
    insert into public.order_items(organization_id,order_id,product_id,quantity,unit_price)
    select v_org,v_order_id,product_id,quantity,unit_price from jsonb_to_recordset(p_items)
      as x(product_id text,quantity numeric,unit_price numeric);
  end if;

  v_new_reserved := p_status in ('Подтверждён','В производстве','Собирается','Готов');
  v_new_shipped := p_status in ('На доставке','Доставлен','Выполнен');
  v_new_sale := p_status in ('Доставлен','Выполнен');

  if not v_old_shipped then
    for v_row in select * from public.order_items where order_id=v_order_id loop
      select * into v_stock from private.current_stock(v_org,v_row.product_id);
      if v_new_reserved then
        if v_stock.available < v_row.quantity then raise exception 'insufficient stock: available %, requested %',v_stock.available,v_row.quantity; end if;
        insert into public.stock_ledger(organization_id,product_id,reserved_delta,movement_type,source_type,source_id,operation_key,entry_key,description,created_by)
        values(v_org,v_row.product_id,v_row.quantity,'reservation','order',v_order_id,p_idempotency_key,
          'order:'||v_order_id||':reserve:'||v_row.id||':'||p_idempotency_key,'Резерв подтверждённого заказа',v_uid);
      elsif v_new_shipped then
        if v_stock.available < v_row.quantity then raise exception 'insufficient stock: available %, requested %',v_stock.available,v_row.quantity; end if;
        insert into public.stock_ledger(organization_id,product_id,on_hand_delta,movement_type,source_type,source_id,operation_key,entry_key,description,created_by)
        values(v_org,v_row.product_id,-v_row.quantity,'shipment','order',v_order_id,p_idempotency_key,
          'order:'||v_order_id||':shipment:'||v_row.id||':'||p_idempotency_key,'Физическая отгрузка заказа',v_uid);
      end if;
    end loop;
  elsif not v_old_sale and v_new_sale then
    null; -- stock was already shipped at status На доставке.
  end if;

  -- Recognise sale only on delivery/completion, never when a new order is merely created.
  if not v_old_sale and v_new_sale and v_new_total > 0 then
    insert into public.financial_ledger(organization_id,order_id,entry_type,amount,operation_key,entry_key,description,created_by)
    values(v_org,v_order_id,'sale',v_new_total,p_idempotency_key,'order:'||v_order_id||':sale:'||p_idempotency_key,'Реализация после доставки',v_uid);
  end if;

  -- Payments are independent cash events. Decreasing them requires record_refund_rc.
  select coalesce(sum(case when entry_type='payment' then amount when entry_type='refund' then -amount else 0 end),0)
    into v_current_paid from public.financial_ledger where order_id=v_order_id;
  if v_actor_role='staff' and p_paid_amount <> v_current_paid then raise exception 'manager access required for payment changes'; end if;
  if p_paid_amount < v_current_paid then raise exception 'paid amount cannot be decreased; record a refund instead'; end if;
  v_payment_delta := p_paid_amount-v_current_paid;
  if v_payment_delta > 0 then
    insert into public.financial_ledger(organization_id,order_id,entry_type,amount,operation_key,entry_key,description,created_by)
    values(v_org,v_order_id,'payment',v_payment_delta,p_idempotency_key,'order:'||v_order_id||':payment:'||p_idempotency_key,'Получена оплата по заказу',v_uid);
  end if;
  update public.orders set paid_amount=p_paid_amount,updated_at=now() where id=v_order_id;

  insert into public.operation_events(organization_id,event_type,entity_type,entity_id,message,details,request_id,created_by)
  values(v_org,case when p_order_id is null then 'order.created' else 'order.updated' end,'order',v_order_id,
    case when p_order_id is null then 'Создан заказ' else 'Изменён заказ' end,
    jsonb_build_object('status',p_status,'total',v_new_total,'items',p_items),p_idempotency_key,v_uid);

  insert into public.notification_events(organization_id,channel,recipient,event_type,aggregate_type,aggregate_id,payload,entry_key,created_by)
  values(v_org,'email','icefresh.kz@gmail.com','order.updated','order',v_order_id,
    jsonb_build_object('order_id',v_order_id,'status',p_status),
    'order:'||v_order_id||':notify:'||p_idempotency_key,v_uid)
  on conflict (organization_id,entry_key) do nothing;

  perform private.complete_operation(v_org,'save_order_rc',p_idempotency_key,jsonb_build_object('order_id',v_order_id));
  return v_order_id;
end; $$;
revoke all on function public.save_order_rc(uuid,uuid,date,uuid,jsonb,numeric,text) from public,anon,authenticated;
grant execute on function public.save_order_rc(uuid,uuid,date,uuid,jsonb,numeric,text) to authenticated;

create or replace function public.record_refund_rc(
  p_idempotency_key uuid,p_order_id uuid,p_amount numeric,p_reason text
) returns numeric
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_org uuid; v_paid numeric; v_result jsonb; v_reason text:=btrim(p_reason); v_fp text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select organization_id into v_org from public.profiles where id=v_uid and active and role in ('owner','admin');
  if v_org is null then raise exception 'manager access required'; end if;
  if p_amount is null or p_amount<=0 or char_length(v_reason)<3 then raise exception 'invalid refund'; end if;
  perform 1 from public.orders where id=p_order_id and organization_id=v_org for update;
  if not found then raise exception 'order not found'; end if;
  v_fp:=encode(extensions.digest(concat_ws('|',p_order_id::text,p_amount::text,v_reason), 'sha256'), 'hex');
  v_result:=private.reserve_operation(v_org,'record_refund_rc',p_idempotency_key,v_fp,v_uid);
  if v_result is not null then return (v_result->>'paid_amount')::numeric; end if;
  select coalesce(sum(case when entry_type='payment' then amount when entry_type='refund' then -amount else 0 end),0)
    into v_paid from public.financial_ledger where order_id=p_order_id;
  if p_amount>v_paid then raise exception 'refund exceeds received payments'; end if;
  insert into public.financial_ledger(organization_id,order_id,entry_type,amount,operation_key,entry_key,description,created_by)
  values(v_org,p_order_id,'refund',p_amount,p_idempotency_key,'order:'||p_order_id||':refund:'||p_idempotency_key,v_reason,v_uid);
  v_paid:=v_paid-p_amount;
  update public.orders set paid_amount=v_paid,updated_at=now() where id=p_order_id;
  insert into public.operation_events(organization_id,event_type,entity_type,entity_id,message,details,request_id,created_by)
  values(v_org,'payment.refund','order',p_order_id,'Возврат оплаты',jsonb_build_object('amount',p_amount,'reason',v_reason),p_idempotency_key,v_uid);
  perform private.complete_operation(v_org,'record_refund_rc',p_idempotency_key,jsonb_build_object('paid_amount',v_paid));
  return v_paid;
end; $$;
revoke all on function public.record_refund_rc(uuid,uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.record_refund_rc(uuid,uuid,numeric,text) to authenticated;

create or replace function public.save_production_entry_rc(
  p_idempotency_key uuid,p_entry_id uuid,p_production_date date,p_product_id text,p_quantity numeric,p_employee_id uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_org uuid; v_name text; v_id uuid:=p_entry_id; v_old_qty numeric:=0; v_old_product text; v_delta numeric; v_stock record; v_result jsonb; v_fp text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select organization_id into v_org from public.profiles where id=v_uid and active and organization_id is not null and role in ('owner','admin','staff');
  if v_org is null then raise exception 'active organization membership required'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'invalid production quantity'; end if;
  select full_name into v_name from public.employees where id=p_employee_id and organization_id=v_org and active;
  if v_name is null then raise exception 'active employee not found'; end if;
  perform 1 from public.products where id=p_product_id and organization_id=v_org and active for update;
  if not found then raise exception 'active product not found'; end if;
  v_fp:=encode(extensions.digest(concat_ws('|',coalesce(p_entry_id::text,''),p_production_date::text,p_product_id,p_quantity::text,p_employee_id::text), 'sha256'), 'hex');
  v_result:=private.reserve_operation(v_org,'save_production_entry_rc',p_idempotency_key,v_fp,v_uid);
  if v_result is not null then return (v_result->>'entry_id')::uuid; end if;
  if v_id is null then
    insert into public.production_entries(organization_id,production_date,product_id,quantity,employee_id,employee_name,created_by)
    values(v_org,p_production_date,p_product_id,p_quantity,p_employee_id,v_name,v_uid) returning id into v_id;
    v_delta:=p_quantity;
  else
    select quantity,product_id into v_old_qty,v_old_product from public.production_entries where id=v_id and organization_id=v_org for update;
    if not found then raise exception 'production entry not found'; end if;
    if v_old_product<>p_product_id then raise exception 'production product cannot be changed; create a correction'; end if;
    v_delta:=p_quantity-v_old_qty;
    if v_delta<0 then
      select * into v_stock from private.current_stock(v_org,p_product_id);
      if v_stock.available+v_delta<0 then raise exception 'production cannot be reduced below reserved/available stock'; end if;
    end if;
    update public.production_entries set production_date=p_production_date,quantity=p_quantity,employee_id=p_employee_id,employee_name=v_name,updated_at=now() where id=v_id;
  end if;
  if v_delta<>0 then
    insert into public.stock_ledger(organization_id,product_id,on_hand_delta,movement_type,source_type,source_id,operation_key,entry_key,description,created_by)
    values(v_org,p_product_id,v_delta,case when p_entry_id is null then 'production' else 'production_adjustment' end,'production',v_id,p_idempotency_key,
      'production:'||v_id||':'||p_idempotency_key,'Факт производства / корректировка',v_uid);
  end if;
  perform private.complete_operation(v_org,'save_production_entry_rc',p_idempotency_key,jsonb_build_object('entry_id',v_id));
  return v_id;
end; $$;
revoke all on function public.save_production_entry_rc(uuid,uuid,date,text,numeric,uuid) from public,anon,authenticated;
grant execute on function public.save_production_entry_rc(uuid,uuid,date,text,numeric,uuid) to authenticated;

create or replace function public.record_inventory_adjustment_rc(
  p_idempotency_key uuid,p_product_id text,p_quantity_delta numeric,p_reason text
) returns numeric
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_org uuid; v_stock record; v_reason text:=btrim(p_reason); v_result jsonb; v_fp text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select organization_id into v_org from public.profiles where id=v_uid and active and role='owner';
  if v_org is null then raise exception 'owner access required'; end if;
  if p_quantity_delta is null or p_quantity_delta=0 or char_length(v_reason)<5 then raise exception 'invalid adjustment'; end if;
  perform 1 from public.products where id=p_product_id and organization_id=v_org for update;
  if not found then raise exception 'product not found'; end if;
  v_fp:=encode(extensions.digest(concat_ws('|',p_product_id,p_quantity_delta::text,v_reason), 'sha256'), 'hex');
  v_result:=private.reserve_operation(v_org,'record_inventory_adjustment_rc',p_idempotency_key,v_fp,v_uid);
  if v_result is not null then return (v_result->>'on_hand')::numeric; end if;
  select * into v_stock from private.current_stock(v_org,p_product_id);
  if v_stock.on_hand+p_quantity_delta<0 or v_stock.available+p_quantity_delta<0 then raise exception 'adjustment would make stock negative'; end if;
  insert into public.stock_ledger(organization_id,product_id,on_hand_delta,movement_type,source_type,operation_key,entry_key,description,created_by)
  values(v_org,p_product_id,p_quantity_delta,'manual_adjustment','adjustment',p_idempotency_key,'adjustment:'||p_product_id||':'||p_idempotency_key,v_reason,v_uid);
  select * into v_stock from private.current_stock(v_org,p_product_id);
  perform private.complete_operation(v_org,'record_inventory_adjustment_rc',p_idempotency_key,jsonb_build_object('on_hand',v_stock.on_hand));
  return v_stock.on_hand;
end; $$;
revoke all on function public.record_inventory_adjustment_rc(uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.record_inventory_adjustment_rc(uuid,text,numeric,text) to authenticated;

-- Safe manual retry of outbox delivery.
create or replace function public.retry_notification_rc(p_notification_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_org uuid;
begin
  select organization_id into v_org from public.profiles where id=v_uid and active and role in ('owner','admin');
  if v_org is null then raise exception 'manager access required'; end if;
  update public.notification_events set status='pending',next_attempt_at=now(),last_error=null,updated_at=now()
  where id=p_notification_id and organization_id=v_org and status in ('failed','dead_letter');
  if not found then raise exception 'notification is not retryable'; end if;
end; $$;
revoke all on function public.retry_notification_rc(uuid) from public,anon,authenticated;
grant execute on function public.retry_notification_rc(uuid) to authenticated;

-- Re-implement website request acceptance on top of the RC order writer.
create or replace function public.accept_website_request(p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_org uuid; v_req public.website_requests%rowtype; v_client uuid; v_price numeric; v_order uuid; v_phone text;
begin
  select organization_id into v_org from public.profiles where id=v_uid and active and role in ('owner','admin','staff');
  if v_org is null then raise exception 'active organization membership required'; end if;
  select * into v_req from public.website_requests where id=p_request_id and organization_id=v_org for update;
  if not found then raise exception 'website request not found'; end if;
  if v_req.status in ('Принята','Закрыта') then raise exception 'website request already processed'; end if;
  select default_price into v_price from public.products where id=v_req.product_id and organization_id=v_org and active;
  if v_price is null then raise exception 'active product not found'; end if;
  v_phone:=regexp_replace(v_req.phone,'[^0-9]+','','g');
  select id into v_client from public.clients where organization_id=v_org and regexp_replace(phone,'[^0-9]+','','g')=v_phone order by created_at limit 1;
  if v_client is null then
    insert into public.clients(organization_id,name,category,phone,created_by)
    values(v_org,btrim(v_req.customer_name),case when v_req.customer_type='business' then 'Оптовые клиенты' else 'Частные клиенты' end,btrim(v_req.phone),v_uid)
    returning id into v_client;
  end if;
  v_order:=public.save_order_rc(gen_random_uuid(),null,current_date,v_client,
    jsonb_build_array(jsonb_build_object('product_id',v_req.product_id,'quantity',v_req.quantity,'unit_price',v_price)),0,'Новый');
  update public.website_requests set status='Принята',processed_order_id=v_order,updated_at=now() where id=v_req.id;
  return v_order;
end; $$;
revoke all on function public.accept_website_request(uuid) from public,anon,authenticated;
grant execute on function public.accept_website_request(uuid) to authenticated;

-- Realtime publication for new RC tables where publication exists and is selective.
do $$
declare v_table text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
  foreach v_table in array array['order_items','stock_ledger','financial_ledger','operation_events','notification_events'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
    execute format('alter publication supabase_realtime add table public.%I',v_table);
   end if;
  end loop;
 end if;
end $$;
