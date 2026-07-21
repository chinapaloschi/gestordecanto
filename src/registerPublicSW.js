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

// Solo registra el service worker público. La detección y aplicación de
// actualizaciones (SKIP_WAITING + reload) la maneja exclusivamente
// <UpdateBanner/> — tener dos consumidores del mismo "waiting" worker
// causaba que el banner se quedara pegado mostrando "nueva versión disponible"
// sin aplicarla nunca.
export function registerPublicSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!isPublicPortal()) return;

  navigator.serviceWorker.register(SW_URL, { scope: '/' })
    .catch(err => console.error('SW público ERROR', err));
}
