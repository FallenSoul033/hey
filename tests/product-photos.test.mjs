import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');

const assets = [
  ['cup250', 'public/assets/products/cup-250-premium-1600.webp'],
  ['bag1', 'public/assets/products/bag-1kg-premium-1600.webp'],
  ['bag2', 'public/assets/products/bag-2kg-premium-1600.webp'],
  ['35e74838-68cb-4fb7-9e93-7e30675c48d8', 'public/assets/products/horeca-5kg-premium-1600.webp'],
];

test('all four premium IceFresh product photos are bundled', async () => {
  for (const [, path] of assets) {
    const info = await stat(new URL(path, root));
    assert.ok(info.size > 50_000, `${path} should contain the production image`);
  }
});

test('product photo mapping covers cup, 1kg, 2kg and HoReCa 5kg', async () => {
  const app = await read('public/app.js');
  for (const [id, path] of assets) {
    assert.match(app, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(app, new RegExp(path.split('/').at(-1).replace('.', '\\.')));
  }
  assert.match(app, /builtInProductPhoto/);
  assert.match(app, /HoReCa\|5\\s\*кг/);
});

test('packaged products use contain crop while HoReCa keeps scene cover', async () => {
  const [app, css] = await Promise.all([read('public/app.js'), read('public/public-site.css')]);
  assert.match(app, /product-photo--pack/);
  assert.match(app, /product-photo--scene/);
  assert.match(css, /product-photo--pack\{object-fit:contain/);
  assert.match(css, /product-photo--scene\{object-fit:cover/);
});

test('service worker cache revision is bumped for the new storefront assets', async () => {
  const sw = await read('public/sw.js');
  assert.match(sw, /icefresh-rc1-6-v4/);
});
