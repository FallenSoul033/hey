import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePublicProducts, handlePublicSocialLinks } from '../worker/public-social-links.ts';

const organizationId = '20000000-0000-0000-0000-000000000001';
const publishableKey = 'sb_publishable_123456789012345678901234567890';

function legacyKey(role) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role })}.signature`;
}

function env(key, fallbackKey = key) {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: key,
    ICEFRESH_ORGANIZATION_ID: organizationId,
    ASSETS: {
      fetch: async () => new Response(`window.__ICEFRESH_CONFIG__ = { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: '${fallbackKey}' };`),
    },
  };
}

async function withUpstream(handler) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: new URL(String(input)), init });
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await handler();
    return { response, calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('public endpoints impose canonical tenant, fields, and publication-state filters', async () => {
  const hostile = '?organization_id=eq.ffffffff-ffff-ffff-ffff-ffffffffffff&select=organization_id';
  const social = await withUpstream(() => handlePublicSocialLinks(new Request(`https://icefresh.test/api/public-social-links${hostile}`), env(publishableKey)));
  const products = await withUpstream(() => handlePublicProducts(new Request(`https://icefresh.test/api/public-products${hostile}`), env(publishableKey)));

  assert.equal(social.response.status, 200);
  assert.equal(products.response.status, 200);
  assert.equal(social.calls.length, 1);
  assert.equal(products.calls.length, 1);

  const socialUrl = social.calls[0].url;
  assert.equal(socialUrl.searchParams.get('organization_id'), `eq.${organizationId}`);
  assert.equal(socialUrl.searchParams.get('select'), 'platform,url,label,sort_order');
  assert.equal(socialUrl.searchParams.get('enabled'), 'eq.true');
  assert.equal(socialUrl.searchParams.get('url'), 'neq.');

  const productUrl = products.calls[0].url;
  assert.equal(productUrl.searchParams.get('organization_id'), `eq.${organizationId}`);
  assert.equal(productUrl.searchParams.get('select'), 'id,name,description,weight_label,default_price,unit,photo_path,active,public_visible,sort_order');
  assert.equal(productUrl.searchParams.get('active'), 'eq.true');
  assert.equal(productUrl.searchParams.get('public_visible'), 'eq.true');
});

test('privileged and malformed Supabase keys fail closed without an upstream request', async () => {
  for (const key of [
    'sb_secret_123456789012345678901234567890',
    legacyKey('service_role'),
    'test-publishable-key-that-is-not-a-real-key',
  ]) {
    const result = await withUpstream(() => handlePublicProducts(new Request('https://icefresh.test/api/public-products'), env(key)));
    assert.equal(result.calls.length, 0);
    assert.deepEqual(await result.response.json(), { products: [], available: null, degraded: true });
  }
});

test('legacy JWT keys are accepted only when their role is anon', async () => {
  const result = await withUpstream(() => handlePublicSocialLinks(new Request('https://icefresh.test/api/public-social-links'), env(legacyKey('anon'))));
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].init.headers.apikey, legacyKey('anon'));
});

test('non-GET requests fail closed before configuration or upstream access', async () => {
  const result = await withUpstream(() => handlePublicProducts(new Request('https://icefresh.test/api/public-products', { method: 'POST' }), env(publishableKey)));
  assert.equal(result.response.status, 405);
  assert.equal(result.calls.length, 0);
});
