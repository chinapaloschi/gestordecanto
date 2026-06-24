import React, { useEffect, useState, useCallback } from 'react';

// Banner visible que avisa al alumno cuando hay una versión nueva de la app.
// Detecta el Service Worker "waiting" y, al tocar, lo activa, limpia cachés y recarga.
export function UpdateBanner() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [applying, setApplying] = useState(false);

  const checkWaiting = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update().catch(() => {})));
      const waiting = regs.find(r => r.waiting);
      if (waiting) setHasUpdate(true);
    } catch {}
  }, []);

  useEffect(() => {
    checkWaiting();

    let cleanupFns = [];
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (!reg) return;
        const onFound = () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) setHasUpdate(true);
          });
        };
        reg.addEventListener('updatefound', onFound);
        cleanupFns.push(() => reg.removeEventListener('updatefound', onFound));
      }).catch(() => {});
    }

    // Revisar cada vez que la app vuelve al primer plano (clave en iOS)
    const onVisible = () => { if (document.visibilityState === 'visible') checkWaiting(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', checkWaiting);
    cleanupFns.push(() => document.removeEventListener('visibilitychange', onVisible));
    cleanupFns.push(() => window.removeEventListener('pageshow', checkWaiting));

    return () => cleanupFns.forEach(fn => fn());
  }, [checkWaiting]);

  const applyUpdate = useCallback(async () => {
    setApplying(true);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        const reg = regs.find(r => r.waiting);
        if (reg?.waiting) {
          const reloadOnce = new Promise(resolve => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
          });
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          // No esperamos indefinidamente: si en 2.5s no cambió el controller, recargamos igual
          await Promise.race([reloadOnce, new Promise(r => setTimeout(r, 2500))]);
        }
      }
      // Limpiar cachés por las dudas y forzar recarga fresca
      if ('caches' in window) {
        try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } catch {}
      }
    } catch {}
    window.location.reload();
  }, []);

  if (!hasUpdate) return null;

  return (
    <div className="bg-gradient-to-r from-rose-600 to-pink-600 text-white px-4 py-2.5 flex items-center gap-3 shadow-md">
      <span className="text-lg flex-shrink-0">🎉</span>
      <p className="flex-1 text-xs font-semibold leading-tight">
        Hay una versión nueva de la app disponible.
      </p>
      <button onClick={applyUpdate} disabled={applying}
        className="flex-shrink-0 bg-white text-rose-700 font-black text-xs px-4 py-1.5 rounded-lg shadow-sm active:scale-95 transition disabled:opacity-60">
        {applying ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  );
}
