-- IceFresh production integrity foundation.
--
-- The ledger triggers are deliberately compatible with the currently
-- published client: legacy authenticated inserts remain usable while every
-- stock-affecting write is validated and journalled inside one transaction.
-- The version 12 client uses the idempotent RPCs defined below.

create schema if not exists private;

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

create table if not exists public.inventory_ledger (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  source_type text not null check (source_type in ('production', 'order', 'adjustment', 'migration')),
  source_id uuid,
  movement_type text not null check (movement_type in (
    'production', 'production_adjustment', 'order_reservation',
    'order_adjustment', 'order_release', 'manual_adjustment', 'migration'
  )),
  category text not null check (category in ('production', 'order', 'adjustment')),
  quantity_delta numeric(12,2) not null check (quantity_delta <> 0),
  operation_key uuid not null,
  entry_key text not null check (char_length(entry_key) between 8 and 180),
  description text not null default '' check (char_length(description) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  unique (organization_id, entry_key)
);

create index if not exists inventory_ledger_org_product_time_idx
  on public.inventory_ledger (organization_id, product_id, occurred_at desc);
create index if not exists inventory_ledger_source_idx
  on public.inventory_ledger (organization_id, source_type, source_id)
  where source_id is not null;

create table if not exists public.financial_ledger (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  entry_type text not null check (entry_type in ('sale', 'payment')),
  amount_delta numeric(14,2) not null check (amount_delta <> 0),
  operation_key uuid not null,
  entry_key text not null check (char_length(entry_key) between 8 and 180),
  description text not null default '' check (char_length(description) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  unique (organization_id, entry_key)
);

create index if not exists financial_ledger_org_order_time_idx
  on public.financial_ledger (organization_id, order_id, occurred_at desc);

create table if not exists public.operation_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  severity text not null default 'info' check (severity in ('info', 'warning', 'error')),
  event_type text not null check (char_length(event_type) between 2 and 100),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id uuid,
  message text not null check (char_length(message) between 2 and 500),
  details jsonb not null default '{}'::jsonb,
  request_id uuid not null default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists operation_events_org_time_idx
  on public.operation_events (organization_id, occurred_at desc);
create index if not exists operation_events_org_type_time_idx
  on public.operation_events (organization_id, event_type, occurred_at desc);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'webhook')),
  recipient text not null check (char_length(btrim(recipient)) between 3 and 320),
  event_type text not null check (char_length(event_type) between 2 and 100),
  aggregate_type text not null check (char_length(aggregate_type) between 2 and 80),
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  entry_key text not null check (char_length(entry_key) between 8 and 180),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (organization_id, entry_key)
);

create index if not exists notification_events_delivery_idx
  on public.notification_events (status, next_attempt_at, created_at)
  where status in ('pending', 'failed');
create index if not exists notification_events_org_time_idx
  on public.notification_events (organization_id, created_at desc);

do $$
declare
  v_table text;
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and not puballtables
  ) then
    foreach v_table in array array[
      'inventory_ledger', 'financial_ledger', 'operation_events', 'notification_events'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end $$;

alter table public.inventory_ledger enable row level security;
alter table public.financial_ledger enable row level security;
alter table public.operation_events enable row level security;
alter table public.notification_events enable row level security;

drop policy if exists inventory_ledger_select on public.inventory_ledger;
create policy inventory_ledger_select on public.inventory_ledger
  for select to authenticated
  using (organization_id = (select private.current_org_id()));

drop policy if exists financial_ledger_select on public.financial_ledger;
create policy financial_ledger_select on public.financial_ledger
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  );

drop policy if exists operation_events_select on public.operation_events;
create policy operation_events_select on public.operation_events
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  );

drop policy if exists notification_events_select on public.notification_events;
create policy notification_events_select on public.notification_events
  for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  );

revoke all on table public.inventory_ledger from public, anon, authenticated;
revoke all on table public.financial_ledger from public, anon, authenticated;
revoke all on table public.operation_events from public, anon, authenticated;
revoke all on table public.notification_events from public, anon, authenticated;
grant select on table public.inventory_ledger to authenticated;
grant select on table public.financial_ledger to authenticated;
grant select on table public.operation_events to authenticated;
grant select on table public.notification_events to authenticated;

create or replace function private.reject_immutable_ledger_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ledger entries are immutable';
end;
$$;

revoke all on function private.reject_immutable_ledger_change() from public, anon, authenticated;

drop trigger if exists inventory_ledger_immutable on public.inventory_ledger;
create trigger inventory_ledger_immutable
  before update or delete on public.inventory_ledger
  for each row execute function private.reject_immutable_ledger_change();

drop trigger if exists financial_ledger_immutable on public.financial_ledger;
create trigger financial_ledger_immutable
  before update or delete on public.financial_ledger
  for each row execute function private.reject_immutable_ledger_change();

drop trigger if exists operation_events_immutable on public.operation_events;
create trigger operation_events_immutable
  before update or delete on public.operation_events
  for each row execute function private.reject_immutable_ledger_change();

alter table public.orders
  add column if not exists operation_key uuid not null default gen_random_uuid();
alter table public.production_entries
  add column if not exists operation_key uuid not null default gen_random_uuid();
alter table public.website_requests
  add column if not exists processed_order_id uuid references public.orders(id) on delete set null;

create index if not exists website_requests_processed_order_idx
  on public.website_requests (organization_id, processed_order_id)
  where processed_order_id is not null;

-- Build an opening ledger for any records that predate this migration.
insert into public.inventory_ledger (
  organization_id, product_id, source_type, source_id, movement_type,
  category, quantity_delta, operation_key, entry_key, description,
  created_by, occurred_at
)
select
  p.organization_id, p.product_id, 'migration', p.id, 'migration',
  'production', p.quantity, p.operation_key,
  'migration:production:' || p.id::text,
  'Начальный перенос производства в складской журнал',
  p.created_by, p.created_at
from public.production_entries p
on conflict (organization_id, entry_key) do nothing;

insert into public.inventory_ledger (
  organization_id, product_id, source_type, source_id, movement_type,
  category, quantity_delta, operation_key, entry_key, description,
  created_by, occurred_at
)
select
  o.organization_id, o.product_id, 'migration', o.id, 'migration',
  'order', -o.quantity, o.operation_key,
  'migration:order:' || o.id::text,
  'Начальный перенос заказа в складской журнал',
  o.created_by, o.created_at
from public.orders o
where o.status <> 'Отменён'
on conflict (organization_id, entry_key) do nothing;

insert into public.financial_ledger (
  organization_id, order_id, entry_type, amount_delta, operation_key,
  entry_key, description, created_by, occurred_at
)
select
  o.organization_id, o.id, 'sale', o.quantity * o.unit_price, o.operation_key,
  'migration:sale:' || o.id::text,
  'Начальный перенос начисленной выручки', o.created_by, o.created_at
from public.orders o
where o.status <> 'Отменён' and o.quantity * o.unit_price <> 0
on conflict (organization_id, entry_key) do nothing;

insert into public.financial_ledger (
  organization_id, order_id, entry_type, amount_delta, operation_key,
  entry_key, description, created_by, occurred_at
)
select
  o.organization_id, o.id, 'payment', o.paid_amount, o.operation_key,
  'migration:payment:' || o.id::text,
  'Начальный перенос полученной оплаты', o.created_by, o.created_at
from public.orders o
where o.status <> 'Отменён' and o.paid_amount <> 0
on conflict (organization_id, entry_key) do nothing;

create or replace function private.current_inventory(p_organization_id uuid, p_product_id text)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(l.quantity_delta), 0)::numeric
  from public.inventory_ledger l
  where l.organization_id = p_organization_id
    and l.product_id = p_product_id;
$$;

revoke all on function private.current_inventory(uuid, text) from public, anon, authenticated;

create or replace function private.validate_business_actor(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select p.role
    into v_role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.organization_id = p_organization_id
    and p.active
    and p.role in ('owner', 'admin', 'staff');

  if v_role is null then
    raise exception 'active organization membership required';
  end if;
  return v_role;
end;
$$;

revoke all on function private.validate_business_actor(uuid) from public, anon, authenticated;

create or replace function private.validate_order_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old_reserved numeric(12,2) := 0;
  v_new_reserved numeric(12,2) := 0;
  v_balance numeric;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  perform private.validate_business_actor(new.organization_id);

  if new.created_by <> v_actor then
    raise exception 'created_by must match authenticated user';
  end if;
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.created_by <> old.created_by
  ) then
    raise exception 'order ownership fields are immutable';
  end if;

  perform 1
  from public.clients c
  where c.id = new.client_id and c.organization_id = new.organization_id;
  if not found then raise exception 'client not found in organization'; end if;

  perform p.id
  from public.products p
  where p.organization_id = new.organization_id
    and p.id in (new.product_id, case when tg_op = 'UPDATE' then old.product_id else new.product_id end)
  order by p.id
  for update;

  perform 1
  from public.products p
  where p.id = new.product_id
    and p.organization_id = new.organization_id
    and (p.active or new.status = 'Отменён');
  if not found then raise exception 'active product not found'; end if;

  if tg_op = 'UPDATE' then
    v_old_reserved := case when old.status <> 'Отменён' then old.quantity else 0 end;
    if new.operation_key is null or new.operation_key = old.operation_key then
      new.operation_key := gen_random_uuid();
    end if;
  elsif new.operation_key is null then
    new.operation_key := gen_random_uuid();
  end if;
  v_new_reserved := case when new.status <> 'Отменён' then new.quantity else 0 end;

  if tg_op = 'UPDATE' and old.product_id <> new.product_id then
    v_balance := private.current_inventory(new.organization_id, old.product_id) + v_old_reserved;
    if v_balance < 0 then
      raise exception 'order cannot be moved: reserved stock would become negative';
    end if;
    v_balance := private.current_inventory(new.organization_id, new.product_id) - v_new_reserved;
  else
    v_balance := private.current_inventory(new.organization_id, new.product_id)
      + v_old_reserved - v_new_reserved;
  end if;

  if v_balance < 0 then
    raise exception 'insufficient stock: available %, requested %',
      private.current_inventory(new.organization_id, new.product_id) + v_old_reserved,
      v_new_reserved;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_order_write() from public, anon, authenticated;

create or replace function private.journal_order_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_reserved numeric(12,2) := 0;
  v_new_reserved numeric(12,2) := case when new.status <> 'Отменён' then new.quantity else 0 end;
  v_old_sale numeric(14,2) := 0;
  v_new_sale numeric(14,2) := case when new.status <> 'Отменён' then new.quantity * new.unit_price else 0 end;
  v_old_payment numeric(14,2) := 0;
  v_new_payment numeric(14,2) := case when new.status <> 'Отменён' then new.paid_amount else 0 end;
  v_delta numeric(14,2);
  v_event_type text;
begin
  if tg_op = 'UPDATE' then
    v_old_reserved := case when old.status <> 'Отменён' then old.quantity else 0 end;
    v_old_sale := case when old.status <> 'Отменён' then old.quantity * old.unit_price else 0 end;
    v_old_payment := case when old.status <> 'Отменён' then old.paid_amount else 0 end;
    v_event_type := 'order.updated';
  else
    v_event_type := 'order.created';
  end if;

  if tg_op = 'UPDATE' and old.product_id <> new.product_id then
    if v_old_reserved <> 0 then
      insert into public.inventory_ledger (
        organization_id, product_id, source_type, source_id, movement_type,
        category, quantity_delta, operation_key, entry_key, description, created_by
      ) values (
        new.organization_id, old.product_id, 'order', new.id, 'order_release',
        'order', v_old_reserved, new.operation_key,
        'order:' || new.operation_key::text || ':old-product',
        'Освобождение резерва при изменении товара', (select auth.uid())
      );
    end if;
    if v_new_reserved <> 0 then
      insert into public.inventory_ledger (
        organization_id, product_id, source_type, source_id, movement_type,
        category, quantity_delta, operation_key, entry_key, description, created_by
      ) values (
        new.organization_id, new.product_id, 'order', new.id, 'order_reservation',
        'order', -v_new_reserved, new.operation_key,
        'order:' || new.operation_key::text || ':new-product',
        'Резерв по заказу после изменения товара', (select auth.uid())
      );
    end if;
  else
    v_delta := v_old_reserved - v_new_reserved;
    if v_delta <> 0 then
      insert into public.inventory_ledger (
        organization_id, product_id, source_type, source_id, movement_type,
        category, quantity_delta, operation_key, entry_key, description, created_by
      ) values (
        new.organization_id, new.product_id, 'order', new.id,
        case
          when v_old_reserved = 0 and v_new_reserved > 0 then 'order_reservation'
          when v_old_reserved > 0 and v_new_reserved = 0 then 'order_release'
          else 'order_adjustment'
        end,
        'order', v_delta, new.operation_key,
        'order:' || new.operation_key::text || ':stock',
        case when tg_op = 'INSERT' then 'Резерв по новому заказу' else 'Изменение резерва по заказу' end,
        (select auth.uid())
      );
    end if;
  end if;

  v_delta := v_new_sale - v_old_sale;
  if v_delta <> 0 then
    insert into public.financial_ledger (
      organization_id, order_id, entry_type, amount_delta, operation_key,
      entry_key, description, created_by
    ) values (
      new.organization_id, new.id, 'sale', v_delta, new.operation_key,
      'order:' || new.operation_key::text || ':sale',
      case when tg_op = 'INSERT' then 'Начисленная выручка по заказу' else 'Корректировка выручки по заказу' end,
      (select auth.uid())
    );
  end if;

  v_delta := v_new_payment - v_old_payment;
  if v_delta <> 0 then
    insert into public.financial_ledger (
      organization_id, order_id, entry_type, amount_delta, operation_key,
      entry_key, description, created_by
    ) values (
      new.organization_id, new.id, 'payment', v_delta, new.operation_key,
      'order:' || new.operation_key::text || ':payment',
      case when tg_op = 'INSERT' then 'Полученная оплата по заказу' else 'Корректировка оплаты по заказу' end,
      (select auth.uid())
    );
  end if;

  insert into public.operation_events (
    organization_id, event_type, entity_type, entity_id, message, details,
    request_id, created_by
  ) values (
    new.organization_id, v_event_type, 'order', new.id,
    case when tg_op = 'INSERT' then 'Создан заказ' else 'Изменён заказ' end,
    jsonb_build_object(
      'status', new.status,
      'product_id', new.product_id,
      'quantity', new.quantity,
      'total_amount', new.quantity * new.unit_price,
      'paid_amount', new.paid_amount
    ),
    new.operation_key, (select auth.uid())
  );

  insert into public.notification_events (
    organization_id, channel, recipient, event_type, aggregate_type,
    aggregate_id, payload, entry_key, created_by
  ) values (
    new.organization_id, 'email', 'icefresh.kz@gmail.com', v_event_type,
    'order', new.id,
    jsonb_build_object(
      'order_id', new.id,
      'client_name', new.client_name,
      'product_id', new.product_id,
      'quantity', new.quantity,
      'status', new.status,
      'total_amount', new.quantity * new.unit_price,
      'paid_amount', new.paid_amount
    ),
    'order:' || new.operation_key::text || ':email',
    (select auth.uid())
  );

  return new;
end;
$$;

revoke all on function private.journal_order_write() from public, anon, authenticated;

create or replace function private.validate_production_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_balance numeric;
begin
  if v_actor is null then raise exception 'authentication required'; end if;
  perform private.validate_business_actor(new.organization_id);
  if new.created_by <> v_actor then
    raise exception 'created_by must match authenticated user';
  end if;
  if tg_op = 'UPDATE' and (
    new.organization_id <> old.organization_id
    or new.created_by <> old.created_by
  ) then
    raise exception 'production ownership fields are immutable';
  end if;

  perform 1 from public.employees e
  where e.id = new.employee_id and e.organization_id = new.organization_id and e.active;
  if not found then raise exception 'active employee not found'; end if;

  perform p.id
  from public.products p
  where p.organization_id = new.organization_id
    and p.id in (new.product_id, case when tg_op = 'UPDATE' then old.product_id else new.product_id end)
  order by p.id
  for update;
  perform 1 from public.products p
  where p.id = new.product_id and p.organization_id = new.organization_id and p.active;
  if not found then raise exception 'active product not found'; end if;

  if tg_op = 'UPDATE' then
    if new.operation_key is null or new.operation_key = old.operation_key then
      new.operation_key := gen_random_uuid();
    end if;
    if old.product_id <> new.product_id then
      v_balance := private.current_inventory(new.organization_id, old.product_id) - old.quantity;
    else
      v_balance := private.current_inventory(new.organization_id, new.product_id) - old.quantity + new.quantity;
    end if;
    if v_balance < 0 then
      raise exception 'production cannot be reduced: reserved stock would become negative';
    end if;
  elsif new.operation_key is null then
    new.operation_key := gen_random_uuid();
  end if;
  return new;
end;
$$;

revoke all on function private.validate_production_write() from public, anon, authenticated;

create or replace function private.journal_production_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta numeric(12,2);
begin
  if tg_op = 'UPDATE' and old.product_id <> new.product_id then
    insert into public.inventory_ledger (
      organization_id, product_id, source_type, source_id, movement_type,
      category, quantity_delta, operation_key, entry_key, description, created_by
    ) values (
      new.organization_id, old.product_id, 'production', new.id, 'production_adjustment',
      'production', -old.quantity, new.operation_key,
      'production:' || new.operation_key::text || ':old-product',
      'Снятие производства при изменении товара', (select auth.uid())
    );
    insert into public.inventory_ledger (
      organization_id, product_id, source_type, source_id, movement_type,
      category, quantity_delta, operation_key, entry_key, description, created_by
    ) values (
      new.organization_id, new.product_id, 'production', new.id, 'production_adjustment',
      'production', new.quantity, new.operation_key,
      'production:' || new.operation_key::text || ':new-product',
      'Перенос производства на другой товар', (select auth.uid())
    );
  else
    v_delta := new.quantity - case when tg_op = 'UPDATE' then old.quantity else 0 end;
    if v_delta <> 0 then
      insert into public.inventory_ledger (
        organization_id, product_id, source_type, source_id, movement_type,
        category, quantity_delta, operation_key, entry_key, description, created_by
      ) values (
        new.organization_id, new.product_id, 'production', new.id,
        case when tg_op = 'INSERT' then 'production' else 'production_adjustment' end,
        'production', v_delta, new.operation_key,
        'production:' || new.operation_key::text || ':stock',
        case when tg_op = 'INSERT' then 'Выпуск готовой продукции' else 'Корректировка записи производства' end,
        (select auth.uid())
      );
    end if;
  end if;

  insert into public.operation_events (
    organization_id, event_type, entity_type, entity_id, message, details,
    request_id, created_by
  ) values (
    new.organization_id,
    case when tg_op = 'INSERT' then 'production.created' else 'production.updated' end,
    'production_entry', new.id,
    case when tg_op = 'INSERT' then 'Записано производство' else 'Изменена запись производства' end,
    jsonb_build_object('product_id', new.product_id, 'quantity', new.quantity, 'employee_id', new.employee_id),
    new.operation_key, (select auth.uid())
  );
  return new;
end;
$$;

revoke all on function private.journal_production_write() from public, anon, authenticated;

drop trigger if exists orders_validate_inventory on public.orders;
create trigger orders_validate_inventory
  before insert or update on public.orders
  for each row execute function private.validate_order_write();

drop trigger if exists orders_journal_inventory on public.orders;
create trigger orders_journal_inventory
  after insert or update on public.orders
  for each row execute function private.journal_order_write();

drop trigger if exists production_validate_inventory on public.production_entries;
create trigger production_validate_inventory
  before insert or update on public.production_entries
  for each row execute function private.validate_production_write();

drop trigger if exists production_journal_inventory on public.production_entries;
create trigger production_journal_inventory
  after insert or update on public.production_entries
  for each row execute function private.journal_production_write();

create or replace function private.reject_business_record_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'business records cannot be deleted; cancel or correct them instead';
end;
$$;

revoke all on function private.reject_business_record_delete() from public, anon, authenticated;

drop trigger if exists orders_prevent_delete on public.orders;
create trigger orders_prevent_delete
  before delete on public.orders
  for each row execute function private.reject_business_record_delete();

drop trigger if exists production_prevent_delete on public.production_entries;
create trigger production_prevent_delete
  before delete on public.production_entries
  for each row execute function private.reject_business_record_delete();

revoke delete on table public.orders from authenticated;
revoke delete on table public.production_entries from authenticated;
drop policy if exists orders_delete on public.orders;
drop policy if exists production_delete on public.production_entries;

create or replace function public.save_order(
  p_idempotency_key uuid,
  p_order_id uuid,
  p_order_date date,
  p_client_id uuid,
  p_product_id text,
  p_quantity numeric,
  p_unit_price numeric,
  p_paid_amount numeric,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_org_id uuid;
  v_client_name text;
  v_fingerprint text;
  v_existing_fingerprint text;
  v_result jsonb;
  v_order_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key required'; end if;
  if p_order_date is null then raise exception 'order date required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive'; end if;
  if p_unit_price is null or p_unit_price < 0 then raise exception 'unit price cannot be negative'; end if;
  if p_paid_amount is null or p_paid_amount < 0 or p_paid_amount > p_quantity * p_unit_price then
    raise exception 'paid amount must be between zero and order total';
  end if;
  if p_status not in ('Новый', 'В доставке', 'Выполнен', 'Отменён') then
    raise exception 'invalid order status';
  end if;

  select p.organization_id into v_org_id
  from public.profiles p
  where p.id = v_user_id and p.active and p.role in ('owner', 'admin', 'staff');
  if v_org_id is null then raise exception 'active organization membership required'; end if;

  select c.name into v_client_name
  from public.clients c where c.id = p_client_id and c.organization_id = v_org_id;
  if v_client_name is null then raise exception 'client not found in organization'; end if;

  v_fingerprint := md5(concat_ws('|',
    coalesce(p_order_id::text, ''), p_order_date::text, p_client_id::text,
    p_product_id, p_quantity::text, p_unit_price::text,
    p_paid_amount::text, p_status
  ));

  insert into private.operation_requests (
    organization_id, operation_type, idempotency_key,
    request_fingerprint, created_by
  ) values (v_org_id, 'save_order', p_idempotency_key, v_fingerprint, v_user_id)
  on conflict do nothing;

  select r.request_fingerprint, r.result
    into v_existing_fingerprint, v_result
  from private.operation_requests r
  where r.organization_id = v_org_id
    and r.operation_type = 'save_order'
    and r.idempotency_key = p_idempotency_key
  for update;

  if v_existing_fingerprint <> v_fingerprint then
    raise exception 'idempotency key reused with different request';
  end if;
  if v_result is not null then return (v_result ->> 'id')::uuid; end if;

  if p_order_id is null then
    insert into public.orders (
      organization_id, order_date, client_id, client_name, product_id,
      quantity, unit_price, paid_amount, status, created_by, operation_key
    ) values (
      v_org_id, p_order_date, p_client_id, v_client_name, p_product_id,
      p_quantity, p_unit_price, p_paid_amount, p_status, v_user_id, p_idempotency_key
    ) returning id into v_order_id;
  else
    update public.orders
    set order_date = p_order_date,
        client_id = p_client_id,
        client_name = v_client_name,
        product_id = p_product_id,
        quantity = p_quantity,
        unit_price = p_unit_price,
        paid_amount = p_paid_amount,
        status = p_status,
        operation_key = p_idempotency_key
    where id = p_order_id and organization_id = v_org_id
    returning id into v_order_id;
    if v_order_id is null then raise exception 'order not found'; end if;
  end if;

  update private.operation_requests
  set result = jsonb_build_object('id', v_order_id), completed_at = now()
  where organization_id = v_org_id
    and operation_type = 'save_order'
    and idempotency_key = p_idempotency_key;
  return v_order_id;
end;
$$;

revoke all on function public.save_order(uuid, uuid, date, uuid, text, numeric, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.save_order(uuid, uuid, date, uuid, text, numeric, numeric, numeric, text)
  to authenticated;

create or replace function public.save_production_entry(
  p_idempotency_key uuid,
  p_entry_id uuid,
  p_production_date date,
  p_product_id text,
  p_quantity numeric,
  p_employee_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_org_id uuid;
  v_employee_name text;
  v_fingerprint text;
  v_existing_fingerprint text;
  v_result jsonb;
  v_entry_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key required'; end if;
  if p_production_date is null then raise exception 'production date required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive'; end if;

  select p.organization_id into v_org_id
  from public.profiles p
  where p.id = v_user_id and p.active and p.role in ('owner', 'admin', 'staff');
  if v_org_id is null then raise exception 'active organization membership required'; end if;

  select e.full_name into v_employee_name
  from public.employees e
  where e.id = p_employee_id and e.organization_id = v_org_id and e.active;
  if v_employee_name is null then raise exception 'active employee not found'; end if;

  v_fingerprint := md5(concat_ws('|',
    coalesce(p_entry_id::text, ''), p_production_date::text,
    p_product_id, p_quantity::text, p_employee_id::text
  ));

  insert into private.operation_requests (
    organization_id, operation_type, idempotency_key,
    request_fingerprint, created_by
  ) values (v_org_id, 'save_production_entry', p_idempotency_key, v_fingerprint, v_user_id)
  on conflict do nothing;

  select r.request_fingerprint, r.result
    into v_existing_fingerprint, v_result
  from private.operation_requests r
  where r.organization_id = v_org_id
    and r.operation_type = 'save_production_entry'
    and r.idempotency_key = p_idempotency_key
  for update;

  if v_existing_fingerprint <> v_fingerprint then
    raise exception 'idempotency key reused with different request';
  end if;
  if v_result is not null then return (v_result ->> 'id')::uuid; end if;

  if p_entry_id is null then
    insert into public.production_entries (
      organization_id, production_date, product_id, quantity,
      employee_id, employee_name, created_by, operation_key
    ) values (
      v_org_id, p_production_date, p_product_id, p_quantity,
      p_employee_id, v_employee_name, v_user_id, p_idempotency_key
    ) returning id into v_entry_id;
  else
    update public.production_entries
    set production_date = p_production_date,
        product_id = p_product_id,
        quantity = p_quantity,
        employee_id = p_employee_id,
        employee_name = v_employee_name,
        operation_key = p_idempotency_key
    where id = p_entry_id and organization_id = v_org_id
    returning id into v_entry_id;
    if v_entry_id is null then raise exception 'production entry not found'; end if;
  end if;

  update private.operation_requests
  set result = jsonb_build_object('id', v_entry_id), completed_at = now()
  where organization_id = v_org_id
    and operation_type = 'save_production_entry'
    and idempotency_key = p_idempotency_key;
  return v_entry_id;
end;
$$;

revoke all on function public.save_production_entry(uuid, uuid, date, text, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.save_production_entry(uuid, uuid, date, text, numeric, uuid)
  to authenticated;

create or replace function public.record_inventory_adjustment(
  p_idempotency_key uuid,
  p_product_id text,
  p_quantity_delta numeric,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_org_id uuid;
  v_role text;
  v_fingerprint text;
  v_existing_fingerprint text;
  v_result jsonb;
  v_ledger_id bigint;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key required'; end if;
  if p_quantity_delta is null or p_quantity_delta = 0 then raise exception 'adjustment cannot be zero'; end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'adjustment reason must contain 5 to 500 characters';
  end if;

  select p.organization_id, p.role into v_org_id, v_role
  from public.profiles p
  where p.id = v_user_id and p.active;
  if v_org_id is null or v_role <> 'owner' then raise exception 'owner access required'; end if;

  v_fingerprint := md5(concat_ws('|', p_product_id, p_quantity_delta::text, v_reason));
  insert into private.operation_requests (
    organization_id, operation_type, idempotency_key,
    request_fingerprint, created_by
  ) values (v_org_id, 'inventory_adjustment', p_idempotency_key, v_fingerprint, v_user_id)
  on conflict do nothing;

  select r.request_fingerprint, r.result
    into v_existing_fingerprint, v_result
  from private.operation_requests r
  where r.organization_id = v_org_id
    and r.operation_type = 'inventory_adjustment'
    and r.idempotency_key = p_idempotency_key
  for update;
  if v_existing_fingerprint <> v_fingerprint then
    raise exception 'idempotency key reused with different request';
  end if;
  if v_result is not null then return (v_result ->> 'id')::bigint; end if;

  perform 1 from public.products p
  where p.id = p_product_id and p.organization_id = v_org_id
  for update;
  if not found then raise exception 'product not found'; end if;
  if private.current_inventory(v_org_id, p_product_id) + p_quantity_delta < 0 then
    raise exception 'adjustment would make stock negative';
  end if;

  insert into public.inventory_ledger (
    organization_id, product_id, source_type, movement_type, category,
    quantity_delta, operation_key, entry_key, description, created_by
  ) values (
    v_org_id, p_product_id, 'adjustment', 'manual_adjustment', 'adjustment',
    p_quantity_delta, p_idempotency_key,
    'adjustment:' || p_idempotency_key::text,
    v_reason, v_user_id
  ) returning id into v_ledger_id;

  insert into public.operation_events (
    organization_id, severity, event_type, entity_type, message, details,
    request_id, created_by
  ) values (
    v_org_id, 'warning', 'inventory.adjusted', 'inventory',
    'Владелец скорректировал остаток',
    jsonb_build_object('product_id', p_product_id, 'quantity_delta', p_quantity_delta, 'reason', v_reason),
    p_idempotency_key, v_user_id
  );

  update private.operation_requests
  set result = jsonb_build_object('id', v_ledger_id), completed_at = now()
  where organization_id = v_org_id
    and operation_type = 'inventory_adjustment'
    and idempotency_key = p_idempotency_key;
  return v_ledger_id;
end;
$$;

revoke all on function public.record_inventory_adjustment(uuid, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.record_inventory_adjustment(uuid, text, numeric, text)
  to authenticated;

create or replace function public.retry_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_org_id uuid;
  v_updated boolean;
begin
  select p.organization_id into v_org_id
  from public.profiles p
  where p.id = v_user_id and p.active and p.role in ('owner', 'admin');
  if v_org_id is null then raise exception 'manager access required'; end if;

  update public.notification_events n
  set status = 'pending', next_attempt_at = now(), last_error = null, updated_at = now()
  where n.id = p_notification_id
    and n.organization_id = v_org_id
    and n.status in ('failed', 'dead_letter');
  v_updated := found;
  if not v_updated then raise exception 'failed notification not found'; end if;

  insert into public.operation_events (
    organization_id, event_type, entity_type, entity_id, message, details, created_by
  ) values (
    v_org_id, 'notification.retried', 'notification', p_notification_id,
    'Уведомление возвращено в очередь', '{}'::jsonb, v_user_id
  );
  return true;
end;
$$;

revoke all on function public.retry_notification(uuid) from public, anon, authenticated;
grant execute on function public.retry_notification(uuid) to authenticated;

create or replace function public.accept_website_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_org_id uuid;
  v_customer_name text;
  v_phone text;
  v_customer_type text;
  v_product_id text;
  v_quantity numeric(12,2);
  v_request_status text;
  v_processed_order_id uuid;
  v_client_id uuid;
  v_order_id uuid;
  v_unit_price numeric(12,2);
  v_phone_digits text;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select p.organization_id into v_org_id
  from public.profiles p
  where p.id = v_user_id and p.active and p.role in ('owner', 'admin', 'staff');
  if v_org_id is null then raise exception 'active organization membership required'; end if;

  select r.customer_name, r.phone, r.customer_type, r.product_id,
         r.quantity, r.status, r.processed_order_id
    into v_customer_name, v_phone, v_customer_type, v_product_id,
         v_quantity, v_request_status, v_processed_order_id
  from public.website_requests r
  where r.id = p_request_id and r.organization_id = v_org_id
  for update;
  if not found then raise exception 'website request not found'; end if;
  if v_processed_order_id is not null then return v_processed_order_id; end if;
  if v_request_status = 'Закрыта' then raise exception 'website request already processed'; end if;

  select p.default_price into v_unit_price
  from public.products p
  where p.id = v_product_id and p.organization_id = v_org_id and p.active;
  if v_unit_price is null then raise exception 'active product not found'; end if;

  v_phone_digits := regexp_replace(v_phone, '[^0-9]+', '', 'g');
  select c.id into v_client_id
  from public.clients c
  where c.organization_id = v_org_id
    and regexp_replace(c.phone, '[^0-9]+', '', 'g') = v_phone_digits
  order by c.created_at
  limit 1;

  if v_client_id is null then
    insert into public.clients (organization_id, name, category, phone, created_by)
    values (
      v_org_id, btrim(v_customer_name),
      case when v_customer_type = 'business' then 'Оптовые клиенты' else 'Частные клиенты' end,
      btrim(v_phone), v_user_id
    ) returning id into v_client_id;
  end if;

  v_order_id := public.save_order(
    p_request_id, null, current_date, v_client_id, v_product_id,
    v_quantity, v_unit_price, 0, 'Новый'
  );

  update public.website_requests
  set status = 'Принята', processed_order_id = v_order_id
  where id = p_request_id and organization_id = v_org_id;
  return v_order_id;
end;
$$;

revoke all on function public.accept_website_request(uuid)
  from public, anon, authenticated;
grant execute on function public.accept_website_request(uuid)
  to authenticated;
