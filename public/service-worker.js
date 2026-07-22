/* PUBLIC SERVICE WORKER (único) */
const SW_VERSION = '1784735000356';
const SHELL = [
  '/', '/index.html', '/offline.html',
  '/icons/app-192.png', '/icons/app-512.png',
  '/icons/app-maskable-192.png', '/icons/app-maskable-512.png',
  '/manifest-public.webmanifest'
];
const CACHE_SHELL = 'shell-' + SW_VERSION;
const CACHE_RT = 'rt-' + SW_VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_SHELL);
    await c.addAll(SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (!k.endsWith(SW_VERSION) ? caches.delete(k) : null)));
    self.clients.claim();
  })());
});

async function nav(req) {
  try {
    const fresh = await fetch(req);
    const c = await caches.open(CACHE_SHELL);
    c.put('/index.html', fresh.clone());
    return fresh;
  } catch {
    const c = await caches.open(CACHE_SHELL);
    return (await c.match('/index.html')) || (await c.match('/offline.html')) || Response.error();
  }
}

async function asset(req) {
  const c = await caches.open(CACHE_RT);
  const cached = await c.match(req);
  const updating = fetch(req).then(res => {
    if (res && res.ok) c.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await updating) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin) return;
  const isNav = e.request.mode === 'navigate' || e.request.destination === 'document';
  if (isNav) { e.respondWith(nav(e.request)); return; }
  if (/\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/.test(u.pathname)) {
    e.respondWith(asset(e.request));
  }
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
