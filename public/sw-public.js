// sw-public.js — PÚBLICO (versión: 2026-07-23T01-50-57-205Z_jwuklk)

self.addEventListener('install', (event) => {
  // NO hacemos skipWaiting aquí (evita bucles).
  // Solo se activará cuando la página envíe el mensaje 'SKIP_WAITING' tras aceptar el banner.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Activación inmediata SOLO si la app lo pide (cuando usuario confirma)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
