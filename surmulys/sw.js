// Šurmulys: оболочка — из кэша, события — сначала из сети (чтобы всегда была свежая сводка), без сети — из кэша.
const VERSION = 'surmulys-v1';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'scene.js', 'vendor/three.module.min.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('surmulys-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/data/events.json')) {
    e.respondWith(fetch(req).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put('data/events.json', r.clone())); return r; })
      .catch(() => caches.match('data/events.json')));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { caches.open(VERSION).then(c => c.put('index.html', r.clone())); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) caches.open(VERSION).then(c => c.put(req, r.clone())); return r; }).catch(() => hit);
    return hit || net;
  }));
});

// Периодическая сводка (Chrome/Android, установленное PWA)
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'daily-digest') return;
  e.waitUntil((async () => {
    try {
      const j = await (await fetch('data/events.json', { cache: 'no-store' })).json();
      const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius' });
      const t = f.format(new Date());
      const list = (j.events || []).filter(x => f.format(new Date(x.start)) <= t && f.format(new Date(x.end || x.start)) >= t);
      if (!list.length) return;
      await self.registration.showNotification(`Сегодня в Вильнюсе: ${list.length}`, {
        body: list.slice(0, 3).map(x => x.title).join('\n'), icon: 'icons/icon-192.png', tag: 'digest' });
    } catch {}
  })());
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.openWindow('./')); });
