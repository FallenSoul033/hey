-- Serialize each manager's AI reservations so concurrent requests cannot bypass the cost limit.

create or replace function public.reserve_ai_request()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid := private.current_org_id();
  v_recent_count integer;
begin
  if v_user_id is null
    or v_organization_id is null
    or not private.is_manager()
  then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':' || v_user_id::text, 0)
  );

  select count(*)
    into v_recent_count
    from public.ai_usage
   where organization_id = v_organization_id
     and user_id = v_user_id
     and requested_at >= now() - interval '1 hour';

  if v_recent_count >= 12 then
    return false;
  end if;

  insert into public.ai_usage (organization_id, user_id)
  values (v_organization_id, v_user_id);

  return true;
end;
$$;

revoke all on function public.reserve_ai_request() from public, anon, authenticated;
grant execute on function public.reserve_ai_request() to authenticated;

comment on function public.reserve_ai_request() is
  'Atomically reserves one of the current manager user''s 12 hourly AI requests.';
