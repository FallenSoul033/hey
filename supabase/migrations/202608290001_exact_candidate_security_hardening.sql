-- Exact-candidate security hardening.
-- Public branded content is selected by the immutable deployment-level
-- ICEFRESH_ORGANIZATION_ID in the Worker. The database grants the anonymous
-- key only the canonical public fields plus organization_id for filtering.

-- Disable every inherited browser path for self-service tenant creation.
revoke all on function public.create_organization(text, text) from public, anon, authenticated;

-- The v2 wrappers are the only browser-facing order mutation API. They run as
-- SECURITY DEFINER and may still call the legacy implementation internally.
revoke all on function public.save_order_manager_rc(uuid,uuid,date,uuid,jsonb,numeric,text)
  from public, anon, authenticated;
revoke all on function public.save_order_operational_rc(uuid,uuid,date,uuid,jsonb,text)
  from public, anon, authenticated;

-- Authenticated base-table product reads are tenant-local. Public catalogue
-- reads use the anonymous key through /api/public-products instead.
drop policy if exists products_authenticated_select on public.products;
create policy products_authenticated_select
  on public.products for select to authenticated
  using (organization_id = (select private.current_org_id()));

-- PostgREST requires SELECT privilege on a filtered column. organization_id is
-- a public UUID, but the Worker never returns it to the browser.
grant select (organization_id) on public.products to anon;
grant select (organization_id) on public.social_links to anon;
