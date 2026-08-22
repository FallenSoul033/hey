-- RC1.6.1 blocker #4: make the v2 snapshot authoritative while preserving
-- the legacy writer as the implementation behind the public v2 wrappers.
--
-- The legacy wrappers still contain an _expected_item_count compatibility
-- guard for older editors. A valid v2 caller supplies p_expected_items instead.
-- After the exact snapshot is accepted, inject the already-verified current
-- item count server-side only so the legacy compatibility guard cannot reject
-- a legitimate reduction in p_items. This is not a second concurrency guard:
-- private.assert_order_items_snapshot remains authoritative for v2 callers.

create or replace function public.save_order_manager_rc_v2(
  p_idempotency_key uuid,
  p_order_id uuid,
  p_order_date date,
  p_client_id uuid,
  p_items jsonb,
  p_paid_amount numeric,
  p_status text,
  p_expected_items jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_legacy_items jsonb := p_items;
  v_verified_item_count integer;
begin
  select p.organization_id into v_org
  from public.profiles p
  where p.id = v_uid and p.active and p.organization_id is not null and p.role in ('owner','admin');
  if v_org is null then raise exception 'manager access required'; end if;

  if p_order_id is not null then
    perform 1
    from public.orders o
    where o.id = p_order_id and o.organization_id = v_org
    for update;
    if not found then raise exception 'order not found'; end if;

    perform private.assert_order_items_snapshot(v_org, p_order_id, p_expected_items, true);

    -- Compatibility only: the authoritative v2 snapshot has already passed.
    -- Supply the verified current count to the legacy wrapper so it does not
    -- mistake a legitimate 3 -> 2 reduction for an old partial editor.
    v_verified_item_count := jsonb_array_length(p_expected_items);
    if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
      v_legacy_items := jsonb_set(
        p_items,
        '{0,_expected_item_count}',
        to_jsonb(v_verified_item_count),
        true
      );
    end if;
  end if;

  return public.save_order_manager_rc(
    p_idempotency_key,
    p_order_id,
    p_order_date,
    p_client_id,
    v_legacy_items,
    p_paid_amount,
    p_status
  );
end;
$$;

create or replace function public.save_order_operational_rc_v2(
  p_idempotency_key uuid,
  p_order_id uuid,
  p_order_date date,
  p_client_id uuid,
  p_items jsonb,
  p_status text,
  p_expected_items jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_legacy_items jsonb := p_items;
  v_verified_item_count integer;
begin
  select p.organization_id into v_org
  from public.profiles p
  where p.id = v_uid and p.active and p.organization_id is not null and p.role in ('owner','admin','staff');
  if v_org is null then raise exception 'active organization membership required'; end if;

  if p_order_id is not null then
    perform 1
    from public.orders o
    where o.id = p_order_id and o.organization_id = v_org
    for update;
    if not found then raise exception 'order not found'; end if;

    perform private.assert_order_items_snapshot(v_org, p_order_id, p_expected_items, false);

    -- Same compatibility bridge for operational saves. Staff authorization,
    -- status transitions and price handling remain enforced by the legacy
    -- operational wrapper after the v2 snapshot check.
    v_verified_item_count := jsonb_array_length(p_expected_items);
    if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
      v_legacy_items := jsonb_set(
        p_items,
        '{0,_expected_item_count}',
        to_jsonb(v_verified_item_count),
        true
      );
    end if;
  end if;

  return public.save_order_operational_rc(
    p_idempotency_key,
    p_order_id,
    p_order_date,
    p_client_id,
    v_legacy_items,
    p_status
  );
end;
$$;

-- Preserve the existing RPC exposure exactly: no new grants and no broader roles.
revoke all on function public.save_order_manager_rc_v2(uuid,uuid,date,uuid,jsonb,numeric,text,jsonb) from public, anon;
revoke all on function public.save_order_operational_rc_v2(uuid,uuid,date,uuid,jsonb,text,jsonb) from public, anon;
grant execute on function public.save_order_manager_rc_v2(uuid,uuid,date,uuid,jsonb,numeric,text,jsonb) to authenticated;
grant execute on function public.save_order_operational_rc_v2(uuid,uuid,date,uuid,jsonb,text,jsonb) to authenticated;
