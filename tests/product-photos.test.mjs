import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');

const assets = [
  ['cup250', 'public/assets/products-approved/IceFresh_01_Лед_в_стакане_250г_MASTER.png'],
  ['bag1', 'public/assets/products-approved/IceFresh_02_Лед_в_термопакете_1кг_MASTER.png'],
  ['bag2', 'public/assets/products-approved/IceFresh_03_Лед_в_термопакете_2кг_MASTER.png'],
  ['35e74838-68cb-4fb7-9e93-7e30675c48d8', 'public/assets/products-approved/IceFresh_04_HoReCa_5кг_MASTER.png'],
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

test('approved masters are authoritative and packaged products use contain crop', async () => {
  const [app, css] = await Promise.all([read('public/app.js'), read('public/public-site.css')]);
  assert.match(app, /if \(builtIn\) return builtIn/);
  assert.match(app, /product-photo--pack/);
  assert.match(app, /product-photo--scene/);
  assert.match(css, /product-photo--pack\{object-fit:contain/);
  assert.match(css, /product-photo--scene\{object-fit:cover/);
});

test('public catalogue uses bounded display derivatives while master mapping stays authoritative', async () => {
  const app = await read('public/app.js');
  assert.match(app, /BUILT_IN_PRODUCT_DISPLAY_PHOTOS/);
  assert.match(app, /product-360\/cup250\/cup250-pika-v4-poster\.webp/);
  assert.match(app, /product-02-640\.webp/);
  assert.match(app, /hero-bag-2kg-640\.webp/);
  assert.match(app, /product-04-640\.webp/);
  assert.match(app, /builtInProductDisplayPhoto\(product\) \|\| productPhotoUrl\(product\)/);
  assert.match(app, /const BUILT_IN_PRODUCT_PHOTOS = \{[\s\S]*IceFresh_04_HoReCa_5кг_MASTER\.png/);
});

test('service worker cache revision is bumped for the new storefront assets', async () => {
  const sw = await read('public/sw.js');
  assert.match(sw, /icefresh-rc1-6-v10/);
  assert.match(sw, /interactive-video-360\.js/);
  assert.match(sw, /pathname\.startsWith\('\/premium-3d'\)/);
});
