import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');

test('release identifiers are consistent across app, version metadata and service worker', async () => {
  const [app, versionText, sw] = await Promise.all([read('public/app.js'), read('public/version.json'), read('public/sw.js')]);
  const version = JSON.parse(versionText);
  assert.equal(version.version, '12.0.0-rc.1.6');
  assert.match(app, /APP_VERSION = '12\.0\.0-rc\.1\.6'/);
  assert.match(sw, /icefresh-rc1-6-v7/);
  assert.equal(version.published, false);
});

test('HTML shell has no duplicate ids and all images have alt text', async () => {
  const html = await read('public/app-shell.html');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const img of html.matchAll(/<img\b[^>]*>/g)) assert.match(img[0], /\balt="[^"]*"/);
});

test('public order form has anti-bot, consent and bounded quantity controls', async () => {
  const html = await read('public/app-shell.html');
  assert.match(html, /name="website"[^>]*tabindex="-1"/);
  assert.match(html, /name="started_at"/);
  assert.match(html, /name="consent" type="checkbox" required/);
  assert.match(html, /name="quantity"[^>]*min="1"[^>]*max="10000"/);
});

test('public order submission protects against double submit and exposes retry-friendly errors', async () => {
  const app = await read('public/app.js');
  assert.match(app, /submit\.disabled = true/);
  assert.match(app, /finally \{\s*submit\.disabled = false/);
  assert.match(app, /response\.status === 429/);
  assert.match(app, /AbortController\(\)/);
  assert.match(app, /setTimeout\(\(\) => controller\.abort\(\), 12000\)/);
});

test('staff UI does not expose financial analytics in operational order and client tables', async () => {
  const app = await read('public/app.js');
  assert.match(app, /const headers = manager\s*\? \['№', 'Дата', 'Клиент', 'Состав заказа', 'Итого', 'Оплачено', 'Долг'/);
  assert.match(app, /: \['№', 'Дата', 'Клиент', 'Состав заказа', 'Статус', ''\]/);
  assert.match(app, /const headers = manager \? \['Клиент', 'Категория', 'Телефон', 'Заказов', 'Выручка', ''\] : \['Клиент', 'Категория', 'Телефон', 'Заказов', ''\]/);
  assert.match(app, /const recentOrders = manager/);
});

test('staff order form hides finance fields and uses finance-free server RPC', async () => {
  const app = await read('public/app.js');
  assert.match(app, /const priceField = manager \?/);
  assert.match(app, /const rpcName = manager \? 'save_order_manager_rc_v2' : 'save_order_operational_rc_v2'/);
  assert.match(app, /manager \? `<label>Получено от клиента/);
});

test('server-side order RPC blocks payment changes by staff', async () => {
  const sql = await read('supabase/migrations/202608160005_atomic_inventory_ledger_outbox.sql');
  assert.match(sql, /v_actor_role text/);
  assert.match(sql, /select organization_id, role into v_org, v_actor_role/);
  assert.match(sql, /v_actor_role='staff' and p_paid_amount <> v_current_paid/);
  assert.match(sql, /manager access required for payment changes/);
});

test('bulk backup is hidden from staff in the rendered CRM', async () => {
  const app = await read('public/app.js');
  assert.match(app, /\$\('#backup'\)\.hidden = !manager/);
});

test('route matrix keeps owner-only integrations and manager-only finance/operations', async () => {
  const source = await read('public/routes.js');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const R = context.IceRoutes;
  const staff = { authenticated:true,onboarded:true,role:'staff',active:true };
  const admin = { authenticated:true,onboarded:true,role:'admin',active:true };
  const owner = { authenticated:true,onboarded:true,role:'owner',active:true };
  assert.equal(R.resolve('analytics', staff).route, 'dashboard');
  assert.equal(R.resolve('operations', staff).route, 'dashboard');
  assert.equal(R.resolve('integrations', admin).route, 'dashboard');
  assert.equal(R.resolve('integrations', owner).route, 'integrations');
});

test('core order calculations handle multi-item totals and escape untrusted text', async () => {
  const source = await read('public/core.js');
  const context = vm.createContext({ Intl });
  vm.runInContext(source, context);
  const C = context.IceCore;
  const result = C.calcOrder({ items:[{qty:2,price:250},{qty:3,price:500}], paid:700 });
  assert.equal(result.total, 2000);
  assert.equal(result.paid, 700);
  assert.equal(result.debt, 1300);
  assert.equal(C.esc('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
});

test('internal app paths are excluded from public sitemap and robots indexing', async () => {
  const [robots, sitemap, worker] = await Promise.all([read('public/robots.txt'), read('public/sitemap.xml'), read('worker/index.ts')]);
  assert.match(robots, /Disallow:\s*\/app/);
  assert.doesNotMatch(sitemap, /\/app(?:\/|<)/);
  assert.match(worker, /noindex/i);
});

test('PWA caches only explicit static assets and excludes API requests', async () => {
  const sw = await read('public/sw.js');
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /PRECACHE\.includes\(pathname\)[\s\S]*pathname\.startsWith\('\/assets\/'\)/);
  assert.doesNotMatch(sw, /cache\.put\(request[^\n]+api/i);
});
