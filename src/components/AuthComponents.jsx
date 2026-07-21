import React from 'react';
import { LoadingScreen } from './LoadingScreen.jsx';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, getRedirectResult } from 'firebase/auth';
import { registerNotifications } from '../notifications.js';
import { FCM_VAPID_KEY } from '../constants.js';
import { getFirestore, collection as fsCollection, doc, getDoc, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { firebaseConfig } from '../firebaseConfig.js';
import { auth, db } from '../firebaseConfig.js';
import { ASSET_VER } from '../constants.js';
const appId = firebaseConfig.appId;
export function UpdateButton({ className = "" }) {
  const [hasUpdate, setHasUpdate] = React.useState(false);
  const [checking, setChecking] = React.useState(false);

  const probe = React.useCallback(async () => {
    try {
      setChecking(true);
      const waiting = await (typeof getSWWaiting === 'function' ? getSWWaiting() : null);
      setHasUpdate(Boolean(waiting));
    } finally {
      setChecking(false);
    }
  }, []);

  const doUpdate = React.useCallback(async () => {
    try {
      const waiting = await (typeof getSWWaiting === 'function' ? getSWWaiting() : null);
      if (waiting && typeof applyWaitingSW === 'function') {
        await applyWaitingSW(waiting);
        return;
      }
      if (typeof refreshApp === 'function') {
        await refreshApp();
      } else {
        window.location.reload();
      }
    } catch (e) {
      try { window.location.reload(); } catch(_e) {}
    }
  }, []);

  React.useEffect(() => {
    probe();
    if (!('serviceWorker' in navigator)) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        reg.addEventListener('updatefound', () => setHasUpdate(true));
      } catch {}
    })();
    // Nota: la aplicación automática de la actualización (SKIP_WAITING + reload)
    // la maneja únicamente UpdateBanner — este botón solo detecta y aplica al click,
    // para no competir por el mismo service worker "waiting".
  }, [probe]);

  return (<button
      onClick={doUpdate}
      title={hasUpdate ? "Nueva versión disponible — Actualizar" : "Recargar"}
      aria-label="Actualizar"
      className={
        "inline-flex items-center justify-center w-8 h-8 rounded-full " +
        "border border-gray-300 bg-white text-gray-800 hover:bg-gray-100 relative " + className
      }
      disabled={checking}
    >
      <span className="text-sm sm:text-base leading-none">↻</span>
      {hasUpdate && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />}
    </button>);
}

// === Soft data refresh (sin recargar toda la PWA) ===
async function softRefreshApp() {
  try {
    if (window.__doSoftRefresh) {
      await window.__doSoftRefresh();
      return;
    }
  } catch (e) {
    console.warn("softRefreshApp error", e);
  }
  // Fallback si no hay manejador: recarga normal
  if (typeof refreshApp === "function") return refreshApp();
  try { window.location.reload(); } catch {}
}


// === Reporte de Ingresos (PDF con LOGO y formato agrupado) ===
async function exportIngresosCSV({ tituloMes, grupos, logoUrl }) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "A4" });

  const MARGIN = 48;
  const LINE_H = 18;
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();

  // Alinea montos a la derecha
  const drawAmountRight = (y, amount) => {
    const num = Number(amount) || 0;
    const txt = `$${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)}`;
    const tw = doc.getTextWidth(txt);
    doc.text(txt, PAGE_W - MARGIN - tw, y);
  };

  // --- LOGO ---
  let y = MARGIN;
  if (logoUrl) {
    try {
      const blob = await fetch(logoUrl, { cache: "no-store" }).then(r => r.blob());
      const base64 = await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.readAsDataURL(blob);
      });
      // 80x80 en la esquina superior izquierda
      doc.addImage(base64, "PNG", MARGIN, y - 20, 80, 80);
      y += 80; // dejamos espacio para el logo
    } catch (e) {
      try {
        // si falla fetch (por CORS), continuamos sin logo
        console.warn("No se pudo cargar el logo", e);
      } catch (_){}



// === Exportar Ingresos como CSV (datos en celdas reales) ===
function downloadBlobAs(filename, blob){
  try{
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  }catch(e){ console.error(e); }
}

function toCsvLine(arr){
  return arr.map(v => {
    const s = String(v ?? "");
    // escapar comillas dobles
    const esc = s.replace(/"/g, '""');
    return `"${esc}"`;
  }).join(",");
}

function exportIngresosCSV({ tituloMes, grupos }){
  const lines = [];
  if (tituloMes) lines.push(toCsvLine([tituloMes]));
  lines.push("");

  // Encabezados
  lines.push(toCsvLine(["Alumno","Concepto","Fecha","Monto","Total alumno?"]));

  let totalMensual = 0;
  for(const g of (grupos || [])){
    const alumno = g.alumno || "";
    const totalAlumno = Number(g.total) || 0;
    totalMensual += totalAlumno;

    // Fila total del alumno
    lines.push(toCsvLine([alumno, "TOTAL", "", totalAlumno.toFixed(2), "sí"]));

    // Detalle de pagos
    for(const it of (g.items || [])){
      lines.push(toCsvLine([alumno, it.concepto || "", it.fecha || "", Number(it.monto || 0).toFixed(2), ""]));
    }

    // línea en blanco entre alumnos
    lines.push("");
  }

  // Total mensual
  lines.push(toCsvLine(["TOTAL MENSUAL","","", totalMensual.toFixed(2), ""]));

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const safeName = (tituloMes || "mes").toLowerCase().replace(/\s+/g, "_");
  downloadBlobAs(`ingresos_${safeName}.csv`, blob);
}


// === NUEVO: Reporte de Ingresos (PDF tipo TEXTO, 1:1 con tu ejemplo) ===
async function exportIngresosPDF_Text({ tituloMes, grupos }) {
  try {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "A4" });
    const M = 56;
    const LINE = 18;
    let y = M;

    const formatMoneyPlain = (n) => {
      const x = Number(n || 0);
      return x.toFixed(2); // 102905.00
    };

    // Título
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Reporte de Ingresos", M, y);
    y += LINE * 1.5;

    // Mes
    doc.setFontSize(14);
    doc.text(String(tituloMes || ""), M, y);
    y += LINE;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);

    const addLine = (text) => {
      const pageH = doc.internal.pageSize.getHeight();
      if (y > pageH - M) { doc.addPage(); y = M; }
      doc.text(text, M, y);
      y += LINE;
    };

    let totalMensual = 0;

    for (const g of (grupos || [])) {
      const alumno = g.alumno || "";
      const totalAlumno = Number(g.total || 0);
      totalMensual += totalAlumno;

      // Encabezado alumno: "nombre: $xxxxx.00"
      doc.setFont("helvetica", "bold");
      addLine(`${alumno}: $${formatMoneyPlain(totalAlumno)}`);
      doc.setFont("helvetica", "normal");

      // Detalle
      for (const it of (g.items || [])) {
        const fecha = it.fecha || "";
        const concepto = it.concepto || "";
        const monto = formatMoneyPlain(Number(it.monto || 0));
        addLine(`- ${fecha} - ${concepto} $${monto}`);
      }
      y += 2; // aire
    }

    doc.setFont("helvetica", "bold");
    addLine(`TOTAL MENSUAL: $${formatMoneyPlain(totalMensual)}`);

    const nombre = (tituloMes || "mes").toLowerCase().replace(/\\s+/g, "_");
    doc.save(`reporte_${nombre}.pdf`);
  } catch (e) {
    console.error("exportIngresosPDF_Text error:", e);
    alert("No se pudo generar el PDF de ingresos (texto).");
  }
}



    }
  }

  // --- Título del mes (ej: "agosto de 2025")
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(tituloMes || "", MARGIN, y);
  y += LINE_H;

  // --- Contenido por alumno
  const needPage = () => (y > (PAGE_H - MARGIN - 60));
  const newPage = () => { doc.addPage(); y = MARGIN; };

  for (const g of (grupos || [])) {
    if (needPage()) newPage();

    // Encabezado del alumno + total del alumno
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${g.alumno || ""}:`, MARGIN, y);
    if (typeof g.total === "number") drawAmountRight(y, g.total);
    y += LINE_H;

    // Renglones de pagos (viñeta + (fecha))
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const it of (g.items || [])) {
      if (needPage()) newPage();
      const texto = `- ${it.concepto || ""} (${it.fecha || ""})`;
      doc.text(texto, MARGIN + 12, y);
      if (typeof it.monto === "number") drawAmountRight(y, it.monto);
      y += LINE_H;
    }

    y += 4; // respirito entre alumnos
  }

  // --- Separador + Total mensual
  if (needPage()) newPage();
  doc.setDrawColor(220);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += LINE_H;

  const totalMensual = (grupos || []).reduce((acc, g) => acc + (Number(g.total) || 0), 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL MENSUAL:", MARGIN, y);
  drawAmountRight(y, totalMensual);

  // Guardar
  const nombre = (tituloMes || "mes").toLowerCase().replace(/\s+/g, "_");
  doc.save(`ingresos_${nombre}.pdf`);
}





// === Compartir comprobante (helper global) ===



// === SW update helpers (iOS-friendly) ===
async function getSWWaiting() {
  if (!("serviceWorker" in navigator)) return null;
  const regs = await navigator.serviceWorker.getRegistrations();
  // Intentá refrescar metadata de todos
  await Promise.all(regs.map(r => r.update().catch(()=>{})));
  return regs.find(r => r.waiting)?.waiting || null;
}

async function applyWaitingSW(waiting) {
  if (!waiting) return false;
  // Cuando el nuevo SW tome control, recargamos una sola vez
  const waitForControl = new Promise((resolve) => {
    navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
  });
  try { waiting.postMessage({ type: "SKIP_WAITING" }); } catch {}
  await waitForControl;
  // Recarga suave (sesión persiste por Firebase Auth)
  window.location.reload();
  return true;
}

// === SW helper: actualizar PWA sin perder sesión ===
async function refreshApp() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update().catch(()=>{})));
      const reg = regs.find(r => r.waiting);
      if (reg && reg.waiting) {
        const waitForReload = new Promise(resolve => {
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once:true });
        });
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        await waitForReload;
        window.location.reload();
        return;
      }
    }
  } catch (e) {}
  // Fallback general
  window.location.reload();
}

// --- INICIALIZACIÓN DE FIREBASE ---



// ======== LOGIN CON GOOGLE + WHITELIST + PANTALLA DE INICIO ========
export const ALLOWED_EMAILS = new Set([
  'sandrupaloschi@gmail.com',
  'gracielamargheritis8@gmail.com',
  'javicampa010@gmail.com',
]);

const provider = new GoogleAuthProvider();
// Forzar selección de cuenta en cada login
provider.setCustomParameters({ prompt: 'select_account' });

// Detecta browser interno de WhatsApp/Instagram/Facebook
const isInAppBrowser = () => /WhatsApp|FBAN|FBAV|Instagram|FB_IAB/i.test(navigator.userAgent);

const loginWithGoogle = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    try { await signInWithRedirect(auth, provider); } catch (e) { console.error('Login failed:', e); }
  }
};
// ======== BLOQUE LOGIN (LIMPIO)
// Logo + sistema de botones
const LOGO_URL = `/nuevologo.gif?v=${ASSET_VER}`;

export const BrandLogo = ({ className = "h-10 sm:h-12 sm:h-16 w-auto mb-4" }) => (
  <img
    src={LOGO_URL}
    alt="Logo Estudio de Canto"
    className={`mx-auto ${className}`}
    onError={(e) => { e.currentTarget.style.display = 'none'; }}
  />
);
// ====== Portal del Alumno: sesión local (sin Google) ======
const PORTAL_SESSION_KEY = (typeof appId !== 'undefined' && appId ? `sp.portal.session.${appId}` : 'sp.portal.session');

function savePortalSession(session) { try { localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(session)); } catch {} }
function loadPortalSession() { try { return JSON.parse(localStorage.getItem(PORTAL_SESSION_KEY) || 'null'); } catch { return null; } }
function clearPortalSession() { try { localStorage.removeItem(PORTAL_SESSION_KEY); } catch {} }

function disablePullToRefreshIOS() {
  try {
    const el = document.scrollingElement || document.documentElement || document.body;
    const prev = el.style.overscrollBehaviorY;
    el.style.overscrollBehaviorY = 'contain';
    // return cleanup function
    return () => { try { el.style.overscrollBehaviorY = prev || ''; } catch (e) {} };
  } catch (e) {
    // fallback: no-op cleanup
    return () => {};
  }

}


// === Botones unificados (basados en primario rose) ===
const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg sm:rounded-xl font-semibold transition " +
  "focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none " +
  "shadow-sm hover:shadow";

const BTN_SIZES = { sm: "px-2 py-1.5 text-sm sm:text-base sm:text-sm sm:text-xs", md: "px-4 py-1 text-sm sm:text-base sm:text-sm sm:text-xs", lg: "px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base text-sm sm:text-base sm:text-sm sm:text-xs" };

const BTN_VARIANTS = {
  primary:  "bg-[var(--c-primary)] text-white hover:bg-[var(--c-primary-hover)] focus:ring-[var(--c-primary)]",
  secondary:"bg-white text-[var(--c-dark)] border border-[color:var(--c-muted-text)] hover:bg-[var(--c-muted)] focus:ring-[var(--c-muted-text)]",
  outline:  "bg-white text-[var(--c-muted-text)] border border-[color:var(--c-muted)] hover:bg-[var(--c-muted)] focus:ring-[var(--c-muted-text)]",
  subtle:   "bg-rose-50 text-[var(--c-primary)] hover:bg-rose-100 focus:ring-rose-200",
  dark:     "bg-[var(--c-dark)] text-white hover:bg-[var(--c-dark-hover)] focus:ring-[var(--c-dark)]",
  success:  "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500",
  danger:   "bg-[var(--c-danger)] text-white hover:bg-[var(--c-danger-hover)] focus:ring-[var(--c-danger)]",
  neo:     "bg-gray-100 text-gray-800 rounded-lg sm:rounded-xl shadow-inner hover:shadow-lg hover:bg-gray-200 active:shadow-md",

};

// --- Estilo neumórfico reutilizable ---
const NEO_BTN = "inline-flex items-center justify-center gap-2 rounded-lg sm:rounded-xl bg-gray-100 text-gray-800 shadow-inner hover:shadow-lg hover:bg-gray-200 active:shadow-md transition font-semibold";


export function Button({ children, variant="primary", size="md", className=" text-sm sm:text-base sm:text-sm", ...props }) {
  const classes = `${BTN_BASE} ${BTN_SIZES[size]} ${BTN_VARIANTS[variant]} ${className}`;
  return <button className={classes} {...props}>{children}</button>;
}

// --- Pantalla de Login ---
export const LoginScreen = () => {
  const inApp = isInAppBrowser();
  return (
  <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_#ffe4e6_10%,_#fff_60%)]">
    <div className="w-full max-w-sm">
      <div className="flex justify-center mb-3"><UpdateButton /></div>
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center border border-rose-50 space-y-4">
        <BrandLogo className="h-20 w-auto" />
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Estudio Sandra Paloschi</h1>
          <p className="text-gray-500 text-sm mt-1">Accedé con tu cuenta de Google autorizada</p>
        </div>

        {/* Advertencia si está en browser interno de WhatsApp/Instagram */}
        {inApp && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left">
            <p className="text-xs font-bold text-amber-800 mb-1">⚠️ Estás en el browser de WhatsApp</p>
            <p className="text-xs text-amber-700 mb-2">Para que el login funcione correctamente, abrí esta página en Safari o Chrome.</p>
            <button
              onClick={() => window.open(window.location.href, '_blank')}
              className="text-xs font-bold text-amber-800 underline"
            >
              Abrir en Safari →
            </button>
          </div>
        )}

        <Button
          onClick={loginWithGoogle}
          variant="primary"
          size="lg"
          className="w-full bg-rose-600 hover:bg-rose-700 text-white"
          aria-label="Continuar con Google"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 31.9 29.3 35 24 35c-7 0-12.7-5.7-12.7-12.7S17 9.7 24 9.7c3.1 0 5.9 1.1 8.1 3.1l5.7-5.7C34.5 3.5 29.6 1.7 24 1.7 11.8 1.7 1.7 11.8 1.7 24S11.8 46.3 24 46.3 46.3 36.2 46.3 24c0-1.1-.1-2.2-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.6l6.6 4.8C14.7 16 18.9 13.4 24 13.4c3.1 0 5.9 1.1 8.1 3.1l5.7-5.7C34.5 6.1 29.6 4.3 24 4.3c-7.9 0-14.5 4.6-17.7 11.3z"/>
            <path fill="#4CAF50" d="M24 43.7c5.2 0 10-2 13.6-5.2l-6.3-5.2c-2 1.4-4.7 2.2-7.4 2.2-5 0-9.2-3.3-10.7-7.7l-6.6 5.1C6 38.8 14.4 43.7 24 43.7z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.4-3.7 6.2-7 7.6l6.3 5.2c3.6-3.3 5.7-8.1 5.7-13.8 0-1.1-.1-2.3-.4-3.5z"/>
          </svg>
          Continuar con Google
        </Button>

        <p className="text-xs text-gray-400">
          ¿No podés entrar? Escribinos a{' '}
          <a href="mailto:sandrupaloschi@gmail.com" className="underline hover:text-gray-700">sandrupaloschi@gmail.com</a>
        </p>
      </div>
    </div>
  </div>
  );
};

// --- Acceso no autorizado ---
export const UnauthorizedScreen = ({ lastEmail }) => (
  <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_#ffe4e6_10%,_#fff_60%)]">
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 text-center border border-rose-50 space-y-4">
      <BrandLogo className="h-14 w-auto" />
      <div>
        <h1 className="font-bold text-gray-900 text-lg">Acceso no autorizado</h1>
        <p className="text-gray-500 text-sm mt-1">Esta app está restringida a cuentas autorizadas.</p>
      </div>

      {lastEmail && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-left">
          <p className="text-xs text-red-500 font-semibold uppercase tracking-wide">Cuenta usada</p>
          <p className="text-sm font-bold text-red-800 break-all">{lastEmail}</p>
          <p className="text-xs text-red-500 mt-1">Esta cuenta no tiene acceso. Usá la cuenta correcta de Google.</p>
        </div>
      )}

      {isInAppBrowser() && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left">
          <p className="text-xs font-bold text-amber-800">⚠️ Browser de WhatsApp detectado</p>
          <p className="text-xs text-amber-700 mt-0.5">El login con Google no funciona bien en el browser interno. Abrí la app en Safari.</p>
          <button onClick={() => window.open(window.location.href, '_blank')}
            className="text-xs font-bold text-amber-800 underline mt-1 block">
            Abrir en Safari →
          </button>
        </div>
      )}

      <Button
        onClick={async () => { try { await signOut(auth); } catch {} loginWithGoogle(); }}
        variant="secondary"
        size="md"
        className="w-full"
      >
        Cambiar de cuenta
      </Button>

      <p className="text-xs text-gray-400">
        ¿Es un error? Contactanos:{' '}
        <a href="mailto:sandrupaloschi@gmail.com" className="underline">sandrupaloschi@gmail.com</a>
      </p>
    </div>
  </div>
);
// ======== FIN BLOQUE LOGIN

export function AuthGate({ children }) {
  const [phase, setPhase] = React.useState('loading');
  const [lastEmail, setLastEmail] = React.useState('');

  React.useEffect(() => {
    // Procesar resultado de redirect (crítico en iOS Safari)
    getRedirectResult(auth)
      .then(r => { if (r?.user) console.log('[Auth] Redirect OK:', r.user.email); })
      .catch(e => console.warn('[Auth] getRedirectResult:', e.code));

    // Flag para evitar que el signOut del usuario no-autorizado
    // dispare onAuthStateChanged(null) y sobreescriba el estado 'denied'
    let intentionalSignOut = false;

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        if (intentionalSignOut) { intentionalSignOut = false; return; }
        setPhase('login');
        return;
      }

      // Ignorar usuarios anónimos (signInAnonymously del portal público en firebaseConfig)
      if (currentUser.isAnonymous || !currentUser.email) {
        setPhase('login');
        return;
      }

      const email = currentUser.email.toLowerCase().trim();
      setLastEmail(email);

      console.log('[Auth] Email:', email, '| Autorizado:', ALLOWED_EMAILS.has(email));

      if (!ALLOWED_EMAILS.has(email)) {
        intentionalSignOut = true;
        signOut(auth).catch(() => {});
        setPhase('denied');
        return;
      }

      // Usuario autorizado — la migración no puede bloquear el acceso
      try {
        await migrateSpecificUids(['1cI6RKndpjWRMCINq7vWbXpsYGz2','BoysynEGRrZbIrzvuksebwtKLsE3']);
      } catch (e) {
        console.warn('[Auth] migrateSpecificUids falló (no crítico):', e.message);
      }
      setPhase('ready');

      // Registrar token push para notificaciones de admin (silencioso)
      registerNotifications({
        app: auth.app,
        db,
        auth,
        appId,
        studentId: null, // admin — no es alumno
        vapidKey: FCM_VAPID_KEY,
        onToast: () => {},
        _adminOverridePath: `artifacts/${appId}/adminTokens`,
      }).catch(() => {});
    });

    return () => unsub();
  }, []);

  if (phase === 'loading') return <LoadingScreen />;
  if (phase === 'login') return <LoginScreen />;
  if (phase === 'denied') return <UnauthorizedScreen lastEmail={lastEmail} />;
  return <>{children}</>;
}
// ======== FIN BLOQUE LOGIN ========

/**
 * Migra datos desde artifacts/${appId}/users/{uid}/{collection}
 * a artifacts/${appId}/{collection} para una lista de UIDs.
 * Es idempotente (merge:true) y deja un flag por uid para no repetir.
 */
async function migrateSpecificUids(uids) {
  const destBase = `artifacts/${appId}`;
  const collectionsToMove = [
    'students',
    'scheduledClasses',
    'payments',
    'expenses',
    'extraIncomes',
    'blockedSlots',
    'expenseCategories'
  ];

  for (const uid of uids) {
    try {
      const flagRef = doc(db, `${destBase}/migrationFlags/${uid}`);
      const flagSnap = await getDoc(flagRef);
      if (flagSnap.exists() && flagSnap.data()?.migrated) {
        console.log('[Migración] UID ya migrado:', uid);
        continue;
      }

      for (const name of collectionsToMove) {
        const srcCol = fsCollection(db, `${destBase}/users/${uid}/${name}`);
        const snap = await getDocs(srcCol);
        if (snap.empty) continue;

        let batch = writeBatch(db);
        let ops = 0;
        for (const docSnap of snap.docs) {
          const destRef = doc(db, `${destBase}/${name}`, docSnap.id);
          batch.set(destRef, docSnap.data(), { merge: true });
          ops++;
          if (ops >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }
        if (ops > 0) await batch.commit();
        console.log(`[Migración] Copiados ${snap.size} documentos de ${name} para uid ${uid}`);
      }

      await setDoc(flagRef, { migrated: true, migratedAt: new Date(), uid,
  paidAt: null,}, { merge: true });
      console.log('[Migración] Finalizada para uid:', uid);
    } catch (err) {
      console.error('[Migración] Error con uid', uid, err);
    }
  }
}

// --- Helper Functions && Constants ---
function toCsvLine(arr) {
  return arr.map(v => {
    const s = String(v ?? "").replace(/"/g, '""');
    return `"${s}"`;
  }).join(";");
}

function downloadBlobAs(filename, blob) {
  try {
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const finalBlob = new Blob([bom, blob], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(finalBlob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { console.error("Error descargando:", e); }
}

// ======= Input de dinero con formateo AR =======

// Helper function to get the dates for the current week (Monday to Saturday)
const getWeekRange = (startOfWeek) => {
    const dates = [];
    let currentDay = new Date(startOfWeek);
    // Ensure the start of the week is Monday
    const dayOfWeek = currentDay.getDay(); // 0 for Sunday, 1 for Monday
    const diff = currentDay.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // If Sunday (0), go back 6 days to Monday. Otherwise, go back dayOfWeek - 1 days.
    currentDay.setDate(diff);
    currentDay.setHours(0, 0, 0, 0); // Normalize to start of the day

    for (let i = 0; i < 6; i++) { // Only 6 days (Monday-Saturday)
        const date = new Date(currentDay);
        date.setDate(currentDay.getDate() + i);
        dates.push(date);
    }
    return dates;
};


// Helper function to get day name from a date string




// --- Toast básico reutilizable ---
