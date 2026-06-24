import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './scanner.css'

// Importamos la función original para registrar el SW público
import { registerPublicSW as registerSwPublic } from './registerPublicSW.js'

// Función para detectar si la URL actual corresponde al portal público
function isPublicUrl() {
  try {
    const hash = window.location.hash || '';
    // Definimos todas las rutas que consideramos públicas
    const publicRoutes = ['/checkin', '/muestras', '/portal', '/ticket'];
    return publicRoutes.some(route => hash.startsWith('#' + route));
  } catch {
    return false;
  }
}

// Función para registrar el Service Worker del Administrador
// Actualización AUTOMÁTICA y silenciosa: no muestra confirm(), aplica directo.
function registerAdminSW() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw-admin.js', { scope: '/' });

      // Aplica el SW en espera (skipWaiting) y recarga la página
      const applyUpdate = (registration) => {
        if (!registration.waiting) return;
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      };

      // Si al abrir ya hay una versión en espera → aplicar de inmediato (usuario recién abre la app)
      if (reg.waiting && navigator.serviceWorker.controller) {
        applyUpdate(reg);
        return;
      }

      // Escuchar nuevas instalaciones en segundo plano
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            applyUpdate(reg);
          }
        });
      });

      // ── CLAVE PARA iOS PWA ──────────────────────────────────────────────
      // Cuando el usuario vuelve a la app desde el background → forzar check de update
      const checkUpdate = () => reg.update().catch(() => {});

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkUpdate();
      });

      // pageshow: se dispara también cuando el browser restaura desde bfcache
      window.addEventListener('pageshow', (e) => {
        if (e.persisted) checkUpdate();
      });

      // focus: cobertura extra para cuando el usuario vuelve a la ventana/app
      window.addEventListener('focus', checkUpdate);

    } catch (err) {
      console.error('[Admin SW] Error:', err);
    }
  });
}

// --- LÓGICA PRINCIPAL ---
// Aquí decidimos cuál de los dos Service Workers registrar
if (isPublicUrl()) {
  registerSwPublic(); // Llama a la función importada para el público
} else {
  registerAdminSW(); // Llama a la nueva función para el admin
}

// El resto de tu archivo main.jsx no cambia
document.getElementById('root').className = 'min-h-dvh w-full max-w-[100vw] overflow-x-hidden';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)