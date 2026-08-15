-- Keep one SELECT policy per API role so catalogue reads stay efficient.
drop policy if exists products_public_select on public.products;
drop policy if exists products_org_select on public.products;

create policy products_public_select
  on public.products for select to anon
  using (active and public_visible);

create policy products_authenticated_select
  on public.products for select to authenticated
  using (
    (active and public_visible)
    or organization_id = (select private.current_org_id())
  );
