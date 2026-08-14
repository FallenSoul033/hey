(function (globalScope) {
  const PUBLIC_ROUTES = new Set(['login', 'register']);
  const APP_ROUTES = new Set([
    'dashboard',
    'orders',
    'clients',
    'production',
    'employees',
    'accruals',
    'warehouse',
    'analytics'
  ]);
  const MANAGER_ROUTES = new Set(['employees', 'accruals', 'analytics']);

  function parseHash(hash) {
    const route = String(hash || '')
      .replace(/^#\/?/, '')
      .split(/[?&]/, 1)[0]
      .trim()
      .toLowerCase();
    return route || 'dashboard';
  }

  function resolve(requestedRoute, access) {
    const requested = String(requestedRoute || '').toLowerCase();
    const authenticated = Boolean(access?.authenticated && access?.active);

    if (!authenticated) {
      return {
        screen: 'auth',
        route: PUBLIC_ROUTES.has(requested) ? requested : 'login'
      };
    }

    if (!access?.onboarded || access?.role === 'pending') {
      return { screen: 'onboarding', route: 'onboarding' };
    }

    const manager = access.role === 'owner' || access.role === 'admin';
    const route = APP_ROUTES.has(requested) && (!MANAGER_ROUTES.has(requested) || manager)
      ? requested
      : 'dashboard';
    return { screen: 'app', route };
  }

  globalScope.IceRoutes = Object.freeze({ parseHash, resolve });
})(typeof window === 'undefined' ? globalThis : window);
