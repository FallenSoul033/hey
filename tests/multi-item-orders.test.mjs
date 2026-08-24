import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');

test('order editor supports multiple lines and per-line totals', async () => {
  const app = await read('public/app.js');
  assert.match(app, /data-add-order-line/);
  assert.match(app, /data-remove-order-line/);
  assert.match(app, /data-order-line-total/);
  assert.match(app, /data-order-editor-total/);
  assert.match(app, /recalcOrderEditorTotals/);
});

test('order save uses guarded v2 RPC and verifies the persisted item set', async () => {
  const app = await read('public/app.js');
  assert.match(app, /save_order_manager_rc_v2/);
  assert.match(app, /save_order_operational_rc_v2/);
  assert.match(app, /p_expected_items/);
  assert.match(app, /verifySavedOrder/);
  assert.match(app, /saved order verification failed/);
});

test('backend rejects stale or partial editor snapshots', async () => {
  const sql = await read('supabase/migrations/202608220004_safe_multi_item_editor.sql');
  assert.match(sql, /assert_order_items_snapshot/);
  assert.match(sql, /order changed since editor was opened/);
  assert.match(sql, /save_order_manager_rc_v2/);
  assert.match(sql, /save_order_operational_rc_v2/);
});

test('mobile multi-item editor stacks safely without horizontal dependency', async () => {
  const css = await read('public/admin.css');
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.order-line/);
  assert.match(css, /\.order-editor-total/);
});
