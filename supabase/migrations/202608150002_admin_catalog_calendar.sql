-- Owner administration, organization-scoped catalogue, product images, and
-- the operations calendar. All browser-facing tables remain protected by RLS.

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.active and p.role = 'owner'
    from public.profiles p
    where p.id = (select auth.uid())
  ), false)
$$;

revoke execute on function private.is_owner() from public, anon, service_role;
grant execute on function private.is_owner() to authenticated;

alter table public.organization_invites
  add column employee_id uuid references public.employees(id) on delete set null;
create index organization_invites_employee_id_idx
  on public.organization_invites(employee_id);

create or replace function public.accept_invite(p_token uuid, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.organization_invites%rowtype;
  display_name text;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if exists(select 1 from public.profiles where id = uid and organization_id is not null) then
    raise exception 'profile already belongs to an organization';
  end if;

  select * into inv
  from public.organization_invites
  where token = p_token and accepted_at is null and expires_at > now()
  for update;
  if not found then raise exception 'invite is invalid or expired'; end if;

  display_name := coalesce(nullif(btrim(p_full_name), ''), 'Сотрудник');
  update public.profiles
  set organization_id = inv.organization_id,
      full_name = display_name,
      role = inv.role,
      active = true,
      updated_at = now()
  where id = uid;

  if inv.employee_id is not null then
    update public.employees
    set profile_id = uid,
        full_name = display_name,
        active = true,
        updated_at = now()
    where id = inv.employee_id
      and organization_id = inv.organization_id
      and profile_id is null;
    if not found then raise exception 'employee record is unavailable'; end if;
  else
    insert into public.employees(organization_id, profile_id, full_name, created_by)
    values(inv.organization_id, uid, display_name, inv.created_by);
  end if;

  update public.organization_invites
  set accepted_by = uid, accepted_at = now()
  where id = inv.id;
  return inv.organization_id;
end
$$;

revoke execute on function public.accept_invite(uuid, text) from public, anon, service_role;
grant execute on function public.accept_invite(uuid, text) to authenticated;

-- Turn the original fixed three-row product list into a manageable catalogue.
alter table public.products
  drop constraint if exists products_id_check;
alter table public.products
  drop constraint if exists products_name_key;

alter table public.products
  add column organization_id uuid references public.organizations(id) on delete cascade,
  add column description text not null default '',
  add column weight_label text not null default '',
  add column photo_path text,
  add column active boolean not null default true,
  add column public_visible boolean not null default true,
  add column sort_order integer not null default 0,
  add column created_by uuid references auth.users(id) on delete restrict,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

update public.products p
set organization_id = o.id,
    created_by = o.created_by
from (
  select id, created_by
  from public.organizations
  order by created_at
  limit 1
) o
where p.organization_id is null;

do $$
begin
  if exists (select 1 from public.products where organization_id is null or created_by is null) then
    raise exception 'products require an existing organization and owner';
  end if;
end $$;

alter table public.products
  alter column organization_id set not null,
  alter column created_by set not null,
  add constraint products_id_length_check check (char_length(id) between 1 and 80),
  add constraint products_name_length_check check (char_length(btrim(name)) between 2 and 160),
  add constraint products_description_length_check check (char_length(description) <= 500),
  add constraint products_weight_label_length_check check (char_length(weight_label) <= 40),
  add constraint products_photo_path_length_check check (photo_path is null or char_length(photo_path) between 1 and 500),
  add constraint products_unit_length_check check (char_length(btrim(unit)) between 1 and 30),
  add constraint products_sort_order_check check (sort_order between 0 and 100000);

update public.products
set description = case id
      when 'cup250' then 'Удобный формат для напитков и мероприятий.'
      when 'bag1' then 'Практичный формат для дома, заведений и ежедневных потребностей.'
      when 'bag2' then 'Большой объём для ресторанов, магазинов и мероприятий.'
      else description
    end,
    weight_label = case id
      when 'cup250' then '250 г'
      when 'bag1' then '1 кг'
      when 'bag2' then '2 кг'
      else weight_label
    end,
    sort_order = case id when 'cup250' then 10 when 'bag1' then 20 when 'bag2' then 30 else sort_order end;

create unique index products_org_name_unique_idx
  on public.products(organization_id, lower(btrim(name)));
create index products_organization_id_idx on public.products(organization_id);
create index products_created_by_idx on public.products(created_by);
create index products_public_catalog_idx
  on public.products(organization_id, sort_order, name)
  where active and public_visible;

create trigger products_touch
  before update on public.products
  for each row execute function private.touch_updated_at();

drop policy if exists products_select on public.products;
create policy products_public_select
  on public.products for select to anon, authenticated
  using (active and public_visible);
create policy products_org_select
  on public.products for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy products_manage_insert
  on public.products for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and created_by = (select auth.uid())
    and (select private.is_manager())
  );
create policy products_manage_update
  on public.products for update to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  )
  with check (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  );
create policy products_manage_delete
  on public.products for delete to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  );

revoke all privileges on table public.products from anon, authenticated;
grant select (id, name, description, weight_label, default_price, unit, photo_path, active, public_visible, sort_order)
  on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.products to service_role;

-- Publicly served product images; only managers in the matching organization
-- folder may upload, replace, list, or remove objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy product_images_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
    and (select private.is_manager())
  );
create policy product_images_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and (select private.is_manager())
  );
create policy product_images_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
    and (select private.is_manager())
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and (select private.is_manager())
  );
create policy product_images_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
    and (select private.is_manager())
  );

-- Calendar records are organization-scoped. Staff may maintain the plan; only
-- managers may permanently delete entries.
create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  item_type text not null default 'shipment' check (item_type in ('shipment', 'commitment', 'production', 'other')),
  scheduled_at timestamptz not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null default '' check (char_length(client_name) <= 160),
  order_id uuid references public.orders(id) on delete set null,
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'Запланировано' check (status in ('Запланировано', 'В работе', 'Выполнено', 'Отменено')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index schedule_items_org_date_idx
  on public.schedule_items(organization_id, scheduled_at);
create index schedule_items_org_status_date_idx
  on public.schedule_items(organization_id, status, scheduled_at);
create index schedule_items_client_id_idx on public.schedule_items(client_id);
create index schedule_items_order_id_idx on public.schedule_items(order_id);
create index schedule_items_created_by_idx on public.schedule_items(created_by);

create trigger schedule_items_touch
  before update on public.schedule_items
  for each row execute function private.touch_updated_at();
create trigger schedule_items_audit
  after insert or update or delete on public.schedule_items
  for each row execute function private.audit_change();

alter table public.schedule_items enable row level security;
create policy schedule_items_select
  on public.schedule_items for select to authenticated
  using (organization_id = (select private.current_org_id()));
create policy schedule_items_insert
  on public.schedule_items for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and created_by = (select auth.uid())
  );
create policy schedule_items_update
  on public.schedule_items for update to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));
create policy schedule_items_delete
  on public.schedule_items for delete to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  );

revoke all privileges on table public.schedule_items from anon, authenticated;
grant select, insert, update, delete on public.schedule_items to authenticated;

-- The owner can change another member between administrator and employee, or
-- suspend access. Direct role/active column updates remain unavailable.
create or replace function public.manage_member(p_member_id uuid, p_role text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_org uuid;
  target_role text;
  target_org uuid;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_role not in ('admin', 'staff') then raise exception 'invalid member role'; end if;

  select organization_id into caller_org
  from public.profiles
  where id = caller_id and active and role = 'owner';
  if caller_org is null then raise exception 'owner access required'; end if;

  select organization_id, role into target_org, target_role
  from public.profiles
  where id = p_member_id
  for update;
  if target_org is distinct from caller_org then raise exception 'member not found'; end if;
  if p_member_id = caller_id or target_role = 'owner' then raise exception 'owner account cannot be changed'; end if;

  update public.profiles
  set role = p_role, active = p_active, updated_at = now()
  where id = p_member_id;

  update public.employees
  set active = p_active, updated_at = now()
  where profile_id = p_member_id and organization_id = caller_org;
end
$$;

revoke execute on function public.manage_member(uuid, text, boolean) from public, anon, service_role;
grant execute on function public.manage_member(uuid, text, boolean) to authenticated;
grant update (full_name, position, phone, active) on public.employees to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'schedule_items'
  ) then
    alter publication supabase_realtime add table public.schedule_items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end $$;
