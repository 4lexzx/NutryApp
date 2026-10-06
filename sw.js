/* Service worker: la app abre y funciona SIN internet (los datos están en IndexedDB).
   Solo las consultas a la IA necesitan red. */

const CACHE = 'nutri-gym-v7';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/util.js',
  './js/icons.js',
  './js/auth.js',
  './js/nutrition.js',
  './js/ai.js',
  './js/charts.js',
  './js/export.js',
  './js/editor.js',
  './js/views/today.js',
  './js/views/log.js',
  './js/views/history.js',
  './js/views/profile.js',
  './js/views/settings.js',
  './js/views/ia.js',
  './js/views/login.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // API de Gemini y externos: siempre red

  // Navegación (abrir la app): red primero, respaldo desde caché
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./', fresh.clone()).catch(() => null);
        cache.put('./index.html', fresh.clone()).catch(() => null);
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Resto (JS, CSS, iconos): caché primero y actualizar en segundo plano
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        cache.put(req, res.clone()).catch(() => null);
      }
      return res;
    }).catch(() => null);

    if (hit) { network && network.then(() => null).catch(() => null); return hit; }
    const res = await network;
    return res || Response.error();
  })());
});
