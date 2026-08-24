import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { bootstrapPremium3D, evaluatePremium3DPolicy } from '../public/premium-3d-bootstrap.js';

const [html, app, css, bootstrapSource, sceneSource] = await Promise.all([
  readFile(new URL('../public/app-shell.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/public-site.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/premium-3d-bootstrap.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/premium-3d.js', import.meta.url), 'utf8'),
]);

const capableEnvironment = (overrides = {}) => ({
  reducedMotion: false,
  saveData: false,
  effectiveType: '4g',
  deviceMemory: 4,
  hardwareConcurrency: 4,
  viewportWidth: 1024,
  ...overrides,
});
const fakeHost = () => ({ dataset: { enhancement: 'pending' } });
const observerHarness = () => {
  let callback;
  let observed = false;
  return {
    factory(next) {
      callback = next;
      return { observe() { observed = true; }, disconnect() {} };
    },
    intersect(value) { callback([{ isIntersecting: value }]); },
    get observed() { return observed; },
  };
};

test('1. WebGL available mounts the enhancement after intersection', async () => {
  const host = fakeHost();
  const observer = observerHarness();
  let mounted = 0;
  const controller = bootstrapPremium3D(host, {
    environment: capableEnvironment(), probe: () => true, observerFactory: observer.factory,
    moduleLoader: async () => ({ mountPremiumIceScene: () => { mounted += 1; return { destroy() {} }; } }),
  });
  assert.equal(observer.observed, true);
  observer.intersect(true);
  assert.equal((await controller.ready).status, 'active');
  assert.equal(mounted, 1);
});
test('2. WebGL unavailable leaves the static fallback', async () => {
  const host = fakeHost();
  const result = await bootstrapPremium3D(host, { environment: capableEnvironment(), probe: () => false }).ready;
  assert.deepEqual({ status: result.status, reason: result.reason }, { status: 'fallback', reason: 'webgl-unavailable' });
});

test('3. context capability creation exceptions become fallback', async () => {
  const host = fakeHost();
  const result = await bootstrapPremium3D(host, { environment: capableEnvironment(), probe: () => { throw new Error('context'); } }).ready;
  assert.equal(result.reason, 'webgl-unavailable');
});

test('4. context loss and restoration have explicit handlers', () => {
  assert.match(sceneSource, /webglcontextlost/);
  assert.match(sceneSource, /webglcontextrestored/);
  assert.match(sceneSource, /context-restore-failed/);
});

test('5. JS module load failure leaves fallback without console error', async () => {
  const host = fakeHost();
  const observer = observerHarness();
  const controller = bootstrapPremium3D(host, {
    environment: capableEnvironment(), probe: () => true, observerFactory: observer.factory,
    moduleLoader: async () => { throw new Error('network'); },
  });
  observer.intersect(true);
  assert.equal((await controller.ready).reason, 'module-or-context-failed');
  assert.doesNotMatch(bootstrapSource, /console\.error/);
});

test('6. reduced motion disables the continuous scene', () => {
  assert.deepEqual(evaluatePremium3DPolicy(capableEnvironment({ reducedMotion: true })), { allowed: false, reason: 'reduced-motion' });
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('7. mobile portrait remains eligible above the narrow fallback threshold', () => {
  assert.equal(evaluatePremium3DPolicy(capableEnvironment({ viewportWidth: 390 })).allowed, true);
});

test('8. mobile landscape remains eligible', () => {
  assert.equal(evaluatePremium3DPolicy(capableEnvironment({ viewportWidth: 844 })).allowed, true);
});

test('9. tablet remains eligible', () => {
  assert.equal(evaluatePremium3DPolicy(capableEnvironment({ viewportWidth: 768 })).allowed, true);
});

test('10. desktop remains eligible', () => {
  assert.equal(evaluatePremium3DPolicy(capableEnvironment({ viewportWidth: 1440 })).allowed, true);
});

test('11. slow network and data saver select the static fallback', () => {
  assert.equal(evaluatePremium3DPolicy(capableEnvironment({ effectiveType: '2g' })).reason, 'slow-network');
  assert.equal(evaluatePremium3DPolicy(capableEnvironment({ saveData: true })).reason, 'data-saver');
});

test('12. a hero below the viewport does not load the renderer', async () => {
  const host = fakeHost();
  const observer = observerHarness();
  let loads = 0;
  const controller = bootstrapPremium3D(host, {
    environment: capableEnvironment(), probe: () => true, observerFactory: observer.factory,
    moduleLoader: async () => { loads += 1; return { mountPremiumIceScene() { return {}; } }; },
  });
  observer.intersect(false);
  await Promise.resolve();
  assert.equal(loads, 0);
  controller.destroy();
});

test('13. hidden tab and offscreen state pause animation frames', () => {
  assert.match(sceneSource, /document\.hidden/);
  assert.match(sceneSource, /visibilitychange/);
  assert.match(sceneSource, /if \(!visible && frame\)/);
});

test('14. primary CTA remains semantic and clickable before 3D', () => {
  assert.match(html, /<button class="public-primary" type="button" data-scroll="order">Оставить заявку<\/button>/);
  assert.ok(html.indexOf('data-scroll="order"') < html.indexOf('data-icefresh-3d'));
});

test('15. keyboard navigation remains native and canvas is decorative', () => {
  assert.doesNotMatch(sceneSource, /tabIndex|tabindex/);
  assert.match(sceneSource, /role', 'presentation/);
  assert.match(sceneSource, /aria-hidden', 'true/);
});

test('16. screen-reader semantic content exists without canvas', () => {
  assert.match(html, /<h1>Чистый лёд/);
  assert.match(html, /alt="Два стакана IceFresh с пищевым льдом"/);
  assert.match(html, /<section class="public-section" id="products">/);
});

test('17. public order form remains present and unmodified by the enhancement', () => {
  assert.match(html, /<form id="public-order-form" class="public-order-form">/);
  assert.doesNotMatch(sceneSource, /public-order-form|supabase|fetch\(/);
});

test('18. no 3D interaction traps focus or pointer input', () => {
  assert.match(css, /\.hero-3d-layer\{[^}]*pointer-events:none/);
  assert.doesNotMatch(sceneSource, /keydown|focus\(|pointerdown|click/);
});

test('19. layer is contained and cannot create horizontal overflow', () => {
  assert.match(css, /\.hero-3d-layer\{[^}]*inset:0;overflow:hidden/);
  assert.match(css, /\.public-site\{[^}]*overflow:hidden/);
});

test('20. lazy chunks are bounded and absent from the critical static import path', async () => {
  const [bootstrapBytes, sceneBytes] = await Promise.all([
    stat(new URL('../public/premium-3d-bootstrap.js', import.meta.url)),
    stat(new URL('../public/premium-3d.js', import.meta.url)),
  ]);
  assert.ok(bootstrapBytes.size < 6_000, `bootstrap ${bootstrapBytes.size} bytes`);
  assert.ok(sceneBytes.size < 16_000, `scene ${sceneBytes.size} bytes`);
  assert.match(app, /import\('\/premium-3d-bootstrap\.js'\)/);
  assert.match(bootstrapSource, /import\('\/premium-3d\.js'\)/);
  assert.doesNotMatch(html, /premium-3d(?:-bootstrap)?\.js/);
});
