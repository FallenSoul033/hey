import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import {
  createAngleTimeMapper,
  createVideoScrubTracker,
  mountInteractiveVideo360,
  wrapAngle,
  wrapProgress,
} from '../public/interactive-video-360.js';
import {
  CUP250_PIKA_V4_ANGLE_TIME_MAP,
  PRODUCT_360_VIDEO_POCS,
} from '../public/product-360-config.js';

const videoConfig = PRODUCT_360_VIDEO_POCS.cup250;

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex').toUpperCase();

test('video timeline wraps without losing the selected angle', () => {
  assert.equal(wrapAngle(360), 0);
  assert.equal(wrapAngle(-90), 270);
  assert.equal(wrapProgress(1), 0);
  assert.equal(wrapProgress(-0.25), 0.75);
  assert.equal(wrapProgress(2.125), 0.125);
});

test('calibrated angle map is strictly monotonic and returns measured cardinal timings', () => {
  const mapper = createAngleTimeMapper(CUP250_PIKA_V4_ANGLE_TIME_MAP);
  assert.equal(mapper.valid, true);
  for (let index = 1; index < mapper.anchors.length; index += 1) {
    assert.ok(mapper.anchors[index][0] > mapper.anchors[index - 1][0]);
    assert.ok(mapper.anchors[index][1] > mapper.anchors[index - 1][1]);
  }
  assert.equal(mapper.timeForAngle(0), 0);
  assert.equal(mapper.timeForAngle(90), 1.6);
  assert.equal(mapper.timeForAngle(180), 2.633333);
  assert.equal(mapper.timeForAngle(270), 3.466667);
  assert.equal(mapper.timeForAngle(360), 4.866667);
  assert.ok(Math.abs(mapper.timeForAngle(82.5) - 1.5) < 0.000001);
});

test('scrub tracker reverses immediately and preserves vertical page scrolling', () => {
  const tracker = createVideoScrubTracker({ frameCount: 24, pixelsPerTurn: 240 });
  tracker.start(120, 100, 0);
  const vertical = tracker.move(114, 132, 16);
  assert.equal(vertical.axis, 'vertical');
  assert.equal(vertical.angle, 0);
  assert.equal(vertical.changed, false);
  tracker.end();

  tracker.start(120, 100, 100);
  const forward = tracker.move(60, 102, 132);
  assert.equal(forward.axis, 'horizontal');
  assert.equal(forward.changed, true);
  assert.equal(forward.angle, 90);
  assert.equal(forward.progress, 0.25);
  const reverse = tracker.move(90, 102, 148);
  assert.equal(reverse.axis, 'horizontal');
  assert.equal(reverse.angle, 45);
  assert.equal(reverse.progress, 0.125);
  const released = tracker.end();
  assert.equal(released.angle, 45);
  assert.equal(released.progress, 0.125);
});

test('angle-space tracker completes a full rotation in both directions', () => {
  const tracker = createVideoScrubTracker({ pixelsPerTurn: 240, reducedMotion: true });
  tracker.start(120, 100, 0);
  assert.equal(tracker.move(60, 100, 16).angle, 90);
  assert.equal(tracker.move(0, 100, 32).angle, 180);
  assert.equal(tracker.move(-60, 100, 48).angle, 270);
  assert.equal(tracker.move(-120, 100, 64).angle, 0);
  tracker.end();
  tracker.start(120, 100, 80);
  assert.equal(tracker.move(180, 100, 96).angle, 270);
  assert.equal(tracker.move(240, 100, 112).angle, 180);
  assert.equal(tracker.move(300, 100, 128).angle, 90);
  assert.equal(tracker.move(360, 100, 144).angle, 0);
});

test('light inertia is bounded and a new touch interrupts it immediately', () => {
  const tracker = createVideoScrubTracker({ frameCount: 24, pixelsPerTurn: 240 });
  tracker.start(120, 100, 0);
  tracker.move(60, 100, 30);
  const release = tracker.end();
  assert.ok(Math.abs(release.velocity) > 0);
  const first = tracker.advanceInertia(16);
  assert.equal(first.active, true);
  assert.notEqual(first.progress, release.progress);
  tracker.start(60, 100, 50);
  const interrupted = tracker.advanceInertia(16);
  assert.equal(interrupted.active, false);
  assert.equal(interrupted.angle, tracker.angle);
  assert.equal(interrupted.progress, tracker.progress);
});

test('reduced motion disables angle-space inertia', () => {
  const tracker = createVideoScrubTracker({ pixelsPerTurn: 240, reducedMotion: true });
  tracker.start(120, 100, 0);
  tracker.move(60, 100, 30);
  assert.equal(tracker.end().velocity, 0);
  assert.equal(tracker.advanceInertia(16).active, false);
});

function viewerHarness({ saveData = false, reducedMotion = true } = {}) {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Map([['data-product-360', 'cup250']]);
  const children = [];
  const image = {
    src: 'https://icefresh.test/assets/product-360/cup250/cup250-pika-v4-poster.webp',
    currentSrc: '',
    alt: 'Лёд в стакане 250 г',
  };
  const host = {
    clientWidth: 280,
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
    append(child) { children.push(child); child.parentNode = host; },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const videoListeners = new Map();
  const video = {
    className: '',
    muted: false,
    playsInline: false,
    controls: true,
    preload: '',
    poster: '',
    src: '',
    currentTime: 0,
    duration: 4.9,
    readyState: 2,
    parentNode: null,
    canPlayType(type) { return type === 'video/mp4' ? 'probably' : ''; },
    setAttribute() {},
    addEventListener(type, listener) { videoListeners.set(type, listener); },
    removeEventListener(type) { videoListeners.delete(type); },
    load() {
      queueMicrotask(() => {
        videoListeners.get('loadedmetadata')?.();
        videoListeners.get('loadeddata')?.();
      });
    },
    remove() {
      if (!video.parentNode) return;
      const index = children.indexOf(video);
      if (index >= 0) children.splice(index, 1);
      video.parentNode = null;
    },
  };
  let intersectionCallback = null;
  let videoFactoryCalls = 0;
  const animationQueue = [];
  const controller = mountInteractiveVideo360(host, {
    productId: 'cup250',
    config: videoConfig,
    connection: { effectiveType: '4g', saveData },
    reducedMotion,
    baseURI: 'https://icefresh.test/',
    evaluatePolicy(connection) {
      return connection.saveData ? { allowed: false, reason: 'data-saver' } : { allowed: true, reason: '' };
    },
    observerFactory(callback) {
      intersectionCallback = callback;
      return { observe() {}, disconnect() {} };
    },
    videoFactory() { videoFactoryCalls += 1; return video; },
    elementFactory() { return { className: '', textContent: '', setAttribute() {}, remove() {} }; },
    requestFrame(callback) { animationQueue.push(callback); return animationQueue.length; },
    cancelFrame() {},
    now: () => 100,
  });
  return {
    controller, host, image, video, children, classes, attributes,
    get videoFactoryCalls() { return videoFactoryCalls; },
    intersect() { intersectionCallback?.([{ isIntersecting: true }]); },
    flushAnimation(time = 116) { animationQueue.shift()?.(time); },
    dispatch(type, overrides = {}) {
      let prevented = false;
      listeners.get(type)?.({
        isPrimary: true, pointerType: 'touch', button: 0, pointerId: 1,
        clientX: 120, clientY: 100, timeStamp: 100,
        preventDefault() { prevented = true; },
        ...overrides,
      });
      return { get prevented() { return prevented; } };
    },
  };
}

test('video is proximity-loaded, matches the poster, and scrubs without autoplay', async () => {
  const harness = viewerHarness();
  assert.equal(harness.videoFactoryCalls, 0);
  assert.equal(harness.controller.status, 'poster');
  harness.intersect();
  assert.equal(await harness.controller.prepare(), true);
  assert.equal(harness.videoFactoryCalls, 1);
  assert.equal(harness.video.poster, 'https://icefresh.test/assets/product-360/cup250/cup250-pika-v4-poster.webp');
  assert.equal(harness.video.src, 'https://icefresh.test/assets/product-360/cup250/cup250-pika-v4-scrub-h264-gop4.mp4');
  assert.equal(harness.video.controls, false);
  assert.equal(harness.video.muted, true);
  assert.equal(harness.video.playsInline, true);
  assert.equal(harness.controller.status, 'ready');

  harness.dispatch('pointerdown');
  const move = harness.dispatch('pointermove', { clientX: 50, clientY: 102, timeStamp: 132 });
  assert.equal(move.prevented, true);
  harness.flushAnimation();
  assert.ok(harness.video.currentTime > 0);
  harness.dispatch('pointerup', { timeStamp: 148 });
  const selected = harness.controller.progress;
  assert.ok(selected > 0);
  assert.equal(harness.controller.progress, selected);
});

test('keyboard selects calibrated 15 degree anchors', async () => {
  const harness = viewerHarness();
  harness.intersect();
  assert.equal(await harness.controller.prepare(), true);
  harness.dispatch('keydown', { key: 'ArrowRight' });
  await Promise.resolve();
  harness.flushAnimation();
  assert.equal(harness.controller.angle, 15);
  assert.ok(Math.abs(harness.video.currentTime - 0.333333) < 0.000001);
  assert.equal(harness.attributes.get('aria-valuenow'), '15');
  assert.equal(harness.attributes.get('aria-valuetext'), 'Угол 15°');
});

test('Data Saver keeps the static poster and never creates the video', async () => {
  const harness = viewerHarness({ saveData: true });
  assert.equal(harness.controller.status, 'fallback');
  assert.equal(harness.host.dataset.viewer360Reason, 'data-saver');
  assert.equal(await harness.controller.prepare(), false);
  assert.equal(harness.videoFactoryCalls, 0);
});

test('committed derivative, poster, source evidence, and 151x24 matrix identities are exact', async () => {
  const derivativeUrl = new URL('../public/assets/product-360/cup250/cup250-pika-v4-scrub-h264-gop4.mp4', import.meta.url);
  const posterUrl = new URL('../public/assets/product-360/cup250/cup250-pika-v4-poster.webp', import.meta.url);
  const evidenceUrl = new URL('../docs/task64/pika-v4-calibration.json', import.meta.url);
  const matrixUrl = new URL('../docs/task64/pika-v4-cost-matrix.csv', import.meta.url);
  const [derivative, poster, evidence, matrix, derivativeStats, posterStats] = await Promise.all([
    readFile(derivativeUrl), readFile(posterUrl), readFile(evidenceUrl, 'utf8'), readFile(matrixUrl, 'utf8'),
    stat(derivativeUrl), stat(posterUrl),
  ]);
  const parsed = JSON.parse(evidence);
  assert.equal(derivativeStats.size, videoConfig.derivativeIdentity.bytes);
  assert.equal(sha256(derivative), videoConfig.derivativeIdentity.sha256);
  assert.equal(posterStats.size, videoConfig.posterIdentity.bytes);
  assert.equal(sha256(poster), videoConfig.posterIdentity.sha256);
  assert.equal(parsed.source.bytes, videoConfig.sourceIdentity.bytes);
  assert.equal(parsed.source.sha256, videoConfig.sourceIdentity.sha256);
  assert.deepEqual(parsed.calibration.matrixShape, [151, 24]);
  assert.equal(parsed.calibration.matrixFloat32Sha256, videoConfig.calibrationEvidence.matrixFloat32Sha256);
  assert.equal(matrix.trim().split(/\r?\n/).length, 152);
});
