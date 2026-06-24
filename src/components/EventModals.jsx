const playSound = (src) => { try { new Audio(src).play().catch(()=>{}); } catch {} };

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection as fsCollection, doc, getDoc, getDocs, updateDoc, deleteDoc, query, where, onSnapshot, serverTimestamp, runTransaction, addDoc as fsAddDoc , limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { v4 as uuidv4 } from 'uuid';
import { Modal, ModalHeader } from './Modal.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { IconTicket, IconCalendar, IconPlusCircle, IconDownload, IconShare, IconTrash, IconMic, IconEye, IconEyeOff, IconEdit, IconUsers, IconBanknote, IconBan, IconQrCode } from './Icons.jsx';
import { formatMoneyAr } from '../utils/money.js';
import { formatDateToDDMMYYYY } from '../utils/classHelpers.js';
import { ROUTES } from '../constants.js';

const toCsvLine = (arr) => arr.map(v => {
  const s = String(v ?? "").replace(/"/g, '""');
  return `"${s}"`;
}).join(";");

const downloadBlobAs = (filename, blob) => {
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
};

const sendEventReminderPush = async (appId, studentIds, body) => {
  if (!studentIds.length) return 0;
  try {
    const fns = getFunctions();
    const callFn = httpsCallable(fns, 'sendPushNotification');
    const result = await callFn({ studentIds, title: 'Estudio Sandra Paloschi 🎵', body, appId, url: `/#/checkin?a=${appId}` });
    return result.data?.sent || 0;
  } catch (err) { console.error('Push de evento falló:', err); return 0; }
};

export const ManageTicketsModal = ({ isOpen, onClose, db, appId, event, showMessage }) => {
  const [participants, setParticipants] = React.useState([]);
  const [ticketsByStudent, setTicketsByStudent] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const [qrCache, setQrCache] = React.useState({});
  const [activeAccordion, setActiveAccordion] = React.useState(null);

  const getPid = (p) => p?.id ?? p?.studentId ?? null;

  const fmtEventDate = (iso, time) => {
    if (!iso) return "";
    try {
      const d = new Date(`${iso}T00:00:00`);
      const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const dd = dias[d.getDay()];
      const dia = String(d.getDate()).padStart(2, "0");
      const mes = String(d.getMonth() + 1).padStart(2, "0");
      const hhmm = (time || "").slice(0, 5);
      return `${dd} ${dia}/${mes}${hhmm ? ` - ${hhmm} hs` : ""}`;
    } catch { return ""; }
  };
  


const handleShareOrDownload = async (action, ticket, participantName) => {
    setLoading(true);
    try {
      const qrUrl = `${location.origin}/${ROUTES.TICKET}?e=${encodeURIComponent(event.id)}&t=${encodeURIComponent(ticket.id)}&a=${encodeURIComponent(appId)}`;
      const eventInfo = {
        title: ticket.eventTitle,
        subtitle: fmtEventDate(ticket.eventDate, ticket.eventStartTime),
        attendee: participantName,
        ticketNumber: ticket.ticketNumber,
         ticketId: ticket.id

      };

      const composedImageDataUrl = await generateComposedTicketImage(qrUrl, eventInfo, '/logo.png');
      if (!composedImageDataUrl) {
        throw new Error("No se pudo generar la imagen de la entrada.");
      }

      const fileName = `Entrada_${(event.title || 'evento').replace(/\s/g, '_')}_${(participantName || 'participante').replace(/\s/g, '_')}.png`;

      if (action === 'share') {
        const imageFile = await dataUrlToFile(composedImageDataUrl, fileName);
        if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
          await navigator.share({
            title: `Entrada para ${event.title}`,
            text: `Aquí tienes tu entrada para ${event.title}.`,
            files: [imageFile],
          });
        } else {
          await navigator.clipboard.writeText(qrUrl);
          showMessage('Este navegador no permite compartir imágenes. Se copió el enlace de la entrada.', 'info');
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
        console.error(`Error en la acción [${action}]:`, error);
        showMessage(`No se pudo ${action === 'share' ? 'compartir' : 'descargar'} la entrada: ${error.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
};

  React.useEffect(() => {
    if (!isOpen || !db || !appId || !event?.id) return;
    const eventRef = doc(db, `artifacts/${appId}/events/${event.id}`);
    const unsubEvent = onSnapshot(eventRef, (snap) => {
      setParticipants(Array.isArray(snap.data()?.participants) ? snap.data().participants : []);
    });
    const ticketsCol = fsCollection(db, `artifacts/${appId}/events/${event.id}/tickets`);
    const qy = query(ticketsCol, where("status", "in", ["active", "used"]));
    const unsubTickets = onSnapshot(qy, (snap) => {
      const allTickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTicketsByStudent(allTickets.reduce((acc, t) => {
        const studentId = t.assignedTo;
        if (!acc[studentId]) acc[studentId] = [];
        acc[studentId].push(t);
        return acc;
      }, {}));
    });
    return () => { unsubEvent(); unsubTickets(); };
  }, [isOpen, db, appId, event?.id]);
  
  React.useEffect(() => {
    const generatePreviewQRs = async () => {
      const newCache = { ...qrCache };
      for (const t of Object.values(ticketsByStudent).flat()) {
        if (!newCache[t.id]) {
          try {
            const url = `${location.origin}/${ROUTES.TICKET}?e=${encodeURIComponent(event.id)}&t=${encodeURIComponent(t.id)}&a=${encodeURIComponent(appId)}`;
            newCache[t.id] = await generateQrWithLogo(url, '/logo.png', 128);
          } catch (e) { console.error("Error generating preview QR", e); }
        }
      }
      setQrCache(newCache);
    };
    if (Object.keys(ticketsByStudent).length > 0) generatePreviewQRs();
  }, [ticketsByStudent, event?.id, appId]);



const adjustTicketCount = async (participant, amount) => {
    setLoading(true);
    const studentId = getPid(participant);
    const eventRef = doc(db, `artifacts/${appId}/events/${event.id}`);

    try {
        await runTransaction(db, async (transaction) => {
            const eventDoc = await transaction.get(eventRef);
            if (!eventDoc.exists()) throw new Error("El evento no existe.");

            const eventData = eventDoc.data();
            const currentParticipants = eventData.participants || [];
            const pIndex = currentParticipants.findIndex(p => getPid(p) === studentId);
            if (pIndex === -1) throw new Error("Participante no encontrado.");

            if (amount > 0) { // --- AÑADIENDO UNA ENTRADA ---
                const lastIssued = eventData.lastTicketNumberIssued || 0;
                const totalLimit = eventData.totalTickets || 0;
                
                if (totalLimit > 0 && lastIssued >= totalLimit) {
                    throw new Error(`Límite de ${totalLimit} entradas alcanzado.`);
                }
                
                const newTicketNumber = lastIssued + 1;
                alert(`Creando entrada N° ${newTicketNumber}`);
                const ticketRef = doc(fsCollection(db, `artifacts/${appId}/events/${event.id}/tickets`));
                
                const ticketData = {
                    createdAt: serverTimestamp(), status: 'active', eventId: event.id,
                    assignedTo: studentId, assignedToName: participant.name || '',
                    eventTitle: event.title, eventDate: event.date,
                    eventStartTime: event.startTime, eventLocation: event.location,
                    ticketNumber: newTicketNumber, // ✅ NÚMERO ÚNICO ASIGNADO
                };
                transaction.set(ticketRef, ticketData);
                
                const studentTicketRef = doc(db, `artifacts/${appId}/studentTickets/${studentId}/tickets/${ticketRef.id}`);
                transaction.set(studentTicketRef, ticketData);

                const nextParticipants = [...currentParticipants];
                nextParticipants[pIndex].ticketsSold = (nextParticipants[pIndex].ticketsSold || 0) + 1;
                
                transaction.update(eventRef, {
                    participants: nextParticipants,
                    lastTicketNumberIssued: newTicketNumber, // ✅ Actualizamos el contador
                });

            } else { // --- QUITANDO UNA ENTRADA ---
                const q = query(fsCollection(db, `artifacts/${appId}/events/${event.id}/tickets`), where("assignedTo", "==", studentId), where("status", "==", "active"), orderBy("createdAt", "desc"), limit(1));
                const snapshot = await getDocs(q); // getDocs es seguro dentro de transacciones para lecturas
                
                if (snapshot.empty) throw new Error("No hay entradas activas para revocar.");
                
                const ticketToRevokeRef = snapshot.docs[0].ref;
                transaction.delete(ticketToRevokeRef);

                const studentTicketRef = doc(db, `artifacts/${appId}/studentTickets/${studentId}/tickets/${snapshot.docs[0].id}`);
                transaction.delete(studentTicketRef);

                const nextParticipants = [...currentParticipants];
                nextParticipants[pIndex].ticketsSold = Math.max(0, (nextParticipants[pIndex].ticketsSold || 0) - 1);
                
                transaction.update(eventRef, { participants: nextParticipants });
            }
        });
        showMessage(`Ajuste realizado para ${participant.name}.`, 'success');
    } catch (e) {
        console.error("Error ajustando entradas:", e);
        showMessage(`Error: ${e.message}`, 'error');
    } finally {
        setLoading(false);
    }
};

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full">
      <div className="flex flex-col h-[calc(100svh-4rem)]">
        <ModalHeader iconNode={<IconTicket />} title="Gestionar Entradas Vendidas" subtitle={event?.title || ''} />
        <div className="flex-grow overflow-y-auto p-4 sm:p-6 bg-gray-50/50">
          {participants.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No hay participantes.</div>
          ) : (
            <div className="space-y-2">
              {participants.map(p => {
                const studentId = getPid(p);
                const studentTickets = (ticketsByStudent[studentId] || []).sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
                const isExpanded = activeAccordion === studentId;
                return (
                  <div key={studentId} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <button className="w-full flex justify-between items-center p-4 text-left" onClick={() => setActiveAccordion(isExpanded ? null : studentId)}>
                      <span className="font-semibold text-gray-800">{p.name}</span>
                      <span className="text-sm font-medium bg-gray-100 px-2 py-1 rounded-md">{p.ticketsSold || 0} entradas {isExpanded ? '▴' : '▾'}</span>
                    </button>
                    {isExpanded && (
                      <div className="p-4 border-t border-gray-200 bg-gray-50">
                        <div className="flex items-center gap-2 mb-4">
                          <button onClick={() => adjustTicketCount(p, 1)} disabled={loading} className="px-3 py-1.5 text-xs font-semibold bg-green-100 text-green-800 rounded-md border border-green-200 hover:bg-green-200 disabled:opacity-50">+1 Entrada</button>
                          <button onClick={() => adjustTicketCount(p, -1)} disabled={loading || studentTickets.filter(t => t.status === 'active').length === 0} className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-800 rounded-md border border-red-200 hover:bg-red-200 disabled:opacity-50">-1 Entrada</button>
                        </div>
                        {studentTickets.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">No hay entradas generadas.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {studentTickets.map((t, index) => (
                              <div key={t.id} className="bg-white p-3 rounded-lg border text-center flex flex-col shadow-sm">
                                <div className="flex items-center gap-3 text-left mb-3">
                                  <img src="/logo.png" alt="Logo" className="h-10 w-10 rounded-full border p-1" />
                                  <div className="leading-tight">
                                    <p className="font-bold text-gray-800 text-sm">{t.eventTitle}</p>
                                    <p className="text-xs text-gray-500">{fmtEventDate(t.eventDate, t.eventStartTime)}</p>
                                  </div>
                                </div>
                                <div className="flex-grow flex items-center justify-center my-2">
                                    {qrCache[t.id] ? (
                                      <img src={qrCache[t.id]} alt={`QR para ${t.id}`} className="w-32 h-32 rounded-md" />
                                    ) : (
                                      <div className="w-32 h-32 flex items-center justify-center bg-gray-100 text-gray-400 text-xs rounded-md">Generando QR...</div>
                                    )}
                                </div>
                                <div className="flex justify-between items-center mt-3 pt-2 border-t">
                                  <div className="text-xs text-gray-500 font-semibold">
    {t.ticketNumber ? `Entrada N° ${t.ticketNumber}` : `ID: ${t.id.slice(0, 6)}`}
</div>
                                  <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${t.status === 'used' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                    {t.status === 'used' ? 'USADA' : 'ACTIVA'}
                                  </div>
                                </div>
                                <div className="mt-3 pt-3 border-t space-y-2">
                                    <button
                                        onClick={() => handleShareOrDownload('share', t, p.name)}
                                        disabled={loading}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold bg-blue-100 text-blue-800 rounded-md border border-blue-200 hover:bg-blue-200 disabled:opacity-50"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" /></svg>
                                        {loading ? 'Generando...' : 'Compartir'}
                                    </button>
                                    <button
                                        onClick={() => handleShareOrDownload('download', t, p.name)}
                                        disabled={loading}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-800 rounded-md border border-gray-200 hover:bg-gray-200 disabled:opacity-50"
                                    >
                                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                       {loading ? 'Generando...' : 'Descargar'}
                                    </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
// --- Helper Icono Ticket ---


// ▼▼▼ REEMPLAZÁ TU ScanTicketsView ENTERO CON ESTA VERSIÓN ▼▼▼
export const ScanTicketsView = ({ isOpen, onClose, db, appId, event, showMessage }) => {
  const videoRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const lockRef = React.useRef(false);

  const [permission, setPermission] = React.useState('pending');
  const [scanning, setScanning] = React.useState(false);
  const [lastResult, setLastResult] = React.useState(null);
  const [cameraError, setCameraError] = React.useState('');
  
  // ▼ ESTADO PARA GUARDAR LOS TICKETS DEL EVENTO
  const [eventTickets, setEventTickets] = React.useState([]);

  // ▼ EFECTO PARA ESCUCHAR CAMBIOS EN TIEMPO REAL
  React.useEffect(() => {
    if (!isOpen || !db || !appId || !event?.id) {
      setEventTickets([]);
      return;
    }

    const ticketsCol = fsCollection(db, `artifacts/${appId}/events/${event.id}/tickets`);
    const q = query(ticketsCol, where("status", "in", ["active", "used"]));

    const unsub = onSnapshot(q, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => doc.data());
      setEventTickets(ticketsData);
    });

    return () => unsub(); // Se desuscribe al cerrar el modal
  }, [isOpen, db, appId, event?.id]);

  // ▼ CALCULAMOS LOS TOTALES
  const ticketCounts = React.useMemo(() => {
    const used = eventTickets.filter(t => t.status === 'used').length;
    const total = eventTickets.length;
    return { used, total };
  }, [eventTickets]);

  const feedback = (ok) => {
    try {
      if (ok) {
        playSound('/success.mp3');
        if (navigator.vibrate) navigator.vibrate(80);
      } else {
        playSound('/error.mp3');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      }
    } catch (e) {
      console.warn("Feedback (sonido/vibración) falló:", e);
    }
  };

  const parseTicketURL = (url) => {
    try {
      const u = new URL(url);
      const hash = u.hash || '';
      const qIndex = hash.indexOf('?');
      const qs = new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : u.search);
      return { a: qs.get('a'), e: qs.get('e'), t: qs.get('t') };
    } catch {
      return { a: null, e: null, t: null };
    }
  };

  const validateAndUse = async ({ e, t }) => {
    if (e !== event.id) {
      setLastResult({ ok: false, msg: 'ACCESO DENEGADO', detail: 'Ticket de otro evento' });
      feedback(false);
      return;
    }
    const tRef = doc(db, `artifacts/${appId}/events/${e}/tickets/${t}`);
    try {
      let ticketInfoForDisplay = {};
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tRef);
        if (!snap.exists()) throw new Error('El ticket no existe');
        const data = snap.data();
        ticketInfoForDisplay = data;
        if (data.status === 'used') {
          const usedTime = data.usedAt?.toDate ? data.usedAt.toDate().toLocaleTimeString('es-AR') : 'antes';
          throw new Error(`Ticket ya fue usado a las ${usedTime}`);
        }
        if (data.status !== 'active') throw new Error(`El ticket no está activo (estado: ${data.status})`);
        tx.update(tRef, { status: 'used', usedAt: serverTimestamp() });
      });
      setLastResult({
        ok: true,
        msg: 'ACCESO PERMITIDO',
        detail: `${ticketInfoForDisplay.assignedToName || 'Participante'} - N° ${ticketInfoForDisplay.ticketNumber || 'S/N'}`,
      });
      feedback(true);
    } catch (err) {
      setLastResult({ ok: false, msg: 'ACCESO DENEGADO', detail: err.message });
      feedback(false);
    }
  };

  React.useEffect(() => {
    let stream;
    let scriptTag;
    const startCamera = async () => {
      try {
        setCameraError('');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (err) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (finalError) {
          setCameraError(`Error: ${finalError.name} - ${finalError.message}`);
          setPermission('denied');
          return;
        }
      }
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setPermission('granted');
        setScanning(true);
      }
    };
    const initializeScanner = () => {
      if (typeof jsQR !== 'undefined') {
        startCamera();
      } else {
        scriptTag = document.createElement('script');
        scriptTag.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
        scriptTag.async = true;
        scriptTag.onload = startCamera;
        scriptTag.onerror = () => {
          setCameraError("No se pudo cargar la librería del escáner.");
          setPermission('denied');
        };
        document.body.appendChild(scriptTag);
      }
    };
    if (isOpen) {
      lockRef.current = false;
      initializeScanner();
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      setScanning(false);
      setLastResult(null);
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (!scanning || !isOpen || typeof jsQR === 'undefined') return;
    let animationFrameId;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (lockRef.current) {
        animationFrameId = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        if (code) {
          lockRef.current = true;
          const { t, e } = parseTicketURL(code.data);
          await validateAndUse({ t, e });
          setTimeout(() => {
            setLastResult(null); 
            lockRef.current = false;
          }, 2500);
        }
      }
      animationFrameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(animationFrameId);
  }, [scanning, isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="flex flex-col">
        <ModalHeader iconNode={<IconTicket />} title="Escanear Entradas" subtitle={event?.title || ''} />
        <div className="p-4 relative">
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {permission === 'denied' ? (
            <div className="text-center text-red-700 bg-red-50 p-4 rounded-lg">
              <p className="font-semibold">No se pudo acceder a la cámara.</p>
              <p className="text-xs mt-1">{cameraError}</p>
            </div>
          ) : (
            <div className="relative w-full max-w-md mx-auto aspect-square bg-gray-900 rounded-xl overflow-hidden shadow-lg">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              <div className="absolute inset-0 border-8 border-white/20 rounded-xl pointer-events-none"></div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-[80%] h-[50%]">
                  <div className="absolute inset-0 border-2 border-white/60 rounded-lg shadow-lg"></div>
                  {scanning && <div className="scanner-line"></div>}
                </div>
              </div>
              {lastResult && (
                <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white transition-opacity duration-300 ${lastResult.ok ? 'bg-green-600/90' : 'bg-red-600/90'}`}>
                  <h3 className="text-4xl font-extrabold drop-shadow-md">{lastResult.msg}</h3>
                  <p className="mt-2 text-lg drop-shadow">{lastResult.detail}</p>
                </div>
              )}
            </div>
          )}
          
          {/* ▼ NUEVO BLOQUE DE CONTADORES ▼ */}
          <div className="mt-4 grid grid-cols-2 gap-4 text-center">
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl">
              <p className="text-xs font-semibold text-blue-800 uppercase">Entradas Aceptadas</p>
              <p className="text-3xl font-bold text-blue-900 tabular-nums">{ticketCounts.used}</p>
            </div>
            <div className="bg-gray-100 border border-gray-200 p-3 rounded-xl">
              <p className="text-xs font-semibold text-gray-600 uppercase">Total Vendidas</p>
              <p className="text-3xl font-bold text-gray-900 tabular-nums">{ticketCounts.total}</p>
            </div>
          </div>
          {/* ▲ FIN DEL NUEVO BLOQUE ▲ */}

        </div>
      </div>
    </Modal>
  );
};


const _safeToCSV = function(arr) {
    return arr.map(function(v) {
        return '"' + String(v || "").replace(/"/g, '""') + '"';
    }).join(";");
};

const _safeDownload = function(filename, content) {
    try {
        // Usa BOM para que Excel reconozca acentos
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, content], { type: 'text/csv;charset=utf-8' });
        
        // Método compatible con varios navegadores
        if (navigator.msSaveBlob) { // IE 10+
            navigator.msSaveBlob(blob, filename);
        } else {
            const url = (window.URL || window.webkitURL).createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(function() {
                document.body.removeChild(link);
                (window.URL || window.webkitURL).revokeObjectURL(url);
            }, 1000);
        }
    } catch (e) {
        console.error("Error fatal en descarga:", e);
        alert("Tu navegador bloqueó la descarga. Intenta con otro navegador.");
    }
};

// ▼▼▼ VERSIÓN FINAL BLINDADA DE EventsListModal ▼▼▼
export const EventsListModal = ({ isOpen, onClose, events = [], onCreate, onSelect, onEdit, onDelete, db, appId }) => {
  const [queryText, setQueryText] = React.useState('');
  const [scope, setScope] = React.useState('upcoming');
  const [exportingId, setExportingId] = React.useState(null);
  const todayStr = new Date().toISOString().slice(0, 10);

  React.useEffect(() => { if (!isOpen) setQueryText(''); }, [isOpen]);

  const fmtDate = (yyyy_mm_dd, hhmm) => {
    if (!yyyy_mm_dd) return '';
    try {
      const [y, m, d] = (yyyy_mm_dd || '').split('-');
      return `${d}/${m}/${y}${hhmm ? ` · ${hhmm} hs` : ''}`;
    } catch { return yyyy_mm_dd; }
  };

  // --- LÓGICA DE EXPORTACIÓN 100% INTEGRADA ---
  const handleExportUsed = async (event) => {
    if (!db || !appId) { alert("Error de conexión."); return; }
    setExportingId(event.id);
    try {
      // 1. Obtener datos
      const q = query(fsCollection(db, `artifacts/${appId}/events/${event.id}/tickets`), where("status", "==", "used"));
      const snap = await getDocs(q);
      if (snap.empty) { alert("No hay asistentes escaneados para este evento."); return; }

      const list = snap.docs.map(d => d.data()).sort((a, b) => (a.ticketNumber||0) - (b.ticketNumber||0));

      // 2. Generar contenido CSV línea por línea manualmente
      let csvContent = "\uFEFF"; // BOM para que Excel reconozca acentos
      csvContent += '"Nro Entrada";"Asistente";"Hora Escaneo"\n'; // Encabezado

      list.forEach(t => {
          // Formatear hora
          let timeStr = "-";
          if (t.usedAt?.toDate) timeStr = t.usedAt.toDate().toLocaleString('es-AR');
          else if (t.usedAt?.seconds) timeStr = new Date(t.usedAt.seconds * 1000).toLocaleString('es-AR');

          // Escapar comillas dobles en los datos por seguridad
          const col1 = String(t.ticketNumber || "—").replace(/"/g, '""');
          const col2 = String(t.assignedToName || t.buyerName || "(Sin nombre)").replace(/"/g, '""');
          const col3 = String(timeStr).replace(/"/g, '""');

          csvContent += `"${col1}";"${col2}";"${col3}"\n`;
      });

      // 3. Forzar descarga en el navegador
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `asistentes_${(event.title||"evento").replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

    } catch (e) {
        console.error(e);
        alert(`Error al exportar: ${e.message}`);
    } finally {
        setExportingId(null);
    }
  };
  // ------------------------------------------------

  const filtered = React.useMemo(() => {
    let list = Array.isArray(events) ? [...events] : [];
    if (scope === 'upcoming') list = list.filter(ev => (ev.date || '') >= todayStr);
    if (scope === 'past') list = list.filter(ev => (ev.date || '') < todayStr);
    const q = (queryText || '').toLowerCase();
    if (q) {
      list = list.filter(ev => {
        const inTitle = (ev.title || '').toLowerCase().includes(q);
        const inPeople = (ev.participants || []).some(p => (p?.name || p?.studentName || '').toLowerCase().includes(q));
        return inTitle || inPeople;
      });
    }
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (scope === 'upcoming') list.reverse();
    return list;
  }, [events, queryText, scope, todayStr]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="flex flex-col h-full">
        <ModalHeader iconNode={<IconMic />} title="Muestras" subtitle="Gestioná presentaciones, entradas y participantes" />
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm">🔎</span>
              <input type="text" value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Buscar por título o participante..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-300 transition" />
            </div>
            <button onClick={onCreate} className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-sm transition flex items-center justify-center gap-2">
              <IconPlusCircle /> Crear muestra
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setScope('upcoming')} className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${scope === 'upcoming' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Próximas</button>
            <button onClick={() => setScope('past')} className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${scope === 'past' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Pasadas</button>
            <button onClick={() => setScope('all')} className={`px-3 py-1.5 text-xs font-bold rounded-full transition ${scope === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Todas</button>
            <span className="ml-auto text-[11px] font-semibold text-gray-400">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="flex-grow overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
              <div className="text-3xl mb-2">🎤</div>
              <p className="font-bold text-gray-700 text-sm">No hay muestras que coincidan</p>
              <p className="text-xs text-gray-400 mt-1">Probá cambiando el filtro de arriba o creá una nueva con "Crear muestra".</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map(ev => {
                const isPast = (ev.date || '') < todayStr;
                const participants = Array.isArray(ev.participants) ? ev.participants : [];
                const soldCount = participants.reduce((acc, p) => acc + (Number(p?.ticketsSold) || 0), 0);
                const revenue = soldCount * (Number(ev.price) || 0);
                return (
                  <li key={ev.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition">
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-gray-900">{ev.title || 'Sin título'}</h3>
                            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${isPast ? 'bg-gray-100 text-gray-400' : 'bg-emerald-50 text-emerald-600'}`}>
                              {isPast ? 'Finalizada' : 'Próxima'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">📅 {fmtDate(ev.date, ev.startTime)}{ev.location ? ` · 📍 ${ev.location}` : ''}</p>
                          {participants.length > 0 && (
                            <p className="text-xs text-gray-400 mt-1.5 truncate">
                              👥 {participants.map(p => p?.name || p?.studentName).filter(Boolean).join(', ')}
                            </p>
                          )}
                        </div>
                        <button onClick={() => onSelect(ev)} className="sm:hidden flex-shrink-0 px-3 py-1.5 text-xs font-bold bg-gray-900 text-white rounded-lg">Ver</button>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="inline-flex items-center gap-1 font-bold text-gray-600 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
                          👤 {participants.length} participante{participants.length !== 1 ? 's' : ''}
                        </span>
                        {Number(ev.totalTickets) > 0 && (
                          <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                            🎟️ {soldCount}/{ev.totalTickets} entradas vendidas
                          </span>
                        )}
                        {revenue > 0 && (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                            💰 {formatMoneyAr(revenue)} recaudados
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-50">
                        <button
                          onClick={() => handleExportUsed(ev)}
                          disabled={exportingId === ev.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-green-50 text-green-700 rounded-lg hover:bg-green-100 border border-green-100 disabled:opacity-50 transition"
                          title="Descargar lista de presentes"
                        >
                          {exportingId === ev.id
                            ? <div className="w-3 h-3 border-2 border-green-300 border-t-green-600 rounded-full animate-spin" />
                            : <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>}
                          Asistentes
                        </button>
                        <div className="flex-grow" />
                        <button onClick={() => onEdit(ev)} title="Editar muestra"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition">
                          <IconEdit />
                        </button>
                        <button onClick={() => onDelete(ev)} title="Eliminar muestra"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                          <IconTrash />
                        </button>
                        <button onClick={() => onSelect(ev)} className="hidden sm:flex px-4 py-1.5 text-xs font-bold bg-gray-900 text-white rounded-lg hover:bg-black transition items-center gap-1.5">
                          Ver detalles →
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
};
export const StudentTicketsViewerModal = ({ isOpen, onClose, student, event, db, appId, showMessage }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fmtDate = (iso, time) => {
    if (!iso) return "";
    try {
      const d = new Date(`${iso}T00:00:00`);
      const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const dd = dias[d.getDay()];
      const dia = String(d.getDate()).padStart(2, "0");
      const mes = String(d.getMonth() + 1).padStart(2, "0");
      const hhmm = (time || "").slice(0, 5);
      return `${dd} ${dia}/${mes}${hhmm ? ` - ${hhmm} hs` : ""}`;
    } catch { return ""; }
  };
  
  useEffect(() => {
    if (!isOpen || !db || !appId || !event?.id || !student?.id) {
      setTickets([]);
      return;
    }
    setLoading(true);
    // Solo mostramos entradas activas o usadas, no las revokadas/borradas
    const ticketsCol = fsCollection(db, `artifacts/${appId}/events/${event.id}/tickets`);
    const qy = query(ticketsCol, where("assignedTo", "==", student.id), where("status", "in", ["active", "used"]));
    
    const unsub = onSnapshot(qy, (snap) => {
      const allTickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      allTickets.sort((a,b) => (a.ticketNumber || 0) - (b.ticketNumber || 0));
      setTickets(allTickets);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching student tickets:", error);
      showMessage("No se pudieron cargar las entradas.", "error");
      setLoading(false);
    });

    return () => unsub();
  }, [isOpen, db, appId, event?.id, student?.id]);

  const handleShareOrDownload = async (action, ticket, participantName) => {
    setActionLoading(true);
    try {
      const qrUrl = `${location.origin}/${ROUTES.TICKET}?e=${encodeURIComponent(event.id)}&t=${encodeURIComponent(ticket.id)}&a=${encodeURIComponent(appId)}`;
      const eventInfo = {
        title: ticket.eventTitle,
        subtitle: fmtDate(ticket.eventDate, ticket.eventStartTime),
        attendee: participantName,
        ticketNumber: ticket.ticketNumber,
        ticketId: ticket.id
      };

      const composedImageDataUrl = await generateComposedTicketImage(qrUrl, eventInfo, '/logo.png');
      if (!composedImageDataUrl) throw new Error("No se pudo generar la imagen de la entrada.");

      const fileName = `Entrada_${(event.title || 'evento').replace(/\s/g, '_')}_${(participantName || 'participante').replace(/\s/g, '_')}_N${ticket.ticketNumber}.png`;

      if (action === 'share') {
        const imageFile = await dataUrlToFile(composedImageDataUrl, fileName);
        if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
          await navigator.share({
            title: `Entrada para ${event.title}`,
            text: `Aquí tienes tu entrada para ${event.title}.`,
            files: [imageFile],
          });
        } else {
          alert('Este navegador no permite compartir imágenes. Intenta descargarla.');
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
        showMessage(`No se pudo ${action === 'share' ? 'compartir' : 'descargar'} la entrada: ${error.message}`, 'error');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // ▼▼▼ NUEVA FUNCIÓN PARA ELIMINAR ENTRADA INDIVIDUAL ▼▼▼
  const handleDeleteTicket = async (ticketId, ticketNumber) => {
    if (!window.confirm(`¿Estás seguro de ELIMINAR la entrada N° ${ticketNumber}? Esta acción no se puede deshacer.`)) return;
    
    setActionLoading(true);
    try {
        await runTransaction(db, async (transaction) => {
            // 1. Obtener evento para actualizar contador
            const eventRef = doc(db, `artifacts/${appId}/events/${event.id}`);
            const eventDoc = await transaction.get(eventRef);
            if (!eventDoc.exists()) throw new Error("Evento no encontrado.");
            
            // 2. Identificar participante y restar 1 a su cantidad vendida
            const participants = eventDoc.data().participants || [];
            const pIdx = participants.findIndex(p => (p.id || p.studentId) === student.id);
            
            if (pIdx >= 0) {
                const p = participants[pIdx];
                // Restamos 1, asegurando que no baje de 0
                participants[pIdx] = { ...p, ticketsSold: Math.max(0, (p.ticketsSold || 0) - 1) };
                transaction.update(eventRef, { participants });
            }

            // 3. Eliminar el documento de la entrada (de ambas ubicaciones si existen)
            const ticketRef = doc(db, `artifacts/${appId}/events/${event.id}/tickets/${ticketId}`);
            transaction.delete(ticketRef);
            
            const studentTicketRef = doc(db, `artifacts/${appId}/studentTickets/${student.id}/tickets/${ticketId}`);
            transaction.delete(studentTicketRef);
        });
        showMessage("Entrada eliminada correctamente.", "success");
    } catch (e) {
        console.error("Error deleting ticket:", e);
        showMessage(`No se pudo eliminar: ${e.message}`, "error");
    } finally {
        setActionLoading(false);
    }
  };
  // ▲▲▲ FIN NUEVA FUNCIÓN ▲▲▲
  
  const StatusBadge = ({ status }) => {
    const s = String(status || 'active').toLowerCase();
    const config = {
      active: { label: 'Activa', color: 'bg-green-100 text-green-800 border-green-200' },
      used: { label: 'Usada', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    };
    const { label, color } = config[s] || { label: s, color: 'bg-gray-100 text-gray-800 border-gray-200'};
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>{label}</span>;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="flex flex-col h-[calc(100svh-4rem)] sm:max-h-[80vh]">
        <ModalHeader iconNode={<IconTicket />} title={`Entradas de ${student?.name || '...'}`} subtitle={event?.title || ''} />
        <div className="flex-grow overflow-y-auto p-4 bg-gray-50/50">
          {loading ? (
            <p className="text-center text-gray-500">Cargando entradas...</p>
          ) : tickets.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Este alumno no tiene entradas activas para este evento.</p>
          ) : (
            <ul className="space-y-3">
              {tickets.map(ticket => (
                <li key={ticket.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                           <span className="font-bold text-gray-800">Entrada N° {ticket.ticketNumber || 'S/N'}</span>
                           <StatusBadge status={ticket.status} />
                        </div>
                        <p className="text-xs text-gray-500 font-mono mt-1">ID: {ticket.id}</p>
                      </div>
                      {/* BOTÓN ELIMINAR */}
                      <button 
                        onClick={() => handleDeleteTicket(ticket.id, ticket.ticketNumber)} 
                        disabled={actionLoading}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        title="Eliminar esta entrada"
                      >
                        <IconTrash />
                      </button>
                  </div>
                  
                  <div className="flex items-center gap-2 self-end sm:self-start">
                    <button onClick={() => handleShareOrDownload('download', ticket, student?.name)} disabled={actionLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-800 rounded-md border border-gray-200 hover:bg-gray-200 disabled:opacity-50">
                      <IconDownload /> Descargar
                    </button>
                    <button onClick={() => handleShareOrDownload('share', ticket, student?.name)} disabled={actionLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-100 text-blue-800 rounded-md border border-blue-200 hover:bg-blue-200 disabled:opacity-50">
                      <IconShare /> Compartir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
};
// ▲▲▲ FIN DEL COMPONENTE REEMPLAZADO ▲▲▲
export const EventDetailModal = ({ isOpen, onClose, event, db, appId, showMessage, students = [] }) => {
  const [localEvent, setLocalEvent] = React.useState(event || null);
  const [saving, setSaving] = React.useState(false);
  const [showManageTickets, setShowManageTickets] = React.useState(false);
  const [showScanQR, setShowScanQR] = React.useState(false);
  const [studentForTickets, setStudentForTickets] = React.useState(null);

  const [selectedStudentId, setSelectedStudentId] = React.useState('');
  const [externalParticipantName, setExternalParticipantName] = React.useState('');
  const [participantSearch, setParticipantSearch] = React.useState('');
  const [reminding, setReminding] = React.useState(false);

  const toggleTicketsVisibility = async (participantIndex) => {
    const participants = localEvent?.participants || [];
    const participant = participants[participantIndex];
    if (!participant) return;
    const nextParticipants = participants.map((p, i) => i === participantIndex ? { ...p, ticketsVisible: !p.ticketsVisible } : p);
    await updateEvent({ participants: nextParticipants });
  };

  React.useEffect(() => { setLocalEvent(event || null); }, [event]);

  const fmtDate = (yyyy_mm_dd) => {
    if (!yyyy_mm_dd) return '';
    try { const [y,m,d] = (yyyy_mm_dd || '').split('-'); return `${d}/${m}/${y}`; } catch { return yyyy_mm_dd; }
  };
  const clamp = (min, val, max) => Math.max(min, Math.min(Number(val || 0), max));
  const fmtMoney = (n) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const getPid = (p) => p?.id ?? p?.studentId ?? null;
  const getPname = (p) => p?.name ?? p?.studentName ?? 'Sin nombre';

  const updateEvent = async (patch) => {
    if (!db || !appId || !localEvent?.id) return;
    setSaving(true);
    try {
      const ref = doc(db, `artifacts/${appId}/events/${localEvent.id}`);
      await updateDoc(ref, patch);
      setLocalEvent(prev => ({ ...prev, ...patch }));
      showMessage && showMessage('Guardado', 'success');
    } catch (e) {
      console.error(e); showMessage && showMessage(`Error: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const participants = Array.isArray(localEvent?.participants) ? localEvent?.participants : [];
  const sortedParticipants = React.useMemo(() => {
    return [...participants]
      .map((p, originalIndex) => ({ ...p, originalIndex }))
      .sort((a, b) => getPname(a).localeCompare(getPname(b), 'es', { sensitivity: 'base' }));
  }, [participants]);
  
  const price = Number((localEvent?.price) || 0);
  const expenses = Array.isArray(localEvent?.expenses) ? localEvent?.expenses : [];
  const totalTickets = Number((localEvent?.totalTickets) || 0);

  const totals = React.useMemo(() => {
    const totalDelivered = participants.reduce((a,p)=> a + Number(p.ticketsDelivered || 0), 0);
    const totalSold = participants.reduce((a,p)=> a + Number(p.ticketsSold || 0), 0);
    const gross = totalSold * price;
    const totalExpenses = expenses.reduce((a,e)=> a + Number(e.amount || 0), 0);
    const net = gross - totalExpenses;
    const unassigned = Math.max(0, Number(totalTickets || 0) - totalDelivered);
    return { totalDelivered, totalSold, remaining: totalDelivered - totalSold, gross, totalExpenses, net, unassigned };
  }, [participants, price, expenses, totalTickets]);
  
  const [postingNet, setPostingNet] = React.useState(false);
  const postNetToFinance = async () => {
    if (!db) return;
    const net = Number(totals?.net || 0);
    if (net === 0) { showMessage && showMessage('El resultado neto es cero.', 'info'); return; }
    
    setPostingNet(true);
    try {
      const description = `Resultado neto evento: ${localEvent?.title || 'Evento'} (${fmtDate(localEvent.date)})`;
      const collectionName = net > 0 ? 'extraIncomes' : 'expenses';
      const amount = net > 0 ? net : Math.abs(net);
      
      await fsAddDoc(fsCollection(db, `artifacts/${appId}/${collectionName}`), {
        date: new Date(), description, amount, category: 'Eventos', recordedAt: serverTimestamp(),
        source: 'event_net_profit', eventId: localEvent.id
      });
      showMessage('Resultado neto registrado en Finanzas.', 'success');
    } catch (e) {
      console.error("Error registrando resultado neto:", e);
      showMessage(`Error: ${e.message}`, 'error');
    } finally {
      setPostingNet(false);
    }
  };

  const [newExpense, setNewExpense] = React.useState({ concept: '', amount: '' });

  const mutateParticipant = async (index, mutator) => {
    const next = participants.map((p,i)=> i===index ? mutator({...p}) : p);
    await updateEvent({ participants: next });
  };

  const handleDeliveredInput = (idx, val) => mutateParticipant(idx, p => ({...p, ticketsDelivered: clamp(0, val, 9999), ticketsSold: Math.min(Number(p.ticketsSold || 0), clamp(0, val, 9999))}));
  const togglePaid = (idx) => mutateParticipant(idx, p => ({ ...p, paid: !p.paid }));

  const handleSoldInput = async (idx, newSoldValue) => {
      const participant = participants[idx];
      if (!participant || saving) return;
      setSaving(true);
      const oldSoldCount = Number(participant.ticketsSold || 0);
      const newSoldCount = clamp(0, newSoldValue, participant.ticketsDelivered || 0);
      const studentId = getPid(participant);
      const studentName = getPname(participant);
      const isExternal = !!participant.isExternal;
      const diff = newSoldCount - oldSoldCount;

      if (diff === 0) { setSaving(false); return; }

      const eventRef = doc(db, `artifacts/${appId}/events/${event.id}`);
      try {
          await runTransaction(db, async (transaction) => {
              const eventDoc = await transaction.get(eventRef);
              if (!eventDoc.exists()) throw new Error("El evento no existe.");
              const eventData = eventDoc.data();
              let lastIssued = eventData.lastTicketNumberIssued || 0;

              if (diff > 0) {
                  const totalLimit = eventData.totalTickets || 0;
                  if (totalLimit > 0 && (lastIssued + diff) > totalLimit) {
                      throw new Error(`No se pueden generar ${diff} entradas. Superaría el límite de ${totalLimit}.`);
                  }
                  for (let i = 0; i < diff; i++) {
                      const newTicketNumber = lastIssued + 1;
                      const ticketRef = doc(fsCollection(db, `artifacts/${appId}/events/${event.id}/tickets`));
                      const ticketData = { createdAt: serverTimestamp(), status: 'active', eventId: event.id, assignedTo: studentId, assignedToName: studentName, eventTitle: event.title, eventDate: event.date, eventStartTime: event.startTime, eventLocation: event.location, ticketNumber: newTicketNumber };
                      transaction.set(ticketRef, ticketData);
                      if (!isExternal && studentId) {
                        const studentTicketRef = doc(db, `artifacts/${appId}/studentTickets/${studentId}/tickets/${ticketRef.id}`);
                        transaction.set(studentTicketRef, ticketData);
                      }
                      lastIssued++;
                  }
              } else if (diff < 0) {
                  const ticketsToDelete = Math.abs(diff);
                  const q = query( fsCollection(db, `artifacts/${appId}/events/${event.id}/tickets`), where("assignedTo", "==", studentId), where("status", "==", "active"), limit(ticketsToDelete) );
                  const snapshot = await getDocs(q);
                  if (snapshot.size < ticketsToDelete) throw new Error(`No hay suficientes entradas activas para eliminar.`);
                  snapshot.forEach(ticketDoc => {
                      transaction.delete(ticketDoc.ref);
                      if (!isExternal && studentId) {
                        const studentTicketRef = doc(db, `artifacts/${appId}/studentTickets/${studentId}/tickets/${ticketDoc.id}`);
                        transaction.delete(studentTicketRef);
                      }
                  });
              }
              const nextParticipants = [...participants];
              nextParticipants[idx] = { ...participant, ticketsSold: newSoldCount };
              const updatePayload = { participants: nextParticipants };
              if (diff > 0) updatePayload.lastTicketNumberIssued = lastIssued;
              transaction.update(eventRef, updatePayload);
          });
          const nextParticipantsState = [...participants];
          nextParticipantsState[idx] = { ...participant, ticketsSold: newSoldCount };
          setLocalEvent(prev => ({...prev, participants: nextParticipantsState}));
          showMessage(`Se ${diff > 0 ? 'generaron' : 'eliminaron'} ${Math.abs(diff)} entrada(s) para ${studentName}.`, 'success');
      } catch (e) {
          console.error("Error al actualizar entradas:", e);
          showMessage(`Error: ${e.message}`, 'error');
      } finally {
          setSaving(false);
      }
  };

  const addParticipantById = async () => {
    const id = selectedStudentId; if (!id) return;
    const studentToAdd = (students || []).find(s => s.id === id); if (!studentToAdd) return;
    if (participants.some(p => getPid(p) === id)) return;
    const newParticipant = { id: studentToAdd.id, name: studentToAdd.name || studentToAdd.fullName, ticketsDelivered: 0, ticketsSold: 0, paid: false };
    await updateEvent({ participants: [...participants, newParticipant] });
    setSelectedStudentId('');
  };

  // ▼ AÑADIDO: Nueva función para añadir participantes externos
  const addExternalParticipant = async () => {
    const name = (externalParticipantName || '').trim();
    if (!name) {
      showMessage && showMessage('El nombre del participante externo no puede estar vacío.', 'error');
      return;
    }
    if (participants.some(p => getPname(p).toLowerCase() === name.toLowerCase())) {
      showMessage && showMessage('Ya existe un participante con ese nombre en el evento.', 'error');
      return;
    }
    const newParticipant = {
      id: `ext_${uuidv4()}`, // ID único con prefijo "ext_"
      name: name,
      ticketsDelivered: 0,
      ticketsSold: 0,
      paid: false,
      isExternal: true // Bandera para identificar que no es un alumno
    };
    await updateEvent({ participants: [...participants, newParticipant] });
    setExternalParticipantName(''); // Limpiar el campo de texto
  };


  const removeParticipant = async (idx) => {
    const participant = participants[idx];
    if (!participant) return;
    const name = getPname(participant);
    const soldCount = Number(participant.ticketsSold || 0);
    const studentId = getPid(participant);

    if (soldCount > 0) {
      if (!window.confirm(`${name} tiene ${soldCount} entrada(s) vendida(s). Si lo quitás, esas entradas se anularán. ¿Continuar?`)) return;
    } else if (!window.confirm(`¿Quitar a ${name} del evento?`)) {
      return;
    }

    setSaving(true);
    try {
      if (soldCount > 0 && studentId) {
        const isExternal = !!participant.isExternal;
        const q = query(fsCollection(db, `artifacts/${appId}/events/${localEvent.id}/tickets`), where("assignedTo", "==", studentId), where("status", "==", "active"));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(async (ticketDoc) => {
          await updateDoc(ticketDoc.ref, { status: 'cancelled' });
          if (!isExternal) {
            try { await updateDoc(doc(db, `artifacts/${appId}/studentTickets/${studentId}/tickets/${ticketDoc.id}`), { status: 'cancelled' }); } catch {}
          }
        }));
      }
      await updateDoc(doc(db, `artifacts/${appId}/events/${localEvent.id}`), { participants: participants.filter((_, i) => i !== idx) });
      setLocalEvent(prev => ({ ...prev, participants: participants.filter((_, i) => i !== idx) }));
      showMessage && showMessage(`${name} fue quitado del evento${soldCount > 0 ? ' y sus entradas se anularon' : ''}.`, 'success');
    } catch (e) {
      console.error('Error quitando participante:', e);
      showMessage && showMessage(`Error: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemindUnpaid = async () => {
    const unpaid = participants.filter(p => !p.isExternal && Number(p.ticketsSold || 0) > 0 && !p.paid);
    const ids = unpaid.map(p => getPid(p)).filter(Boolean);
    if (!ids.length) { showMessage && showMessage('No hay alumnos con entradas vendidas pendientes de pago.', 'info'); return; }
    setReminding(true);
    try {
      const sent = await sendEventReminderPush(appId, ids, `Recordatorio: tenés entradas pendientes de pago para "${localEvent?.title || 'la muestra'}". ¡Te esperamos! 🎤`);
      showMessage && showMessage(`Recordatorio enviado a ${sent} alumno(s).`, 'success');
    } finally {
      setReminding(false);
    }
  };

  const addExpense = async () => {
    const concept = (newExpense.concept || '').trim();
    const amount = Number(newExpense.amount);
    if (!concept || isNaN(amount) || amount <= 0) return;
    const next = [...expenses, { concept, amount }];
    await updateEvent({ expenses: next });
    setNewExpense({ concept:'', amount:'' });
  };
  
  const removeExpense = async (i) => {
    const next = expenses.filter((_,idx)=> idx!==i);
    await updateEvent({ expenses: next });
  };
const handleExportTicketsCSV = async () => {
    if (!db || !appId || !localEvent?.id) return;
    setSaving(true);
    try {
      const col = fsCollection(db, `artifacts/${appId}/events/${localEvent.id}/tickets`);
      const q = query(col, where("status", "in", ["active", "used"]));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        showMessage && showMessage("No hay entradas para exportar.", "info");
        return;
      }
      
      const list = snap.docs.map(d => d.data());
      list.sort((a,b) => (a.ticketNumber||0) - (b.ticketNumber||0));
      
      const lines = [toCsvLine(["Nro Entrada", "Asignada a", "Estado"])];
      list.forEach(t => {
        lines.push(toCsvLine([
          t.ticketNumber || "—",
          t.assignedToName || "(Sin nombre)",
          t.status === 'used' ? 'USADA' : 'ACTIVA'
        ]));
      });
      
      const fileName = `entradas_${(localEvent.title||"evento").replace(/\s+/g,"_")}.csv`;
      downloadBlobAs(fileName, new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8"}));
      
    } catch(e) {
      console.error(e);
      showMessage && showMessage("Error al exportar.", "error");
    } finally {
      setSaving(false);
    }
  };
  const { title, date, startTime, location } = localEvent || {};
  const todayStr = new Date().toISOString().slice(0, 10);
  const isPast = (date || '') < todayStr;
  const initials = (name) => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  };
  const filteredParticipants = sortedParticipants.filter(p => getPname(p).toLowerCase().includes(participantSearch.trim().toLowerCase()));
  const unpaidCount = participants.filter(p => !p.isExternal && Number(p.ticketsSold || 0) > 0 && !p.paid).length;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="full" footer={<></>}>
        <div className="flex flex-col h-[calc(100svh-4rem)] sm:max-h-[80vh]">
          <ModalHeader iconNode={<IconMic />} title="Detalles de la muestra" subtitle={`${title || ''} • ${fmtDate(date)} ${startTime || ''}`} />
          <div className="p-3 border-b border-gray-100 bg-white/95 backdrop-blur sticky top-[calc(env(safe-area-inset-top)+65px)] z-10 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${isPast ? 'bg-gray-100 text-gray-400' : 'bg-emerald-50 text-emerald-600'}`}>
                  {isPast ? 'Finalizada' : 'Próxima'}
                </span>
                {location ? <span className="text-xs text-gray-500">📍 {location}</span> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={()=> setShowManageTickets(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-sm transition">
                  <IconTicket /> Gestionar Entradas
                </button>
                <button onClick={()=> setShowScanQR(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-white bg-gray-900 hover:bg-black shadow-sm transition">
                  <IconQrCode /> Escanear
                </button>
                <button onClick={handleExportTicketsCSV} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 disabled:opacity-50 transition">
                  <IconDownload /> Exportar Excel
                </button>
              </div>
          </div>

          <div className="flex-grow overflow-y-auto p-4 sm:p-6 bg-gray-50/50 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Vendidas</p>
                <p className="text-lg font-extrabold text-gray-900 mt-0.5">{totals.totalSold}<span className="text-xs font-semibold text-gray-400">/{totalTickets}</span></p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Sin asignar</p>
                <p className={`text-lg font-extrabold mt-0.5 ${totals.unassigned > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{totals.unassigned}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Recaudado</p>
                <p className="text-lg font-extrabold text-emerald-600 mt-0.5">{formatMoneyAr(totals.gross)}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Resultado neto</p>
                <p className={`text-lg font-extrabold mt-0.5 ${totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoneyAr(totals.net)}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Configuración</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { const v = Number(localEvent?.price ?? 0); if (v !== Number(event?.price ?? 0)) updateEvent({ price: v }); } }}>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Precio de entrada (ARS)</label>
                        <MoneyInput id="price" value={price} onValueChange={(v) => setLocalEvent(ev => ({...ev, price:v}))} className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-100 focus:border-rose-300 transition" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Entradas totales</label>
                        <input type="number" min="0" value={totalTickets} onChange={(e) => setLocalEvent(ev => ({...ev, totalTickets: Number(e.target.value)}))} onBlur={() => { const v = Number(localEvent?.totalTickets ?? 0); if (v !== Number(event?.totalTickets ?? 0)) updateEvent({ totalTickets: v }); }} className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-100 focus:border-rose-300 transition" />
                    </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">Los cambios se guardan automáticamente al salir del campo.</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Añadir participantes</p>
                <div className="flex flex-col sm:flex-row sm:items-end gap-2 mb-3">
                  <div className="flex-grow">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Alumno existente</label>
                    <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-300 transition">
                      <option value="">Seleccionar...</option>
                      {(students || []).filter(s => !participants.some(p => getPid(p) === s.id)).map(s => (<option key={s.id} value={s.id}>{s.name || s.fullName}</option>))}
                    </select>
                  </div>
                  <button onClick={addParticipantById} disabled={!selectedStudentId} className="px-4 py-2.5 text-xs font-bold text-white rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-sm disabled:opacity-50 transition">+ Añadir alumno</button>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-grow">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Participante externo (no alumno)</label>
                    <input
                      type="text"
                      placeholder="Nombre y apellido..."
                      value={externalParticipantName}
                      onChange={(e) => setExternalParticipantName(e.target.value)}
                      className="w-full p-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-rose-100 focus:border-rose-300 transition"
                    />
                  </div>
                  <button onClick={addExternalParticipant} disabled={!externalParticipantName.trim()} className="px-4 py-2.5 text-xs font-bold text-gray-700 rounded-xl bg-gray-100 hover:bg-gray-200 border border-gray-200 disabled:opacity-50 transition">+ Añadir externo</button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Participantes ({participants.length})</p>
                  {unpaidCount > 0 && (
                    <button onClick={handleRemindUnpaid} disabled={reminding} className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-100 rounded-full disabled:opacity-50 transition">
                      {reminding ? 'Enviando…' : `🔔 Recordar pago a ${unpaidCount} alumno${unpaidCount !== 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
                {participants.length > 0 && (
                  <input
                    type="search" value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)}
                    placeholder="🔎 Buscar participante..."
                    className="w-full p-2.5 mb-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 transition"
                  />
                )}
                {participants.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-6">Todavía no hay participantes. Añadí alumnos o externos arriba.</p>
                ) : filteredParticipants.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-6">No se encontraron participantes con ese nombre.</p>
                ) : (
                  <ul className="space-y-2">
                    {filteredParticipants.map((p) => (
                      <li key={getPid(p) || p.originalIndex} className="border border-gray-100 rounded-xl p-3">
                        <div className="flex items-start gap-3">
                          <span className={`w-9 h-9 rounded-full text-white text-xs font-black flex items-center justify-center flex-shrink-0 ${p.isExternal ? 'bg-gradient-to-br from-gray-400 to-gray-500' : 'bg-gradient-to-br from-amber-400 to-rose-400'}`}>
                            {initials(getPname(p))}
                          </span>
                          <div className="min-w-0 flex-grow">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-800 truncate">{getPname(p)}</span>
                              {p.isExternal ? (
                                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Externo</span>
                              ) : (
                                <button onClick={() => togglePaid(p.originalIndex)} className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full transition ${p.paid ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}>
                                  {p.paid ? '✓ Pagado' : 'Sin pagar'}
                                </button>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-gray-600">
                              <label className="flex items-center gap-1.5">
                                Entregadas
                                <input type="number" min="0" defaultValue={p.ticketsDelivered || 0} onBlur={(e) => handleDeliveredInput(p.originalIndex, Number(e.target.value))} className="w-16 p-1 text-center border border-gray-200 rounded-lg" />
                              </label>
                              <div className="flex items-center gap-1.5">
                                Vendidas
                                <button type="button" onClick={() => handleSoldInput(p.originalIndex, (p.ticketsSold || 0) - 1)} disabled={saving || (p.ticketsSold || 0) <= 0} className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 font-bold">−</button>
                                <input type="number" min="0" max={p.ticketsDelivered || 0} value={p.ticketsSold || 0} onChange={(e) => handleSoldInput(p.originalIndex, Number(e.target.value))} className="w-12 text-center p-1 border border-gray-200 rounded-lg" />
                                <button type="button" onClick={() => handleSoldInput(p.originalIndex, (p.ticketsSold || 0) + 1)} disabled={saving || (p.ticketsSold || 0) >= (p.ticketsDelivered || 0)} className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 font-bold">+</button>
                              </div>
                              <span className="font-bold text-gray-800">${fmtMoney((p.ticketsSold || 0) * price)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => toggleTicketsVisibility(p.originalIndex)} title={p.ticketsVisible ? 'Visible para el alumno' : 'Oculto para el alumno'} className={`w-8 h-8 flex items-center justify-center rounded-lg transition ${p.ticketsVisible ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-300 hover:bg-gray-50'}`}>
                              {p.ticketsVisible ? <IconEye /> : <IconEyeOff />}
                            </button>
                            <button onClick={() => setStudentForTickets(p)} title={`Ver entradas de ${getPname(p)}`} disabled={(p.ticketsSold || 0) === 0} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition">
                              <IconTicket />
                            </button>
                            <button onClick={() => removeParticipant(p.originalIndex)} title={`Quitar a ${getPname(p)}`} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                              <IconTrash />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Gastos del evento</p>
                 <div className="flex flex-col sm:flex-row sm:items-end gap-2 mb-3">
                   <div className="flex-grow"><input type="text" placeholder="Concepto" value={newExpense.concept} onChange={(e)=> setNewExpense(s=>({...s, concept:e.target.value}))} className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 transition" /></div>
                   <div className="sm:w-36"><MoneyInput id="expense_amount" value={newExpense.amount} onValueChange={(v) => setNewExpense(s=>({...s, amount:v}))} placeholder="Monto" className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 transition" /></div>
                   <button onClick={addExpense} className="px-4 py-2.5 text-xs font-bold text-gray-700 rounded-xl bg-gray-100 hover:bg-gray-200 border border-gray-200 transition">+ Añadir</button>
                 </div>
                {expenses.length > 0 && (
                  <ul className="space-y-1.5">{expenses.map((e,i)=> (
                    <li key={i} className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-xl text-sm">
                      <span className="text-gray-700">{e.concept}</span>
                      <div className="flex items-center gap-3"><b className="text-gray-800">${fmtMoney(e.amount)}</b><button onClick={()=> removeExpense(i)} className="text-gray-300 hover:text-red-600 transition"><IconTrash /></button></div>
                    </li>
                  ))}</ul>
                )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                 <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Resumen económico</p>
                 <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                   <div><span className="text-gray-500">Recaudación</span><b className="block text-lg text-gray-900">{formatMoneyAr(totals.gross)}</b></div>
                   <div><span className="text-gray-500">Gastos</span><b className="block text-lg text-gray-900">{formatMoneyAr(totals.totalExpenses)}</b></div>
                   <div><span className="text-gray-500">Resultado neto</span><b className={`block text-lg ${totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatMoneyAr(totals.net)}</b></div>
                 </div>
                 <div className="mt-3 text-right"><button onClick={postNetToFinance} disabled={postingNet || totals.net === 0} title={totals.net === 0 ? "El resultado neto es cero" : "Registrar resultado en finanzas"} className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition">{postingNet ? 'Registrando…' : 'Registrar en Finanzas'}</button></div>
            </div>
          </div>
        </div>
      </Modal>

      <ManageTicketsModal isOpen={showManageTickets} onClose={()=> setShowManageTickets(false)} db={db} appId={appId} event={localEvent} showMessage={showMessage} />
      <ScanTicketsView isOpen={showScanQR} onClose={()=> setShowScanQR(false)} db={db} appId={appId} event={localEvent} showMessage={showMessage} />
      
      <StudentTicketsViewerModal
        isOpen={!!studentForTickets}
        onClose={() => setStudentForTickets(null)}
        student={studentForTickets}
        event={localEvent}
        db={db}
        appId={appId}
        showMessage={showMessage}
      />
    </>
  );
};
// ▲▲▲ FIN DEL BLOQUE PARA REEMPLAZAR ▲▲▲

