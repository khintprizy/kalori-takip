// Uygulama dosyalarını önbelleğe alır; uygulama internet olmadan da anında açılır.
// Önbellekteki sürüm hemen gösterilir, arka planda yenisi indirilir (güncelleme bir sonraki açılışta görünür).
const CACHE = 'kalori-v2';
const ASSETS = [
  './', './index.html', './app.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;
  const key = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key, { ignoreSearch: true });
    const update = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(update.catch(() => {})); return hit; }
    return update.catch(() => Response.error());
  })());
});
