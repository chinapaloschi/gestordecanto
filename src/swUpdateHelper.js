// swUpdateHelper.js — utilidades para actualizar la PWA sin perder sesión
// Importar y usar:  import { setupSWUpdatePrompt, refreshApp } from './swUpdateHelper.js';

export async function getSWWaiting() {
  if (!('serviceWorker' in navigator)) return null;
  const regs = await navigator.serviceWorker.getRegistrations();
  // Forzar check de update
  await Promise.all(regs.map(r => r.update().catch(()=>{})));
  for (const r of regs) {
    if (r.waiting) return r.waiting;
  }
  return null;
}

export async function applyWaitingSW(waiting) {
  if (!waiting) return false;
  const once = new Promise(res => {
    navigator.serviceWorker.addEventListener('controllerchange', res, { once: true });
  });
  try { waiting.postMessage({ type: 'SKIP_WAITING' }); } catch {}
  await once;
  return true;
}

export async function refreshApp() {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update()?.catch(()=>{});
      const waiting = reg?.waiting;
      if (waiting) {
        await applyWaitingSW(waiting);
        window.location.reload();
        return;
      }
    }
  } catch {}
  window.location.reload();
}

// Botoncito/badge opcional: detecta updates al volver a primer plano (iOS)
export function setupSWUpdatePrompt({ onUpdate } = {}) {
  const check = async () => {
    const w = await getSWWaiting();
    if (w && typeof onUpdate === 'function') onUpdate(w);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('pageshow', () => check());
  // Primera comprobación
  check();
  return () => {
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('pageshow', check);
  };
}
