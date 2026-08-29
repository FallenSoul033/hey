import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, routes, migration, reconciliation, hardening, worker, proxy] = await Promise.all([
  readFile(new URL('../public/app-shell.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/routes.js', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202608280001_social_links.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202608280002_social_links_exact_candidate.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202608290001_exact_candidate_security_hardening.sql', import.meta.url), 'utf8'),
  readFile(new URL('../worker/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../worker/public-social-links.ts', import.meta.url), 'utf8').catch(() => ''),
]);

test('desktop and mobile public navigation expose /contacts', () => {
  assert.match(html, /href="\/contacts"[^>]*>Контакты</);
  assert.match(html, /public-mobile-contact/);
  assert.match(html, /id="public-contacts"/);
  assert.match(routes, /contacts/);
  assert.match(routes, /if \(requested === 'contacts'\) return '\/contacts'/);
});

test('social URLs are data-driven and never hardcoded in the frontend', () => {
  assert.match(app, /from\('social_links'\)/);
  assert.doesNotMatch(html, /instagram\.com|tiktok\.com|2gis\.(?:kz|ru)/i);
  assert.doesNotMatch(app, /instagram\.com|tiktok\.com|2gis\.(?:kz|ru)/i);
});

test('migration explicitly grants public read and manager-only writes under RLS', () => {
  assert.match(migration, /alter table public\.social_links enable row level security/i);
  assert.match(migration, /for select\s+to anon/i);
  assert.match(migration, /enabled and url <> ''/i);
  assert.match(migration, /create policy social_links_org_select[\s\S]*organization_id = \(select private\.current_org_id\(\)\)/i);
  assert.doesNotMatch(migration, /create policy social_links_authenticated_select/i);
  assert.match(migration, /private\.is_manager\(\)/i);
  assert.match(migration, /for update\s+to authenticated/i);
  assert.match(migration, /with check/i);
  assert.match(migration, /grant select[^;]*to anon/i);
  assert.match(migration, /grant insert \(organization_id, platform, url, label, enabled, sort_order, created_by\)[^;]*to authenticated/i);
  assert.match(migration, /grant update \(platform, url, label, enabled, sort_order\)[^;]*to authenticated/i);
  assert.match(migration, /grant delete on public\.social_links to authenticated/i);
});

test('database rejects unsafe or empty enabled links', () => {
  assert.match(migration, /social_links_url_check/i);
  assert.match(migration, /https:\/\//i);
  assert.doesNotMatch(migration, /mailto:|tel:/i);
  assert.match(migration, /not enabled or url <> ''/i);
});

test('column grants hide sensitive ownership fields from anon and prevent organization reassignment', () => {
  assert.match(migration, /grant select \(platform, url, label, sort_order\)[\s\S]*to anon/i);
  assert.doesNotMatch(migration, /grant select \([^)]*(?:\bid\b|\benabled\b)[^)]*\)[\s\S]*to anon/i);
  assert.doesNotMatch(migration, /grant select \([^)]*(?:organization_id|created_by)[^)]*\)[\s\S]*to anon/i);
  assert.match(migration, /grant update \(platform, url, label, enabled, sort_order\)[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /grant update \([^)]*organization_id[^)]*\)/i);
});

test('forward migration reconciles the earlier non-prod schema without dropping contact data', () => {
  assert.match(reconciliation, /rename column display_order to sort_order/i);
  assert.match(reconciliation, /coalesce\(nullif\(btrim\(label\), ''\), lower\(btrim\(platform\)\)\)/i);
  assert.doesNotMatch(reconciliation, /drop table|truncate table|delete from public\.social_links/i);
  assert.match(reconciliation, /revoke select \(%1\$I\), insert \(%1\$I\), update \(%1\$I\), references \(%1\$I\)/i);
  assert.match(reconciliation, /grant update \(platform, url, label, enabled, sort_order\)/i);
});

test('public contacts use a same-origin compatibility endpoint while the migration is pending', () => {
  assert.match(app, /fetch\('\/api\/public-social-links'/);
  assert.match(worker, /handlePublicSocialLinks/);
  assert.match(worker, /url\.pathname === "\/api\/public-social-links"/);
  assert.match(proxy, /PGRST205/);
  assert.match(proxy, /PUBLIC_FIELDS = "platform,url,label,sort_order"/);
  assert.match(proxy, /searchParams\.set\("organization_id", `eq\.\$\{config\.organizationId\}`\)/);
  assert.match(proxy, /ICEFRESH_ORGANIZATION_ID/);
  assert.match(migration, /using \(enabled and url <> ''\)/i);
  assert.match(proxy, /available:\s*false/);
  assert.match(proxy, /Cache-Control",\s*"no-store"/);
});

test('public branded catalogue also uses the organization-scoped same-origin endpoint', () => {
  assert.match(app, /fetch\('\/api\/public-products'/);
  assert.doesNotMatch(app, /from\('products'\)[\s\S]{0,300}eq\('public_visible', true\)/);
  assert.match(worker, /handlePublicProducts/);
  assert.match(worker, /url\.pathname === "\/api\/public-products"/);
  assert.match(proxy, /PUBLIC_PRODUCT_FIELDS/);
  assert.match(proxy, /publicRows\(config, "products"/);
});

test('security hardening closes cross-tenant product reads and legacy RPC bypasses', () => {
  assert.match(hardening, /products_authenticated_select[\s\S]*organization_id = \(select private\.current_org_id\(\)\)/i);
  assert.doesNotMatch(hardening, /active and public_visible[\s\S]*or organization_id/i);
  assert.match(hardening, /revoke all on function public\.create_organization\(text, text\) from public, anon, authenticated/i);
  assert.match(hardening, /revoke all on function public\.save_order_manager_rc\(uuid,uuid,date,uuid,jsonb,numeric,text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(hardening, /revoke all on function public\.save_order_operational_rc\(uuid,uuid,date,uuid,jsonb,text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(hardening, /grant select \(organization_id\) on public\.products to anon/i);
  assert.match(hardening, /grant select \(organization_id\) on public\.social_links to anon/i);
});
