-- RC1.6.1 Issue #4 live regression.
-- Preconditions:
--   * 202608230001_rc161_blocker4_v2_compat.sql is active in this transaction/test DB.
--   * Control order 000001 is at its documented baseline.
-- Safety: every mutation and synthetic user is inside this outer transaction and ROLLBACKs.

begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('11111111-1111-4111-8111-111111111161','authenticated','authenticated','rc161-admin@invalid.test','{}','{}',now(),now()),
('22222222-2222-4222-8222-222222222261','authenticated','authenticated','rc161-staff@invalid.test','{}','{}',now(),now());

insert into public.profiles(id,organization_id,full_name,role,active) values
('11111111-1111-4111-8111-111111111161','a1d7efd8-8dc8-4061-9112-3d28ab89c7d7','RC1.6.1 test admin','admin',true),
('22222222-2222-4222-8222-222222222261','a1d7efd8-8dc8-4061-9112-3d28ab89c7d7','RC1.6.1 test staff','staff',true)
on conflict(id) do update set organization_id=excluded.organization_id,role=excluded.role,active=true;

set local role authenticated;
select set_config('request.jwt.claim.sub','36f18425-bebc-4520-82be-defd92d11bd6',true);

do $rc161$
declare
 v_order uuid := 'fa29ef36-a969-4f36-9fcc-67f1f0e36557';
 v_client uuid; v_date date; v_status text; v_items jsonb; v_count int; v_total numeric; v_paid numeric; v_debt numeric; v_rejected boolean; v_err text;
 v_s3 jsonb := '[{"product_id":"bag1","quantity":100,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855},{"product_id":"cup250","quantity":150,"unit_price":304}]';
 v_s101 jsonb := '[{"product_id":"bag1","quantity":101,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855},{"product_id":"cup250","quantity":150,"unit_price":304}]';
 v_s2 jsonb := '[{"product_id":"bag1","quantity":101,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855}]';
begin
 select client_id,order_date,status into v_client,v_date,v_status from public.orders where id=v_order;
 select count(*)::int,coalesce(sum(quantity*unit_price),0),jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity,'unit_price',unit_price) order by product_id)
 into v_count,v_total,v_items from public.order_items where order_id=v_order;
 if v_count<>3 or v_total<>268900 or v_items is distinct from v_s3 then raise exception 'baseline mismatch'; end if;

 -- quantity edit: 3 -> 3
 perform public.save_order_manager_rc_v2('30000000-0000-4000-8000-000000000001',v_order,v_date,v_client,
   '[{"product_id":"bag1","quantity":101,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855},{"product_id":"cup250","quantity":150,"unit_price":304}]',0,v_status,v_s3);
 select count(*)::int,coalesce(sum(quantity*unit_price),0) into v_count,v_total from public.order_items where order_id=v_order;
 if v_count<>3 or v_total<>269423 then raise exception 'quantity edit failed'; end if;

 -- remove item: exact 3-row expected snapshot + 2-row new payload MUST pass.
 perform public.save_order_manager_rc_v2('30000000-0000-4000-8000-000000000002',v_order,v_date,v_client,
   '[{"product_id":"bag1","quantity":101,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855}]',0,v_status,v_s101);
 select count(*)::int,coalesce(sum(quantity*unit_price),0),jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity,'unit_price',unit_price) order by product_id)
 into v_count,v_total,v_items from public.order_items where order_id=v_order;
 if v_count<>2 or v_total<>223823 or v_items is distinct from v_s2 then raise exception 'remove-item regression failed'; end if;

 -- re-add item: exact 2-row expected snapshot + 3-row new payload MUST pass.
 perform public.save_order_manager_rc_v2('30000000-0000-4000-8000-000000000003',v_order,v_date,v_client,
   '[{"product_id":"bag1","quantity":101,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855},{"product_id":"cup250","quantity":150,"unit_price":304}]',0,v_status,v_s2);
 select count(*)::int,coalesce(sum(quantity*unit_price),0) into v_count,v_total from public.order_items where order_id=v_order;
 if v_count<>3 or v_total<>269423 then raise exception 're-add regression failed'; end if;

 -- stale and partial expected snapshots reject with no mutation.
 v_rejected:=false; begin
   perform public.save_order_manager_rc_v2('30000000-0000-4000-8000-000000000004',v_order,v_date,v_client,
     '[{"product_id":"bag1","quantity":102,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855},{"product_id":"cup250","quantity":150,"unit_price":304}]',0,v_status,v_s3);
 exception when others then v_rejected:=true; end;
 if not v_rejected then raise exception 'stale snapshot accepted'; end if;

 v_rejected:=false; begin
   perform public.save_order_manager_rc_v2('30000000-0000-4000-8000-000000000005',v_order,v_date,v_client,
     '[{"product_id":"bag1","quantity":101,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855}]',0,v_status,v_s2);
 exception when others then v_rejected:=true; end;
 if not v_rejected then raise exception 'partial snapshot accepted'; end if;
 select count(*)::int,coalesce(sum(quantity*unit_price),0) into v_count,v_total from public.order_items where order_id=v_order;
 if v_count<>3 or v_total<>269423 then raise exception 'snapshot rejection mutated state'; end if;

 -- staff is unauthorized for manager RPC.
 perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222261',true);
 v_rejected:=false; begin
   perform public.save_order_manager_rc_v2('30000000-0000-4000-8000-000000000006',v_order,v_date,v_client,
     '[{"product_id":"bag1","quantity":102,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855},{"product_id":"cup250","quantity":150,"unit_price":304}]',0,v_status,v_s101);
 exception when others then v_rejected:=true; end;
 if not v_rejected then raise exception 'staff authorized for manager RPC'; end if;

 -- admin exact snapshot passes.
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111161',true);
 perform public.save_order_manager_rc_v2('30000000-0000-4000-8000-000000000007',v_order,v_date,v_client,
   '[{"product_id":"bag1","quantity":101,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855},{"product_id":"cup250","quantity":150,"unit_price":304}]',0,v_status,v_s101);
 perform set_config('request.jwt.claim.sub','36f18425-bebc-4520-82be-defd92d11bd6',true);

 -- force a late failure (insufficient stock after row replacement) and prove subtransaction atomicity.
 v_rejected:=false; v_err:=null; begin
   perform public.save_order_manager_rc_v2('30000000-0000-4000-8000-000000000008',v_order,v_date,v_client,
     '[{"product_id":"bag1","quantity":101,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855},{"product_id":"cup250","quantity":150,"unit_price":304}]',0,'Подтверждён',v_s101);
 exception when others then v_rejected:=true; v_err:=sqlerrm; end;
 if not v_rejected or position('insufficient stock' in coalesce(v_err,''))=0 then raise exception 'expected late stock failure, got %',v_err; end if;
 select count(*)::int,coalesce(sum(quantity*unit_price),0) into v_count,v_total from public.order_items where order_id=v_order;
 if v_count<>3 or v_total<>269423 or (select status from public.orders where id=v_order)<>v_status then raise exception 'transaction failure left partial mutation'; end if;

 -- restore documented control baseline before outer rollback as an extra invariant.
 perform public.save_order_manager_rc_v2('30000000-0000-4000-8000-000000000009',v_order,v_date,v_client,
   '[{"product_id":"bag1","quantity":100,"unit_price":523},{"product_id":"bag2","quantity":200,"unit_price":855},{"product_id":"cup250","quantity":150,"unit_price":304}]',0,v_status,v_s101);
 select count(*)::int,coalesce(sum(quantity*unit_price),0) into v_count,v_total from public.order_items where order_id=v_order;
 select paid_amount,total_amount-paid_amount into v_paid,v_debt from public.orders where id=v_order;
 if v_count<>3 or v_total<>268900 or v_paid<>0 or v_debt<>268900 then raise exception 'final baseline restore failed'; end if;
end $rc161$;

rollback;
