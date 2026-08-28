-- Organization-managed public contact links. Destination URLs live only in
-- Supabase; the frontend contains labels/icons but no social destination.

create table public.social_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null,
  url text not null default '',
  label text not null,
  enabled boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_links_platform_check check (platform ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  constraint social_links_label_check check (char_length(btrim(label)) between 1 and 80),
  constraint social_links_url_length_check check (char_length(url) <= 2048),
  constraint social_links_order_check check (sort_order between 0 and 100000),
  constraint social_links_enabled_url_check check (not enabled or url <> ''),
  constraint social_links_url_check check (
    url = ''
    or (platform = 'email' and url ~* '^mailto:[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    or (platform = 'phone' and url ~* '^tel:\+?[0-9 ()-]{6,30}$')
    or (platform not in ('email', 'phone') and url ~* '^https://[^[:space:]]+$')
  ),
  constraint social_links_org_platform_unique unique (organization_id, platform)
);

create index social_links_org_order_idx
  on public.social_links(organization_id, sort_order, platform);
create index social_links_public_order_idx
  on public.social_links(sort_order, platform)
  where enabled and url <> '';

create trigger social_links_touch
  before update on public.social_links
  for each row execute function private.touch_updated_at();
create trigger social_links_audit
  after insert or update or delete on public.social_links
  for each row execute function private.audit_change();

alter table public.social_links enable row level security;

create policy social_links_public_select
  on public.social_links for select
  to anon
  using (enabled and url <> '');

create policy social_links_authenticated_select
  on public.social_links for select
  to authenticated
  using (
    (enabled and url <> '')
    or (
      organization_id = (select private.current_org_id())
      and (select private.is_manager())
    )
  );

create policy social_links_manager_insert
  on public.social_links for insert
  to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and created_by = (select auth.uid())
    and (select private.is_manager())
  );

create policy social_links_manager_update
  on public.social_links for update
  to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  )
  with check (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  );

create policy social_links_manager_delete
  on public.social_links for delete
  to authenticated
  using (
    organization_id = (select private.current_org_id())
    and (select private.is_manager())
  );

revoke all privileges on table public.social_links from anon, authenticated;
grant select (id, platform, url, label, enabled, sort_order)
  on public.social_links to anon;
grant select (id, organization_id, platform, url, label, enabled, sort_order)
  on public.social_links to authenticated;
grant insert (organization_id, platform, url, label, enabled, sort_order, created_by)
  on public.social_links to authenticated;
grant update (platform, url, label, enabled, sort_order)
  on public.social_links to authenticated;
grant delete on public.social_links to authenticated;
grant select, insert, update, delete on public.social_links to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'social_links'
  ) then
    alter publication supabase_realtime add table public.social_links;
  end if;
end $$;
