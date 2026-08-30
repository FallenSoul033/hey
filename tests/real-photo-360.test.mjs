import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createDragTracker,
  evaluateViewerPolicy,
  mountConfiguredProductViewers,
  mountRealPhoto360,
  validateManifest,
  wrapFrameIndex,
} from '../public/real-photo-360.js';
import { PRODUCT_360_MANIFESTS } from '../public/product-360-config.js';

const validFrames = Array.from({ length: 24 }, (_, index) => `frame-${String(index + 1).padStart(2, '0')}.webp`);

test('published product manifests expose all 72 derived-photo frames in canonical order', async () => {
  for (const productId of ['cup250', 'bag1', 'bag2']) {
    const directory = new URL(`../public/assets/product-360/${productId}/`, import.meta.url);
    const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
    assert.equal(manifest.enabled, true);
    assert.equal(manifest.productId, productId);
    assert.equal(manifest.sourceClassification, 'DERIVED_FROM_APPROVED_PHOTOS');
    assert.deepEqual(manifest.frames, validFrames);
    assert.equal(validateManifest(manifest, productId).valid, true);

    for (const frame of manifest.frames) {
      const bytes = await readFile(new URL(frame, directory));
      assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
      assert.ok(bytes.length > 0, `${productId}/${frame} must not be empty`);
    }
  }
});

test('360 manifests require 24-36 explicit real-photo frames', () => {
  const result = validateManifest({
    schemaVersion: 1,
    productId: 'cup250',
    enabled: true,
    frames: validFrames,
  }, 'cup250');
  assert.equal(result.valid, true);
  assert.equal(result.manifest.frames.length, 24);
  assert.equal(validateManifest({ schemaVersion: 1, productId: 'cup250', enabled: true, frames: validFrames.slice(0, 23) }, 'cup250').reason, 'frame-count');
  assert.equal(validateManifest({ schemaVersion: 1, productId: 'bag1', enabled: true, frames: validFrames }, 'cup250').reason, 'product-mismatch');
  assert.equal(validateManifest({ schemaVersion: 1, productId: 'cup250', enabled: false, frames: [] }, 'cup250').reason, 'disabled');
});

test('frame math loops in both directions', () => {
  assert.equal(wrapFrameIndex(24, 24), 0);
  assert.equal(wrapFrameIndex(-1, 24), 23);
  assert.equal(wrapFrameIndex(49, 24), 1);
});

test('horizontal mouse/touch drag rotates and preserves the released angle', () => {
  const tracker = createDragTracker({ frameCount: 24, pixelsPerFrame: 10, initialFrame: 2 });
  tracker.start(100, 50);
  assert.deepEqual(tracker.move(70, 53), { axis: 'horizontal', frame: 5, changed: true });
  assert.equal(tracker.end(), 5);
  tracker.start(70, 53);
  assert.deepEqual(tracker.move(100, 52), { axis: 'horizontal', frame: 2, changed: true });
  assert.equal(tracker.end(), 2);
});

test('vertical intent never rotates the product or claims the scroll gesture', () => {
  const tracker = createDragTracker({ frameCount: 24, pixelsPerFrame: 10, initialFrame: 7 });
  tracker.start(50, 50);
  assert.deepEqual(tracker.move(53, 82), { axis: 'vertical', frame: 7, changed: false });
  assert.equal(tracker.end(), 7);
});

test('slow networks and data saver retain the poster fallback', () => {
  assert.deepEqual(evaluateViewerPolicy({ effectiveType: '2g', saveData: false }), { allowed: false, reason: 'slow-network' });
  assert.deepEqual(evaluateViewerPolicy({ effectiveType: '4g', saveData: true }), { allowed: false, reason: 'data-saver' });
  assert.deepEqual(evaluateViewerPolicy({ effectiveType: '4g', saveData: false }), { allowed: true, reason: '' });
});

test('only physical packaged products are configured; HoReCa waits for a suitable package', () => {
  assert.deepEqual(Object.keys(PRODUCT_360_MANIFESTS), ['cup250', 'bag1', 'bag2']);
  assert.equal(PRODUCT_360_MANIFESTS['35e74838-68cb-4fb7-9e93-7e30675c48d8'], undefined);
});

test('configured mounts read numeric data attributes without relying on DOMStringMap camel casing', () => {
  const image = { src: 'https://icefresh.test/poster.webp', currentSrc: '' };
  const host = {
    dataset: {},
    getAttribute(name) { return name === 'data-product-360' ? 'cup250' : ''; },
    querySelector(selector) { return selector === 'img' ? image : null; },
    classList: { add() {}, remove() {} },
  };
  const controllers = mountConfiguredProductViewers({ querySelectorAll: () => [host] }, { connection: { saveData: true } });
  assert.equal(controllers.length, 1);
  assert.equal(controllers[0].status, 'fallback');
  assert.equal(host.dataset.viewer360Reason, 'data-saver');
});

function viewerHarness({ failFrame = false } = {}) {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Map([['data-product-360', 'cup250']]);
  const image = { src: 'https://icefresh.test/poster.webp', currentSrc: '', draggable: true, alt: 'Лёд в стакане 250 г' };
  const host = {
    dataset: { product360: 'cup250' },
    classList: {
      add(...values) { values.forEach(value => classes.add(value)); },
      remove(...values) { values.forEach(value => classes.delete(value)); },
    },
    querySelector(selector) { return selector === 'img' ? image : null; },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  let intersectionCallback;
  let observed = false;
  const loaded = [];
  const controller = mountRealPhoto360(host, {
    productId: 'cup250',
    manifestUrl: '/assets/product-360/cup250/manifest.json',
    baseURI: 'https://icefresh.test/',
    connection: { effectiveType: '4g', saveData: false },
    observerFactory(callback) {
      intersectionCallback = callback;
      return { observe() { observed = true; }, disconnect() {} };
    },
    fetchImpl: async () => ({ ok: true, json: async () => ({ schemaVersion: 1, productId: 'cup250', enabled: true, frames: validFrames }) }),
    imageLoader: async url => {
      loaded.push(url);
      if (failFrame) throw new Error('missing');
      return url;
    },
  });
  return {
    controller, host, image, loaded, classes, attributes,
    get observed() { return observed; },
    intersect() { intersectionCallback([{ isIntersecting: true }]); },
    dispatch(type, overrides = {}) {
      let prevented = false;
      listeners.get(type)?.({
        isPrimary: true, pointerType: 'touch', button: 0, pointerId: 1,
        clientX: 100, clientY: 100,
        preventDefault() { prevented = true; },
        ...overrides,
      });
      return { get prevented() { return prevented; } };
    },
  };
}

test('manifest and first frame wait for viewport proximity; the remaining queue waits for interaction', async () => {
  const harness = viewerHarness();
  assert.equal(harness.observed, true);
  assert.equal(harness.loaded.length, 0);
  harness.intersect();
  await harness.controller.prepare();
  assert.equal(harness.loaded.length, 1);
  assert.equal(harness.image.src, 'https://icefresh.test/poster.webp');
  harness.dispatch('pointerdown');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(harness.loaded.length > 1);
});

test('mounted viewer claims only horizontal motion and retains its frame after release', async () => {
  const harness = viewerHarness();
  harness.intersect();
  await harness.controller.prepare();
  harness.dispatch('pointerdown');
  const vertical = harness.dispatch('pointermove', { clientX: 103, clientY: 140 });
  assert.equal(vertical.prevented, false);
  harness.dispatch('pointerup');
  assert.equal(harness.controller.frame, 0);
  harness.dispatch('pointerdown');
  const horizontal = harness.dispatch('pointermove', { clientX: 70, clientY: 102 });
  assert.equal(horizontal.prevented, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  harness.dispatch('pointerup');
  assert.equal(harness.controller.frame, 2);
  assert.equal(harness.image.src.endsWith('/frame-03.webp'), true);
});

test('ready viewer exposes slider semantics and supports cyclic keyboard rotation', async () => {
  const harness = viewerHarness();
  harness.intersect();
  await harness.controller.prepare();

  assert.equal(harness.attributes.get('tabindex'), '0');
  assert.equal(harness.attributes.get('role'), 'slider');
  assert.equal(harness.attributes.get('aria-label'), 'Лёд в стакане 250 г — обзор 360°');
  assert.equal(harness.attributes.get('aria-orientation'), 'horizontal');
  assert.equal(harness.attributes.get('aria-valuemin'), '1');
  assert.equal(harness.attributes.get('aria-valuemax'), '24');
  assert.equal(harness.attributes.get('aria-valuenow'), '1');

  const right = harness.dispatch('keydown', { key: 'ArrowRight' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(right.prevented, true);
  assert.equal(harness.controller.frame, 1);
  assert.equal(harness.image.src.endsWith('/frame-02.webp'), true);
  assert.equal(harness.attributes.get('aria-valuenow'), '2');
  assert.equal(harness.attributes.get('aria-valuetext'), 'Ракурс 2 из 24');

  harness.dispatch('keydown', { key: 'Home' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(harness.controller.frame, 0);
  harness.dispatch('keydown', { key: 'ArrowLeft' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(harness.controller.frame, 23);
  assert.equal(harness.attributes.get('aria-valuenow'), '24');

  harness.controller.destroy();
  assert.equal(harness.attributes.has('tabindex'), false);
  assert.equal(harness.attributes.has('role'), false);
  assert.equal(harness.attributes.has('aria-label'), false);
});

test('a missing frame restores the original poster without throwing', async () => {
  const harness = viewerHarness({ failFrame: true });
  harness.intersect();
  assert.equal(await harness.controller.prepare(), false);
  assert.equal(harness.controller.status, 'fallback');
  assert.equal(harness.image.src, 'https://icefresh.test/poster.webp');
});
