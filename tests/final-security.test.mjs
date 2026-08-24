import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = p => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('RC1.5 release version is consistent', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const version = JSON.parse(await read('public/version.json'));
  const app = await read('public/app.js');
  assert.equal(pkg.version, '12.0.0-rc.1.6');
  assert.equal(version.version, '12.0.0-rc.1.6');
  assert.match(app, /12\.0\.0-rc\.1\.6/);
});

test('HSTS and strong browser headers are present', async () => {
  const headers = await read('public/_headers');
  const worker = await read('worker/index.ts');
  for (const source of [headers, worker]) {
    assert.match(source, /Strict-Transport-Security/);
    assert.match(source, /X-Content-Type-Options/);
    assert.match(source, /frame-ancestors 'none'/);
  }
  assert.doesNotMatch(headers, /unsafe-inline|unsafe-eval/);
});

test('Vite dev server is loopback-only', async () => {
  assert.match(await read('vite.config.ts'), /host:\s*['"]127\.0\.0\.1['"]/);
});

test('Gemini key is sent in header instead of URL', async () => {
  const ai = await read('worker/ai-provider.ts');
  assert.match(ai, /x-goog-api-key/);
  assert.doesNotMatch(ai, /generateContent\?key=/);
});

test('Public order endpoint has production-only CORS and DB atomic submission', async () => {
  const fn = await read('supabase/functions/public-order-request/index.ts');
  assert.match(fn, /submit_public_request_rc/);
  assert.match(fn, /idempotencyKey/);
  assert.doesNotMatch(fn, /localhost/);
  assert.doesNotMatch(fn, /PUBLIC_REQUEST_HMAC_SECRET/);
  assert.doesNotMatch(fn, /\.select\("id", \{ count: "exact"/);
});

test('Public request migration serializes rate limiting and protects secret', async () => {
  const sql = await read('supabase/migrations/202608210002_rc15_security_hardening.sql');
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /website_requests_org_idempotency_uidx/);
  assert.match(sql, /revoke all on private\.public_request_security/);
  assert.match(sql, /grant execute[\s\S]+to service_role/i);
});

test('Pending accounting migration uses SHA-256, not MD5', async () => {
  const sql = await read('supabase/migrations/202608160005_atomic_inventory_ledger_outbox.sql');
  assert.match(sql, /extensions\.digest\([\s\S]*'sha256'/);
  assert.doesNotMatch(sql, /\bmd5\s*\(/i);
});

test('Registration UI requires an invite', async () => {
  const app = await read('public/app.js');
  assert.match(app, /sessionStorage\.getItem\('icefresh-invite'\)/);
  assert.match(app, /Регистрация доступна только по ссылке-приглашению/);
  assert.match(app, /emailRedirectTo/);
});

test('React RSC packages are aligned at 19.2.8', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.dependencies.react, '19.2.8');
  assert.equal(pkg.dependencies['react-dom'], '19.2.8');
  assert.equal(pkg.devDependencies['react-server-dom-webpack'], '19.2.8');
});
