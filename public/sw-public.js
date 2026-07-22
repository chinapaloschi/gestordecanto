// sw-public.js — PÚBLICO (versión: 2026-07-22T13-06-42-256Z_6ijwz0)

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
