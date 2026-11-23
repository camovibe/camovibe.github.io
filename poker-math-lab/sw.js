/* Poker Math Lab — Service Worker（离线缓存） */
const CACHE = 'pml-v4';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './engine.js',
  './manifest.json',
  './icons/01a208e0-8e1f-7ea0-91c0-0db5c496a136-icon-180.png',
  './icons/01a208e0-ec40-7e90-9995-aa75dbfdf4f8-icon-192.png',
  './icons/01a208e1-0de2-79e4-a590-d6d1db51697b-icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit ||
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
