import { manifestForProduct } from './product-360-config.js';

const MIN_FRAMES = 24;
const MAX_FRAMES = 36;
const GESTURE_THRESHOLD = 6;

export function wrapFrameIndex(value, frameCount) {
  const count = Number(frameCount);
  if (!Number.isInteger(count) || count < 1) return 0;
  return ((Math.trunc(value) % count) + count) % count;
}

export function evaluateViewerPolicy(connection = {}) {
  if (connection?.saveData) return { allowed: false, reason: 'data-saver' };
  if (['slow-2g', '2g'].includes(String(connection?.effectiveType || '').toLowerCase())) {
    return { allowed: false, reason: 'slow-network' };
  }
  return { allowed: true, reason: '' };
}

function isSafeFramePath(value) {
  const path = String(value || '').trim();
  return Boolean(path)
    && !/^(?:[a-z]+:)?\/\//i.test(path)
    && !path.split('/').includes('..')
    && /\.(?:avif|webp|png|jpe?g)$/i.test(path);
}

export function validateManifest(input, expectedProductId = '') {
  if (!input || typeof input !== 'object') return { valid: false, reason: 'invalid-manifest' };
  if (input.enabled !== true) return { valid: false, reason: 'disabled' };
  if (input.schemaVersion !== 1) return { valid: false, reason: 'schema-version' };
  const productId = String(input.productId || '').trim();
  if (!productId || (expectedProductId && productId !== expectedProductId)) return { valid: false, reason: 'product-mismatch' };
  if (!Array.isArray(input.frames) || input.frames.length < MIN_FRAMES || input.frames.length > MAX_FRAMES) {
    return { valid: false, reason: 'frame-count' };
  }
  const frames = input.frames.map(frame => String(frame || '').trim());
  if (frames.some(frame => !isSafeFramePath(frame)) || new Set(frames).size !== frames.length) {
    return { valid: false, reason: 'frame-path' };
  }
  return {
    valid: true,
    reason: '',
    manifest: Object.freeze({
      schemaVersion: 1,
      productId,
      enabled: true,
      frames: Object.freeze(frames),
    }),
  };
}

export function createDragTracker({ frameCount, pixelsPerFrame = 12, initialFrame = 0 }) {
  const count = Number(frameCount);
  const sensitivity = Math.max(4, Number(pixelsPerFrame) || 12);
  let currentFrame = wrapFrameIndex(initialFrame, count);
  let startFrame = currentFrame;
  let startX = 0;
  let startY = 0;
  let active = false;
  let axis = 'pending';

  return {
    start(x, y) {
      startX = Number(x) || 0;
      startY = Number(y) || 0;
      startFrame = currentFrame;
      active = true;
      axis = 'pending';
      return currentFrame;
    },
    move(x, y) {
      if (!active) return { axis: 'idle', frame: currentFrame, changed: false };
      const deltaX = (Number(x) || 0) - startX;
      const deltaY = (Number(y) || 0) - startY;
      if (axis === 'pending') {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < GESTURE_THRESHOLD) {
          return { axis, frame: currentFrame, changed: false };
        }
        axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      }
      if (axis === 'vertical') return { axis, frame: currentFrame, changed: false };
      const nextFrame = wrapFrameIndex(startFrame + Math.trunc(-deltaX / sensitivity), count);
      const changed = nextFrame !== currentFrame;
      currentFrame = nextFrame;
      return { axis, frame: currentFrame, changed };
    },
    end() {
      active = false;
      axis = 'pending';
      return currentFrame;
    },
    setFrame(value) {
      currentFrame = wrapFrameIndex(value, count);
      startFrame = currentFrame;
      return currentFrame;
    },
    get frame() {
      return currentFrame;
    },
  };
}

function defaultObserverFactory(callback, options) {
  if (!('IntersectionObserver' in globalThis)) return null;
  return new IntersectionObserver(callback, options);
}

function defaultImageLoader(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(url);
    image.onerror = () => reject(new Error('frame-load-failed'));
    image.src = url;
  });
}

function frameUrlsFor(manifest, manifestUrl, baseURI) {
  const manifestAddress = new URL(manifestUrl, baseURI);
  return manifest.frames.map(frame => new URL(frame, manifestAddress).href);
}

export function mountRealPhoto360(host, options = {}) {
  const productId = String(options.productId || host?.getAttribute?.('data-product-360') || '').trim();
  const manifestUrl = options.manifestUrl || manifestForProduct(productId);
  const image = host?.querySelector?.('img');
  const connection = options.connection || globalThis.navigator?.connection || {};
  const policy = evaluateViewerPolicy(connection);
  const poster = image?.currentSrc || image?.src || '';
  const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
  const imageLoader = options.imageLoader || defaultImageLoader;
  const observerFactory = options.observerFactory || defaultObserverFactory;
  const baseURI = options.baseURI || globalThis.document?.baseURI || 'http://localhost/';
  let observer = null;
  let manifest = null;
  let frameUrls = [];
  let preparePromise = null;
  let tracker = null;
  let failed = false;
  let pointerActive = false;
  let capturedPointerId = null;
  let lastPointer = null;
  let hint = null;
  let preloadStarted = false;
  let accessibilityEnabled = false;
  const loadedFrames = new Set();
  const pendingFrames = new Map();
  const managedAccessibilityAttributes = [
    'tabindex',
    'role',
    'aria-label',
    'aria-orientation',
    'aria-valuemin',
    'aria-valuemax',
    'aria-valuenow',
    'aria-valuetext',
    'aria-keyshortcuts',
  ];
  const originalAccessibilityAttributes = new Map(managedAccessibilityAttributes.map(name => [
    name,
    host?.getAttribute?.(name) ?? null,
  ]));

  const setState = (state, reason = '') => {
    if (!host?.dataset) return;
    host.dataset.viewer360 = state;
    if (reason) host.dataset.viewer360Reason = reason;
    else delete host.dataset.viewer360Reason;
  };

  const updateAccessibleFrame = () => {
    if (!accessibilityEnabled || !tracker || !frameUrls.length) return;
    const frameNumber = tracker.frame + 1;
    host.setAttribute('aria-valuenow', String(frameNumber));
    host.setAttribute('aria-valuetext', `Ракурс ${frameNumber} из ${frameUrls.length}`);
  };

  const enableAccessibility = () => {
    if (!host?.setAttribute || !frameUrls.length) return;
    const productLabel = String(image?.alt || 'Товар IceFresh').trim() || 'Товар IceFresh';
    host.setAttribute('tabindex', '0');
    host.setAttribute('role', 'slider');
    host.setAttribute('aria-label', `${productLabel} — обзор 360°`);
    host.setAttribute('aria-orientation', 'horizontal');
    host.setAttribute('aria-valuemin', '1');
    host.setAttribute('aria-valuemax', String(frameUrls.length));
    host.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End');
    accessibilityEnabled = true;
    updateAccessibleFrame();
  };

  const restoreAccessibility = () => {
    if (!accessibilityEnabled || !host) return;
    for (const [name, value] of originalAccessibilityAttributes) {
      if (value === null) host.removeAttribute?.(name);
      else host.setAttribute?.(name, value);
    }
    accessibilityEnabled = false;
  };

  const fallback = reason => {
    if (failed) return;
    failed = true;
    pointerActive = false;
    tracker?.end();
    if (image && poster && image.src !== poster) image.src = poster;
    host?.classList?.remove('is-360-ready', 'is-360-dragging');
    hint?.remove?.();
    hint = null;
    restoreAccessibility();
    observer?.disconnect?.();
    setState('fallback', reason);
  };

  const loadFrame = index => {
    const wanted = wrapFrameIndex(index, frameUrls.length);
    if (loadedFrames.has(wanted)) return Promise.resolve(frameUrls[wanted]);
    if (pendingFrames.has(wanted)) return pendingFrames.get(wanted);
    const pending = Promise.resolve(imageLoader(frameUrls[wanted]))
      .then(() => {
        loadedFrames.add(wanted);
        pendingFrames.delete(wanted);
        return frameUrls[wanted];
      })
      .catch(error => {
        pendingFrames.delete(wanted);
        throw error;
      });
    pendingFrames.set(wanted, pending);
    return pending;
  };

  const displayFrame = async index => {
    if (failed || !image || !frameUrls.length) return;
    try {
      const url = await loadFrame(index);
      if (!failed && tracker?.frame === wrapFrameIndex(index, frameUrls.length)) {
        image.src = url;
        updateAccessibleFrame();
      }
    } catch {
      fallback('frame-load-failed');
    }
  };

  const preloadRemaining = () => {
    if (preloadStarted || failed || !frameUrls.length) return;
    preloadStarted = true;
    const queue = frameUrls.map((_, index) => index).filter(index => index !== 0);
    const worker = async () => {
      while (queue.length && !failed) {
        const index = queue.shift();
        try {
          await loadFrame(index);
        } catch {
          fallback('frame-load-failed');
        }
      }
    };
    void Promise.all([worker(), worker()]);
  };

  const makeReady = () => {
    if (failed || hint || !host) return;
    host.classList?.add('is-360-ready');
    setState('ready');
    enableAccessibility();
    hint = globalThis.document?.createElement?.('span') || null;
    if (hint) {
      hint.className = 'product-360-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = '↔ 360°';
      host.append?.(hint);
    }
  };

  const prepare = () => {
    if (preparePromise) return preparePromise;
    preparePromise = (async () => {
      if (!policy.allowed || !manifestUrl || !productId || !image || !poster || !fetchImpl) {
        fallback(policy.reason || 'not-configured');
        return false;
      }
      try {
        const response = await fetchImpl(manifestUrl, { credentials: 'same-origin', cache: 'force-cache' });
        if (!response?.ok) throw new Error('manifest-load-failed');
        const validation = validateManifest(await response.json(), productId);
        if (!validation.valid) {
          fallback(validation.reason);
          return false;
        }
        manifest = validation.manifest;
        frameUrls = frameUrlsFor(manifest, manifestUrl, baseURI);
        tracker = createDragTracker({ frameCount: frameUrls.length, pixelsPerFrame: options.pixelsPerFrame, initialFrame: 0 });
        await loadFrame(0);
        makeReady();
        if (pointerActive && lastPointer) tracker.start(lastPointer.x, lastPointer.y);
        return true;
      } catch {
        fallback('manifest-or-frame-unavailable');
        return false;
      }
    })();
    return preparePromise;
  };

  const onPointerDown = event => {
    if (failed || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointerActive = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    if (tracker) tracker.start(event.clientX, event.clientY);
    void prepare().then(ready => { if (ready && pointerActive) preloadRemaining(); });
  };

  const onPointerMove = event => {
    if (!pointerActive || failed) return;
    lastPointer = { x: event.clientX, y: event.clientY };
    if (!tracker) return;
    const movement = tracker.move(event.clientX, event.clientY);
    if (movement.axis !== 'horizontal') return;
    event.preventDefault?.();
    host.classList?.add('is-360-dragging');
    if (capturedPointerId === null) {
      try {
        host.setPointerCapture?.(event.pointerId);
        capturedPointerId = event.pointerId;
      } catch {
        capturedPointerId = null;
      }
    }
    if (movement.changed) void displayFrame(movement.frame);
  };

  const endPointer = () => {
    if (!pointerActive) return;
    pointerActive = false;
    tracker?.end();
    host.classList?.remove('is-360-dragging');
    if (capturedPointerId !== null) {
      try { host.releasePointerCapture?.(capturedPointerId); } catch { /* capture may already be lost */ }
    }
    capturedPointerId = null;
    lastPointer = null;
  };

  const onKeyDown = event => {
    const key = String(event?.key || '');
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key) || failed) return;
    event.preventDefault?.();
    void prepare().then(ready => {
      if (!ready || failed || !tracker || !frameUrls.length) return;
      preloadRemaining();
      const nextFrame = key === 'Home'
        ? 0
        : key === 'End'
          ? frameUrls.length - 1
          : tracker.frame + (key === 'ArrowRight' ? 1 : -1);
      tracker.setFrame(nextFrame);
      void displayFrame(tracker.frame);
    });
  };

  if (!host || !image || !manifestUrl || !policy.allowed) {
    fallback(policy.reason || 'not-configured');
  } else {
    image.draggable = false;
    setState('poster');
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endPointer);
    host.addEventListener('pointercancel', endPointer);
    host.addEventListener('keydown', onKeyDown);
    observer = observerFactory(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer?.disconnect?.();
        void prepare();
      }
    }, { rootMargin: '240px 0px', threshold: 0.01 });
    if (observer) observer.observe(host);
  }

  return {
    prepare,
    get frame() { return tracker?.frame ?? 0; },
    get status() { return host?.dataset?.viewer360 || 'fallback'; },
    destroy() {
      observer?.disconnect?.();
      host?.removeEventListener?.('pointerdown', onPointerDown);
      host?.removeEventListener?.('pointermove', onPointerMove);
      host?.removeEventListener?.('pointerup', endPointer);
      host?.removeEventListener?.('pointercancel', endPointer);
      host?.removeEventListener?.('keydown', onKeyDown);
      host?.classList?.remove('is-360-ready', 'is-360-dragging');
      hint?.remove?.();
      restoreAccessibility();
      if (image && poster) image.src = poster;
    },
  };
}

export function mountConfiguredProductViewers(root = document, options = {}) {
  return [...root.querySelectorAll('[data-product-360]')]
    .map(host => {
      const productId = String(host.getAttribute('data-product-360') || '');
      const manifestUrl = manifestForProduct(productId);
      return manifestUrl ? mountRealPhoto360(host, { ...options, productId, manifestUrl }) : null;
    })
    .filter(Boolean);
}
