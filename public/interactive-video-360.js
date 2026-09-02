const GESTURE_THRESHOLD = 6;
const DEFAULT_FRAME_COUNT = 24;
const DEFAULT_PIXELS_PER_TURN = 300;
const FULL_TURN = 360;
const MAX_ANGULAR_VELOCITY = 0.432;
const STOP_ANGULAR_VELOCITY = 0.009;
const INERTIA_FRICTION = 0.84;

export function wrapAngle(value) {
  const angle = Number(value);
  if (!Number.isFinite(angle)) return 0;
  return ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

export function wrapProgress(value) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return 0;
  return wrapAngle(progress * FULL_TURN) / FULL_TURN;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createAngleTimeMapper(angleTimeMap = []) {
  const anchors = Array.isArray(angleTimeMap)
    ? angleTimeMap.map(anchor => [Number(anchor?.[0]), Number(anchor?.[1])])
    : [];
  const valid = anchors.length >= 2
    && anchors[0][0] === 0
    && anchors.at(-1)[0] === FULL_TURN
    && anchors[0][1] >= 0
    && anchors.every((anchor, index) => Number.isFinite(anchor[0])
      && Number.isFinite(anchor[1])
      && (index === 0 || (anchor[0] > anchors[index - 1][0] && anchor[1] > anchors[index - 1][1])));

  return Object.freeze({
    valid,
    anchors: valid ? Object.freeze(anchors.map(anchor => Object.freeze(anchor))) : Object.freeze([]),
    maxTime: valid ? anchors.at(-1)[1] : 0,
    timeForAngle(value) {
      if (!valid) return 0;
      const numeric = Number(value);
      const angle = numeric === FULL_TURN ? FULL_TURN : wrapAngle(numeric);
      if (angle <= 0) return anchors[0][1];
      for (let index = 1; index < anchors.length; index += 1) {
        const [rightAngle, rightTime] = anchors[index];
        if (angle > rightAngle) continue;
        const [leftAngle, leftTime] = anchors[index - 1];
        const ratio = (angle - leftAngle) / (rightAngle - leftAngle);
        return leftTime + ((rightTime - leftTime) * ratio);
      }
      return anchors.at(-1)[1];
    },
  });
}

export function createVideoScrubTracker({
  frameCount = DEFAULT_FRAME_COUNT,
  pixelsPerTurn = DEFAULT_PIXELS_PER_TURN,
  initialProgress = 0,
  initialAngle,
  reducedMotion = false,
} = {}) {
  const count = Math.max(1, Math.trunc(Number(frameCount) || DEFAULT_FRAME_COUNT));
  const sensitivity = Math.max(120, Number(pixelsPerTurn) || DEFAULT_PIXELS_PER_TURN);
  let angle = wrapAngle(initialAngle ?? (Number(initialProgress) * FULL_TURN));
  let startAngle = angle;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;
  let active = false;
  let axis = 'pending';
  let movedHorizontally = false;

  const setAngle = value => {
    angle = wrapAngle(value);
    return angle;
  };

  const setProgress = value => setAngle(Number(value) * FULL_TURN) / FULL_TURN;

  return {
    start(x, y, time = 0) {
      startX = Number(x) || 0;
      startY = Number(y) || 0;
      lastX = startX;
      lastTime = Number(time) || 0;
      startAngle = angle;
      velocity = 0;
      active = true;
      axis = 'pending';
      movedHorizontally = false;
      return angle;
    },
    move(x, y, time = 0) {
      if (!active) return { axis: 'idle', angle, progress: angle / FULL_TURN, changed: false };
      const nextX = Number(x) || 0;
      const nextY = Number(y) || 0;
      const nextTime = Number(time) || lastTime;
      const deltaX = nextX - startX;
      const deltaY = nextY - startY;
      if (axis === 'pending') {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < GESTURE_THRESHOLD) {
          return { axis, angle, progress: angle / FULL_TURN, changed: false };
        }
        axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      }
      if (axis === 'vertical') {
        velocity = 0;
        return { axis, angle, progress: angle / FULL_TURN, changed: false };
      }
      const previous = angle;
      angle = wrapAngle(startAngle - ((deltaX / sensitivity) * FULL_TURN));
      const elapsed = Math.max(8, nextTime - lastTime);
      const instantaneous = clamp(
        (-(nextX - lastX) / sensitivity / elapsed) * FULL_TURN,
        -MAX_ANGULAR_VELOCITY,
        MAX_ANGULAR_VELOCITY,
      );
      velocity = (velocity * 0.35) + (instantaneous * 0.65);
      lastX = nextX;
      lastTime = nextTime;
      movedHorizontally = true;
      return { axis, angle, progress: angle / FULL_TURN, changed: Math.abs(angle - previous) > 0.0036 };
    },
    end() {
      active = false;
      axis = 'pending';
      if (reducedMotion || !movedHorizontally) velocity = 0;
      velocity = clamp(velocity, -MAX_ANGULAR_VELOCITY, MAX_ANGULAR_VELOCITY);
      return { angle, progress: angle / FULL_TURN, velocity };
    },
    advanceInertia(deltaMs = 16.667) {
      if (active || reducedMotion || Math.abs(velocity) < STOP_ANGULAR_VELOCITY) {
        velocity = 0;
        return { active: false, angle, progress: angle / FULL_TURN };
      }
      const elapsed = clamp(Number(deltaMs) || 16.667, 8, 34);
      angle = wrapAngle(angle + (velocity * elapsed));
      velocity *= Math.pow(INERTIA_FRICTION, elapsed / 16.667);
      if (Math.abs(velocity) < STOP_ANGULAR_VELOCITY) velocity = 0;
      return { active: velocity !== 0, angle, progress: angle / FULL_TURN };
    },
    setAngle,
    setProgress,
    setFrame(frame) {
      return setAngle(((Number(frame) || 0) / count) * FULL_TURN);
    },
    get frame() {
      return ((Math.round((angle / FULL_TURN) * count) % count) + count) % count;
    },
    get angle() { return angle; },
    get progress() { return angle / FULL_TURN; },
    get velocity() { return velocity; },
  };
}

function defaultObserverFactory(callback, options) {
  if (!('IntersectionObserver' in globalThis)) return null;
  return new IntersectionObserver(callback, options);
}

function defaultPolicy(connection = {}) {
  if (connection?.saveData) return { allowed: false, reason: 'data-saver' };
  if (['slow-2g', '2g'].includes(String(connection?.effectiveType || '').toLowerCase())) {
    return { allowed: false, reason: 'slow-network' };
  }
  return { allowed: true, reason: '' };
}

function safeSameOriginAsset(value, baseURI, extensionPattern) {
  try {
    const base = new URL(baseURI);
    const url = new URL(String(value || ''), base);
    return url.origin === base.origin && extensionPattern.test(url.pathname) ? url.href : '';
  } catch {
    return '';
  }
}

export function mountInteractiveVideo360(host, options = {}) {
  const productId = String(options.productId || host?.getAttribute?.('data-product-360') || '').trim();
  const config = options.config || null;
  const image = host?.querySelector?.('img');
  const connection = options.connection || globalThis.navigator?.connection || {};
  const evaluatePolicy = options.evaluatePolicy || defaultPolicy;
  const policy = evaluatePolicy(connection);
  const baseURI = options.baseURI || globalThis.document?.baseURI || 'http://localhost/';
  const posterUrl = safeSameOriginAsset(config?.poster, baseURI, /\.(?:avif|webp|png|jpe?g)$/i);
  const videoUrl = safeSameOriginAsset(config?.src, baseURI, /\.mp4$/i);
  const angleStep = clamp(Number(config?.angleStep) || 15, 1, FULL_TURN);
  const frameCount = Math.max(1, Math.round(FULL_TURN / angleStep));
  const fps = Math.max(1, Number(config?.fps) || DEFAULT_FRAME_COUNT);
  const angleTimeMapper = createAngleTimeMapper(config?.angleTimeMap);
  const reducedMotion = options.reducedMotion ?? Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const pixelsPerTurn = options.pixelsPerTurn || clamp((Number(host?.clientWidth) || 260) * 1.15, 240, 360);
  const tracker = createVideoScrubTracker({ frameCount, pixelsPerTurn, reducedMotion });
  const observerFactory = options.observerFactory || defaultObserverFactory;
  const videoFactory = options.videoFactory || (() => globalThis.document?.createElement?.('video'));
  const elementFactory = options.elementFactory || (tag => globalThis.document?.createElement?.(tag));
  const requestFrame = options.requestFrame || (callback => globalThis.requestAnimationFrame?.(callback) ?? setTimeout(() => callback(Date.now()), 16));
  const cancelFrame = options.cancelFrame || (handle => globalThis.cancelAnimationFrame?.(handle) ?? clearTimeout(handle));
  const now = options.now || (() => globalThis.performance?.now?.() ?? Date.now());
  const originalImage = image?.currentSrc || image?.src || '';
  let observer = null;
  let video = null;
  let hint = null;
  let preparePromise = null;
  let fallbackController = null;
  let pointerActive = false;
  let capturedPointerId = null;
  let seekFrame = null;
  let inertiaFrame = null;
  let inertiaTime = 0;
  let failed = false;
  let ready = false;
  let destroyed = false;
  let accessibilityEnabled = false;
  const originalAccessibilityAttributes = new Map([
    'tabindex', 'role', 'aria-label', 'aria-orientation', 'aria-valuemin',
    'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-keyshortcuts',
  ].map(name => [name, host?.getAttribute?.(name) ?? null]));

  const setState = (state, reason = '') => {
    if (!host?.dataset) return;
    host.dataset.viewer360 = state;
    host.dataset.viewer360Mode = 'video-poc';
    if (reason) host.dataset.viewer360Reason = reason;
    else delete host.dataset.viewer360Reason;
  };

  const updateAccessibility = () => {
    if (!accessibilityEnabled) return;
    const selectedAngle = Math.round(tracker.angle);
    host.setAttribute('aria-valuenow', String(selectedAngle));
    host.setAttribute('aria-valuetext', `Угол ${selectedAngle}°`);
  };

  const enableAccessibility = () => {
    if (!host?.setAttribute || accessibilityEnabled) return;
    const productLabel = String(image?.alt || 'Товар IceFresh').trim() || 'Товар IceFresh';
    host.setAttribute('tabindex', '0');
    host.setAttribute('role', 'slider');
    host.setAttribute('aria-label', `${productLabel} — плавный обзор 360°`);
    host.setAttribute('aria-orientation', 'horizontal');
    host.setAttribute('aria-valuemin', '0');
    host.setAttribute('aria-valuemax', String(FULL_TURN));
    host.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End');
    accessibilityEnabled = true;
    updateAccessibility();
  };

  const restoreAccessibility = () => {
    if (!accessibilityEnabled || !host) return;
    for (const [name, value] of originalAccessibilityAttributes) {
      if (value === null) host.removeAttribute?.(name);
      else host.setAttribute?.(name, value);
    }
    accessibilityEnabled = false;
  };

  const stopInertia = () => {
    if (inertiaFrame !== null) cancelFrame(inertiaFrame);
    inertiaFrame = null;
    inertiaTime = 0;
  };

  const scheduleSeek = () => {
    if (!ready || !video || seekFrame !== null) return;
    seekFrame = requestFrame(() => {
      seekFrame = null;
      if (!ready || !video || !Number.isFinite(video.duration) || video.duration <= 0) return;
      const lastSafeTime = Math.max(0, video.duration - (0.5 / fps));
      const targetTime = Math.min(lastSafeTime, angleTimeMapper.timeForAngle(tracker.angle));
      if (Math.abs((Number(video.currentTime) || 0) - targetTime) >= (0.25 / fps)) {
        video.currentTime = targetTime;
      }
      updateAccessibility();
    });
  };

  const startInertia = velocity => {
    if (reducedMotion || Math.abs(velocity) < STOP_ANGULAR_VELOCITY) return;
    stopInertia();
    const tick = timestamp => {
      const delta = inertiaTime ? timestamp - inertiaTime : 16.667;
      inertiaTime = timestamp;
      const result = tracker.advanceInertia(delta);
      scheduleSeek();
      if (result.active && !pointerActive && !destroyed) inertiaFrame = requestFrame(tick);
      else stopInertia();
    };
    inertiaFrame = requestFrame(tick);
  };

  const removeVideo = () => {
    if (seekFrame !== null) cancelFrame(seekFrame);
    seekFrame = null;
    stopInertia();
    video?.pause?.();
    video?.remove?.();
    video = null;
    ready = false;
    host?.classList?.remove('is-video-360-ready', 'is-360-ready', 'is-360-dragging');
    hint?.remove?.();
    hint = null;
  };

  const removeHostListeners = () => {
    host?.removeEventListener?.('pointerdown', onPointerDown);
    host?.removeEventListener?.('pointermove', onPointerMove);
    host?.removeEventListener?.('pointerup', endPointer);
    host?.removeEventListener?.('pointercancel', endPointer);
    host?.removeEventListener?.('keydown', onKeyDown);
  };

  const staticFallback = reason => {
    failed = true;
    pointerActive = false;
    observer?.disconnect?.();
    removeVideo();
    restoreAccessibility();
    setState('fallback', reason);
    return false;
  };

  const activateImageSequenceFallback = reason => {
    if (fallbackController || destroyed) return false;
    if (host?.dataset) host.dataset.viewer360VideoFallbackReason = reason;
    removeHostListeners();
    observer?.disconnect?.();
    removeVideo();
    restoreAccessibility();
    failed = true;
    fallbackController = options.fallbackFactory?.(reason) || null;
    if (!fallbackController) setState('fallback', reason);
    return false;
  };

  const makeReady = () => {
    if (ready || destroyed || failed || !video) return;
    ready = true;
    host?.classList?.add('is-360-ready', 'is-video-360-ready');
    setState('ready');
    if (host?.dataset) delete host.dataset.viewer360VideoFallbackReason;
    enableAccessibility();
    hint = elementFactory('span') || null;
    if (hint) {
      hint.className = 'product-360-hint';
      hint.setAttribute?.('aria-hidden', 'true');
      hint.textContent = '↔ 360° POC';
      host.append?.(hint);
    }
    scheduleSeek();
  };

  const prepare = () => {
    if (fallbackController) return fallbackController.prepare?.() || Promise.resolve(false);
    if (preparePromise) return preparePromise;
    preparePromise = (async () => {
      if (!policy.allowed) return staticFallback(policy.reason || 'policy');
      const configurationFailure = !host
        ? 'video-host-missing'
        : !image
          ? 'video-poster-element-missing'
          : !config?.enabled
            ? 'video-disabled'
            : config.productId !== productId
              ? 'video-product-mismatch'
              : !posterUrl
                ? 'video-poster-invalid'
                : !videoUrl
                  ? 'video-source-invalid'
                  : !angleTimeMapper.valid
                    ? `video-angle-map-invalid-${String(config?.angleTimeMap?.length ?? 'missing')}`
                    : '';
      if (configurationFailure) return activateImageSequenceFallback(configurationFailure);
      video = videoFactory();
      if (!video || !String(video.canPlayType?.(config.type || 'video/mp4') || '')) {
        return activateImageSequenceFallback('video-unsupported');
      }
      video.className = 'product-360-video';
      video.muted = true;
      video.playsInline = true;
      video.controls = false;
      video.autoplay = false;
      video.loop = false;
      video.disablePictureInPicture = true;
      video.disableRemotePlayback = true;
      video.preload = 'auto';
      video.poster = posterUrl;
      video.src = videoUrl;
      video.setAttribute?.('aria-hidden', 'true');
      video.setAttribute?.('tabindex', '-1');
      host.append?.(video);
      return await new Promise(resolve => {
        let settled = false;
        const finish = result => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        const onReady = () => {
          if (!Number.isFinite(Number(video?.duration)) || Number(video.duration) <= 0) return;
          if (angleTimeMapper.maxTime > Number(video.duration) + (0.5 / fps)) {
            finish(activateImageSequenceFallback('video-duration-mismatch'));
            return;
          }
          makeReady();
          finish(true);
        };
        const onError = () => finish(activateImageSequenceFallback('video-load-failed'));
        video.addEventListener?.('loadeddata', onReady, { once: true });
        video.addEventListener?.('error', onError, { once: true });
        video.load?.();
        if (video.readyState >= 2) queueMicrotask(onReady);
      });
    })();
    return preparePromise;
  };

  function onPointerDown(event) {
    if (failed || destroyed || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    stopInertia();
    pointerActive = true;
    tracker.start(event.clientX, event.clientY, event.timeStamp || now());
    void prepare();
  }

  function onPointerMove(event) {
    if (!pointerActive || failed || destroyed) return;
    const movement = tracker.move(event.clientX, event.clientY, event.timeStamp || now());
    if (movement.axis !== 'horizontal') return;
    event.preventDefault?.();
    host?.classList?.add('is-360-dragging');
    if (capturedPointerId === null) {
      try {
        host?.setPointerCapture?.(event.pointerId);
        capturedPointerId = event.pointerId;
      } catch {
        capturedPointerId = null;
      }
    }
    if (movement.changed) scheduleSeek();
  }

  function endPointer() {
    if (!pointerActive) return;
    pointerActive = false;
    const released = tracker.end();
    host?.classList?.remove('is-360-dragging');
    if (capturedPointerId !== null) {
      try { host?.releasePointerCapture?.(capturedPointerId); } catch { /* capture can already be gone */ }
    }
    capturedPointerId = null;
    if (ready) startInertia(released.velocity);
  }

  function onKeyDown(event) {
    const key = String(event?.key || '');
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key) || failed || destroyed) return;
    event.preventDefault?.();
    stopInertia();
    void prepare().then(isReady => {
      if (!isReady || !ready) return;
      const nextFrame = key === 'Home'
        ? 0
        : key === 'End'
          ? frameCount - 1
          : tracker.frame + (key === 'ArrowRight' ? 1 : -1);
      tracker.setFrame(nextFrame);
      scheduleSeek();
    });
  }

  if (image && posterUrl) image.src = posterUrl;
  if (!host || !image || !policy.allowed) {
    staticFallback(policy.reason || 'not-configured');
  } else {
    image.draggable = false;
    setState('poster');
    host.addEventListener?.('pointerdown', onPointerDown);
    host.addEventListener?.('pointermove', onPointerMove);
    host.addEventListener?.('pointerup', endPointer);
    host.addEventListener?.('pointercancel', endPointer);
    host.addEventListener?.('keydown', onKeyDown);
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
    get frame() { return fallbackController?.frame ?? tracker.frame; },
    get angle() { return tracker.angle; },
    get progress() { return tracker.progress; },
    get status() { return fallbackController?.status || host?.dataset?.viewer360 || 'fallback'; },
    destroy() {
      destroyed = true;
      observer?.disconnect?.();
      removeHostListeners();
      removeVideo();
      restoreAccessibility();
      fallbackController?.destroy?.();
      fallbackController = null;
      if (image && originalImage) image.src = originalImage;
    },
  };
}
