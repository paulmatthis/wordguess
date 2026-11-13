// Offline support: everything the game needs is stored on the phone the first
// time it is opened. Afterwards it loads from that copy, and quietly refreshes
// the copy in the background whenever there happens to be a connection.
const CACHE = 'wordguess-v6';
const FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'words.js', 'manifest.webmanifest',
  'dict/3.txt', 'dict/4.txt', 'dict/5.txt', 'dict/6.txt', 'dict/7.txt',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
});
