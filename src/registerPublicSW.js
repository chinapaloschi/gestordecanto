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
export async function registerPublicSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!isPublicPortal()) return;

  // Un mismo dispositivo puede haber visitado el panel admin en algún
  // momento (sw-admin.js) — ambos comparten scope '/', así que si no se
  // limpia, quedan las dos registraciones para siempre y el banner de
  // actualización puede terminar reaccionando a la que no corresponde.
  // OJO: nunca tocar firebase-messaging-sw.js acá — es el que procesa los
  // taps de las notificaciones push (incluidos los botones "Voy"/"No
  // puedo"). Antes esta limpieza lo desregistraba en cada visita al
  // portal, dejando las notificaciones sin nadie que las escuchara.
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter(r => {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '';
      return url && !url.endsWith('/sw-public.js') && !url.endsWith('/firebase-messaging-sw.js');
    }).map(r => r.unregister().catch(() => {})));
  } catch {}

  navigator.serviceWorker.register(SW_URL, { scope: '/' })
    .catch(err => console.error('SW público ERROR', err));
}
