
import React from "react";
import {
  onSnapshot,
  query,
  where,
  collectionGroup,
} from "firebase/firestore";

/**
 * Hook: subscribe tickets for a student (public profile)
 * Expects each ticket doc to have at least:
 *  - studentId
 *  - appId (recommended)
 *  - eventTitle, date, startTime, location, seat, price, qrPayload (optional)
 *  - id (document id)
 */
export function useStudentTickets(db, appId, studentId) {
  const [tickets, setTickets] = React.useState([]);

  React.useEffect(() => {
    if (!db || !appId || !studentId) return;

    let unsub = onSnapshot(
      // If you don't store appId in ticket docs, remove the where('appId','==',appId)
      query(collectionGroup(db, 'tickets'),
        where('studentId', '==', studentId),
        where('appId', '==', appId)
      ),
      (snap) => {
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data(), __path: d.ref.path }));
        // Defensive client-side filter for correct app path as fallback safety
        const safe = rows.filter(r => r.__path.includes(`/artifacts/${appId}/`));
        setTickets(safe);
      },
      (err) => { console.error('useStudentTickets', err); setTickets([]); }
    );

    return () => { try { unsub && unsub(); } catch {} };
  }, [db, appId, studentId]);

  return tickets;
}

// Lightweight QR image that generates on mount
export function AsyncQr({ payload, size = 128, makeQrPng }) {
  const [src, setSrc] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const dataUrl = await makeQrPng(payload, { size, margin: 1 });
        if (alive) setSrc(dataUrl);
      } catch (e) {
        console.warn('AsyncQr', e);
      }
    })();
    return () => { alive = false; };
  }, [payload, size, makeQrPng]);

  if (!src) {
    return (
      <div className="w-32 h-32 grid place-items-center text-[11px] text-gray-500 border rounded-lg">
        Cargando…
      </div>
    );
  }
  return <img src={src} alt="QR" className="w-32 h-32" />;
}

/**
 * PublicTicketsSection
 * Props:
 *  - db, appId, student (with fullName and id)
 *  - makeQrPng, exportTicketPDForPNG, shareTicket (helpers from your App.jsx)
 */
export default function PublicTicketsSection({
  db, appId, student,
  makeQrPng, exportTicketPDForPNG, shareTicket,
}) {
  const tickets = useStudentTickets(db, appId, student?.id);

  if (!tickets?.length) return null;

  const handlePdf = async (t) => {
    try {
      const payload = t.qrPayload || `ticket:${t.id}`;
      const qr = await makeQrPng(payload, { size: 512, margin: 1 });
      await exportTicketPDForPNG({
        qrDataUrl: qr,
        alumno: student?.fullName,
        evento: { title: t.eventTitle, date: t.date, startTime: t.startTime, location: t.location },
        asiento: t.seat,
        ticketId: t.id,
      });
    } catch (e) { console.error('PublicTicketsSection:pdf', e); }
  };

  const handleShare = async (t) => {
    try {
      const payload = t.qrPayload || `ticket:${t.id}`;
      const qr = await makeQrPng(payload, { size: 512, margin: 1 });
      const res = await fetch(qr);
      const blob = await res.blob();
      const file = new File([blob], `Entrada_${(student?.fullName||'alumno').replace(/\s+/g,'_')}.png`, { type: 'image/png' });
      await shareTicket({
        texto: `Entrada — ${t.eventTitle || 'Evento'} (${t.date}${t.startTime ? ' · ' + t.startTime : ''})`,
        files: [file],
      });
    } catch (e) { console.error('PublicTicketsSection:share', e); }
  };

  return (
    <div className="mt-6">
      <div className="text-sm font-semibold text-gray-800 mb-2">
        Entradas emitidas para este alumno
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tickets.map((t) => (
          <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-900 truncate">
                {t.eventTitle || 'Evento'}
              </div>
              <div className="text-xs text-gray-500 shrink-0">
                {t.date}{t.startTime ? ` · ${t.startTime}` : ''}
              </div>
            </div>

            <div className="grid place-items-center my-2">
              <AsyncQr payload={t.qrPayload || `ticket:${t.id}`} size={256} makeQrPng={makeQrPng} />
            </div>

            <div className="text-sm text-gray-700 flex items-center justify-between">
              <span className="tabular-nums">
                {t.price != null ? `$${Number(t.price).toLocaleString("es-AR")}` : ''}
              </span>
              {t.seat ? <span className="text-xs text-gray-600">Asiento: {t.seat}</span> : <span />}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => handlePdf(t)}
                className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-black"
              >
                PDF
              </button>
              <button
                onClick={() => handleShare(t)}
                className="px-3 py-1.5 rounded-lg bg-gray-700 text-white text-xs font-semibold hover:bg-gray-800"
              >
                Compartir
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
