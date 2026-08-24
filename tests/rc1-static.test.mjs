import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('RC1 uses multi-item orders and separates physical stock from reservations', async () => {
  const [app, migration, core] = await Promise.all([
    read('public/app.js'),
    read('supabase/migrations/202608160005_atomic_inventory_ledger_outbox.sql'),
    read('public/core.js'),
  ]);
  assert.match(migration, /create table if not exists public\.order_items/);
  assert.match(migration, /on_hand_delta numeric/);
  assert.match(migration, /reserved_delta numeric/);
  assert.match(migration, /available/);
  assert.match(migration, /'reservation'/);
  assert.match(migration, /'shipment'/);
  assert.match(app, /orderLineTemplate/);
  assert.match(app, /p_items: items/);
  assert.match(core, /Array\.isArray\(o\.items\)/);
});

test('RC1 keeps payment, refund and sale recognition as different financial events', async () => {
  const [app, migration] = await Promise.all([
    read('public/app.js'),
    read('supabase/migrations/202608160005_atomic_inventory_ledger_outbox.sql'),
  ]);
  assert.match(migration, /entry_type text not null check \(entry_type in \('sale','sale_reversal','payment','refund','credit'\)\)/);
  assert.match(migration, /Recognise sale only on delivery\/completion/);
  assert.match(migration, /paid amount cannot be decreased; record a refund instead/);
  assert.match(migration, /create or replace function public\.record_refund_rc/);
  assert.match(app, /Оформить возврат оплаты/);
  assert.match(app, /record_refund_rc/);
});

test('RC1 disables browser self-service organisation creation and preserves server-side checks', async () => {
  const [app, migration] = await Promise.all([
    read('public/app.js'),
    read('supabase/migrations/202608160005_atomic_inventory_ledger_outbox.sql'),
  ]);
  assert.match(migration, /revoke execute on function public\.create_organization\(text, text\) from authenticated/);
  assert.match(app, /Новая организация в IceFresh не создаётся самостоятельно/);
  assert.match(migration, /security definer set search_path=''/);
  assert.match(migration, /active organization membership required/);
});

test('RC1 uses immutable stock and finance ledgers and idempotency', async () => {
  const migration = await read('supabase/migrations/202608160005_atomic_inventory_ledger_outbox.sql');
  assert.match(migration, /stock_ledger_immutable/);
  assert.match(migration, /financial_ledger_immutable/);
  assert.match(migration, /private\.operation_requests/);
  assert.match(migration, /idempotency key reused with different payload/);
  assert.match(migration, /revoke insert,update,delete on public\.orders from authenticated/);
});

test('RC1 provides a server-side multi-provider AI gateway without exposing provider secrets', async () => {
  const [assistant, provider, app] = await Promise.all([
    read('worker/ai-assistant.ts'),
    read('worker/ai-provider.ts'),
    read('public/app.js'),
  ]);
  assert.match(assistant, /callAiProvider/);
  assert.match(provider, /api\.anthropic\.com\/v1\/messages/);
  assert.match(provider, /generativelanguage\.googleapis\.com/);
  assert.match(provider, /AI_CUSTOM_BASE_URL/);
  assert.match(provider, /url\.protocol !== "https:"/);
  assert.ok(provider.includes('192\\.168'));
  assert.doesNotMatch(`${assistant}\n${provider}\n${app}`, /sk-proj-[A-Za-z0-9_-]{20,}/);
});

test('RC1 does not show management financial KPIs to staff', async () => {
  const app = await read('public/app.js');
  assert.match(app, /if \(!manager\) \{/);
  assert.match(app, /Заявки сайта/);
  assert.match(app, /Реализовано/);
  assert.match(app, /Только доставленные\/выполненные заказы/);
});


test('RC1 migration classifies legacy order statuses consistently with runtime semantics', async () => {
  const migration = await read('supabase/migrations/202608160005_atomic_inventory_ledger_outbox.sql');
  assert.match(migration, /where o\.status in \('Подтверждён','В производстве','Собирается','Готов'\)/);
  assert.match(migration, /where o\.status in \('На доставке','Доставлен','Выполнен'\)/);
  assert.doesNotMatch(migration, /where o\.status not in \('Отменён','Доставлен','Выполнен'\)/);
  assert.match(migration, /duplicate IceFresh organizations detected/);
});

test('RC1 test script is compatible with the declared Node 22 engine range', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.scripts.test, 'vinext build && node --test tests/*.test.mjs');
  assert.equal(pkg.scripts['test:static'], 'node --test tests/routes.test.mjs tests/rc1-static.test.mjs tests/uxui-qa.test.mjs tests/qa-engineer.test.mjs tests/technical-performance.test.mjs tests/final-security.test.mjs');
  assert.equal(pkg.scripts['verify:release'], 'npm run build && npm run lint && node --test tests/*.test.mjs');
  assert.doesNotMatch(pkg.scripts.test, /--test-isolation/);
});
