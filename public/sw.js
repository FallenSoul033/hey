const CACHE_NAME = 'icefresh-v12-3d2-production';
const APP_SHELL = '/';
const PRECACHE = [
  '/',
  '/styles.css?v=12.0.0-3d2',
  '/admin.css?v=12.0.0-3d2',
  '/public-site.css?v=12.0.0-3d2',
  '/core.js?v=12.0.0-3d2',
  '/routes.js?v=12.0.0-3d2',
  '/app.js?v=12.0.0-3d2',
  '/config.js?v=12.0.0-3d2',
  '/assets/logo.webp',
  '/manifest.webmanifest?v=12.0.0-3d2',
  '/icon.svg',
  '/version.json'
];

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function navigationResponse(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(APP_SHELL)) || new Response(
      '<!doctype html><html lang="ru"><meta charset="utf-8"><title>IceFresh</title><body><h1>Нет подключения</h1><p>Проверьте интернет и повторите попытку.</p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function staticResponse(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

function isCacheableStatic(pathname) {
  return PRECACHE.includes(pathname) || pathname.startsWith('/assets/');
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }
  if (!isCacheableStatic(url.pathname)) return;
  event.respondWith(staticResponse(request));
});
