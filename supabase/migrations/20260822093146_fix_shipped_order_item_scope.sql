CREATE OR REPLACE FUNCTION public.save_order_rc(p_idempotency_key uuid, p_order_id uuid, p_order_date date, p_client_id uuid, p_items jsonb, p_paid_amount numeric, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_client_name text;
  v_order_id uuid := p_order_id;
  v_old_status text;
  v_old_total numeric := 0;
  v_new_total numeric := 0;
  v_current_paid numeric := 0;
  v_payment_delta numeric := 0;
  v_first_product text;
  v_first_qty numeric;
  v_first_price numeric;
  v_row record;
  v_stock record;
  v_old_item record;
  v_result jsonb;
  v_fingerprint text;
  v_old_shipped boolean := false;
  v_new_shipped boolean := false;
  v_old_reserved boolean := false;
  v_new_reserved boolean := false;
  v_old_sale boolean := false;
  v_new_sale boolean := false;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select organization_id into v_org from public.profiles
   where id=v_uid and active and organization_id is not null and role in ('owner','admin','staff');
  if v_org is null then raise exception 'active organization membership required'; end if;
  perform private.validate_business_actor(v_org);
  if p_status not in ('Новый','Подтверждён','В производстве','Собирается','Готов','На доставке','Доставлен','Выполнен','Отменён') then
    raise exception 'invalid order status';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'order requires at least one item'; end if;
  if p_paid_amount is null or p_paid_amount < 0 then raise exception 'invalid paid amount'; end if;

  v_fingerprint := encode(extensions.digest(convert_to(concat_ws('|',coalesce(p_order_id::text,''),p_order_date::text,p_client_id::text,p_items::text,p_paid_amount::text,p_status),'UTF8'),'sha256'),'hex');
  v_result := private.reserve_operation(v_org,'save_order_rc',p_idempotency_key,v_fingerprint,v_uid);
  if v_result is not null then return (v_result->>'order_id')::uuid; end if;

  select name into v_client_name from public.clients where id=p_client_id and organization_id=v_org;
  if v_client_name is null then raise exception 'client not found in organization'; end if;

  if v_order_id is not null then
    select status into v_old_status from public.orders where id=v_order_id and organization_id=v_org for update;
    if not found then raise exception 'order not found'; end if;
    v_old_shipped := v_old_status in ('На доставке','Доставлен','Выполнен');
    v_old_reserved := v_old_status in ('Подтверждён','В производстве','Собирается','Готов');
    v_old_sale := v_old_status in ('Доставлен','Выполнен');
    if v_old_shipped then
      -- Shipment has already changed physical stock. Items are immutable afterwards.
      if exists(
        select 1
        from (
          select oi.product_id, oi.quantity, oi.unit_price
          from public.order_items oi
          where oi.order_id = v_order_id
        ) oi
        full join jsonb_to_recordset(p_items) as j(product_id text,quantity numeric,unit_price numeric)
          on j.product_id = oi.product_id
        where coalesce(oi.quantity,-1) <> coalesce(j.quantity,-1)
           or coalesce(oi.unit_price,-1) <> coalesce(j.unit_price,-1)
           or oi.product_id is null or j.product_id is null
      ) then raise exception 'shipped order items are immutable; use return or correction'; end if;
      if p_status in ('Новый','Подтверждён','В производстве','Собирается','Готов','Отменён') then
        raise exception 'shipped order cannot return to an earlier status';
      end if;
    end if;
  else
    v_old_status := null;
  end if;

  -- Validate and lock all requested products in deterministic order.
  for v_row in
    select product_id,quantity,unit_price from jsonb_to_recordset(p_items)
      as x(product_id text,quantity numeric,unit_price numeric)
    order by product_id
  loop
    if v_row.quantity is null or v_row.quantity <= 0 or v_row.unit_price is null or v_row.unit_price < 0 then raise exception 'invalid order item'; end if;
    perform 1 from public.products where id=v_row.product_id and organization_id=v_org and active for update;
    if not found then raise exception 'active product not found'; end if;
    if v_first_product is null then v_first_product:=v_row.product_id; v_first_qty:=v_row.quantity; v_first_price:=v_row.unit_price; end if;
    v_new_total := v_new_total + v_row.quantity*v_row.unit_price;
  end loop;
  if (select count(*) from jsonb_to_recordset(p_items) as x(product_id text,quantity numeric,unit_price numeric))
     <> (select count(distinct product_id) from jsonb_to_recordset(p_items) as x(product_id text,quantity numeric,unit_price numeric)) then
    raise exception 'duplicate product in order items';
  end if;
  if p_paid_amount > v_new_total then raise exception 'paid amount cannot exceed order total'; end if;

  if v_order_id is null then
    insert into public.orders(organization_id,order_date,client_id,client_name,product_id,quantity,unit_price,paid_amount,status,created_by)
    values(v_org,p_order_date,p_client_id,v_client_name,v_first_product,v_first_qty,v_first_price,0,p_status,v_uid)
    returning id into v_order_id;
  else
    update public.orders set order_date=p_order_date,client_id=p_client_id,client_name=v_client_name,
      product_id=v_first_product,quantity=v_first_qty,unit_price=v_first_price,status=p_status,updated_at=now()
    where id=v_order_id;
  end if;

  select coalesce(sum(quantity*unit_price),0) into v_old_total from public.order_items where order_id=v_order_id;

  if not v_old_shipped then
    -- Remove old reservation before replacing items.
    if v_old_reserved then
      for v_old_item in select * from public.order_items where order_id=v_order_id loop
        insert into public.stock_ledger(organization_id,product_id,reserved_delta,movement_type,source_type,source_id,operation_key,entry_key,description,created_by)
        values(v_org,v_old_item.product_id,-v_old_item.quantity,'reservation_release','order',v_order_id,p_idempotency_key,
          'order:'||v_order_id||':release-old:'||v_old_item.id||':'||p_idempotency_key,'Освобождение предыдущего резерва при изменении заказа',v_uid);
      end loop;
    end if;
    delete from public.order_items where order_id=v_order_id;
    insert into public.order_items(organization_id,order_id,product_id,quantity,unit_price)
    select v_org,v_order_id,product_id,quantity,unit_price from jsonb_to_recordset(p_items)
      as x(product_id text,quantity numeric,unit_price numeric);
  end if;

  v_new_reserved := p_status in ('Подтверждён','В производстве','Собирается','Готов');
  v_new_shipped := p_status in ('На доставке','Доставлен','Выполнен');
  v_new_sale := p_status in ('Доставлен','Выполнен');

  if not v_old_shipped then
    for v_row in select * from public.order_items where order_id=v_order_id loop
      select * into v_stock from private.current_stock(v_org,v_row.product_id);
      if v_new_reserved then
        if v_stock.available < v_row.quantity then raise exception 'insufficient stock: available %, requested %',v_stock.available,v_row.quantity; end if;
        insert into public.stock_ledger(organization_id,product_id,reserved_delta,movement_type,source_type,source_id,operation_key,entry_key,description,created_by)
        values(v_org,v_row.product_id,v_row.quantity,'reservation','order',v_order_id,p_idempotency_key,
          'order:'||v_order_id||':reserve:'||v_row.id||':'||p_idempotency_key,'Резерв подтверждённого заказа',v_uid);
      elsif v_new_shipped then
        if v_stock.available < v_row.quantity then raise exception 'insufficient stock: available %, requested %',v_stock.available,v_row.quantity; end if;
        insert into public.stock_ledger(organization_id,product_id,on_hand_delta,movement_type,source_type,source_id,operation_key,entry_key,description,created_by)
        values(v_org,v_row.product_id,-v_row.quantity,'shipment','order',v_order_id,p_idempotency_key,
          'order:'||v_order_id||':shipment:'||v_row.id||':'||p_idempotency_key,'Физическая отгрузка заказа',v_uid);
      end if;
    end loop;
  elsif not v_old_sale and v_new_sale then
    null; -- stock was already shipped at status На доставке.
  end if;

  -- Recognise sale only on delivery/completion, never when a new order is merely created.
  if not v_old_sale and v_new_sale and v_new_total > 0 then
    insert into public.financial_ledger(organization_id,order_id,entry_type,amount,operation_key,entry_key,description,created_by)
    values(v_org,v_order_id,'sale',v_new_total,p_idempotency_key,'order:'||v_order_id||':sale:'||p_idempotency_key,'Реализация после доставки',v_uid);
  end if;

  -- Payments are independent cash events. Decreasing them requires record_refund_rc.
  select coalesce(sum(case when entry_type='payment' then amount when entry_type='refund' then -amount else 0 end),0)
    into v_current_paid from public.financial_ledger where order_id=v_order_id;
  if p_paid_amount < v_current_paid then raise exception 'paid amount cannot be decreased; record a refund instead'; end if;
  v_payment_delta := p_paid_amount-v_current_paid;
  if v_payment_delta > 0 then
    insert into public.financial_ledger(organization_id,order_id,entry_type,amount,operation_key,entry_key,description,created_by)
    values(v_org,v_order_id,'payment',v_payment_delta,p_idempotency_key,'order:'||v_order_id||':payment:'||p_idempotency_key,'Получена оплата по заказу',v_uid);
  end if;
  update public.orders set paid_amount=p_paid_amount,updated_at=now() where id=v_order_id;

  insert into public.operation_events(organization_id,event_type,entity_type,entity_id,message,details,request_id,created_by)
  values(v_org,case when p_order_id is null then 'order.created' else 'order.updated' end,'order',v_order_id,
    case when p_order_id is null then 'Создан заказ' else 'Изменён заказ' end,
    jsonb_build_object('status',p_status,'total',v_new_total,'items',p_items),p_idempotency_key,v_uid);

  insert into public.notification_events(organization_id,channel,recipient,event_type,aggregate_type,aggregate_id,payload,entry_key,created_by)
  values(v_org,'email','icefresh.kz@gmail.com','order.updated','order',v_order_id,
    jsonb_build_object('order_id',v_order_id,'status',p_status),
    'order:'||v_order_id||':notify:'||p_idempotency_key,v_uid)
  on conflict (organization_id,entry_key) do nothing;

  perform private.complete_operation(v_org,'save_order_rc',p_idempotency_key,jsonb_build_object('order_id',v_order_id));
  return v_order_id;
end; $function$

