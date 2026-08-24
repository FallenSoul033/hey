import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');

const canonicalImages = [
  'cup-250-premium-1600.webp',
  'bag-1kg-premium-1600.webp',
  'bag-2kg-premium-1600.webp',
  'horeca-5kg-premium-1600.webp',
];

test('RC1.6 keeps the full canonical application route surface', async () => {
  const routes = await read('public/routes.js');
  for (const route of [
    'dashboard', 'calendar', 'requests', 'orders', 'clients', 'production',
    'products', 'employees', 'accruals', 'warehouse', 'analytics',
    'operations', 'ai', 'integrations'
  ]) {
    assert.match(routes, new RegExp(`['"]${route}['"]`), `missing route ${route}`);
  }
  assert.match(routes, /MANAGER_ROUTES[\s\S]*products[\s\S]*employees[\s\S]*accruals[\s\S]*analytics[\s\S]*operations/);
  assert.match(routes, /OWNER_ROUTES[\s\S]*integrations/);
});

test('RC1.6 order editor loads and saves the complete order_items aggregate', async () => {
  const app = await read('public/app.js');
  assert.match(app, /select\('\*,order_items\(id,product_id,quantity,unit_price\)'\)/);
  assert.match(app, /const items = \[\.\.\.form\.querySelectorAll\('\[data-order-line\]'\)\]\.map/);
  assert.match(app, /new Set\(items\.map\(item => item\.product_id\)\)\.size !== items\.length/);
  assert.match(app, /save_order_manager_rc_v2/);
  assert.match(app, /save_order_operational_rc_v2/);
  assert.match(app, /p_expected_items: expectedItems/);
  assert.doesNotMatch(app, /supabase\.from\('orders'\)\.\s*(?:insert|update|upsert|delete)\s*\(/);
});

test('RC1.6 canonical product images use exact 1600px WebP asset names only', async () => {
  const app = await read('public/app.js');
  for (const image of canonicalImages) {
    const info = await stat(new URL(`public/assets/products/${image}`, root));
    assert.ok(info.size > 50_000, `${image} must be a real production asset`);
    assert.match(app, new RegExp(image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const oldName of [
    'cup-250-premium.webp', 'bag-1kg-premium.webp', 'bag-2kg-premium.webp', 'horeca-5kg-premium.webp'
  ]) {
    assert.doesNotMatch(app, new RegExp(`(?:^|/)${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});

test('RC1.6 mobile editor and product cards have explicit responsive safeguards', async () => {
  const [adminCss, publicCss, shellCss] = await Promise.all([
    read('public/admin.css'),
    read('public/public-site.css'),
    read('public/styles.css'),
  ]);
  assert.match(adminCss, /@media\(max-width:720px\)[\s\S]*\.order-line\{grid-template-columns:1fr 1fr\}/);
  assert.match(shellCss, /@media\(max-width:720px\)[\s\S]*\.fields\{grid-template-columns:1fr\}/);
  assert.match(shellCss, /main\{margin:0;padding:22px 16px 116px\}/);
  assert.match(shellCss, /\.sidebar #nav\{[^}]*overflow-y:auto[^}]*overscroll-behavior-y:contain[^}]*-webkit-overflow-scrolling:touch/);
  assert.match(shellCss, /\.sidebar\{[^}]*height:100dvh[^}]*overflow:hidden/);
  assert.match(adminCss, /\.order-items-editor,\.order-line,[^}]*min-width:0/);
  assert.match(publicCss, /product-photo--pack\{object-fit:contain/);
  assert.match(publicCss, /product-photo--scene\{object-fit:cover/);
  assert.match(publicCss, /#products\{container-name:product-catalog;container-type:inline-size\}/);
  assert.match(publicCss, /@container product-catalog \(max-width:900px\)\{\.catalog-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(publicCss, /\.catalog-card\{display:grid;grid-template-columns:minmax\(0,210px\) minmax\(0,1fr\)/);
  assert.match(publicCss, /@container product-catalog \(max-width:640px\)[\s\S]*\.public-product-photo\{height:210px/);
});

test('RC1.6 service worker cache revision isolates the final premium asset mapping', async () => {
  const sw = await read('public/sw.js');
  assert.match(sw, /icefresh-rc1-6-v4/);
  assert.match(sw, /pathname\.startsWith\('\/assets\/'\)/);
});
