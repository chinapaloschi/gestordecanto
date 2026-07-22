import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collection as fsCollection, doc, getDoc, getDocs, updateDoc, addDoc as fsAddDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp, writeBatch , limit } from 'firebase/firestore';
import { ref as stRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../firebaseConfig.js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Modal, ModalHeader } from './Modal.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { Toast } from './Toast.jsx';
import { BrandLogo } from './AuthComponents.jsx';
import { formatMoneyAr, parseMoneyAr } from '../utils/money.js';
import { formatDateToDDMMYYYY, mapClassTypeToSpanish, daysOfWeekFull } from '../utils/classHelpers.js';
import { getLocalToday, toLocalYYYYMMDD } from '../utils/dateHelpers.js';
import { useMergedValidatedPayments } from '../hooks/useMergedValidatedPayments.js';
import { useHasPaidThisMonth } from '../hooks/useHasPaidThisMonth.js';
import { useLatestPackagePaid } from '../hooks/useLatestPackagePaid.js';
import { useNewReceiptsFlag } from '../hooks/useNewReceiptsFlag.js';
import { TransferBox, UnpaidPackageBanner, PublicBillingInfo, PublicPaymentsList, PublicTicketsSection } from './PublicPortalComponents.jsx';
import { GracePeriodNotice, NextMonthInfoBox } from './PublicPortalWidgets.jsx';
import { SocialMediaLinks } from './SocialMediaLinks.jsx';
import { ReceiptsModal, ReceiptUploadBox } from './ReceiptsComponents.jsx';
import { MinimalReceiptUpload } from './UploadComponents.jsx';
import { EventConfirmationPopup, ConfirmedEventsSection, ReceiptUploadBoxPatched } from './MiscComponents.jsx';
import { MassEventsStudentSection } from './MassEvents.jsx';
import { ROUTES } from '../constants.js';
import { IconCalendar, IconCreditCard, IconPackage, IconReceipt, IconDownload, IconShare, IconUsers, IconClock } from './Icons.jsx';
import QRCode from 'qrcode';
import QRCodeWithLogo from 'qrcode-with-logos';
import { ROUTES as R } from '../constants.js';
import { ASSET_VER } from '../constants.js';
import { IconTrash } from './Icons.jsx';
import { isPresent, isAbsent } from '../utils/studentHelpers.js';
import { ReceiptsCenter } from './ReceiptsComponents.jsx';
import { ALLOWED_EMAILS } from './AuthComponents.jsx';
import { ChromaticTuner } from './PitchPanel.jsx';
export const TicketMiniCard = ({ appId, eventId, eventMeta, attendee }) => {
  const [qr, setQr] = React.useState(null);
  const LOGO_URL = `/nuevologo.gif?v=${ASSET_VER}`;

  const ticketUrl = React.useMemo(() => {
    const base = `${window.location.origin}/${ROUTES.CHECKIN}`;
    const p = new URLSearchParams({ a: appId || "", e: eventId || "", s: attendee?.id || "" });
    return `${base}?${p.toString()}`;
  }, [appId, eventId, attendee?.id]);

  React.useEffect(() => {
    if (!ticketUrl) return;
    QRCode.toDataURL(ticketUrl, { margin: 0, scale: 8 })
      .then(setQr)
      .catch(console.error);
  }, [ticketUrl]);

  const waHref = React.useMemo(() => {
    const texto = [
      `🎟️ ${eventMeta?.title || "Evento"}`,
      eventMeta?.date ? `📅 ${eventMeta.date}${eventMeta?.startTime ? ` · ${eventMeta.startTime}` : ""}` : "",
      eventMeta?.location ? `📍 ${eventMeta.location}` : "",
      "",
      "Entrada:"
    ].filter(Boolean).join("\\n");
    return `https://wa.me/?text=${encodeURIComponent(texto + "\\n" + ticketUrl)}`;
  }, [ticketUrl, eventMeta]);

  return (
    <div className="max-w-xs bg-white rounded-lg sm:rounded-2xl shadow p-4 flex flex-col items-center gap-2 border border-gray-200">
      {/* Encabezado con logo */}
      <div className="flex items-center gap-2">
        <img
          src={LOGO_URL}
          alt="Logo"
          className="h-8 w-8 rounded-md object-contain ring-1 ring-gray-300 bg-white p-1"
          onError={(e)=>{ e.currentTarget.style.display='none'; }}
        />
        <div className="leading-tight">
          <div className="text-[11px] uppercase tracking-widest text-gray-500">Entrada</div>
          <div className="font-bold text-gray-800">{eventMeta?.title || "Evento"}</div>
        </div>
      </div>

      {/* Fecha / lugar */}
      <div className="text-sm sm:text-base sm:text-sm text-gray-600 text-center">
        {eventMeta?.location || "Lugar"}<br />
        {eventMeta?.date ? formatDateToDDMMYYYY(eventMeta.date) : "DD/MM/AAAA"}{eventMeta?.startTime ? ` · ${eventMeta.startTime}` : ""}
      </div>

      {/* QR con overlay de logo (NO muestra URL en texto) */}
      <div className="relative p-2 bg-white rounded-lg sm:rounded-xl shadow">
        {qr ? (
          <div className="relative h-48 w-48">
            <div className="relative h-[220px] w-[220px] mx-auto">  <img src={qr} alt="QR" className="h-[220px] w-[220px] rounded-md" />  <div className="absolute inset-0 grid place-items-center pointer-events-none">    <div className="h-11 sm:h-14 w-14 rounded-md bg-white grid place-items-center shadow">      <img src={LOGO_URL_QR} alt="Logo" className="h-10 sm:h-12 w-12 object-contain" onError={(e)=>{ e.currentTarget.style.display='none'; }} />    </div>  </div></div>
            {/* Logo centrado sobre el QR */}
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="h-10 w-10 rounded-md bg-white grid place-items-center shadow">
                <img
                  src={LOGO_URL}
                  alt="Logo"
                  className="h-8 w-8 object-contain"
                  onError={(e)=>{ e.currentTarget.style.display='none'; }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="h-48 w-48 grid place-items-center text-gray-400">QR…</div>
        )}
      </div>

      {/* Acciones (sin mostrar la URL) */}
      <div className="flex gap-2">
        {qr && (
          <a
            href={qr}
            download={`QR_${(eventMeta?.title||"evento").replace(/[^\w\-]+/g,"_")}_${(attendee?.name||"titular").replace(/[^\w\-]+/g,"_")}.png`}
            className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-800 text-sm sm:text-base sm:text-sm font-medium hover:bg-gray-300"
          >
            Descargar PNG
          </a>
        )}
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm sm:text-base sm:text-sm font-medium hover:bg-green-700"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
};


// ======== [Messaging Helpers + Components] ========
// -- Solo envío desde privado; lectura en público --

// Broadcast (a todos)
async function sendBroadcastMessage({ db, appId, text, authorEmail }) {
  try {
    const t = (text || "").trim();
    if (!t) return;
    const ref = fsCollection(db, `artifacts/${appId}/publicMessages`);
    await fsAddDoc(ref, {
      text: t,
      createdAt: serverTimestamp(),
      author: authorEmail || "",
      type: "broadcast",
    });
  } catch (e) {
    console.error("sendBroadcastMessage error:", e);
    throw e;
  }
}

// Directo a un alumno (1→1)
async function sendDirectMessage({ db, appId, student, text, authorEmail }) {
  try {
    const t = (text || "").trim();
    if (!student?.id || !t) return;
    const ref = fsCollection(db, `artifacts/${appId}/studentMessages/${student.id}/messages`);
    await fsAddDoc(ref, {
      text: t,
      createdAt: serverTimestamp(),
      author: authorEmail || "",
      type: "direct",
      studentId: student.id,
      studentName: student.name || student.fullName || ""
    });
  } catch (e) {
    console.error("sendDirectMessage error:", e);
    throw e;
  }
}

// Componente público: muestra mensajes (broadcast + directos al alumno) con dismiss
export function PublicMessages({ db, appId, student }) {
  const [rows, setRows] = React.useState([]);
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      const key = `dismissed_msgs_${student?.id}`;
      return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    } catch { return new Set(); }
  });

  React.useEffect(() => {
    if (!db || !appId || !student?.id) return;

    const qBroadcast = query(
      fsCollection(db, `artifacts/${appId}/publicMessages`),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const qDirect = query(
      fsCollection(db, `artifacts/${appId}/studentMessages/${student.id}/messages`),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    let broadcast = [], direct = [];
    const apply = () => {
      const merged = [...broadcast, ...direct]
        .sort((a,b) => (b?.createdAt?.toMillis?.()||0) - (a?.createdAt?.toMillis?.()||0))
        .slice(0, 20);
      setRows(merged);
    };

    const u1 = onSnapshot(qBroadcast, snap => {
      broadcast = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}), scope: 'todos' }));
      apply();
    });
    const u2 = onSnapshot(qDirect, snap => {
      direct = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}), scope: 'directo' }));
      apply();
    });

    return () => { try { u1(); u2(); } catch {} };
  }, [db, appId, student?.id]);

  const dismissMsg = (id) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(`dismissed_msgs_${student?.id}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const visible = rows.filter(m => !dismissed.has(m.id));
  if (!visible.length) return null;

  const fmt = (ts) => {
    try {
      const d = ts?.toDate?.() || new Date();
      return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
    } catch { return ""; }
  };

  return (
    <div className="rounded-xl border border-rose-100 bg-white shadow-sm mt-4 overflow-hidden">
      <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-100 flex items-center gap-2">
        <span className="text-base">💬</span>
        <span className="text-sm font-bold text-rose-900">Mensajes del Estudio</span>
        <span className="ml-auto text-[11px] text-rose-400 font-semibold">{visible.length} mensaje{visible.length !== 1 ? 's' : ''}</span>
      </div>
      <ul className="divide-y divide-gray-50">
        {visible.map(m => (
          <li key={m.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
            <div className="flex-shrink-0 mt-0.5 text-base">
              {m.scope === 'directo' ? '👤' : '📣'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400 mb-0.5">
                {m.scope === 'directo' ? 'Para vos' : 'Para todos'} · {fmt(m.createdAt)}
              </p>
              <p className="text-sm text-gray-800 font-medium whitespace-pre-wrap leading-snug">{m.text}</p>
            </div>
            {/* Botón ocultar */}
            <button
              onClick={() => dismissMsg(m.id)}
              title="Ocultar mensaje"
              className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 hover:bg-rose-100 hover:text-rose-600 text-gray-400 flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-all mt-0.5"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}


// ▼▼▼ REEMPLAZA TU COMPONENTE AdminMessageComposer CON ESTA VERSIÓN ▼▼▼

const MSG_TEMPLATES = [
  { icon:'📅', label:'Clase suspendida',    text:'Hola! La clase de esta semana está suspendida. Te aviso cuando se reprograme. ¡Saludos!' },
  { icon:'💳', label:'Recordatorio de pago', text:'Hola! Te recuerdo que tenés tu cuota pendiente. Podés abonarla desde el portal del estudio.\n\n⚠️ Importante: a partir del día 8 de cada mes se aplica un recargo del 10% sobre el monto. ¡Abonando antes lo evitás!\n\n¡Gracias y saludos!' },
  { icon:'🕐', label:'Cambio de horario',    text:'Hola! Hubo un cambio en el horario de tu clase. Me comunico pronto para coordinar. ¡Saludos!' },
  { icon:'🎉', label:'Aviso de muestra',     text:'Hola! Se acerca la muestra del estudio. Pronto te paso los detalles. ¡No te la pierdas!' },
];

export function AdminMessageComposer({ db, appId, currentUserEmail, students, showMessage, onClose }) {
  const [mode,          setMode]          = React.useState("broadcast");
  const [searchQuery,   setSearchQuery]   = React.useState("");
  const [selectedIds,   setSelectedIds]   = React.useState([]); // multiple selection
  const [broadcastFilter, setBroadcastFilter] = React.useState("all"); // "all" | "debt" | "noattend"
  const [text,          setText]          = React.useState("");
  const [loading,       setLoading]       = React.useState(false);
  const [history,       setHistory]       = React.useState([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [histStudent,   setHistStudent]   = React.useState("");
  const [sendPush,      setSendPush]      = React.useState(true);
  const [sendingDebtReminder, setSendingDebtReminder] = React.useState(false);

  // Filtro de alumnos por búsqueda
  const filteredStudents = React.useMemo(() => {
    const q = searchQuery.toLowerCase();
    return (students || [])
      .filter(s => !s.isArchived)
      .filter(s => !q || (s.name||'').toLowerCase().includes(q))
      .sort((a,b) => (a.name||'').localeCompare(b.name||''));
  }, [students, searchQuery]);

  // Alumnos destino según filtro broadcast
  const broadcastTargets = React.useMemo(() => {
    const all = (students || []).filter(s => !s.isArchived);
    if (broadcastFilter === 'debt')     return all.filter(s => s.hasAnyUnpaidItems);
    if (broadcastFilter === 'noattend') return all.filter(s => (s.totalPaidUnconsumedClasses||0) > 0);
    return all;
  }, [students, broadcastFilter]);

  const toggleStudent = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectedStudentsData = React.useMemo(
    () => (students||[]).filter(s => selectedIds.includes(s.id)),
    [students, selectedIds]
  );

  const studentId = selectedIds[0] || ""; // compat con historial
  const selectedStudent = (students||[]).find(s => s.id === studentId) || null;

  React.useEffect(() => {
    if (mode !== 'history') { setHistory([]); return; }
    setHistoryLoading(true);
    const sid = histStudent;
    if (sid) {
      const qD = query(fsCollection(db, `artifacts/${appId}/studentMessages/${sid}/messages`), orderBy("createdAt","desc"), limit(20));
      const unsub = onSnapshot(qD, snap => {
        setHistory(snap.docs.map(d => ({ id: d.id, type:'direct', ...d.data() })));
        setHistoryLoading(false);
      });
      return () => unsub();
    } else {
      const qB = query(fsCollection(db, `artifacts/${appId}/publicMessages`), orderBy("createdAt","desc"), limit(20));
      const unsub = onSnapshot(qB, snap => {
        setHistory(snap.docs.map(d => ({ id: d.id, type:'broadcast', ...d.data() })));
        setHistoryLoading(false);
      });
      return () => unsub();
    }
  }, [mode, histStudent, db, appId]);

const send = async () => {
    const t = (text || "").trim();
    if (!t) { showMessage("El mensaje no puede estar vacío.", "error"); return; }
    if (mode === "direct" && selectedIds.length === 0) { showMessage("Seleccioná al menos un alumno.", "error"); return; }

    setLoading(true);
    try {
      if (mode === "broadcast") {
        await sendBroadcastMessage({ db, appId, text: t, authorEmail: currentUserEmail });
      } else if (mode === "direct" && selectedStudentsData.length > 0) {
        for (const st of selectedStudentsData) {
          await sendDirectMessage({ db, appId, student: st, text: t, authorEmail: currentUserEmail });
        }
      }

      if (sendPush) {
        try {
          const fns = getFunctions();
          const callFn = httpsCallable(fns, 'sendPushNotification');
          const targetIds = mode === "broadcast"
            ? broadcastTargets.map(s => s.id)
            : selectedIds;

          if (targetIds.length > 0) {
            const result = await callFn({ studentIds: targetIds, title: "Estudio Sandra Paloschi 🎵", body: t, appId, url: `/#/checkin?a=${appId}` });
            const { sent = 0 } = result.data || {};
            showMessage(`✅ Enviado${sent > 0 ? ` + ${sent} notificación${sent!==1?'es':''}` : ''}.`, "success");
          }
        } catch (pushErr) {
          showMessage("Mensaje guardado. Push falló: " + pushErr.message, "warn");
        }
      } else {
        showMessage("Mensaje enviado.", "success");
      }

      setText(""); setSelectedIds([]);
      onClose();
    } catch (e) {
      showMessage(`Error: ${e.message}`, "error");
    } finally { setLoading(false); }
  };

  // Acción rápida: avisar del recargo del 10% a todos los alumnos con deuda,
  // de uno a uno (para que cada quien vea solo su propio aviso) + push para que llegue con la app cerrada
  const sendDebtReminder = async () => {
    const targets = (students || []).filter(s => !s.isArchived && s.hasAnyUnpaidItems);
    if (!targets.length) { showMessage('Ningún alumno tiene deuda actualmente.', 'info'); return; }
    const reminderText = MSG_TEMPLATES.find(t => t.label === 'Recordatorio de pago')?.text || '';
    if (!window.confirm(`¿Avisar a ${targets.length} alumno${targets.length !== 1 ? 's' : ''} con deuda sobre el recargo del 10%?`)) return;

    setSendingDebtReminder(true);
    try {
      for (const st of targets) {
        await sendDirectMessage({ db, appId, student: st, text: reminderText, authorEmail: currentUserEmail });
      }
      try {
        const fns = getFunctions();
        const callFn = httpsCallable(fns, 'sendPushNotification');
        const result = await callFn({ studentIds: targets.map(s => s.id), title: "Estudio Sandra Paloschi 🎵", body: reminderText, appId, url: `/#/checkin?a=${appId}` });
        const { sent = 0 } = result.data || {};
        showMessage(`✅ Aviso enviado a ${targets.length} alumno${targets.length !== 1 ? 's' : ''}${sent > 0 ? ` + ${sent} notificación${sent !== 1 ? 'es' : ''} push` : ''}.`, "success");
      } catch (pushErr) {
        showMessage(`Aviso guardado para ${targets.length} alumno${targets.length !== 1 ? 's' : ''}. Push falló: ${pushErr.message}`, "warn");
      }
    } catch (e) {
      showMessage(`Error: ${e.message}`, "error");
    } finally {
      setSendingDebtReminder(false);
    }
  };

  const handleDeleteMessage = async (message) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este mensaje? Esta acción es irreversible.")) return;

    try {
        let messageRef;
        if (message.type === 'broadcast') {
            messageRef = doc(db, `artifacts/${appId}/publicMessages`, message.id);
        } else {
            // Asegurarse de tener el studentId para mensajes directos
            const msgStudentId = message.studentId || studentId;
            if (!msgStudentId) throw new Error("Falta el ID del alumno para este mensaje.");
            messageRef = doc(db, `artifacts/${appId}/studentMessages/${msgStudentId}/messages`, message.id);
        }
        await deleteDoc(messageRef);
        showMessage("Mensaje eliminado correctamente.", "success");
    } catch (e) {
        console.error("Error al eliminar mensaje:", e);
        showMessage(`No se pudo eliminar el mensaje: ${e.message}`, "error");
    }
  };

  const fmtDate = (ts) => {
      try {
        return (ts?.toDate() || new Date()).toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
      } catch { return 'Fecha inválida'; }
  };

  const fldInput = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 transition';

  return (
    <div className="bg-white rounded-xl overflow-hidden">

      {/* ── HEADER ── */}
      <div className="bg-gradient-to-r from-rose-700 to-pink-500 px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-white/20 rounded-xl">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12l-4-4H4a2 2 0 01-2-2V6z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-white font-bold text-base">Mensajes</h2>
            <p className="text-rose-100 text-xs">Enviá mensajes y notificaciones a tus alumnos</p>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1">
          {[['broadcast','📣 A Todos'],['direct','👤 Alumnos'],['history','📖 Historial']].map(([id, label]) => (
            <button key={id} onClick={() => setMode(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${mode===id ? 'bg-white text-rose-700' : 'text-rose-100 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">

      {/* ── MODO: A TODOS ── */}
      {mode === 'broadcast' && (
        <div className="space-y-3">

          {/* Acción rápida: avisar recargo a quienes deben, en un solo toque */}
          {(() => {
            const debtCount = (students || []).filter(s => !s.isArchived && s.hasAnyUnpaidItems).length;
            if (!debtCount) return null;
            return (
              <button type="button" onClick={sendDebtReminder} disabled={sendingDebtReminder}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md transition disabled:opacity-50">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 text-lg">
                  {sendingDebtReminder ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : '⚡'}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="font-black text-sm leading-tight">
                    {sendingDebtReminder ? 'Enviando avisos...' : `Avisar recargo del 10% a ${debtCount} alumno${debtCount !== 1 ? 's' : ''} con deuda`}
                  </p>
                  <p className="text-[11px] text-white/80 leading-tight">Mensaje directo + notificación push — llega con la app cerrada</p>
                </div>
              </button>
            );
          })()}

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Filtrar destinatarios</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { id:'all',      label:`Todos (${(students||[]).filter(s=>!s.isArchived).length})` },
                { id:'debt',     label:`Con deuda (${(students||[]).filter(s=>!s.isArchived&&s.hasAnyUnpaidItems).length})` },
                { id:'noattend', label:`Clases restantes (${(students||[]).filter(s=>!s.isArchived&&(s.totalPaidUnconsumedClasses||0)>0).length})` },
              ].map(f => (
                <button key={f.id} type="button" onClick={() => setBroadcastFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border
                    ${broadcastFilter===f.id ? 'bg-rose-600 text-white border-rose-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-rose-300'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de destinatarios del filtro activo */}
          {broadcastFilter !== 'all' && broadcastTargets.length > 0 && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                {broadcastFilter === 'debt' ? '🔴 Alumnos con deuda' : '📚 Alumnos con clases restantes'}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {broadcastTargets.map(s => (
                  <div key={s.id} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1">
                    <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 bg-rose-100">
                      {s.photoURL
                        ? <img src={s.photoURL} alt="" className="w-full h-full object-cover"/>
                        : <div className="w-full h-full flex items-center justify-center text-[8px] font-black text-rose-600">
                            {(s.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
                          </div>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-gray-800 truncate max-w-[80px]">
                        {(s.name||'').split(' ')[0]}
                      </p>
                      {broadcastFilter === 'debt' && (
                        <p className="text-[9px] text-rose-600 font-bold">
                          ${new Intl.NumberFormat('es-AR').format(s.pendingBalanceWithSurcharge || s.pendingBalance || 0)}
                          {s.aplicaRecargo && <span className="text-[8px]"> +10%</span>}
                        </p>
                      )}
                      {broadcastFilter === 'noattend' && (
                        <p className="text-[9px] text-blue-600 font-bold">{s.totalPaidUnconsumedClasses} clase{s.totalPaidUnconsumedClasses!==1?'s':''}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {broadcastFilter !== 'all' && broadcastTargets.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              {broadcastFilter === 'debt' ? '✅ Ningún alumno tiene deuda actualmente' : '✅ Sin alumnos con clases restantes'}
            </p>
          )}
        </div>
      )}

      {/* ── MODO: A ALUMNOS (búsqueda + selección múltiple) ── */}
      {mode === 'direct' && (
        <div className="space-y-2">
          {/* Chips de seleccionados */}
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedStudentsData.map(s => (
                <span key={s.id} className="flex items-center gap-1 bg-rose-100 text-rose-800 text-xs font-semibold px-2 py-1 rounded-full">
                  {s.name.split(' ')[0]}
                  <button onClick={() => toggleStudent(s.id)} className="text-rose-500 hover:text-rose-700 font-black text-sm leading-none">×</button>
                </span>
              ))}
              <button onClick={() => setSelectedIds([])} className="text-xs text-gray-400 hover:text-gray-600 underline">Limpiar</button>
            </div>
          )}
          {/* Búsqueda */}
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Buscá un alumno por nombre..."
            className={fldInput}
            autoFocus
          />
          {/* Lista filtrada */}
          <div className="max-h-44 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
            {filteredStudents.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3">Sin resultados</p>
            )}
            {filteredStudents.map(s => {
              const sel = selectedIds.includes(s.id);
              return (
                <button key={s.id} type="button" onClick={() => toggleStudent(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition
                    ${sel ? 'bg-rose-50' : 'hover:bg-gray-50'}`}>
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-rose-100">
                    {s.photoURL
                      ? <img src={s.photoURL} alt="" className="w-full h-full object-cover"/>
                      : <div className="w-full h-full flex items-center justify-center text-xs font-black text-rose-600">
                          {(s.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
                        </div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                    {s.hasAnyUnpaidItems && <p className="text-[10px] text-rose-500 font-medium">Tiene deuda</p>}
                  </div>
                  {sel && <svg className="w-4 h-4 text-rose-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── REDACTAR MENSAJE ── */}
      {mode !== 'history' && (
        <>
          {/* Plantillas rápidas */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Plantillas rápidas</p>
            <div className="flex flex-wrap gap-1.5">
              {MSG_TEMPLATES.map(tpl => (
                <button key={tpl.label} type="button" onClick={() => setText(tpl.text)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition border
                    ${text === tpl.text ? 'bg-gray-800 text-white border-gray-800' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                  {tpl.icon} {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={4}
              placeholder="Escribí tu mensaje..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 transition resize-none"
            />
            <p className="text-[10px] text-gray-400 text-right mt-0.5">{text.length} caracteres</p>
          </div>

          {/* Toggle push */}
          <label className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-100 transition">
            <div className="relative flex-shrink-0">
              <input type="checkbox" checked={sendPush} onChange={e => setSendPush(e.target.checked)} className="sr-only peer"/>
              <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-rose-600
                after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white
                after:border after:rounded-full after:h-4 after:w-4 after:transition-all
                peer-checked:after:translate-x-4 peer-checked:after:border-white"/>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">🔔 Notificación push</p>
              <p className="text-xs text-gray-500">{sendPush ? 'Llega al celular aunque tengan la app cerrada' : 'Solo visible en el portal'}</p>
            </div>
          </label>

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition">
              Cancelar
            </button>
            <button onClick={send} disabled={loading || (mode==='direct' && selectedIds.length===0)}
              className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-black shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Enviando...</>
                : <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                    {mode === 'broadcast'
                      ? `Enviar a ${broadcastTargets.length} alumnos${sendPush?' + 🔔':''}`
                      : selectedIds.length > 0
                        ? `Enviar a ${selectedIds.length} alumno${selectedIds.length!==1?'s':''}${sendPush?' + 🔔':''}`
                        : 'Seleccioná alumnos'}
                  </>}
            </button>
          </div>
        </>
      )}

      {/* ── HISTORIAL ── */}
      {mode === 'history' && (
        <div className="space-y-3">
          {/* Selector de alumno para historial */}
          <div>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Buscar alumno para ver historial..."
              className={fldInput} />
            {searchQuery && (
              <div className="mt-1 border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-32 overflow-y-auto">
                {filteredStudents.slice(0,5).map(s => (
                  <button key={s.id} type="button" onClick={() => { setHistStudent(s.id); setSearchQuery(s.name); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-rose-50 transition ${histStudent===s.id ? 'font-bold text-rose-700' : 'text-gray-700'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {historyLoading && <div className="flex justify-center py-4 gap-1 items-end" style={{ height: 36 }}>
              {[3,5,4,6,3,5,4].map((h,i) => <div key={i} style={{ width:2, height:`${Math.round(h/6*20)}px`, backgroundColor:'#fda4af', borderRadius:2, animation:`soundwave 0.8s ${i*0.15}s ease-in-out infinite alternate` }}/>)}
            </div>}
            {!historyLoading && history.length === 0 && <p className="text-xs text-center text-gray-400 py-4">Sin mensajes</p>}
            {history.map(msg => (
              <div key={msg.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl group">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">
                      {msg.type === 'broadcast' ? '📣 Para Todos' : `👤 ${msg.studentName || ''}`}
                    </span>
                    <p className="text-sm text-gray-800 mt-0.5">{msg.text}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{fmtDate(msg.createdAt)}</p>
                  </div>
                  <button onClick={() => handleDeleteMessage(msg)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition flex-shrink-0">
                    <IconTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      </div>{/* fin p-5 */}
    </div>
  );
}

// ▼▼▼ REEMPLAZA TU COMPONENTE FloatingAdminMessagesButton CON ESTA VERSIÓN ▼▼▼

export function FloatingAdminMessagesButton({ db, appId, students, showMessage }) {
  const [open, setOpen] = React.useState(false);
  const email = auth?.currentUser?.email || "";
  const isAdmin = ALLOWED_EMAILS.has(email);
  
  if (!isAdmin) return null;

  return (
    <>
      {/* --- BOTÓN FLOTANTE CORREGIDO Y VISIBLE --- */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-2xl shadow-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 flex items-center gap-2"
        title="Enviar mensaje"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        Mensajes
      </button>

      {/* --- Modal que se abre --- */}
      <Modal isOpen={open} onClose={() => setOpen(false)} size="md">
        <AdminMessageComposer
          db={db}
          appId={appId}
          currentUserEmail={email}
          students={students}
          showMessage={showMessage}
          onClose={() => setOpen(false)}
        />
      </Modal>

      {/* Botón fijo para Comprobantes (se mantiene) */}
      <ReceiptsCenter db={db} appId={appId} students={students} />
    </>
  );
}
// ======== [End Floating Admin Messages Button] ========

// === Ensure Firebase Auth session persists across app restarts (PWA) ===
try {
  // Try IndexedDB first (recommended). If not available, fallback to localStorage.
  setPersistence(auth, indexedDBLocalPersistence).catch(() => 
    setPersistence(auth, browserLocalPersistence)
  );
} catch (e) {
  // Non-fatal: if persistence setup falla, Firebase igual intentará hidratar sesión
}

// ====== Portal del Alumno (DNI + PIN) ======
export function PortalAlumno({ db, appId }) {
  const [dni, setDni] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showTuner, setShowTuner] = React.useState(false);
  const [student, setStudent] = React.useState(() => {
    const s = loadPortalSession(); return s?.student || null;
  });
  const [showEventPopup, setShowEventPopup] = React.useState(false);
  const [selectedClassForAttendance, setSelectedClassForAttendance] = useState(null);
  const [showAttendanceOptions, setShowAttendanceOptions] = useState(false);
  const [portalClasses, setPortalClasses] = useState([]);
  const [portalReceipts, setPortalReceipts] = useState([]);
  const [portalRepertoire, setPortalRepertoire] = useState([]);
  const [portalBlockedSlots, setPortalBlockedSlots] = useState([]);

  React.useEffect(() => { disablePullToRefreshIOS(); }, []);
  // Abrir popup de eventos al iniciar sesión si hay eventos no confirmados
React.useEffect(() => {
  if (!student?.id) return;
  const checkPendingEvents = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      // Obtener TODOS los eventos masivos (sin filtro por fecha)
      const q = query(fsCollection(db, `artifacts/${appId}/massEvents`));
      const snap = await getDocs(q);
      let hasPending = false;
      
      for (const docSnap of snap.docs) {
        const eventId = docSnap.id;
        // Obtener las opciones de este evento
        const optionsSnap = await getDocs(
          fsCollection(db, `artifacts/${appId}/massEvents/${eventId}/options`)
        );
        // Verificar si hay al menos una opción con fecha >= hoy
        const hasFutureOption = optionsSnap.docs.some(optDoc => {
          const opt = optDoc.data();
          return opt.date >= today;
        });
        if (!hasFutureOption) continue; // evento sin opciones futuras, ignorar
        
        // Verificar el estado del alumno en este evento
        const attendeeRef = doc(db, `artifacts/${appId}/massEvents/${eventId}/attendees/${student.id}`);
        const attendeeSnap = await getDoc(attendeeRef);
        // ✅ SOLO considerar pendiente si el alumno FUE ASIGNADO al evento (existe attendee) Y no confirmó
        if (attendeeSnap.exists() && attendeeSnap.data().confirmed !== true) {
          hasPending = true;
          break; // encontramos un evento pendiente, salir
        }
      }
      if (hasPending) setShowEventPopup(true);
    } catch (e) {
      console.warn("Error checking pending events", e);
    }
  };
  checkPendingEvents();
}, [student, db, appId]);
  React.useEffect(() => { const s = loadPortalSession(); if (s?.student) setStudent(s.student); }, []);

  useEffect(() => {
    if (!student?.id) return;
    const q = query(
      fsCollection(db, `artifacts/${appId}/scheduledClasses`),
      where('studentId', '==', student.id),
      orderBy('classDate', 'desc')
    );
    const unsub = onSnapshot(q, snap =>
      setPortalClasses(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return unsub;
  }, [student?.id]);

  useEffect(() => {
    if (!student?.id) return;
    const unsub = onSnapshot(
      fsCollection(db, `artifacts/${appId}/blockedSlots`),
      snap => setPortalBlockedSlots(snap.docs.map(d => d.data())),
      () => {}
    );
    return unsub;
  }, [student?.id]);

  useEffect(() => {
    if (!student?.id) return;
    const q = query(
      fsCollection(db, `artifacts/${appId}/students/${student.id}/receipts`),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    const unsub = onSnapshot(q, snap =>
      setPortalReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return unsub;
  }, [student?.id]);

  useEffect(() => {
    if (!student?.id) return;
    const q = query(
      fsCollection(db, `artifacts/${appId}/students/${student.id}/repertoire`),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap =>
      setPortalRepertoire(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return unsub;
  }, [student?.id]);

  const doLogout = () => { clearPortalSession(); setStudent(null); setDni(''); setPin(''); };

  const handleLogin = async (e) => {
    e.preventDefault(); setError('');
    const digits = (dni||'').replace(/\D+/g,'');
    const last4 = (pin||'').replace(/\D+/g,'').slice(-4);
    if (digits.length < 7 || digits.length > 8 || last4.length !== 4) { setError('Revisá DNI y PIN (últimos 4).'); return; }
    setBusy(true);
    try {
      const loginFn = httpsCallable(getFunctions(), 'loginStudent');
      const res = await loginFn({ appId, dni: digits, pin: last4 });
      const ok = res.data;
      if (!ok || !ok.id) { setError('DNI o PIN incorrectos.'); setBusy(false); return; }
      savePortalSession({ student: ok, ts: Date.now() }); setStudent(ok);
    } catch (err) { setError(err?.message || 'No se pudo iniciar sesión.'); }
    finally { setBusy(false); }
  };

  if (student) {
    return (
      <div className="min-h-screen bg-gray-50">

        {/* ── HEADER ── */}
        <div className="bg-gradient-to-br from-rose-700 to-pink-600 px-4 pt-10 pb-16 text-center relative">
          <button
            onClick={doLogout}
            className="absolute right-4 top-4 text-xs font-semibold text-rose-200 hover:text-white transition px-3 py-1.5 rounded-full hover:bg-white/10"
          >
            Salir
          </button>
          <BrandLogo className="h-12 w-auto mx-auto mb-3 brightness-0 invert opacity-90" />
          <p className="text-rose-200 text-[11px] font-bold uppercase tracking-widest">Estudio de Canto</p>
          <h2 className="text-white font-black text-2xl mt-1 tracking-tight">{student.name}</h2>
        </div>

        {/* ── CONTENIDO ── */}
        <div className="max-w-md mx-auto px-4 -mt-8 pb-10 space-y-3">

          {/* Próxima clase */}
          {(() => {
            const todayStr = toLocalYYYYMMDD(new Date());
            const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = toLocalYYYYMMDD(tomorrow);
            const isBlocked = (c) => portalBlockedSlots.some(b => {
              if (b.date !== c.classDate) return false;
              if (b.isAllDay !== false) return true;
              return (c.startTime || '') < b.endTime && (c.endTime || '') > b.startTime;
            });
            const next = portalClasses
              .filter(c => c.classDate >= todayStr && c.status !== 'cancelled' && !isBlocked(c))
              .sort((a, b) => {
                const d = a.classDate.localeCompare(b.classDate);
                return d !== 0 ? d : (a.startTime || '').localeCompare(b.startTime || '');
              })[0];
            const isToday = next?.classDate === todayStr;
            const isTomorrow = next?.classDate === tomorrowStr;
            const tag = isToday ? '¡Hoy!' : isTomorrow ? 'Mañana' : null;
            const ds = next ? new Date(next.classDate + 'T00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) : null;
            return (
              <div className={`rounded-2xl p-5 shadow-sm ${isToday ? 'bg-gradient-to-br from-rose-600 to-pink-500' : 'bg-white border border-gray-100'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isToday ? 'text-rose-200' : 'text-gray-400'}`}>
                  Próxima clase{tag ? ` · ${tag}` : ''}
                </p>
                {next ? (
                  <>
                    <p className={`font-black text-xl capitalize ${isToday ? 'text-white' : 'text-gray-900'}`}>{ds}</p>
                    {(next.startTime || next.classTime) && (
                      <p className={`text-sm font-semibold mt-0.5 ${isToday ? 'text-rose-100' : 'text-rose-600'}`}>
                        {next.startTime || next.classTime} hs
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-gray-400 text-sm font-medium">Sin clases próximas programadas</p>
                )}
              </div>
            );
          })()}

          {/* Comprobante */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <MinimalReceiptUpload appId={appId} student={student} totalHoy={null} receipts={portalReceipts} />
          </div>

          {/* Afinador */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setShowTuner(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0 text-xl">🎵</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900">Afinador cromático</p>
                <p className="text-xs text-gray-400">Detecta tu tono en tiempo real</p>
              </div>
              <svg className={`w-4 h-4 text-gray-300 transition-transform ${showTuner ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            {showTuner && <div className="border-t border-gray-100"><ChromaticTuner /></div>}
          </div>

          {/* Material de clase */}
          {(() => {
            const mats = (student?.scheduledClassesDetailed || [])
              .filter(c => c.topicLink && c.topicLink.length > 5 && c.status !== 'cancelled')
              .sort((a, b) => new Date(a.classDate) - new Date(b.classDate));
            const unique = [];
            const seen = new Set();
            mats.forEach(c => { if (!seen.has(c.topicLink)) { seen.add(c.topicLink); unique.push(c); } });
            if (unique.length === 0) return null;
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Material de clase</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {unique.map((cls, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0 text-base">📎</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 font-medium">
                          {new Date(cls.classDate + 'T00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                        </p>
                        <p className="text-sm font-semibold text-gray-800 truncate">{cls.studentType || 'Material'}</p>
                      </div>
                      <a href={cls.topicLink} target="_blank" rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition flex-shrink-0">
                        Abrir
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Historial de asistencia */}
          {(() => {
            const todayStr = toLocalYYYYMMDD(new Date());
            const past = portalClasses.filter(c => c.classDate < todayStr && c.status !== 'cancelled').slice(0, 12);
            if (!past.length) return null;
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Mis últimas clases</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {past.map(c => {
                    const present = isPresent(c.attendanceStatus);
                    const absent = isAbsent(c.attendanceStatus);
                    const dt = new Date(c.classDate + 'T00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold
                          ${present ? 'bg-green-50 text-green-600' : absent ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400'}`}>
                          {present ? '✓' : absent ? '✗' : '–'}
                        </div>
                        <span className="text-sm text-gray-700 flex-1 capitalize">{dt}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                          ${present ? 'bg-green-50 text-green-600' : absent ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-400'}`}>
                          {present ? 'Presente' : absent ? 'Ausente' : 'Sin marcar'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Repertorio */}
          {portalRepertoire.length > 0 && (() => {
            const ytId = (url) => url?.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)?.[1] || null;
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Mi repertorio</p>
                  <span className="text-[11px] font-semibold text-gray-300">{portalRepertoire.length} {portalRepertoire.length === 1 ? 'canción' : 'canciones'}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {portalRepertoire.map(song => {
                    const vid = ytId(song.url);
                    return (
                      <a key={song.id} href={song.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition group">
                        {vid ? (
                          <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt=""
                            className="w-14 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                        ) : (
                          <div className="w-14 h-9 rounded-lg bg-rose-50 flex-shrink-0 flex items-center justify-center text-rose-400 font-bold text-lg">♪</div>
                        )}
                        <span className="flex-1 text-sm font-semibold text-gray-800 group-hover:text-rose-600 transition truncate">{song.title || '(sin título)'}</span>
                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                        </svg>
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Tickets */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <PublicTicketsSection db={db} appId={appId} student={student} exportTicketPDForPNG={exportTicketPDForPNG} shareTicket={shareTicket} />
          </div>

        </div>

        <EventConfirmationPopup
          isOpen={showEventPopup}
          onClose={() => setShowEventPopup(false)}
          db={db}
          appId={appId}
          student={student}
          showMessage={(text, type) => alert(`${type.toUpperCase()}: ${text}`)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-950 via-rose-800 to-pink-700 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <BrandLogo className="h-20 w-auto mx-auto mb-4 brightness-0 invert opacity-90" />
          <h1 className="text-white font-black text-2xl tracking-tight">Estudio de Canto</h1>
          <p className="text-rose-300 text-sm mt-1">Sandra Paloschi</p>
        </div>
        <div className="bg-white rounded-3xl p-7 shadow-2xl shadow-rose-900/30">
          <h2 className="text-gray-900 font-black text-lg mb-0.5">Bienvenida/o</h2>
          <p className="text-gray-400 text-sm mb-6">Ingresá con tu DNI y PIN personal</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">DNI</label>
              <input
                inputMode="numeric" pattern="[0-9]*"
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D+/g, ''))}
                placeholder="Sin puntos ni espacios"
                className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none text-gray-900 font-medium transition text-base"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">PIN</label>
              <input
                inputMode="numeric" pattern="[0-9]*"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D+/g, '').slice(0, 4))}
                placeholder="Últimos 4 dígitos de tu DNI"
                className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none text-gray-900 font-medium transition text-base tracking-widest"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
            <button
              type="submit" disabled={busy}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-500 text-white font-bold text-base shadow-lg hover:shadow-rose-300/40 hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {busy ? 'Verificando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}


// HMR cleanup for iOS overscroll behavior
if (import.meta && import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      const el = document.scrollingElement || document.documentElement || document.body;
      el.style.overscrollBehaviorY = '';
    } catch (e) {}
  });
}


/* ========================= PDF EXPORT HELPERS (Ingresos / Egresos / Total) =========================
   - Usa jsPDF (ya presente en el proyecto) para generar PDFs sin abrir 'Imprimir'.
   - Tres funciones públicas expuestas en window.__financeExport:
       .ingresos(rows, opts), .egresos(rows, opts), .resumen({ ingresos, egresos, monthLabel })
   - Además, tres botones React listos para usar:
       <ExportIngresosButton getRows={fn} monthLabel="..." />
       <ExportEgresosButton  getRows={fn} monthLabel="..." groupBy="proveedor|categoria" />
       <ExportTotalButton    getIngresos={fn} getEgresos={fn} monthLabel="..." />
   - 'rows' esperado:
       Ingresos: [{ alumno, fecha (Date | 'dd/mm/aaaa'), concepto, monto (number) }]
       Egresos:  [{ proveedor|categoria, fecha, concepto, monto }]
==================================================================================================== */

// Formateos locales (mantenemos la estética de tickets/comprobantes)
const __fmtDDMMYYYY = (d) => {
  if (!d) return "";
  if (typeof d === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d;
  const x = d instanceof Date ? d : new Date(d);
  const dd = String(x.getDate()).padStart(2,"0");
  const mm = String(x.getMonth()+1).padStart(2,"0");
  const yyyy = x.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};
const __f2 = (n) => Number(n ?? 0).toFixed(2);

// Exporta un listado agrupado con subtotales y TOTAL final
async function exportFinanceListPDF(rows, {
  title = "Reporte",
  monthLabel = "",
  groupField = "alumno",
  conceptFallback = (row) => `Pago de ${row[groupField] || "-"}`,
} = {}) {
  const { default: jsPDF } = await import("jspdf");
  // Agrupación
  const groups = new Map();
  for (const r of rows || []) {
    const k = (r[groupField] ?? "-") + "";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  let total = 0;
  const ordered = Array.from(groups.entries()).map(([grp, list]) => {
    let subtotal = 0;
    const items = list.map(r => {
      const monto = Number(r.monto ?? r.amount ?? 0);
      subtotal += monto;
      return {
        fecha: __fmtDDMMYYYY(r.fecha ?? r.date),
        concepto: r.concepto ?? r.concept ?? conceptFallback(r),
        monto,
      };
    });
    total += subtotal;
    return { grp, subtotal, items };
  }).sort((a,b)=>a.grp.localeCompare(b.grp,'es'));

  // PDF
  const doc = new jsPDF({ unit: "pt", format: "A4" });
  const left = 60, top = 64, bottom = 800, lineH = 18;
  let y = top;
  const addLine = (t, {bold=false, size=12}={}) => {
    doc.setFont("helvetica", bold? "bold":"normal");
    doc.setFontSize(size);
    doc.text(String(t ?? ""), left, y);
    y += lineH;
    if (y > bottom) { doc.addPage(); y = top; }
  };

  addLine(title, {bold:true, size:18}); addLine("");
  if (monthLabel) { addLine(monthLabel); addLine(""); }

  for (const g of ordered) {
    addLine(`${g.grp}: $${__f2(g.subtotal)}`, {bold:true, size:13});
    for (const it of g.items) addLine(`- ${it.fecha} - ${it.concepto} $${__f2(it.monto)}`);
    addLine("");
  }
  addLine(`TOTAL MENSUAL: $${__f2(total)}`, {bold:true, size:14});

  const filename = `${title.replace(/\s+/g,'_').toLowerCase()}_${(monthLabel || new Date().toISOString().slice(0,7))}.pdf`;
  doc.save(filename);
}

// Resumen (Ingresos + Egresos + Balance)
async function exportResumenMensualPDF({
  ingresos = [],
  egresos = [],
  monthLabel = "",
  ingresosGroupField = "alumno",
  egresosGroupField  = "proveedor",
} = {}) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "A4" });
  const left = 60, top = 64, bottom = 800, lineH = 18;
  let y = top;
  const addLine = (t, {bold=false, size=12}={}) => {
    doc.setFont("helvetica", bold? "bold":"normal");
    doc.setFontSize(size);
    doc.text(String(t ?? ""), left, y);
    y += lineH;
    if (y > bottom) { doc.addPage(); y = top; }
  };
  const groupBy = (arr, k) => arr.reduce((m, r)=>{
    const key = (r[k] ?? "-") + "";
    (m[key] = m[key] || []).push(r); return m;
  }, {});

  addLine("Resumen Mensual", {bold:true, size:18}); addLine("");
  if (monthLabel) { addLine(monthLabel); addLine(""); }

  // --- Ingresos ---
  addLine("Ingresos", {bold:true, size:14});
  const ingMap = groupBy(ingresos, ingresosGroupField);
  let totalIng = 0;
  for (const k of Object.keys(ingMap).sort((a,b)=>a.localeCompare(b,'es'))) {
    const list = ingMap[k];
    const sub = list.reduce((s,r)=>s+Number(r.monto ?? r.amount ?? 0),0);
    totalIng += sub;
    addLine(`${k}: $${__f2(sub)}`, {bold:true, size:13});
    for (const r of list) {
      const fecha = __fmtDDMMYYYY(r.fecha ?? r.date);
      const concepto = r.concepto ?? r.concept ?? `Pago de ${k}`;
      addLine(`- ${fecha} - ${concepto} $${__f2(r.monto ?? r.amount ?? 0)}`);
    }
    addLine("");
  }
  addLine(`TOTAL INGRESOS: $${__f2(totalIng)}`, {bold:true, size:13});
  addLine("");

  // --- Egresos ---
  addLine("Egresos", {bold:true, size:14});
  const egMap = groupBy(egresos, egresosGroupField);
  let totalEg = 0;
  for (const k of Object.keys(egMap).sort((a,b)=>a.localeCompare(b,'es'))) {
    const list = egMap[k];
    const sub = list.reduce((s,r)=>s+Number(r.monto ?? r.amount ?? 0),0);
    totalEg += sub;
    addLine(`${k}: $${__f2(sub)}`, {bold:true, size:13});
    for (const r of list) {
      const fecha = __fmtDDMMYYYY(r.fecha ?? r.date);
      const concepto = r.concepto ?? r.concept ?? `Gasto de ${k}`;
      addLine(`- ${fecha} - ${concepto} $${__f2(r.monto ?? r.amount ?? 0)}`);
    }
    addLine("");
  }
  addLine(`TOTAL EGRESOS: $${__f2(totalEg)}`, {bold:true, size:13});
  addLine("");

  // --- Balance ---
  const balance = totalIng - totalEg;
  addLine(`BALANCE: $${__f2(balance)}`, {bold:true, size:14});

  const filename = `resumen_${(monthLabel || new Date().toISOString().slice(0,7))}.pdf`;
  doc.save(filename);
}

// Exponer en window para que puedas llamarlo desde cualquier parte (o desde botones existentes)
try {
  window.__financeExport = {
    exportFinanceListPDF,
    exportResumenMensualPDF,
  };
} catch {}

// ----------------- Botones React listos para cablear en cada solapa -----------------
export function ExportIngresosButton({ getRows, monthLabel }) {
  return (
    <button
      type="button"
      className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
      onClick={async () => {
        try {
          const rows = (typeof getRows === "function") ? await getRows() : [];
          if (!rows || !rows.length) { alert("No hay ingresos visibles para exportar."); return; }
          await exportFinanceListPDF(rows, { title: "Reporte de Ingresos", monthLabel, groupField: "alumno" });
        } catch (e) { console.error(e); alert("No se pudo exportar Ingresos."); }
      }}
    >
      EXPORTAR A PDF
    </button>
  );
}

export function ExportEgresosButton({ getRows, monthLabel, groupBy = "proveedor" }) {
  return (
    <button
      type="button"
      className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
      onClick={async () => {
        try {
          const rows = (typeof getRows === "function") ? await getRows() : [];
          if (!rows || !rows.length) { alert("No hay egresos visibles para exportar."); return; }
          await exportFinanceListPDF(rows, {
            title: "Reporte de Egresos",
            monthLabel,
            groupField: groupBy,
            conceptFallback: (r) => r.concepto || `Gasto de ${r[groupBy] || "-"}`
          });
        } catch (e) { console.error(e); alert("No se pudo exportar Egresos."); }
      }}
    >
      EXPORTAR A PDF
    </button>
  );
}

export function ExportTotalButton({ getIngresos, getEgresos, monthLabel, ingresosGroupField="alumno", egresosGroupField="proveedor" }) {
  return (
    <button
      type="button"
      className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
      onClick={async () => {
        try {
          const ingresos = (typeof getIngresos === "function") ? await getIngresos() : [];
          const egresos  = (typeof getEgresos === "function") ? await getEgresos()  : [];
          if ((!ingresos || !ingresos.length) && (!egresos || !egresos.length)) {
            alert("No hay datos visibles para exportar.");
            return;
          }
          await exportResumenMensualPDF({ ingresos, egresos, monthLabel, ingresosGroupField, egresosGroupField });
        } catch (e) { console.error(e); alert("No se pudo exportar el Resumen."); }
      }}
    >
      EXPORTAR A PDF
    </button>
  );
}

/* ========================= FIN PDF EXPORT HELPERS ========================= */



// === Botón para eliminar clases programadas NO PAGADAS del alumno ===
// === Botón para eliminar clases programadas NO PAGADAS del alumno (Versión 2: con renderTrigger) ===
export function UnpaidClassDeleteButton({ db, appId, student, renderTrigger }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState([]);
  const [sel, setSel] = React.useState("");
  const [pkgInfo, setPkgInfo] = React.useState(null);
  const [deletePaymentDoc, setDeletePaymentDoc] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!db || !appId || !student?.id) { setItems([]); return; }
    setLoading(true);
    try {
      const qy = query(
        fsCollection(db, `artifacts/${appId}/scheduledClasses`),
        where("studentId", "==", student.id),
        where("status", "==", "scheduled"),
        where("isPaid", "==", false)
      );
      const snap = await getDocs(qy);
      const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      rows.sort((a,b) => String(a.classDate||"").localeCompare(String(b.classDate||"")) || String(a.startTime||"").localeCompare(String(b.startTime||"")));
      setItems(rows);
      if (rows.length && !sel) setSel(rows[0].id);
    } finally { setLoading(false); }
  }, [db, appId, student?.id, sel]);

  React.useEffect(() => { if (open) load(); }, [open, load]);
  
  React.useEffect(() => {
    (async () => {
      try {
        setPkgInfo(null);
        if (!sel) return;
        const row = items.find(x => x.id === sel);
        if (!row?.monthlyPaymentRefId) return;
        const pref = doc(db, `artifacts/${appId}/payments/${row.monthlyPaymentRefId}`);
        const psnap = await getDoc(pref);
        if (!psnap.exists()) return;
        const data = psnap.data() || {};
        setPkgInfo({
          id: psnap.id,
          isPaid: data.isPaidForPackage === true,
          count: Array.isArray(data.associatedClassIds) ? data.associatedClassIds.length : 0
        });
      } catch(e) { console.warn(e); }
    })();
  }, [sel, items, db, appId]);


  const fmt = (r) => {
    const d = r.classDate || "";
    const t = r.startTime || "--:--";
    const ty = (r.studentType || r.classType || "").toString().toLowerCase();
    return `${d} ${t} — ${ty || "clase"}`;
  };

  const doDelete = async () => {
    if (!sel) return;
    const cls = items.find(x => x.id === sel);
    if (!cls) return;
    if (!window.confirm(`Eliminar definitivamente la clase del ${cls.classDate} ${cls.startTime || ""}?`)) return;
    try {
      setLoading(true);
      await hardDeleteScheduledClass({ db, appId, classId: sel });
      await load();
      setSel("");
      if (typeof softRefreshApp === "function") { try { await softRefreshApp(); } catch {} }
    } finally { setLoading(false); }
  };

  // El componente ahora renderiza el botón que le pases a través de renderTrigger
  return (
    <>
      {renderTrigger({ onClick: () => setOpen(true) })}
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        size="md"
        title="Eliminar clase programada"
      >
        <div className="space-y-3">
          <div className="text-[12px] text-gray-700">
            Solo aparecen clases <b>programadas</b> y <b>no pagadas</b>.
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-500">
              No hay clases no pagadas para este alumno.
            </div>
          ) : (
            <>
              <select
                className="w-full p-2 rounded-lg border border-gray-300 focus:ring-rose-500 focus:border-rose-500"
                value={sel}
                onChange={(e) => setSel(e.target.value)}
              >
                {items.map((r) => (
                  <option key={r.id} value={r.id}>{fmt(r)}</option>
                ))}
              </select>

              {pkgInfo && !pkgInfo.isPaid && pkgInfo.count > 1 && (
                <div className="p-2 rounded-md bg-rose-50 border border-rose-200">
                  <label className="block text-[12px] text-gray-700 mb-1">
                    Se detectó un <b>paquete impago</b> vinculado a esta clase.
                    Cantidad de clases en el paquete: <b>{pkgInfo.count}</b>
                  </label>
                  <label className="inline-flex items-center gap-2 text-[12px] text-gray-700">
                    <input
                      type="checkbox"
                      checked={deletePaymentDoc}
                      onChange={(e) => setDeletePaymentDoc(e.target.checked)}
                    />
                    Eliminar también el registro de pago mensual (impago)
                  </label>
                  <button
                    type="button"
                    className="mt-2 w-full px-3 py-2 rounded-lg bg-rose-700 text-white hover:bg-rose-800"
                    onClick={async () => {
                      if (!window.confirm(`Eliminar TODO el paquete (clases impagas) asociado?`)) return;
                      await hardDeleteUnpaidMonthlyPackage({
                        db,
                        appId,
                        monthlyPaymentId: pkgInfo.id,
                        alsoDeletePaymentDoc: deletePaymentDoc,
                      });
                      await load();
                      setSel("");
                      setPkgInfo(null);
                      if (typeof softRefreshApp === "function") { try { await softRefreshApp(); } catch {} }
                    }}
                  >
                    Eliminar paquete completo
                  </button>
                </div>
              )}

              <button
                type="button"
                className="w-full px-3 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                onClick={doDelete}
                disabled={!sel || loading}
              >
                Eliminar clase individual
              </button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}



