-- IceFresh RC1.5 security hardening.
-- Public request submission is made idempotent and rate limiting is serialized in PostgreSQL.

create extension if not exists pgcrypto with schema extensions;

alter table public.website_requests
  add column if not exists idempotency_key uuid;

create unique index if not exists website_requests_org_idempotency_uidx
  on public.website_requests(organization_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists private.public_request_security (
  singleton boolean primary key default true check (singleton),
  hmac_secret bytea not null
);

insert into private.public_request_security(singleton, hmac_secret)
values (true, extensions.gen_random_bytes(32))
on conflict (singleton) do nothing;

revoke all on private.public_request_security from public, anon, authenticated;

create or replace function public.submit_public_request_rc(
  p_organization_id uuid,
  p_idempotency_key uuid,
  p_customer_name text,
  p_phone text,
  p_customer_type text,
  p_product_id text,
  p_quantity numeric,
  p_message text,
  p_client_ip text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_ip_hash text;
  v_secret bytea;
  v_count integer;
  v_phone_digits text;
  v_name text := btrim(coalesce(p_customer_name,''));
  v_phone text := btrim(coalesce(p_phone,''));
  v_message text := btrim(coalesce(p_message,''));
begin
  if p_organization_id is null or p_idempotency_key is null then
    raise exception 'PUBLIC_REQUEST_INVALID';
  end if;

  select id into v_id
  from public.website_requests
  where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
  if v_id is not null then return v_id; end if;

  v_phone_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
  if char_length(v_name) < 2 or char_length(v_name) > 120
     or char_length(v_phone_digits) < 7 or char_length(v_phone_digits) > 15
     or p_customer_type not in ('private','business')
     or p_product_id is null or char_length(p_product_id) < 1 or char_length(p_product_id) > 80
     or p_quantity is null or p_quantity < 1 or p_quantity > 10000 or p_quantity <> trunc(p_quantity)
     or char_length(v_message) > 500
     or p_client_ip is null or char_length(p_client_ip) > 128
  then
    raise exception 'PUBLIC_REQUEST_INVALID';
  end if;

  perform 1 from public.organizations where id=p_organization_id;
  if not found then raise exception 'PUBLIC_REQUEST_INVALID'; end if;

  perform 1 from public.products
   where id=p_product_id and organization_id=p_organization_id and active and public_visible;
  if not found then raise exception 'PUBLIC_PRODUCT_UNAVAILABLE'; end if;

  select hmac_secret into v_secret
  from private.public_request_security
  where singleton=true;
  if v_secret is null then raise exception 'PUBLIC_REQUEST_SECURITY_UNAVAILABLE'; end if;

  v_ip_hash := encode(extensions.hmac(convert_to(p_client_ip,'UTF8'), v_secret, 'sha256'), 'hex');

  -- Serialize one IP's sliding-window check and insert to prevent parallel bypasses.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_ip_hash, 0));

  -- Re-check idempotency inside the serialized section.
  select id into v_id
  from public.website_requests
  where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
  if v_id is not null then return v_id; end if;

  select count(*)::integer into v_count
  from public.website_requests
  where ip_hash=v_ip_hash and created_at >= now() - interval '1 hour';
  if v_count >= 5 then raise exception 'PUBLIC_RATE_LIMIT'; end if;

  begin
    insert into public.website_requests(
      organization_id, customer_name, phone, customer_type, product_id,
      quantity, message, ip_hash, idempotency_key
    ) values (
      p_organization_id, v_name, v_phone, p_customer_type, p_product_id,
      p_quantity, v_message, v_ip_hash, p_idempotency_key
    ) returning id into v_id;
  exception when unique_violation then
    select id into v_id
    from public.website_requests
    where organization_id=p_organization_id and idempotency_key=p_idempotency_key;
    if v_id is null then raise; end if;
  end;

  return v_id;
end;
$$;

revoke all on function public.submit_public_request_rc(uuid,uuid,text,text,text,text,numeric,text,text)
  from public, anon, authenticated;
grant execute on function public.submit_public_request_rc(uuid,uuid,text,text,text,text,numeric,text,text)
  to service_role;
