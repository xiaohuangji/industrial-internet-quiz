const CACHE_PREFIX = 'iiq:' + self.registration.scope + ':';
const CACHE = CACHE_PREFIX + '9514baea4fe8687b163f';
const FILES = ["./app.js","./assets/barcode-a.png","./assets/barcode-b.png","./assets/barcode-c.png","./assets/barcode-country.png","./assets/barcode-d.png","./data/questions.json","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png","./index.html","./manifest.json","./model.js","./style.css","./views.js"];
const base = new URL(self.registration.scope);
const key = path => new URL(path, base).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(path => new Request(key(path), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const versions = await caches.keys();
    await Promise.all(versions.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  const file = req.mode === 'navigate' ? './index.html' : './' + url.pathname.slice(base.pathname.length);
  if (!FILES.includes(file)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(key(file))) ?? fetch(req);
  })());
});
