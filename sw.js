// Борт: кэширует оболочку приложения, чтобы оно открывалось мгновенно.
// Данные о самолётах и тайлы карты всегда берутся из сети.
const VERSION = 'bort-v1';
const SHELL = [
  './', './index.html', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const shell = url.origin === self.location.origin || url.hostname === 'cdnjs.cloudflare.com'
    || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!shell) return; // API и карта — напрямую в сеть

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      caches.open(VERSION).then(c => c.put('./index.html', res.clone()));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) caches.open(VERSION).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
