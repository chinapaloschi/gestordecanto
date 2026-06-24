import React from 'react';
import { signOut } from 'firebase/auth';
import { db, auth, firebaseConfig } from './firebaseConfig.js';
import { ROUTES } from './constants.js';
import PublicLenceriaCatalogo from './PublicLenceriaCatalogo';
import { AuthGate } from './components/AuthComponents.jsx';
import { MainApp } from './components/MainApp.jsx';
import { PortalAlumno } from './components/PortalAlumnoComponents.jsx';
import { PublicCheckInViewPIN } from './components/PublicCheckInViewPIN.jsx';
import { PublicEventsPortal } from './components/PublicEventsPortal.jsx';
import { PublicTicketView } from './components/PublicTicketView.jsx';
import { LenceriaStockModal } from './components/LenceriaStockModal.jsx';
import { InscripcionPage } from './components/InscripcionPage.jsx';
import { PrivacyProvider } from './context/PrivacyContext.jsx';
import { FinanzasStandalone } from './components/FinanzasStandalone.jsx';

const appId = firebaseConfig.appId;

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

  if (h.startsWith(ROUTES.INSCRIPCION)) return <InscripcionPage db={db} appId={appId} />;
  if (h.startsWith(ROUTES.CATALOGO)) return <PublicLenceriaCatalogo db={db} appId={appId} />;
  if (h.startsWith(ROUTES.MUESTRAS)) return <PublicEventsPortal db={db} appId={appId} />;
  if (h.startsWith(ROUTES.PORTAL))   return <PortalAlumno db={db} appId={appId} />;
  if (h.startsWith(ROUTES.CHECKIN))  return <PublicCheckInViewPIN db={db} />;
  if (h.startsWith(ROUTES.TICKET))   return <PublicTicketView db={db} />;

  if (h.startsWith(ROUTES.LENCERIA)) {
    return (
      <AuthGate>
        <LenceriaStandalone db={db} appId={appId} showMessage={showMessage} handleSignOut={handleSignOut} />
      </AuthGate>
    );
  }

  if (h.startsWith(ROUTES.FINANZAS)) {
    return (
      <AuthGate>
        <PrivacyProvider>
          <FinanzasStandalone appId={appId} />
        </PrivacyProvider>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <PrivacyProvider>
        <MainApp />
      </PrivacyProvider>
    </AuthGate>
  );
}
