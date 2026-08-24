-- Public website enquiries stay separate from confirmed CRM orders.
-- Anonymous browsers call the validated Edge Function; the table itself is not
-- exposed to the anon role.

create table public.website_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 120),
  phone text not null check (char_length(btrim(phone)) between 7 and 40),
  customer_type text not null check (customer_type in ('private','business')),
  product_id text not null references public.products(id),
  quantity numeric(12,2) not null check (quantity >= 1 and quantity <= 10000),
  message text not null default '' check (char_length(message) <= 500),
  status text not null default 'Новая' check (status in ('Новая','Связались','Принята','Закрыта')),
  source text not null default 'icefresh.kz' check (char_length(source) between 1 and 80),
  ip_hash text not null check (char_length(ip_hash) = 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index website_requests_org_created_idx
  on public.website_requests(organization_id, created_at desc);
create index website_requests_product_id_idx
  on public.website_requests(product_id);
create index website_requests_ip_created_idx
  on public.website_requests(ip_hash, created_at desc);
create index website_requests_open_idx
  on public.website_requests(organization_id, status, created_at desc)
  where status in ('Новая','Связались','Принята');

create trigger website_requests_touch
  before update on public.website_requests
  for each row execute function private.touch_updated_at();
create trigger website_requests_audit
  after insert or update or delete on public.website_requests
  for each row execute function private.audit_change();

alter table public.website_requests enable row level security;

create policy website_requests_select
  on public.website_requests for select to authenticated
  using (organization_id = (select private.current_org_id()));

create policy website_requests_update
  on public.website_requests for update to authenticated
  using (organization_id = (select private.current_org_id()))
  with check (organization_id = (select private.current_org_id()));

-- Explicit Data API allow-list. Public visitors never receive table access.
revoke all privileges on table public.website_requests from anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select (
  id, organization_id, customer_name, phone, customer_type, product_id,
  quantity, message, status, source, created_at, updated_at
) on public.website_requests to authenticated;
grant update (status) on public.website_requests to authenticated;
grant select, insert on public.website_requests to service_role;
grant select (id, created_at) on public.organizations to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'website_requests'
  ) then
    alter publication supabase_realtime add table public.website_requests;
  end if;
end $$;
