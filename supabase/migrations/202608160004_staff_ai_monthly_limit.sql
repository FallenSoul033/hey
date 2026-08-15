-- Give every active employee role-scoped AI access while keeping one shared monthly cost ceiling.

drop policy if exists ai_usage_manager_select on public.ai_usage;
drop policy if exists ai_usage_manager_insert on public.ai_usage;

create policy ai_usage_active_user_select
  on public.ai_usage for select to authenticated
  using (
    organization_id = (select private.current_org_id())
    and user_id = (select auth.uid())
  );

create policy ai_usage_active_user_insert
  on public.ai_usage for insert to authenticated
  with check (
    organization_id = (select private.current_org_id())
    and user_id = (select auth.uid())
  );

create table private.ai_monthly_usage (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month_start date not null,
  request_count integer not null default 0 check (request_count between 0 and 500),
  updated_at timestamptz not null default now(),
  primary key (organization_id, month_start)
);

revoke all privileges on table private.ai_monthly_usage from public, anon, authenticated;

create or replace function private.reserve_ai_monthly_slot()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_reserved boolean := false;
begin
  select p.organization_id
    into v_organization_id
    from public.profiles p
   where p.id = v_user_id
     and p.active
   limit 1;

  if v_user_id is null or v_organization_id is null then
    return false;
  end if;

  insert into private.ai_monthly_usage (organization_id, month_start, request_count)
  values (v_organization_id, date_trunc('month', now())::date, 1)
  on conflict (organization_id, month_start) do update
    set request_count = private.ai_monthly_usage.request_count + 1,
        updated_at = now()
    where private.ai_monthly_usage.request_count < 500
  returning true into v_reserved;

  return coalesce(v_reserved, false);
end;
$$;

revoke all on function private.reserve_ai_monthly_slot() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.reserve_ai_monthly_slot() to authenticated;

drop function public.reserve_ai_request();

create function public.reserve_ai_request()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid := private.current_org_id();
  v_recent_count integer;
begin
  if v_user_id is null or v_organization_id is null then
    return 'denied';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('ai-user:' || v_organization_id::text || ':' || v_user_id::text, 0)
  );

  select count(*)
    into v_recent_count
    from public.ai_usage
   where organization_id = v_organization_id
     and user_id = v_user_id
     and requested_at >= now() - interval '1 hour';

  if v_recent_count >= 12 then
    return 'hourly_limit';
  end if;

  if not private.reserve_ai_monthly_slot() then
    return 'monthly_limit';
  end if;

  insert into public.ai_usage (organization_id, user_id)
  values (v_organization_id, v_user_id);

  return 'reserved';
end;
$$;

revoke all on function public.reserve_ai_request() from public, anon, authenticated;
grant execute on function public.reserve_ai_request() to authenticated;

comment on function public.reserve_ai_request() is
  'Reserves one AI request for an active employee, capped at 12/hour/user and 500/calendar-month/organization.';
