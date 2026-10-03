import React, { Suspense, lazy } from 'react';
import { signOut } from 'firebase/auth';
import { db, auth, firebaseConfig } from './firebaseConfig.js';
import { ROUTES } from './constants.js';
import { AuthGate } from './components/AuthComponents.jsx';
import { PrivacyProvider } from './context/PrivacyContext.jsx';

// Cada ruta es su propia pantalla (admin, portal de alumno, inscripción,
// lencería, finanzas, escaneo...) y antes se importaban todas de una, así
// que un alumno entrando solo a marcar asistencia descargaba igual el panel
// completo de admin, jsPDF, html2canvas, etc. Con lazy() cada una se baja
// recién cuando hace falta.
const PublicLenceriaCatalogo = lazy(() => import('./PublicLenceriaCatalogo'));
const MainApp = lazy(() => import('./components/MainApp.jsx').then(m => ({ default: m.MainApp })));
const PublicCheckInViewPIN = lazy(() => import('./components/PublicCheckInViewPIN.jsx').then(m => ({ default: m.PublicCheckInViewPIN })));
const PublicTicketView = lazy(() => import('./components/PublicTicketView.jsx').then(m => ({ default: m.PublicTicketView })));
const ScanPage = lazy(() => import('./components/ScanPage.jsx').then(m => ({ default: m.ScanPage })));
const LenceriaStockModal = lazy(() => import('./components/LenceriaStockModal.jsx').then(m => ({ default: m.LenceriaStockModal })));
const InscripcionPage = lazy(() => import('./components/InscripcionPage.jsx').then(m => ({ default: m.InscripcionPage })));
const FinanzasStandalone = lazy(() => import('./components/FinanzasStandalone.jsx').then(m => ({ default: m.FinanzasStandalone })));

const appId = firebaseConfig.appId;

function RouteLoading() {
  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-[#FBF6F3]">
      <div className="w-8 h-8 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
    </div>
  );
}

function LenceriaStandalone({ db, appId, showMessage, handleSignOut }) {
  return (
    <>
      <div className="fixed top-2 right-2 z-[100]">
        <button
          onClick={handleSignOut}
          className="px-3 py-1.5 text-sm font-semibold bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition"
        >
          Salir
        </button>
      </div>
      <LenceriaStockModal
        isOpen={true}
        onClose={handleSignOut}
        db={db}
        appId={appId}
        showMessage={showMessage}
        isStandalone={true}
        size="full"
      />
    </>
  );
}

export default function App() {
  const [hash, setHash] = React.useState(window.location.hash);

  React.useEffect(() => {
    const hostname = window.location.hostname;
    const currentHash = window.location.hash;
    if (hostname === 'grece-lingerie.web.app') {
      if (currentHash === '' || currentHash === '#/') {
        window.location.hash = ROUTES.CATALOGO;
      }
    }
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const h = (hash || '').toLowerCase();

  // /#/portal quedó sin ningún link visible en la app y duplicaba toda la
  // superficie de /#/checkin — redirigimos en vez de servir esa pantalla.
  // /#/muestras (PublicEventsPortal) tenía el mismo problema -- además,
  // estaba rota (orderBy sin importar, LOGO_URL sin definir: crasheaba
  // apenas alguien la abría) y nada en la app la enlazaba. Ver las
  // muestras/entradas de uno ya vive en el portal del alumno.
  React.useEffect(() => {
    if (h.startsWith(ROUTES.PORTAL) || h.startsWith(ROUTES.MUESTRAS)) {
      window.location.hash = `${ROUTES.CHECKIN}?a=${appId}`;
    }
  }, [h]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      window.location.hash = '';
    } catch (e) {
      console.error('Error al cerrar sesión:', e);
    }
  };

  const showMessage = (text, type = 'info') => {
    alert(`[${type.toUpperCase()}] ${text}`);
  };

  let content;
  if (h.startsWith(ROUTES.INSCRIPCION)) {
    content = <InscripcionPage db={db} appId={appId} />;
  } else if (h.startsWith(ROUTES.CATALOGO)) {
    content = <PublicLenceriaCatalogo db={db} appId={appId} />;
  } else if (h.startsWith(ROUTES.MUESTRAS) || h.startsWith(ROUTES.PORTAL)) {
    content = null; // redirigiendo a /#/checkin (ver useEffect arriba)
  } else if (h.startsWith(ROUTES.CHECKIN)) {
    content = <PublicCheckInViewPIN db={db} />;
  } else if (h.startsWith(ROUTES.TICKET)) {
    content = <PublicTicketView db={db} />;
  } else if (h.startsWith(ROUTES.SCAN)) {
    content = <ScanPage db={db} appId={appId} />;
  } else if (h.startsWith(ROUTES.LENCERIA)) {
    content = (
      <AuthGate>
        <LenceriaStandalone db={db} appId={appId} showMessage={showMessage} handleSignOut={handleSignOut} />
      </AuthGate>
    );
  } else if (h.startsWith(ROUTES.FINANZAS)) {
    content = (
      <AuthGate>
        <PrivacyProvider>
          <FinanzasStandalone appId={appId} />
        </PrivacyProvider>
      </AuthGate>
    );
  } else {
    content = (
      <AuthGate>
        <PrivacyProvider>
          <MainApp />
        </PrivacyProvider>
      </AuthGate>
    );
  }

  return <Suspense fallback={<RouteLoading />}>{content}</Suspense>;
}
