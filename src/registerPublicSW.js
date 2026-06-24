// src/registerPublicSW.js
const PUBLIC_APP_ID = '1:786390581865:web:ed47531cf7415ae5ca18f8';
const SW_URL = '/sw-public.js';

export function isPublicPortal() {
  try {
    const hash = window.location.hash || '';
    if (!hash.includes('/checkin')) return false;
    const q = new URLSearchParams(hash.split('?')[1] || '');
    return q.get('a') === PUBLIC_APP_ID;
  } catch {
    return false;
  }
}

export function registerPublicSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!isPublicPortal()) return;

  navigator.serviceWorker.register(SW_URL, { scope: '/' })
    .then((reg) => {
      // Si ya hay un waiting al cargar (p. ej., la actualización llegó en segundo plano)
      maybePrompt(reg);

      // Escuchar nuevas instalaciones
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          // 'installed' + controller => es una actualización (no primera instalación)
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            // En Chrome la instancia 'installed' pasa a 'waiting' si no hacemos skipWaiting
            maybePrompt(reg);
          }
        });
      });
    })
    .catch(err => console.error('SW público ERROR', err));
}

// Actualización AUTOMÁTICA y silenciosa: no se le pregunta nada al alumno/visitante.
let _applied = false;
function maybePrompt(reg) {
  if (_applied) return;
  // Aplicar solo si hay una versión en espera de activarse
  if (!reg.waiting) return;
  if (!navigator.serviceWorker.controller) return; // primera instalación: no molestar

  _applied = true;

  // Recargar una sola vez cuando el nuevo SW tome control
  const onControllerChange = () => {
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  // Activamos directamente la versión nueva, sin confirm()
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}
