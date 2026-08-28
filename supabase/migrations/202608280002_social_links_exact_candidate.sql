-- Reconcile earlier non-production social_links prototypes with the exact
-- candidate contract. Fresh installs already created by 202608280001 pass
-- through this migration without data loss.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'social_links'
      and column_name = 'display_order'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'social_links'
      and column_name = 'sort_order'
  ) then
    alter table public.social_links rename column display_order to sort_order;
  end if;
end $$;

update public.social_links
set platform = lower(btrim(platform)),
    url = btrim(url),
    label = coalesce(nullif(btrim(label), ''), lower(btrim(platform))),
    sort_order = greatest(0, least(100000, sort_order)),
    created_by = coalesce(created_by, (
      select organizations.created_by
      from public.organizations
      where organizations.id = social_links.organization_id
    ));

do $$
begin
  if exists (
    select 1
    from public.social_links
    group by organization_id, platform
    having count(*) > 1
  ) then
    raise exception 'duplicate social link platforms must be resolved before migration';
  end if;
end $$;

alter table public.social_links
  alter column url set default '',
  alter column label set not null,
  alter column enabled set default false,
  alter column sort_order set default 0,
  alter column created_by drop default,
  alter column created_by set not null,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.social_links
  drop constraint if exists social_links_platform_check,
  drop constraint if exists social_links_label_check,
  drop constraint if exists social_links_url_length_check,
  drop constraint if exists social_links_order_check,
  drop constraint if exists social_links_display_order_check,
  drop constraint if exists social_links_enabled_url_check,
  drop constraint if exists social_links_url_check,
  drop constraint if exists social_links_org_platform_unique,
  drop constraint if exists social_links_created_by_fkey;

alter table public.social_links
  add constraint social_links_platform_check check (platform ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  add constraint social_links_label_check check (char_length(btrim(label)) between 1 and 80),
  add constraint social_links_url_length_check check (char_length(url) <= 2048),
  add constraint social_links_order_check check (sort_order between 0 and 100000),
  add constraint social_links_enabled_url_check check (not enabled or url <> ''),
  add constraint social_links_url_check check (
    url = ''
    or (
      url ~ '^https://([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(?::[0-9]{1,5})?(?:[/?#][^[:space:]]*)?$'
      and (
        url !~ '^https://[^/]+:[0-9]{1,5}(?:[/?#]|$)'
        or substring(url from '^https://[^/]+:([0-9]{1,5})(?:[/?#]|$)')::integer between 1 and 65535
      )
    )
  ),
  add constraint social_links_org_platform_unique unique (organization_id, platform),
  add constraint social_links_created_by_fkey foreign key (created_by)
    references auth.users(id) on delete restrict;

drop index if exists public.social_links_org_order_idx;
drop index if exists public.social_links_created_by_idx;
drop index if exists public.social_links_public_order_idx;
create index social_links_org_order_idx
  on public.social_links(organization_id, sort_order, platform);
create index social_links_created_by_idx
  on public.social_links(created_by);
create index social_links_public_order_idx
  on public.social_links(sort_order, platform)
  where enabled and url <> '';

drop trigger if exists social_links_touch_updated_at on public.social_links;
drop trigger if exists social_links_touch on public.social_links;
drop trigger if exists social_links_audit on public.social_links;
create trigger social_links_touch
  before update on public.social_links
  for each row execute function private.touch_updated_at();
create trigger social_links_audit
  after insert or update or delete on public.social_links
  for each row execute function private.audit_change();

alter table public.social_links enable row level security;

drop policy if exists social_links_public_select on public.social_links;
drop policy if exists social_links_org_select on public.social_links;
drop policy if exists social_links_manager_insert on public.social_links;
drop policy if exists social_links_manager_update on public.social_links;
drop policy if exists social_links_manager_delete on public.social_links;

create policy social_links_public_select
  on public.social_links for select
  to anon
  using (enabled and url <> '');

create policy social_links_org_select
  on public.social_links for select
  to authenticated
  using (organization_id = (select private.current_org_id()));

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

do $$
declare
  column_record record;
begin
  for column_record in
    select attname
    from pg_attribute
    where attrelid = 'public.social_links'::regclass
      and attnum > 0
      and not attisdropped
  loop
    execute format(
      'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on table public.social_links from anon, authenticated',
      column_record.attname
    );
  end loop;
end $$;

revoke all privileges on table public.social_links from anon, authenticated;
grant select (platform, url, label, sort_order)
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
