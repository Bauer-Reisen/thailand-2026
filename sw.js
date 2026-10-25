// Offline-Cache. Bei Änderungen an App-Dateien VERSION erhöhen.
const VERSION = 'th26-v21';
const SHELL = ['./', 'index.html', 'styles.css', 'shared.js', 'app.js', 'data/familie.enc.json', 'data/gaeste.enc.json', 'kids-map.js', 'bg.svg', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache: 'reload' – sonst kann die neue Fassung alte Dateien aus dem Browser-Zwischenspeicher übernehmen
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => !k.startsWith('th26-img') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Wikipedia-Bilder einmal laden, dann offline aus dem Cache
  if (url.hostname === 'upload.wikimedia.org') {
    e.respondWith(caches.open('th26-img').then(c => c.match(e.request).then(hit => hit ||
      fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }))));
    return;
  }
  // Schrift von Google Fonts einmal laden, dann offline
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('th26-img').then(c => c.match(e.request).then(hit => hit ||
      fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  // Tagebuch-Fotos ändern sich nie: Cache zuerst
  if (url.pathname.includes('/data/fotos/')) {
    e.respondWith(caches.open('th26-img').then(c => c.match(e.request).then(hit => hit ||
      fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  // Reisedaten und Seite: erst Netz (damit Änderungen ankommen), sonst Cache
  if (url.pathname.endsWith('.enc.json') || e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  // Rest: Cache zuerst, im Hintergrund auffrischen
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});
