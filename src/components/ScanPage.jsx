import React from 'react';
import { doc, getDoc, collection as fsCollection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ScanTicketsView } from './EventModals.jsx';
import { IconTicket } from './Icons.jsx';

const getHashParams = () => new URLSearchParams(window.location.hash.split('?')[1] || '');

// Página standalone para el personal de puerta: solo escanea entradas,
// sin necesidad de login de admin. Protegida por un PIN simple (server-side,
// vía verifyScanPin) en vez del login completo.
export const ScanPage = ({ db, appId }) => {
  const eventIdParam = getHashParams().get('e') || '';
  const storageKey = `scanPin_ok_${appId}`;

  const [verified, setVerified] = React.useState(false);
  const [pin, setPin] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [pinError, setPinError] = React.useState('');

  const [events, setEvents] = React.useState([]);
  const [loadingEvents, setLoadingEvents] = React.useState(false);
  const [selectedEvent, setSelectedEvent] = React.useState(null);

  React.useEffect(() => {
    try {
      if (sessionStorage.getItem(storageKey) === '1') setVerified(true);
    } catch {}
  }, [storageKey]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setChecking(true);
    setPinError('');
    try {
      const fn = httpsCallable(getFunctions(), 'verifyScanPin');
      const res = await fn({ appId, pin: pin.trim() });
      if (res.data?.ok) {
        setVerified(true);
        try { sessionStorage.setItem(storageKey, '1'); } catch {}
      } else {
        setPinError('PIN incorrecto.');
      }
    } catch (err) {
      setPinError('No se pudo verificar el PIN. Probá de nuevo.');
    } finally {
      setChecking(false);
    }
  };

  React.useEffect(() => {
    if (!verified || !db) return;
    if (eventIdParam) {
      (async () => {
        const snap = await getDoc(doc(db, `artifacts/${appId}/events/${eventIdParam}`));
        if (snap.exists()) setSelectedEvent({ id: snap.id, ...snap.data() });
      })();
      return;
    }
    setLoadingEvents(true);
    (async () => {
      try {
        const q = query(fsCollection(db, `artifacts/${appId}/events`), orderBy('date', 'desc'), limit(25));
        const snap = await getDocs(q);
        setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Error cargando eventos para escanear', err);
      } finally {
        setLoadingEvents(false);
      }
    })();
  }, [verified, db, appId, eventIdParam]);

  if (!verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <form onSubmit={handleVerify} className="bg-white rounded-2xl shadow-xl p-8 max-w-xs w-full text-center">
          <img src="/nuevologo.gif" alt="Logo" className="h-16 w-auto mx-auto mb-4" />
          <h1 className="text-lg font-bold text-gray-900 mb-1">Escaneo de Entradas</h1>
          <p className="text-sm text-gray-500 mb-4">Ingresá el PIN para continuar.</p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full text-center text-2xl tracking-widest border border-gray-300 rounded-lg py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-rose-400"
            placeholder="••••"
          />
          {pinError && <p className="text-sm text-red-600 mb-3">{pinError}</p>}
          <button
            type="submit"
            disabled={checking || !pin.trim()}
            className="w-full bg-gray-900 text-white font-semibold rounded-lg py-3 disabled:opacity-50"
          >
            {checking ? 'Verificando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    );
  }

  if (selectedEvent) {
    return (
      <div className="min-h-screen bg-gray-900">
        <ScanTicketsView
          isOpen={true}
          onClose={() => {
            setSelectedEvent(null);
            if (eventIdParam) window.location.hash = '#/scan';
          }}
          db={db}
          appId={appId}
          event={selectedEvent}
          showMessage={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <img src="/nuevologo.gif" alt="Logo" className="h-14 w-auto mx-auto mb-2" />
          <h1 className="text-xl font-bold text-gray-900">Elegí el evento a escanear</h1>
        </div>
        {loadingEvents ? (
          <p className="text-center text-gray-500">Cargando eventos...</p>
        ) : events.length === 0 ? (
          <p className="text-center text-gray-500">No hay eventos cargados.</p>
        ) : (
          <div className="space-y-3">
            {events.map(ev => (
              <button
                key={ev.id}
                onClick={() => setSelectedEvent(ev)}
                className="w-full text-left bg-white rounded-xl shadow p-4 hover:shadow-md transition flex items-center justify-between gap-3"
              >
                <span>
                  <span className="block font-semibold text-gray-900">{ev.title || 'Evento'}</span>
                  <span className="block text-sm text-gray-500">{ev.date}{ev.startTime ? ` · ${ev.startTime} hs` : ''}</span>
                </span>
                <IconTicket />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
