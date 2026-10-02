/*
 * Service worker de AgroGarantías (portal del productor / Escáner de Bovinos).
 * Objetivo: poder abrir y usar el escáner sin señal después de haberlo abierto una vez con
 * conexión. No cachea respuestas de la API (datos sensibles y siempre en línea).
 *  - /_next/static, /ort, /models: cache-first (archivos versionados o verificados por hash).
 *  - Navegación a /escaner y /productor: red primero; sin red, la última copia guardada.
 */
const STATIC_CACHE = 'agro-static-v1';
const PAGES_CACHE = 'agro-pages-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('agro-') && k !== STATIC_CACHE && k !== PAGES_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  url.pathname.startsWith('/ort/') ||
  url.pathname.startsWith('/models/');

const isOfflinePage = (url) =>
  url.pathname.startsWith('/escaner/') || url.pathname.startsWith('/productor');

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === 'navigate' && isOfflinePage(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? Response.error()),
    );
  }
});
