
import React from "react";
import { onSnapshot, query, where, collectionGroup } from "firebase/firestore";

/**
 * Robust public tickets section.
 * - First tries strict query: studentId + appId.
 * - If no results in the first snapshot, falls back to assignedTo and filters by path (/artifacts/{appId}/).
 */
export default function PublicTicketsSection({
  db, appId, student,
  makeQrPng, exportTicketPDForPNG, shareTicket,
}) {
  const [tickets, setTickets] = React.useState([]);
  const [mode, setMode] = React.useState("strict"); // 'strict' | 'fallback'

  React.useEffect(() => {
    if (!db || !appId || !student?.id) return;
    let unsub = () => {};

    const runStrict = () => {
      const q = query(
        collectionGroup(db, 'tickets'),
        where('studentId', '==', student.id),
        where('appId', '==', appId)
      );
      return onSnapshot(q, (snap) => {
        // if no results, try fallback (only once)
        if (snap.empty) {
          setMode("fallback");
          unsub(); // stop strict
          unsub = runFallback();
          return;
        }
        setMode("strict");
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data(), __path: d.ref.path }));
        setTickets(rows);
      }, (e) => console.error("PublicTicketsSection/strict:", e));
    };

    const runFallback = () => {
      const q = query(
        collectionGroup(db, 'tickets'),
        where('assignedTo', '==', student.id)
      );
      return onSnapshot(q, (snap) => {
        const rowsAll = snap.docs.map(d => ({ id: d.id, ...d.data(), __path: d.ref.path }));
        const rows = rowsAll.filter(r => r.__path.includes(`/artifacts/${appId}/`));
        setTickets(rows);
      }, (e) => console.error("PublicTicketsSection/fallback:", e));
    };

    unsub = runStrict();
    return () => { try { unsub(); } catch {} };
  }, [db, appId, student?.id]);

  const getQr = async (t) => {
    const payload = t.qrPayload || `ticket:${t.id}`;
    return makeQrPng(payload, { size: 512, margin: 1 });
  };

  if (!tickets?.length) return null;

  return (
    <div className="mt-6">
      <div className="text-sm font-semibold text-gray-800 mb-1">Entradas emitidas para este alumno</div>
      <div className="text-[11px] text-gray-500 mb-2">Fuente: {mode === "strict" ? "studentId + appId" : "assignedTo (fallback)"} </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tickets.map((t) => (
          <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-900 truncate">{t.eventTitle || 'Evento'}</div>
              <div className="text-xs text-gray-500 shrink-0">
                {t.date}{t.startTime ? ` · ${t.startTime}` : ''}
              </div>
            </div>

            <AsyncQr payload={t.qrPayload || `ticket:${t.id}`} size={256} makeQrPng={makeQrPng} />

            <div className="mt-2 text-sm text-gray-700 flex items-center justify-between">
              <span className="tabular-nums">
                {t.price != null ? `$${Number(t.price).toLocaleString("es-AR")}` : ''}
              </span>
              {t.seat ? <span className="text-xs text-gray-600">Asiento: {t.seat}</span> : <span />}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  const qr = await getQr(t);
                  await exportTicketPDForPNG({
                    qrDataUrl: qr,
                    alumno: student?.fullName,
                    evento: { title: t.eventTitle, date: t.date, startTime: t.startTime, location: t.location },
                    asiento: t.seat,
                    ticketId: t.id,
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-black"
              >
                PDF
              </button>

              <button
                onClick={async () => {
                  const qr = await getQr(t);
                  const res = await fetch(qr);
                  const blob = await res.blob();
                  const file = new File([blob], `Entrada_${(student?.fullName||'alumno').replace(/\s+/g,'_')}.png`, { type: 'image/png' });
                  await shareTicket({
                    texto: `Entrada — ${t.eventTitle || 'Evento'} (${t.date}${t.startTime ? ' · ' + t.startTime : ''})`,
                    files: [file],
                  });
                }}
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

function AsyncQr({ payload, size = 256, makeQrPng }) {
  const [src, setSrc] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await makeQrPng(payload, { size, margin: 1 });
        if (alive) setSrc(data);
      } catch {}
    })();
    return () => { alive = false; };
  }, [payload, size, makeQrPng]);

  if (!src) {
    return <div className="w-32 h-32 grid place-items-center text-[11px] text-gray-500 border rounded-lg my-2">Cargando…</div>;
  }
  return <div className="grid place-items-center my-2"><img src={src} alt="QR" className="w-32 h-32"/></div>;
}
