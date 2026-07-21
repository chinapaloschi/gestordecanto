// Service Worker para el Panel de Administración (sw-admin.js)
const SW_VERSION = '1784645846837';
const CACHE_SHELL = 'admin-shell-' + SW_VERSION;
const CACHE_RUNTIME = 'admin-runtime-' + SW_VERSION;

// Archivos esenciales para modo offline
const SHELL_FILES = [
  '/',
  '/index.html',
  '/offline.html',
  '/nuevologo.gif',
  '/manifest-admin.webmanifest',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  // NO hacemos skipWaiting automático — esperamos que el usuario confirme la actualización
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then((cache) => cache.addAll(SHELL_FILES.filter(f => {
        // Ignorar archivos opcionales que puedan no existir
        return true;
      })).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map(k => {
        // Borra cachés viejos que no coincidan con la versión actual
        if (k.startsWith('admin-') && !k.endsWith(SW_VERSION)) {
          return caches.delete(k);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // ▼▼▼ CORRECCIÓN IMPORTANTE ▼▼▼
  // Ignorar peticiones que no sean GET (como las de Firestore, que usan POST)
  if (request.method !== 'GET') {
    return;
  }
  // ▲▲▲ FIN DE LA CORRECCIÓN ▲▲▲

  // Para navegación (abrir la página)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/offline.html')) // Si falla la red, muestra la página offline
    );
    return;
  }

  // Para otros recursos (JS, CSS, imágenes): Estrategia Stale-While-Revalidate
  // Ojo: Firestore y otras APIs externas también pueden caer aquí si son GET.
  // Si ves problemas con datos desactualizados, podríamos necesitar filtrar también por URL.
  event.respondWith(
    caches.open(CACHE_RUNTIME).then(cache => {
      return cache.match(request).then(response => {
        const fetchPromise = fetch(request).then(networkResponse => {
          // Solo guardamos en caché si la respuesta es válida y es una petición http/https básica
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
             cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(err => {
           // Si falla el fetch y no había caché, aquí se podría manejar el error
           console.warn('Fallo fetch runtime para', request.url, err);
           // Si ya había respuesta en caché, la devolverá el 'return response || ...' de abajo
           throw err;
        });

        // Devuelve el caché si existe mientras se actualiza en segundo plano, si no, espera a la red
        return response || fetchPromise;
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});