/* Poker Math Lab — Service Worker（离线缓存） */
const CACHE = 'pml-v7';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './engine.js',
  './manifest.json',
  './icons/icon.svg',
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

/* 代码类文件（HTML/JS/manifest）：网络优先，失败回退缓存 —— 保证更新即时生效 */
/* 图标等静态资源：缓存优先，离线秒开 */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isCode = /\/(index\.html|app\.js|engine\.js|manifest\.json)?$/.test(url.pathname)
    || url.pathname.endsWith('/');

  if (isCode) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
  } else {
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
  }
});
