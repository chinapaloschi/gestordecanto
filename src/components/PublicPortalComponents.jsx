import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collection as fsCollection, doc, getDoc, getDocs, updateDoc, addDoc as fsAddDoc, query, where, orderBy, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ref as stRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig.js';
import { Modal, ModalHeader } from './Modal.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { formatMoneyAr, parseMoneyAr } from '../utils/money.js';
import { formatDateToDDMMYYYY, mapClassTypeToSpanish, daysOfWeekFull } from '../utils/classHelpers.js';
import { useMergedValidatedPayments } from '../hooks/useMergedValidatedPayments.js';
import { useHasPaidThisMonth } from '../hooks/useHasPaidThisMonth.js';
import { PaymentHistoryModal } from './PaymentHistoryModal.jsx';
import { SocialMediaLinks } from './SocialMediaLinks.jsx';
import { GracePeriodNotice, NextMonthInfoBox } from './PublicPortalWidgets.jsx';
import { IconClock, IconCalendar, IconTicket, IconDownload, IconShare } from './Icons.jsx';
import { ROUTES } from '../constants.js';
import { dataUrlToFile, generateQrWithLogo, generateComposedTicketImage } from '../utils/ticketQr.js';
import { exportPaymentPDF, sharePayment } from '../utils/paymentPDF.js';
// ▼▼▼ REEMPLAZÁ TU COMPONENTE PublicTicketsSection ENTERO CON ESTA VERSIÓN ▼▼▼
export const PublicTicketsSection = ({ db, appId, student }) => {
  const [tickets, setTickets] = React.useState([]);
  const [eventsById, setEventsById] = React.useState({});
  const [qrCache, setQrCache] = React.useState({});
  const [qrErrors, setQrErrors] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);

  const [openEventId, setOpenEventId] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const fmtDate = (iso, time) => {
    if (!iso) return "";
    try {
      const d = new Date(iso + 'T00:00:00Z');
      const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const dd = dias[d.getUTCDay()];
      const dia = String(d.getUTCDate()).padStart(2, "0");
      const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
      const hhmm = (time || "").slice(0, 5);
      return `${dd} ${dia}/${mes}${hhmm ? ` – ${hhmm}` : ""}`;
    } catch { return ""; }
  };

  React.useEffect(() => {
    if (!db || !appId || !student?.id) {
      setTickets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let alive = true;
    const unsubscribers = []; // Para guardar las funciones de limpieza

    const setupListeners = async () => {
      try {
        const eventsQuery = query(fsCollection(db, `artifacts/${appId}/events`));
        const allEventsSnap = await getDocs(eventsQuery);

        // === LÓGICA DE FILTRADO CORREGIDA ===
        const studentEventsWithVisibleTickets = allEventsSnap.docs.filter(doc => {
            const participants = doc.data().participants || [];
            const studentParticipant = participants.find(p => (p.id || p.studentId) === student.id);
            // El evento solo se incluirá si el participante existe Y su visibilidad está en 'true'
            return studentParticipant && studentParticipant.ticketsVisible === true;
        });
        // === FIN DE LA LÓGICA CORREGIDA ===

        if (!studentEventsWithVisibleTickets.length) {
          if (alive) { setTickets([]); setLoading(false); }
          return;
        }

        const eventDataMap = {};
        studentEventsWithVisibleTickets.forEach(doc => { eventDataMap[doc.id] = { id: doc.id, ...doc.data() }; });
        if (alive) setEventsById(eventDataMap);

        const allTicketsMap = new Map();

        studentEventsWithVisibleTickets.forEach(eventDoc => {
    const ticketsQuery = query(
  fsCollection(db, `artifacts/${appId}/events/${eventDoc.id}/tickets`),
  where("assignedTo", "==", student.id),
  where("status", "in", ["active", "used"]) // <--- ESTA ES LA LÍNEA CLAVE QUE FALTA
);
          
      // ▼▼▼ REEMPLAZÁ EL BLOQUE 'onSnapshot' ENTERO POR ESTA NUEVA VERSIÓN ▼▼▼

          const unsub = onSnapshot(ticketsQuery, (snapshot) => {
            
            // --- INICIO DE LA SOLUCIÓN DEFINITIVA ---
            
            // Usamos docChanges() para manejar 'added', 'modified', y 'removed'
            snapshot.docChanges().forEach((change) => {
              const docData = change.doc.data() || {};
              const docId = change.doc.id;

              if (change.type === "added") {
                // Añadimos la nueva entrada al mapa
                allTicketsMap.set(docId, { id: docId, ...docData });
              }
              if (change.type === "modified") {
                // Modificamos la entrada existente
                allTicketsMap.set(docId, { id: docId, ...docData });
              }
              if (change.type === "removed") {
                // ¡Esta es la parte clave! Eliminamos la entrada del mapa
                allTicketsMap.delete(docId);
              }
            });
            // --- FIN DE LA SOLUCIÓN DEFINITIVA ---

            if (alive) {
              const sortedTickets = Array.from(allTicketsMap.values())
                .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
              setTickets(sortedTickets);
            }
          }, (error) => {
            console.error(`Error en listener de tickets para evento ${eventDoc.id}:`, error);
            if (alive) setLoadError(true);
          });
// ...el resto del bloque (la llave de cierre '});' y 'unsubscribers.push(unsub);')
          unsubscribers.push(unsub);
        });

      } catch (error) {
        console.error("Error al buscar entradas públicas:", error);
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    };

    setupListeners();
    
    return () => { 
      alive = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [db, appId, student?.id]);

  const generateOneQr = React.useCallback(async (ticketId, eventId) => {
    try {
      const url = `${location.origin}/${ROUTES.TICKET}?e=${encodeURIComponent(eventId||'')}&t=${encodeURIComponent(ticketId)}&a=${encodeURIComponent(appId)}`;
      const dataUrl = await generateQrWithLogo(url, '/logo.png', 256);
      setQrCache(prev => ({ ...prev, [ticketId]: dataUrl }));
      setQrErrors(prev => { const next = { ...prev }; delete next[ticketId]; return next; });
    } catch (e) {
      console.error("Error generating QR for modal", e);
      // Antes un fallo acá dejaba el modal en "Cargando QR..." para siempre
      // — no había ningún estado de error ni forma de reintentar.
      setQrErrors(prev => ({ ...prev, [ticketId]: true }));
    }
  }, [appId]);

  React.useEffect(() => {
    for (const t of tickets) {
      if (!qrCache[t.id] && !qrErrors[t.id]) generateOneQr(t.id, t.eventId);
    }
  }, [tickets, generateOneQr]);

  const handleShareOrDownload = async (action, ticket, participantName) => {
    setLoading(true);
    try {
      const qrUrl = `${location.origin}/${ROUTES.TICKET}?e=${encodeURIComponent(ticket.eventId)}&t=${encodeURIComponent(ticket.id)}&a=${encodeURIComponent(appId)}`;
      const eventInfo = {
        title: ticket.eventTitle,
        subtitle: fmtDate(ticket.eventDate, ticket.eventStartTime),
        attendee: participantName,
        ticketNumber: ticket.ticketNumber,
        ticketId: ticket.id
      };

      const composedImageDataUrl = await generateComposedTicketImage(qrUrl, eventInfo, '/logo.png');
      if (!composedImageDataUrl) throw new Error("No se pudo generar la imagen de la entrada.");

      const fileName = `Entrada_${(ticket.eventTitle || 'evento').replace(/\s/g, '_')}_${(participantName || 'participante').replace(/\s/g, '_')}.png`;

      if (action === 'share') {
        const imageFile = await dataUrlToFile(composedImageDataUrl, fileName);
        if (imageFile && navigator.share) {
          await navigator.share({
            title: `Entrada para ${ticket.eventTitle}`,
            text: `Aquí está tu entrada para ${ticket.eventTitle}.`,
            files: [imageFile],
          });
        } else {
          alert('Tu navegador no permite compartir archivos. Intenta descargar la entrada.');
        }
      } else if (action === 'download') {
        const link = document.createElement('a');
        link.href = composedImageDataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(`Error en [${action}]:`, error);
        alert(`No se pudo ${action === 'share' ? 'compartir' : 'descargar'} la entrada: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const StatusBadge = ({ status }) => {
    const s = String(status || 'active').toLowerCase();
    const config = {
      active: { label: 'Activa', color: 'bg-green-100 text-green-800 border-green-200' },
      used: { label: 'Usada', color: 'bg-blue-100 text-blue-800 border-blue-200' },
      revoked: { label: 'Anulada', color: 'bg-red-100 text-red-800 border-red-200' },
    };
    const { label, color } = config[s] || config.revoked;
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>{label}</span>;
  };

  const groups = React.useMemo(() => {
    const m = new Map();
    for (const t of tickets) {
      const key = t.eventId || "_no_event";
      if (!m.has(key)) {
        const ev = eventsById[key];
        const title = ev?.title || t.eventTitle || "Entradas";
        const when = ev ? fmtDate(ev.date, ev.startTime) : '';
        m.set(key, { title, when, rows: [] });
      }
      m.get(key).rows.push(t);
    }
    return Array.from(m.entries()).map(([id, data]) => ({ id, ...data }));
  }, [tickets, eventsById]);

  if (loading) return null;

  if (tickets.length === 0) {
    if (!loadError) return null;
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 shadow-sm mt-4 px-4 py-3 flex items-center gap-2">
        <span className="text-lg flex-shrink-0">⚠️</span>
        <p className="text-xs text-amber-800">No pudimos cargar tus entradas. Revisá tu conexión y volvé a intentar.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200 p-4 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-gray-900">Tus entradas</div>
        </div>
        <div className="space-y-2">
          {groups.map(g => {
            const isExpanded = openEventId === g.id;
            return (
              <div key={g.id} className="rounded-xl border border-amber-300 bg-amber-100 shadow-md overflow-hidden">
                <button
                  type="button"
                  className="w-full flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-amber-200 transition-colors"
                  onClick={() => setOpenEventId(isExpanded ? null : g.id)}
                >
                  <div className="leading-tight">
                    <span className="font-semibold text-amber-900">{g.title}</span>
                    <span className="ml-2 text-xs text-amber-800">({g.rows.length} {g.rows.length === 1 ? 'entrada' : 'entradas'})</span>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-xs font-mono text-amber-800">{g.when}</span>
                      <span className={`transform transition-transform text-amber-900 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 bg-white border-t border-amber-200">
                    <ul className="divide-y divide-gray-200">
                      {g.rows.map(t => (
                        <li key={t.id}>
                          <button type="button" onClick={() => setSelectedTicket(t)} className="w-full flex justify-between items-center py-2 text-left hover:bg-rose-50 rounded-md px-2">
                            <span className="font-semibold text-sm text-gray-800">{t.ticketNumber ? `Entrada N° ${t.ticketNumber}` : `ID: ${t.id.slice(0, 6)}...`}</span>
                            <StatusBadge status={t.status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Modal isOpen={!!selectedTicket} onClose={() => setSelectedTicket(null)} size="sm">
        {selectedTicket && (
          <div className="p-4 flex flex-col items-center text-center">
            <h3 className="font-bold text-lg text-gray-900">{selectedTicket.eventTitle}</h3>
            <p className="text-sm text-gray-600 mb-4">{fmtDate(selectedTicket.eventDate, selectedTicket.eventStartTime)}</p>
            {qrCache[selectedTicket.id] ? (
              <img src={qrCache[selectedTicket.id]} alt="QR Code" className="w-56 h-56 rounded-lg shadow-md border" />
            ) : qrErrors[selectedTicket.id] ? (
              <div className="w-56 h-56 bg-red-50 border border-red-100 flex flex-col items-center justify-center gap-2 rounded-lg text-sm text-red-600 px-4 text-center">
                <span>No se pudo generar el código.</span>
                <button type="button" onClick={() => generateOneQr(selectedTicket.id, selectedTicket.eventId)}
                  className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition">
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="w-56 h-56 bg-gray-100 flex items-center justify-center rounded-lg text-sm">Cargando QR...</div>
            )}
            <p className="mt-4 font-semibold text-gray-800">{selectedTicket.ticketNumber ? `Entrada N° ${selectedTicket.ticketNumber}` : `ID: ${selectedTicket.id.slice(0, 10)}...`}</p>
            <div className="mt-6 w-full space-y-2">
              <button onClick={() => handleShareOrDownload('download', selectedTicket, student.name)} disabled={loading} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200 disabled:opacity-50">
                <IconDownload /> {loading ? 'Generando...' : 'Descargar PNG'}
              </button>
              <button onClick={() => handleShareOrDownload('share', selectedTicket, student.name)} disabled={loading} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200 disabled:opacity-50">
                <IconShare /> {loading ? 'Preparando...' : 'Compartir'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};
async function makeQrPng(text, { size = 512, margin = 2 } = {}) {
  try { return await QRCode.toDataURL(text, { width: size, margin }); }
  catch (e) { console.error('makeQrPng', e); return null; }
}

function downloadDataUrl(filename, dataUrl) {
  try {
    const a = document.createElement('a');
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { console.error('downloadDataUrl', e); }
}

async function exportTicketPDForPNG({ qrDataUrl, alumno, evento, asiento, ticketId }) {
  try {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'A4' });
    const left = 56, top = 64;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(`Entrada — ${evento?.title || 'Evento'}`, left, top);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
    if (alumno) doc.text(`Alumno/a: ${alumno}`, left, top + 24);
    if (asiento) doc.text(`Asiento: ${asiento}`, left, top + 44);
    const meta = [];
    if (evento?.date) meta.push(`Fecha: ${evento.date}`);
    if (evento?.startTime) meta.push(`Hora: ${evento.startTime}`);
    if (evento?.location) meta.push(`Lugar: ${evento.location}`);
    if (ticketId) meta.push(`ID: ${ticketId}`);
    if (meta.length) doc.text(meta.join('  •  '), left, top + 64);
    const qrSize = 240;
    if (qrDataUrl) doc.addImage(qrDataUrl, 'PNG', left, top + 96, qrSize, qrSize);
    doc.setFontSize(10);
    doc.text('Mostrá este código en el ingreso', left, top + 96 + qrSize + 24);
    const filename = `Entrada_${(alumno || 'alumno').replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
  } catch (err) {
    console.warn('jsPDF no disponible, descargando PNG', err);
    const filename = `Entrada_${(alumno || 'alumno').replace(/\s+/g, '_')}.png`;
    if (qrDataUrl) downloadDataUrl(filename, qrDataUrl);
  }
}

// ▼▼▼ REEMPLAZÁ TU FUNCIÓN 'exportPaymentReceiptPDFWithLogo' CON ESTA VERSIÓN ▼▼▼

export const PublicPaymentsList = ({ db, appId, student }) => {
  const merged = useMergedValidatedPayments(db, appId, student?.id);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = React.useState(false);
  
  // 1. Nuevo estado unificado para controlar la vista completa
  const [isFullyExpanded, setIsFullyExpanded] = React.useState(false);

  // Estados internos que ahora son controlados por el estado unificado
  const [openMonths, setOpenMonths] = React.useState({});
  const [showOnlyAll, setShowOnlyAll] = React.useState(false); // Cambiado para mayor claridad
  const [expandAll, setExpandAll] = React.useState(false);

  // Estado para el modal de detalles (sin cambios)
  const [selectedPayment, setSelectedPayment] = React.useState(null);

  // 2. useEffect para sincronizar los estados antiguos con el nuevo estado unificado
  React.useEffect(() => {
    setShowOnlyAll(isFullyExpanded);
    setExpandAll(isFullyExpanded);
  }, [isFullyExpanded]);
  
  const fmtShort = (d) => {
    try {
      const date = (d instanceof Date) ? d : new Date(d);
      return `${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}/${date.getFullYear()}`;
    } catch { return ""; }
  };

  const ymKey = (d) => {
    const x = (d instanceof Date) ? d : new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}`;
  };

  const ymLabel = (k) => {
    const [y,m] = k.split("-").map(Number);
    const nombreMes = new Date(y, m-1, 1).toLocaleDateString("es-AR", { month:"long", year:"numeric" });
    return nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
  };

  // Muestra a qué mes corresponde el pago (periodStartDate) cuando difiere
  // del mes en que se cargó — antes el historial solo mostraba la fecha de
  // carga, así que un pago atrasado o adelantado no se distinguía de uno
  // hecho en término.
  const periodLabel = (periodStartDate, paymentDate) => {
    if (!periodStartDate) return null;
    if (String(periodStartDate).slice(0, 7) === ymKey(paymentDate)) return null;
    try {
      const label = new Date(periodStartDate + 'T12:00:00').toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
      return label.charAt(0).toUpperCase() + label.slice(1);
    } catch { return null; }
  };

  const payments = React.useMemo(() => (showOnlyAll ? merged : merged.slice(0, 5)), [merged, showOnlyAll]);
  
  const groups = React.useMemo(() => {
    const m = new Map();
    for (const p of payments) {
      const key = ymKey(p.date);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(p);
    }
    return Array.from(m.entries()).sort(([a],[b]) => (b > a ? 1 : b < a ? -1 : 0)).map(([key, rows]) => ({ key, rows }));
  }, [payments]);

  React.useEffect(() => {
    if (!groups.length) return;
    const next = {};
    for (const g of groups) next[g.key] = expandAll;
    setOpenMonths(next);
  }, [expandAll, groups]);

  const toggleMonth = (key) => setOpenMonths(prev => ({ ...prev, [key]: !prev[key] }));

  if (!merged.length) {
    return (
      <div className="rounded-lg border border-gray-200 p-4 bg-white shadow-sm">
        <div className="text-sm font-semibold text-gray-900 mb-2">Pagos</div>
        <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-800">No hay pagos registrados.</div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200 p-4 bg-white shadow-sm">
        <div className="text-sm font-semibold text-gray-900 mb-2">Historial de Pagos</div>
        <p className="text-sm text-gray-600 mb-4">
          Aquí puedes consultar todos los comprobantes de tus pagos anteriores.
        </p>
 
<button
  onClick={() => setIsHistoryModalOpen(true)}
  className="w-full text-center text-sm font-semibold text-rose-600 hover:text-rose-800 hover:underline transition-all"
>
  Ver historial completo ({merged.length} en total)
</button>
      </div>
      
      <Modal isOpen={isHistoryModalOpen} onClose={() => { setIsHistoryModalOpen(false); setIsFullyExpanded(false); }} title="Historial de Pagos" size="lg">
        <div className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="text-sm font-semibold text-gray-900">Pagos Registrados</div>
            {/* 3. Botón único que reemplaza a los dos anteriores */}
            <div className="flex items-center gap-2">
              <button 
                type="button" 
                className="w-full sm:w-auto text-xs font-medium px-3 py-1.5 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200" 
                onClick={() => setIsFullyExpanded(v => !v)}
              >
                {isFullyExpanded ? "Mostrar menos" : "Ver historial completo"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {groups.map(({ key, rows }) => (
              <div key={key} className="rounded-xl border border-gray-200 bg-gray-50">
                <button type="button" className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-100" onClick={() => toggleMonth(key)}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{ymLabel(key)}</span>
                    <span className="text-xs text-gray-600">({rows.length})</span>
                  </div>
                  <span className="transform transition-transform" style={{ transform: openMonths[key] ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                </button>
                
                {openMonths[key] && (
                  <div className="px-4 pb-4 pt-2">
                    <div className="flex flex-wrap gap-2">
                      {rows.map((p) => {
                        const pLabel = periodLabel(p.periodStartDate, p.date);
                        return (
                          <button
                            key={p.id}
                            onClick={() => setSelectedPayment(p)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-gray-300 hover:border-rose-400 hover:bg-rose-50 transition-all shadow-sm"
                          >
                            <span className="text-xs font-mono text-gray-600">{fmtShort(p.date)}</span>
                            <span className="font-bold text-sm text-gray-800">
                              ${new Intl.NumberFormat('es-AR').format(p.amount ?? 0)}
                            </span>
                            {pLabel && <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">Cubre {pLabel}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>
      
      {selectedPayment && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center p-4" onClick={() => setSelectedPayment(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs text-gray-500">Comprobante</p>
                    <h3 className="text-lg font-bold text-gray-800">{selectedPayment.concept}</h3>
                    <p className="text-sm text-gray-600">{fmtShort(selectedPayment.date)}</p>
                    {periodLabel(selectedPayment.periodStartDate, selectedPayment.date) && (
                      <p className="text-xs text-blue-600 font-semibold mt-0.5">Cubre {periodLabel(selectedPayment.periodStartDate, selectedPayment.date)}</p>
                    )}
                    {selectedPayment.surchargeApplied && (
                      <p className="text-xs text-amber-600 font-semibold mt-0.5">Incluye 10% de recargo por mora</p>
                    )}
                </div>
                <p className="font-extrabold text-2xl text-rose-600">
                    ${new Intl.NumberFormat('es-AR').format(selectedPayment.amount ?? 0)}
                </p>
            </div>
            <div className="mt-6 pt-4 border-t flex flex-col gap-2">
              <button type="button" className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm font-semibold" onClick={() => exportPaymentPDF({ alumno: student.fullName || student.name || "", fecha: fmtShort(selectedPayment.date), concepto: selectedPayment.concept, monto: new Intl.NumberFormat('es-AR').format(selectedPayment.amount ?? 0) })}>
                <IconDownload /> Descargar PDF
              </button>
              <button type="button" className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm font-semibold" onClick={(e) => sharePayment({ alumno: student.fullName || student.name || "", fecha: fmtShort(selectedPayment.date), concepto: selectedPayment.concept, monto: new Intl.NumberFormat('es-AR').format(selectedPayment.amount ?? 0), stopEvent: e })}>
                <IconShare /> Compartir
              </button>
              <button type="button" className="w-full text-center mt-2 text-sm text-gray-600 hover:text-black" onClick={() => setSelectedPayment(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

async function shareTicket({ texto, url, files }) {
  try {
    if (navigator.canShare && files?.length) { await navigator.share({ text: texto, files }); return true; }
    if (navigator.share && (url || texto)) { await navigator.share({ text: texto, url }); return true; }
  } catch (e) { console.warn('Share no disponible/cancelado', e); }
  return false;
}

// === Borrado robusto de pagos en ambas colecciones (por huella) ===
async function deletePaymentEverywhere({ db, appId, studentId, date, amount, note }) {
  // Normaliza huella
  const fmtShort = (d) => {
    try {
      const x = d instanceof Date ? d : new Date(d);
      return `${String(x.getDate()).padStart(2,"0")}/${String(x.getMonth()+1).padStart(2,"0")}/${x.getFullYear()}`;
    } catch { return ""; }
  };
  const targetKey = [
    fmtShort(date),
    Number.isFinite(Number(amount)) ? Number(amount).toFixed(2) : "",
    String(note || "").toLowerCase().trim()
  ].join("|");

  const matches = [];
  try {
    // Subcolección del alumno
    const subRef = fsCollection(db, `artifacts/${appId}/students/${studentId}/payments`);
    const subSnap = await getDocs(subRef);
    subSnap.forEach(d => {
      const data = d.data() || {};
      const rawDate = data.paidAt || data.paymentDate || data.fechaPago || data.date || data.createdAt;
      const date = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
      const rawAmt = data.amount ?? data.monto ?? data.total ?? data.totalAmount ?? data.value ?? data.importe;
      const amount = Number.isFinite(Number(rawAmt)) ? Number(rawAmt) : null;
      const note = data.concept || data.concepto || data.note || data.nota || "Paquete mensual";
      const key = [fmtShort(date), Number.isFinite(Number(amount)) ? Number(amount).toFixed(2) : "", String(note||"").toLowerCase().trim()].join("|");
      if (key === targetKey) matches.push(`artifacts/${appId}/students/${studentId}/payments/${d.id}`);
    });
  } catch {}

  try {
    // Colección global
    const globRef = fsCollection(db, `artifacts/${appId}/payments`);
    const globQ = query(globRef, where("studentId","==", studentId));
    const globSnap = await getDocs(globQ);
    globSnap.forEach(d => {
      const data = d.data() || {};
      const rawDate = data.paidAt || data.paymentDate || data.fechaPago || data.date || data.createdAt;
      const date = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
      const rawAmt = data.amount ?? data.monto ?? data.total ?? data.totalAmount ?? data.value ?? data.importe;
      const amount = Number.isFinite(Number(rawAmt)) ? Number(rawAmt) : null;
      const note = data.concept || data.concepto || data.note || data.nota || "Paquete mensual";
      const key = [fmtShort(date), Number.isFinite(Number(amount)) ? Number(amount).toFixed(2) : "", String(note||"").toLowerCase().trim()].join("|");
      if (key === targetKey) matches.push(`artifacts/${appId}/payments/${d.id}`);
    });
  } catch {}

  if (!matches.length) return false;

  await Promise.allSettled(matches.map(p => deleteDoc(doc(db, p))));
  return true;
}

// === Vaciar TODOS los pagos del alumno en ambas colecciones ===
async function deleteAllPaymentsForStudent({ db, appId, studentId }) {
  // 1) Subcolección del alumno
  const subRef = fsCollection(db, `artifacts/${appId}/students/${studentId}/payments`);
  const subSnap = await getDocs(subRef);

  // 2) Colección global por studentId
  const globRef = fsCollection(db, `artifacts/${appId}/payments`);
  const globQ   = query(globRef, where("studentId","==", studentId));
  const globSnap = await getDocs(globQ);

  const paths = [];
  subSnap.forEach(d => paths.push(`artifacts/${appId}/students/${studentId}/payments/${d.id}`));
  globSnap.forEach(d => paths.push(`artifacts/${appId}/payments/${d.id}`));

  if (!paths.length) return 0;

  // Borrado en tandas para no superar límites
  let count = 0;
  let batch = writeBatch(db);
  let ops = 0;

  for (const p of paths) {
    batch.delete(doc(db, p));
    ops++; count++;
    if (ops >= 450) { await batch.commit(); batch = writeBatch(db); ops = 0; }
  }
  if (ops > 0) await batch.commit();

  return count;
}

// ==== PDF Resumen Financiero (Ingresos, Egresos, Balance) con LOGO (solo primera página) ====
async function exportResumenFinancieroPDF({
  desde, hasta,
  ingresos = [],     // [{ fecha, descripcion, monto, categoria }]
  egresos = [],      // [{ fecha, descripcion, monto, categoria }]
  logoUrl = null,
  titulo = "Reporte de Ingresos y Egresos"
}) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "A4" });

  // Helpers
  const fmtFechaLarga = (d) =>
    (d instanceof Date ? d : new Date(d))
      .toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

  const fmtMon = (n) =>
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(n || 0));

  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const M = 48;            // margen
  const LINE = 22;         // alto de línea
  let y = M;

  // Logo (solo primera página, si está disponible)
  if (logoUrl) {
    try {
      const blob = await fetch(logoUrl, { cache: "no-store" }).then(r => r.blob());
      const base64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      doc.addImage(base64, "PNG", M, y - 10, 80, 80);
      y += 70;
    } catch (_) {
      // Si falla, seguimos sin logo
    }
  }

  // Encabezado
  doc.setFont("helvetica", "bold");  doc.setFontSize(18);
  doc.text(titulo, M, y); y += LINE;
  doc.setFont("helvetica", "normal"); doc.setFontSize(12);
  doc.text(`Desde: ${fmtFechaLarga(desde)}    Hasta: ${fmtFechaLarga(hasta)}`, M, y); y += LINE;

  // Totales
  const totalIngresos = ingresos.reduce((a,b)=>a + Number(b.monto||0), 0);
  const totalEgresos  = egresos.reduce((a,b)=>a + Number(b.monto||0), 0);
  const balance       = totalIngresos - totalEgresos;

  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(`Total Ingresos: $${fmtMon(totalIngresos)}`, M, y); y += LINE - 6;
  doc.text(`Total Egresos:  $${fmtMon(totalEgresos)}`, M, y);  y += LINE - 6;
  doc.text(`Balance:        $${fmtMon(balance)}`, M, y);       y += LINE;

  // separador
  y += 8; doc.setDrawColor(220); doc.line(M, y, PAGE_W - M, y); y += 16;

  // Dibujar una tabla (reutilizable)
  const drawTabla = (tituloSeccion, datos) => {
    const addPageIfNeeded = () => {
      if (y > PAGE_H - M - LINE) { doc.addPage(); y = M; }
    };

    // Título de sección
    addPageIfNeeded();
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(tituloSeccion, M, y); y += LINE - 4;

    // Cabecera
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    const col = {
      fecha: M,
      desc:  M + 140,
      monto: PAGE_W - M - 140,           // monto a la derecha
      cate:  PAGE_W - M - 10             // texto alineado a la derecha
    };
    doc.text("Fecha", col.fecha, y);
    doc.text("Descripción", col.desc, y);
    doc.text("Monto ($)", PAGE_W - M - doc.getTextWidth("Monto ($)"), y);
    doc.text("Tipo/Categoría", col.cate - doc.getTextWidth("Tipo/Categoría"), y);
    y += 8; doc.setDrawColor(230); doc.line(M, y, PAGE_W - M, y); y += LINE - 8;

    // Filas
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    for (const it of datos) {
      addPageIfNeeded();

      // fecha
      const fTxt = (it.fecha instanceof Date ? it.fecha : new Date(it.fecha))
        .toLocaleDateString("es-AR", { day:"numeric", month:"long", year:"numeric" });
      doc.text(fTxt, col.fecha, y);

      // descripción (truncado simple a una línea)
      const maxDescW = (PAGE_W - M) - col.desc - 220;
      let desc = String(it.descripcion || "");
      while (doc.getTextWidth(desc) > maxDescW && desc.length > 3) desc = desc.slice(0, -4) + "…";
      doc.text(desc, col.desc, y);

      // monto (derecha)
      const mTxt = `$${fmtMon(it.monto)}`;
      doc.text(mTxt, PAGE_W - M - doc.getTextWidth(mTxt), y);

      // categoría (derecha)
      const cat = String(it.categoria || "");
      doc.text(cat, col.cate - doc.getTextWidth(cat), y);

      y += LINE;
    }

    // Subtotal sección
    const subtotal = datos.reduce((a,b)=>a + Number(b.monto||0), 0);
    addPageIfNeeded();
    y += 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    const stTxt = `Subtotal ${tituloSeccion.toLowerCase()}: $${fmtMon(subtotal)}`;
    doc.text(stTxt, PAGE_W - M - doc.getTextWidth(stTxt), y);
    y += LINE;

    // separador
    y += 4; doc.setDrawColor(240); doc.line(M, y, PAGE_W - M, y); y += 12;
  };

  drawTabla("Ingresos", ingresos);
  drawTabla("Egresos",  egresos);

  // Cierre con balance
  if (y > PAGE_H - M - LINE) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  const balTxt = `Balance final del periodo: $${fmtMon(balance)}`;
  doc.text(balTxt, PAGE_W - M - doc.getTextWidth(balTxt), y);

  doc.save("reporte_financiero.pdf");
}

// === Fin helpers ===


// === Borrar / Cancelar clases programadas (helpers) ===
// NOTA: Evitamos arrayRemove/increment para compatibilidad; actualizamos arrays manualmente.

// === Datos bancarios para transferencias ===
export const BANK_INFO = {
  alias: "chinapaloschi.canto",
  cbu:   "",
  banco: "Banco Nación",
  titular: "Sandra Paloschi",
};
// App.jsx

// ▼▼▼ PEGÁ ESTA FUNCIÓN AQUÍ ▼▼▼
function playSound(soundFile) {
  try {
    const audio = new Audio(soundFile);
    audio.play();
  } catch (e) {
    console.warn("No se pudo reproducir el sonido:", e);
  }
}
// ▲▲▲ FIN DE LA FUNCIÓN ▲▲▲
export function copyToClipboard(text, label = "Copiado") {
  try {
    navigator.clipboard.writeText(text);
    alert(`${label}: ${text}`);
  } catch {
    alert("No se pudo copiar al portapapeles.");
  }
}






// --- Minimal Update Button (iOS-friendly) ---
