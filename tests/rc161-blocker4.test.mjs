import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');

const migrationPath = 'supabase/migrations/202608230001_rc161_blocker4_v2_compat.sql';

test('RC1.6.1 keeps v2 snapshot validation authoritative before compatibility delegation', async () => {
  const sql = await read(migrationPath);
  for (const fn of ['save_order_manager_rc_v2', 'save_order_operational_rc_v2']) {
    const start = sql.indexOf(`create or replace function public.${fn}`);
    assert.ok(start >= 0, `missing ${fn}`);
    const next = sql.indexOf('create or replace function public.', start + 1);
    const body = sql.slice(start, next === -1 ? sql.length : next);
    const snapshotPos = body.indexOf('assert_order_items_snapshot');
    const compatPos = body.indexOf("'{0,_expected_item_count}'");
    const delegatePos = body.indexOf(fn === 'save_order_manager_rc_v2'
      ? 'return public.save_order_manager_rc('
      : 'return public.save_order_operational_rc(');
    assert.ok(snapshotPos >= 0, `${fn} must validate expected snapshot`);
    assert.ok(compatPos > snapshotPos, `${fn} compatibility metadata must be added only after snapshot validation`);
    assert.ok(delegatePos > compatPos, `${fn} must delegate only after the verified compatibility bridge`);
  }
});

test('RC1.6.1 does not require _expected_item_count from the frontend API contract', async () => {
  const app = await read('public/app.js');
  assert.match(app, /p_expected_items:/);
  assert.doesNotMatch(app, /_expected_item_count/);
});

test('RC1.6.1 compatibility bridge is server-side and derived from the exact expected snapshot length', async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /v_verified_item_count := jsonb_array_length\(p_expected_items\)/);
  assert.match(sql, /jsonb_set\([\s\S]*p_items[\s\S]*\{0,_expected_item_count\}[\s\S]*to_jsonb\(v_verified_item_count\)/);
});

test('RC1.6.1 preserves manager and operational authorization boundaries', async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /role in \('owner','admin'\)/);
  assert.match(sql, /role in \('owner','admin','staff'\)/);
  assert.match(sql, /manager access required/);
  assert.match(sql, /active organization membership required/);
});

test('RC1.6.1 preserves RPC exposure and does not grant anon/public execution', async () => {
  const sql = await read(migrationPath);
  assert.match(sql, /revoke all on function public\.save_order_manager_rc_v2[^;]+from public, anon;/s);
  assert.match(sql, /revoke all on function public\.save_order_operational_rc_v2[^;]+from public, anon;/s);
  assert.match(sql, /grant execute on function public\.save_order_manager_rc_v2[^;]+to authenticated;/s);
  assert.match(sql, /grant execute on function public\.save_order_operational_rc_v2[^;]+to authenticated;/s);
  assert.doesNotMatch(sql, /grant execute[^;]+to anon/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to public/i);
});

test('package and lock metadata use the same RC1.6 version', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const lock = JSON.parse(await read('package-lock.json'));
  assert.equal(pkg.version, '12.0.0-rc.1.6');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
});
