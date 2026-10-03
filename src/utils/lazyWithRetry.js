import { lazy } from 'react';

// Cada deploy le cambia el nombre (con hash de contenido) a los chunks de
// Vite. Una pestaña que ya estaba abierta desde antes de un deploy sigue
// teniendo el bundle principal viejo en memoria, que todavía apunta a esos
// nombres de archivo que ya no existen en el servidor -- al intentar cargar
// un chunk lazy (entrar a una ruta nueva, abrir un modal lazy como Backup)
// el pedido cae en el catch-all de Firebase Hosting, que devuelve
// index.html en vez del JS ("Failed to fetch dynamically imported module" /
// MIME type text/html). La única solución real es recargar la página para
// traer el bundle principal actualizado -- este helper lo hace una sola vez
// por sesión (sessionStorage evita un loop de recargas si el problema fuera
// otro).
const RELOAD_FLAG = 'sp-chunk-reload-attempted';

export function lazyWithRetry(factory) {
  return lazy(async () => {
    try {
      const mod = await factory();
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch {}
      return mod;
    } catch (error) {
      let alreadyReloaded = false;
      try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch {}
      if (!alreadyReloaded) {
        try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch {}
        window.location.reload();
        // Frena el render hasta que la recarga ocurra de verdad.
        return new Promise(() => {});
      }
      throw error;
    }
  });
}
