-- Run the conversion with the caller's normal grants and RLS policies.
-- Only allow-listed request columns are selected, so confidential request
-- metadata remains unavailable to the authenticated role.

create or replace function public.accept_website_request(p_request_id uuid)
returns uuid
language plpgsql
security invoker
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
  v_client_id uuid;
  v_order_id uuid;
  v_unit_price numeric(12,2);
  v_phone_digits text;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select organization_id
    into v_org_id
  from public.profiles
  where id = v_user_id
    and active
    and organization_id is not null
    and role in ('owner', 'admin', 'staff');

  if v_org_id is null then
    raise exception 'active organization membership required';
  end if;

  select customer_name, phone, customer_type, product_id, quantity, status
    into v_customer_name, v_phone, v_customer_type, v_product_id, v_quantity, v_request_status
  from public.website_requests
  where id = p_request_id
    and organization_id = v_org_id
  for update;

  if not found then
    raise exception 'website request not found';
  end if;
  if v_request_status in ('Принята', 'Закрыта') then
    raise exception 'website request already processed';
  end if;

  select default_price
    into v_unit_price
  from public.products
  where id = v_product_id
    and organization_id = v_org_id
    and active;

  if v_unit_price is null then
    raise exception 'active product not found';
  end if;

  v_phone_digits := regexp_replace(v_phone, '[^0-9]+', '', 'g');

  select id
    into v_client_id
  from public.clients
  where organization_id = v_org_id
    and regexp_replace(phone, '[^0-9]+', '', 'g') = v_phone_digits
  order by created_at
  limit 1;

  if v_client_id is null then
    insert into public.clients (
      organization_id, name, category, phone, created_by
    ) values (
      v_org_id,
      btrim(v_customer_name),
      case when v_customer_type = 'business'
        then 'Оптовые клиенты'
        else 'Частные клиенты'
      end,
      btrim(v_phone),
      v_user_id
    ) returning id into v_client_id;
  end if;

  insert into public.orders (
    organization_id, order_date, client_id, client_name, product_id,
    quantity, unit_price, paid_amount, status, created_by
  ) values (
    v_org_id,
    current_date,
    v_client_id,
    btrim(v_customer_name),
    v_product_id,
    v_quantity,
    v_unit_price,
    0,
    'Новый',
    v_user_id
  ) returning id into v_order_id;

  update public.website_requests
  set status = 'Принята'
  where id = p_request_id
    and organization_id = v_org_id;

  return v_order_id;
end;
$$;

revoke all on function public.accept_website_request(uuid)
  from public, anon, authenticated;
grant execute on function public.accept_website_request(uuid)
  to authenticated;
