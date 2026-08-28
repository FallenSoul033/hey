import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, routes, migration, worker, proxy] = await Promise.all([
  readFile(new URL('../public/app-shell.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/routes.js', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202608280001_social_links.sql', import.meta.url), 'utf8'),
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
  assert.match(migration, /grant select \(id, platform, url, label, enabled, sort_order\)[\s\S]*to anon/i);
  assert.doesNotMatch(migration, /grant select \([^)]*(?:organization_id|created_by)[^)]*\)[\s\S]*to anon/i);
  assert.match(migration, /grant update \(platform, url, label, enabled, sort_order\)[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /grant update \([^)]*organization_id[^)]*\)/i);
});

test('public contacts use a same-origin compatibility endpoint while the migration is pending', () => {
  assert.match(app, /fetch\('\/api\/public-social-links'/);
  assert.match(worker, /handlePublicSocialLinks/);
  assert.match(worker, /url\.pathname === "\/api\/public-social-links"/);
  assert.match(proxy, /PGRST205/);
  assert.match(proxy, /available:\s*false/);
  assert.match(proxy, /Cache-Control",\s*"no-store"/);
});
