begin;

update public.profiles
set role = 'staff', active = true
where id = (
  select id
  from public.profiles
  where role = 'owner' and active
  order by id
  limit 1
);

select set_config(
  'request.jwt.claim.sub',
  (
    select id::text
    from public.profiles
    where role = 'staff' and active
    order by id
    limit 1
  ),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $regression$
declare
  v_client uuid;
  v_product text;
  v_employee uuid;
  v_order uuid;
  v_items jsonb;
begin
  select id into v_client from public.clients order by created_at limit 1;
  select id into v_product from public.products where active order by sort_order nulls last, id limit 1;
  select id into v_employee from public.employees where active order by created_at limit 1;

  if v_client is null or v_product is null or v_employee is null then
    raise exception 'shipped-order regression fixtures unavailable';
  end if;

  perform public.save_production_entry_rc(
    gen_random_uuid(), null, current_date, v_product, 5, v_employee
  );

  v_items := jsonb_build_array(
    jsonb_build_object('product_id', v_product, 'quantity', 1)
  );

  v_order := public.save_order_operational_rc(
    gen_random_uuid(), null, current_date, v_client, v_items, 'Новый'
  );
  perform public.save_order_operational_rc(
    gen_random_uuid(), v_order, current_date, v_client, v_items, 'Подтверждён'
  );
  perform public.save_order_operational_rc(
    gen_random_uuid(), v_order, current_date, v_client, v_items, 'Готов'
  );
  perform public.save_order_operational_rc(
    gen_random_uuid(), v_order, current_date, v_client, v_items, 'На доставке'
  );
  perform public.save_order_operational_rc(
    gen_random_uuid(), v_order, current_date, v_client, v_items, 'Доставлен'
  );
end
$regression$;

rollback;

