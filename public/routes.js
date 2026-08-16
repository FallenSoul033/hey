(function (globalScope) {
  const PUBLIC_SITE_ROUTES = new Set(['home']);
  const AUTH_ROUTES = new Set(['login', 'register']);
  const APP_ROUTES = new Set([
    'dashboard',
    'calendar',
    'requests',
    'orders',
    'clients',
    'production',
    'products',
    'employees',
    'accruals',
    'warehouse',
    'analytics',
    'operations',
    'ai',
    'integrations'
  ]);
  const MANAGER_ROUTES = new Set(['products', 'employees', 'accruals', 'analytics', 'operations']);
  const OWNER_ROUTES = new Set(['integrations']);

  function parseHash(hash) {
    const route = String(hash || '')
      .replace(/^#\/?/, '')
      .split(/[?&]/, 1)[0]
      .trim()
      .toLowerCase();
    return route || 'home';
  }

  function parseLocation(pathname, hash) {
    const legacyHash = String(hash || '');
    if (/^#\//.test(legacyHash)) return parseHash(legacyHash);
    const cleanPath = String(pathname || '/')
      .split(/[?#]/, 1)[0]
      .replace(/\/{2,}/g, '/')
      .replace(/\/$/, '') || '/';
    if (cleanPath === '/' || cleanPath === '/index.html') return 'home';
    if (cleanPath === '/app') return 'dashboard';
    if (cleanPath.startsWith('/app/')) {
      const segment = cleanPath.slice(5).split('/', 1)[0].trim().toLowerCase();
      return segment || 'dashboard';
    }
    return 'home';
  }

  function pathFor(route) {
    const requested = String(route || '').trim().toLowerCase();
    if (requested === 'home') return '/';
    if (AUTH_ROUTES.has(requested) || APP_ROUTES.has(requested)) return `/app/${requested}`;
    return '/app/dashboard';
  }

  function resolve(requestedRoute, access) {
    const requested = String(requestedRoute || '').toLowerCase();
    const authenticated = Boolean(access?.authenticated && access?.active);

    if (PUBLIC_SITE_ROUTES.has(requested)) {
      return { screen: 'public', route: requested };
    }

    if (!authenticated) {
      return {
        screen: 'auth',
        route: AUTH_ROUTES.has(requested) ? requested : 'login'
      };
    }

    if (!access?.onboarded || access?.role === 'pending') {
      return { screen: 'onboarding', route: 'onboarding' };
    }

    const manager = access.role === 'owner' || access.role === 'admin';
    const owner = access.role === 'owner';
    const route = APP_ROUTES.has(requested)
      && (!MANAGER_ROUTES.has(requested) || manager)
      && (!OWNER_ROUTES.has(requested) || owner)
      ? requested
      : 'dashboard';
    return { screen: 'app', route };
  }

  globalScope.IceRoutes = Object.freeze({ parseHash, parseLocation, pathFor, resolve });
})(typeof window === 'undefined' ? globalThis : window);
