export function evaluatePremium3DPolicy(environment) {
  if (environment.reducedMotion) return { allowed: false, reason: 'reduced-motion' };
  if (environment.saveData) return { allowed: false, reason: 'data-saver' };
  if (/2g/.test(environment.effectiveType || '')) return { allowed: false, reason: 'slow-network' };
  if ((environment.deviceMemory || 4) <= 2 || (environment.hardwareConcurrency || 4) <= 2) {
    return { allowed: false, reason: 'low-power' };
  }
  if ((environment.viewportWidth || 1024) < 360) return { allowed: false, reason: 'narrow-mobile' };
  return { allowed: true, reason: null };
}

export function readPremium3DEnvironment() {
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: Boolean(navigator.connection?.saveData),
    effectiveType: navigator.connection?.effectiveType || '',
    deviceMemory: navigator.deviceMemory || 4,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    viewportWidth: window.innerWidth,
  };
}

export function probeWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { alpha: true, failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function bootstrapPremium3D(host, options = {}) {
  const environment = options.environment || readPremium3DEnvironment();
  const policy = evaluatePremium3DPolicy(environment);
  let observer = null;
  let destroyed = false;
  let scene = null;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const finish = (status, reason = null) => {
    host.dataset.enhancement = status;
    if (reason) host.dataset.fallbackReason = reason;
    else delete host.dataset.fallbackReason;
    resolveReady({ status, reason, scene });
  };
  const fallback = reason => {
    observer?.disconnect();
    finish('fallback', reason);
  };

  if (!policy.allowed) {
    fallback(policy.reason);
    return { ready, destroy() {} };
  }
  const probe = options.probe || probeWebGL;
  let capable = false;
  try { capable = probe(); } catch { capable = false; }
  if (!capable) {
    fallback('webgl-unavailable');
    return { ready, destroy() {} };
  }

  const moduleLoader = options.moduleLoader || (() => import('/premium-3d.js'));
  const load = async () => {
    if (destroyed || host.dataset.enhancement === 'loading' || host.dataset.enhancement === 'active') return;
    observer?.disconnect();
    host.dataset.enhancement = 'loading';
    try {
      const rendererModule = await moduleLoader();
      if (destroyed) return;
      scene = rendererModule.mountPremiumIceScene(host, {
        mobile: environment.viewportWidth < 768,
        variant: host.dataset['icefresh-3dVariant'] || 'hero',
      });
      finish('active');
    } catch {
      fallback('module-or-context-failed');
    }
  };

  const observerFactory = options.observerFactory || (callback => new IntersectionObserver(callback, { rootMargin: '120px 0px', threshold: 0.01 }));
  const canObserve = Boolean(options.observerFactory) || (typeof window !== 'undefined' && 'IntersectionObserver' in window);
  if (canObserve) {
    observer = observerFactory(entries => {
      if (entries.some(entry => entry.isIntersecting)) load();
    });
    observer.observe(host);
  } else {
    load();
  }

  return {
    ready,
    destroy() {
      destroyed = true;
      observer?.disconnect();
      scene?.destroy?.();
    },
  };
}
