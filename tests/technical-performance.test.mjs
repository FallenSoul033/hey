import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const bytes = async path => (await stat(new URL(path, root))).size;

test('RC1.4 uses responsive LCP imagery and removes base64 logo payload', async () => {
  const [html, app, sw] = await Promise.all([read('public/app-shell.html'), read('public/app.js'), read('public/sw.js')]);
  assert.match(html, /hero-icefresh-mobile\.webp 720w/);
  assert.match(html, /<picture><source media="\(max-width: 720px\)"/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /src="\/assets\/logo\.webp"/);
  assert.doesNotMatch(html, /logo-data\.js/);
  assert.doesNotMatch(app, /window\.ICEFRESH_LOGO/);
  assert.doesNotMatch(sw, /hero-icefresh(?:-mobile)?\.webp/);
  assert.ok(await bytes('public/assets/logo.webp') < 40_000);
  assert.ok(await bytes('public/assets/products/hero-icefresh-mobile.webp') < 80_000);
  assert.ok(await bytes('public/icefresh-social.jpg') < 100_000);
});

test('PWA install budget stays small and product imagery is runtime cached', async () => {
  const sw = await read('public/sw.js');
  assert.match(sw, /Keep install small/);
  assert.match(sw, /pathname\.startsWith\('\/assets\/'\)/);
  const precacheBlock = sw.match(/const PRECACHE = \[([\s\S]*?)\];/)?.[1] || '';
  const precachePaths = [...precacheBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
  const localPaths = precachePaths.filter(path => path !== '/').map(path => `public${path}`);
  let total = await bytes('public/app-shell.html');
  for (const path of localPaths) total += await bytes(path);
  assert.ok(total < 300_000, `precache raw budget exceeded: ${total} bytes`);
});

test('CRM computes authoritative stock and finance totals server-side', async () => {
  const [app, migration] = await Promise.all([
    read('public/app.js'),
    read('supabase/migrations/202608210001_rc14_security_performance.sql'),
  ]);
  assert.match(app, /rpc\('get_inventory_summary_rc'\)/);
  assert.match(app, /rpc\('get_finance_summary_rc'\)/);
  assert.match(app, /rpc\('get_product_sales_summary_rc'\)/);
  assert.match(app, /stock_ledger'\)\.select[\s\S]*\.limit\(100\)/);
  assert.match(app, /financial_ledger'\)\.select[\s\S]*\.limit\(100\)/);
  assert.match(migration, /create or replace function public\.get_inventory_summary_rc/);
  assert.match(migration, /create or replace function public\.get_finance_summary_rc/);
  assert.match(migration, /greatest\(po\.sale_net - po\.paid_net - po\.credit_total,0\)/);
  const inventoryFn = migration.match(/create or replace function public\.get_inventory_summary_rc\(\)[\s\S]*?grant execute on function public\.get_inventory_summary_rc\(\)/)?.[0] || '';
  assert.equal((inventoryFn.match(/movement_type='shipment'/g) || []).length, 1, 'shipment aggregate must appear exactly once');
});

test('staff order API is finance-free at both read and write boundaries', async () => {
  const [app, migration] = await Promise.all([
    read('public/app.js'),
    read('supabase/migrations/202608210001_rc14_security_performance.sql'),
  ]);
  assert.match(app, /list_orders_operational_rc/);
  assert.match(app, /save_order_operational_rc/);
  assert.match(migration, /create policy orders_select_manager/);
  assert.match(migration, /create policy order_items_select_manager/);
  assert.match(migration, /jsonb_build_object\([\s\S]*'product_id'[\s\S]*'quantity'[\s\S]*\) order by/);
  assert.doesNotMatch(migration.match(/create or replace function public\.list_orders_operational_rc[\s\S]*?grant execute/)[0], /unit_price|paid_amount|total_amount|debt_amount/);
  assert.match(migration, /revoke execute on function public\.save_order_rc/);
  assert.match(migration, /save_order_manager_rc/);
});

test('realtime keeps staff finance-free and coalesces refresh storms', async () => {
  const [app, migration] = await Promise.all([
    read('public/app.js'),
    read('supabase/migrations/202608210001_rc14_security_performance.sql'),
  ]);
  assert.match(app, /manager[\s\S]*\['orders', 'order_items'[\s\S]*: \['order_change_signal'\]/);
  assert.match(app, /refreshInFlight/);
  assert.match(app, /refreshQueued/);
  assert.match(migration, /create table if not exists public\.order_change_signal/);
  assert.match(migration, /alter publication supabase_realtime add table public\.order_change_signal/);
});

test('public order endpoint enforces body bytes, independent HMAC secret and unambiguous tenant', async () => {
  const source = await read('supabase/functions/public-order-request/index.ts');
  assert.match(source, /new TextEncoder\(\)\.encode\(rawBody\)\.byteLength > 6000/);
  assert.match(source, /submit_public_request_rc/);
  assert.match(source, /idempotencyKey/);
  assert.doesNotMatch(source, /PUBLIC_REQUEST_HMAC_SECRET|hmacHex\(clientIp, serviceRoleKey\)/);
  assert.match(source, /configuredOrganizationId/);
  assert.match(source, /limit\(2\)/);
  assert.match(source, /data\?\.length === 1/);
});

test('AI assistant uses environment-provided Supabase configuration', async () => {
  const assistant = await read('worker/ai-assistant.ts');
  assert.match(assistant, /SUPABASE_URL\?: string/);
  assert.match(assistant, /SUPABASE_PUBLISHABLE_KEY\?: string/);
  assert.doesNotMatch(assistant, /const SUPABASE_URL = "https:\/\//);
  assert.doesNotMatch(assistant, /const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_/);
});

test('service worker registration is deferred off the critical boot path', async () => {
  const app = await read('public/app.js');
  assert.match(app, /requestIdleCallback/);
  assert.match(app, /setTimeout\(startPwa, 1200\)/);
});
