import React, { useState, useEffect, useRef } from 'react';
import { writeBatch, serverTimestamp, collection as fsCollection, collectionGroup, doc, getDocs, deleteDoc, query, orderBy, updateDoc, where , limit , onSnapshot } from 'firebase/firestore';
import { ref as stRef, uploadBytesResumable, getDownloadURL, listAll, getMetadata } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { storage } from '../firebaseConfig.js';
import { Modal, ModalHeader } from './Modal.jsx';
import { IconReceipt, IconTrash } from './Icons.jsx';

import { waitForAuthReady, updateReceiptStatus, markStudentReceiptsAsSeen } from '../utils/authHelpers.js';
import { useStudentReceipts } from '../hooks/useStudentReceipts.js';
export const FileTypeIcon = ({ mime = '', filename = '' }) => {
    const isPdf = mime.includes('pdf') || filename.endsWith('.pdf');
    if (isPdf) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        );
    }
    return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
    );
};

function ReceiptCard({
  receipt, busyId, rejectingId, rejectNote, statusCfg,
  isImage, isPdf, fmtDate, onExpand,
  onApprove, onStartReject, onConfirmReject, onCancelReject, onRejectNoteChange, onReopen,
}) {
  const status = String(receipt.status || 'pending').toLowerCase();
  const cfg = statusCfg[status] || statusCfg.pending;
  const isImg = isImage(receipt.filename, receipt.url);
  const isRejecting = rejectingId === receipt.id;
  const busy = busyId === receipt.id;

  return (
    <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${status === 'pending' ? 'border-amber-300' : status === 'approved' ? 'border-green-200' : 'border-rose-200'}`}>

      {/* Preview de imagen */}
      {isImg && receipt.url && (
        <div
          className="w-full bg-gray-100 cursor-zoom-in flex items-center justify-center overflow-hidden"
          style={{ maxHeight: 220 }}
          onClick={() => onExpand(receipt.url)}
        >
          <img
            src={receipt.url}
            alt="Comprobante"
            className="w-full object-contain hover:opacity-90 transition-opacity"
            style={{ maxHeight: 220 }}
          />
        </div>
      )}

      {/* Preview PDF */}
      {isPdf(receipt.filename, receipt.url) && receipt.url && (
        <a
          href={receipt.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 bg-red-50 hover:bg-red-100 transition border-b border-red-100"
        >
          <svg className="w-8 h-8 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div>
            <p className="text-xs font-bold text-red-700">Comprobante PDF</p>
            <p className="text-[11px] text-red-500">Tocá para abrir</p>
          </div>
          <svg className="w-4 h-4 text-red-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        </a>
      )}

      {/* Info */}
      <div className="px-4 py-3 flex items-center justify-between gap-2">
        <div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${cfg.cls}`}>{cfg.label}</span>
          {receipt.rejectionNote && (
            <p className="text-xs text-rose-600 mt-1 italic">"{receipt.rejectionNote}"</p>
          )}
        </div>
        <p className="text-xs text-gray-400 flex-shrink-0">{fmtDate(receipt.createdAt)}</p>
      </div>

      {/* Acciones */}
      {status === 'pending' && !isRejecting && (
        <div className="grid grid-cols-2 border-t border-gray-100">
          <button
            onClick={() => onApprove(receipt.id)}
            disabled={busy}
            className="py-3.5 flex items-center justify-center gap-1.5 text-sm font-bold text-green-700 bg-green-50 hover:bg-green-100 transition border-r border-gray-100 disabled:opacity-50"
          >
            {busy ? <span className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"/> : '✓'} Aprobar
          </button>
          <button
            onClick={() => onStartReject(receipt.id)}
            disabled={busy}
            className="py-3.5 flex items-center justify-center gap-1.5 text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition disabled:opacity-50"
          >
            ✗ Rechazar
          </button>
        </div>
      )}

      {/* Panel de rechazo con nota */}
      {isRejecting && (
        <div className="border-t border-gray-100 p-3 bg-rose-50 space-y-2">
          <p className="text-xs font-bold text-rose-700">¿Por qué rechazás el comprobante? (opcional)</p>
          <textarea
            value={rejectNote}
            onChange={e => onRejectNoteChange(e.target.value)}
            placeholder="Ej: El monto no coincide, imagen ilegible..."
            className="w-full text-sm border border-rose-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white resize-none"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={() => onConfirmReject(receipt.id)}
              disabled={busy}
              className="flex-1 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition disabled:opacity-50"
            >
              {busy ? 'Rechazando...' : 'Confirmar rechazo'}
            </button>
            <button onClick={onCancelReject} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {status !== 'pending' && (
        <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
          <button
            onClick={() => onReopen(receipt.id)}
            disabled={busy}
            className="text-xs text-gray-500 hover:text-gray-700 font-semibold underline transition disabled:opacity-50"
          >
            Reabrir
          </button>
        </div>
      )}
    </div>
  );
}

export function ReceiptsModal({ db, appId, student, isOpen, onClose }) {
  // --- 1. Hooks y Estado ---
  const { receipts, loading } = useStudentReceipts(db, appId, student?.id);
  const [busyId, setBusyId] = React.useState(null);
  
const [displayDebt, setDisplayDebt] = React.useState(student?.pendingBalance || student?.debt || 0);

  // Sincronizar si cambia el alumno desde fuera
  React.useEffect(() => {
      setDisplayDebt(student?.debt || 0);
  }, [student]);

  // Inicializamos con el mes actual
  const getLocalMonth = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedMonth, setSelectedMonth] = React.useState(getLocalMonth());
  const [pendingMonthCount, setPendingMonthCount] = React.useState(0);
  const [loadingCount, setLoadingCount] = React.useState(false);
  const [pendingMonthsList, setPendingMonthsList] = React.useState([]);

  // --- 2. EFECTO: Escanear clases ---
  React.useEffect(() => {
    if (!student || !db || !appId) return;

    const calculatePending = async () => {
        setLoadingCount(true);
        try {
            const q = query(
                fsCollection(db, `artifacts/${appId}/scheduledClasses`),
                where("studentId", "==", student.id)
            );
            const snap = await getDocs(q);
            const allDocs = snap.docs.map(d => d.data());

            // Filtramos las que faltan asistencia
            const allPending = allDocs.filter(d => (!d.attendanceStatus) && (d.status !== 'cancelled') && d.classDate);

            // Agrupar por Mes
            const monthsMap = {};
            allPending.forEach(cls => {
                const m = cls.classDate.slice(0, 7); 
                monthsMap[m] = (monthsMap[m] || 0) + 1;
            });

            const sortedMonths = Object.keys(monthsMap).sort().map(m => ({
                monthStr: m,
                count: monthsMap[m],
                label: (() => {
                    const [y, mo] = m.split('-');
                    const date = new Date(y, mo - 1);
                    return date.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
                })()
            }));
            
            setPendingMonthsList(sortedMonths);

            if (selectedMonth) {
                setPendingMonthCount(monthsMap[selectedMonth] || 0);
            }
        } catch (e) { console.error(e); } finally { setLoadingCount(false); }
    };
    calculatePending();
  }, [selectedMonth, student, db, appId]);


  // --- 3. FUNCIONES DE ACCIÓN ---

  // A) EDITAR DEUDA MANUALMENTE (CON ACTUALIZACIÓN INSTANTÁNEA)
  const handleEditarDeudaManual = async () => {
      const current = displayDebt; // Usamos el valor visual actual
      const input = window.prompt("Ingresa el monto TOTAL de la deuda:", current);
      
      if (input === null) return;
      const newDebt = parseFloat(input);

      if (isNaN(newDebt)) {
          alert("Por favor ingresa un número válido.");
          return;
      }

      try {
          // 1. Actualizamos VISUALMENTE ya mismo (para que no tengas que esperar)
          setDisplayDebt(newDebt);

          // 2. Actualizamos en la base de datos
          const studentRef = doc(db, `artifacts/${appId}/students`, student.id);
          await updateDoc(studentRef, { debt: newDebt });
          
      } catch (e) {
          console.error(e);
          alert("Error al guardar en la base de datos.");
          // Si falla, volvemos al valor original
          setDisplayDebt(current);
      }
  };

  // B) Condonar Deuda
  const handleCondonarDeuda = async () => {
    if (!student || !db || !appId) return;
    const confirm = window.confirm(`¿Estás seguro de ELIMINAR TODA la deuda y dejarla en $0?`);
    if (confirm) {
      try {
        const batch = writeBatch(db);
        // Clases
        const qClasses = query(fsCollection(db, `artifacts/${appId}/scheduledClasses`), where("studentId", "==", student.id), where("isPaid", "==", false), where("scheduleType", "==", "single"));
        const snapClasses = await getDocs(qClasses);
        snapClasses.forEach(d => batch.update(d.ref, { isPaid: true, paymentMethod: 'condonado', paidAt: new Date() }));
        
        // Paquetes
        const qPack = query(fsCollection(db, `artifacts/${appId}/payments`), where("studentId", "==", student.id), where("paymentMethod", "==", "monthly_package_payment"), where("isPaidForPackage", "==", false));
        const snapPack = await getDocs(qPack);
        snapPack.forEach(d => {
            batch.update(d.ref, { isPaidForPackage: true, status: 'paid', paymentMethod: 'condonado', paidAt: new Date() });
            const data = d.data();
            if (data.associatedClassIds?.length) data.associatedClassIds.forEach(id => batch.update(doc(db, `artifacts/${appId}/scheduledClasses`, id), { isPaid: true }));
        });

        // Student
        batch.update(doc(db, `artifacts/${appId}/students`, student.id), { debt: 0 });
        
        await batch.commit();
        
        // Actualizamos visualmente a 0
        setDisplayDebt(0);
        alert("Deuda eliminada.");
        
      } catch (error) { console.error(error); alert("Error al eliminar deuda."); }
    }
  };

  // C) Marcar Presente Masivo
  const handleMarcarMesPresente = async () => {
      if (pendingMonthCount === 0) { alert(`No hay clases pendientes en el mes seleccionado.`); return; }
      const confirm = window.confirm(`¿Marcar PRESENTE a las ${pendingMonthCount} clases del mes ${selectedMonth}?`);
      if (confirm) {
          try {
              const [year, month] = selectedMonth.split('-').map(Number);
              const startDate = `${selectedMonth}-01`;
              const lastDayObj = new Date(year, month, 0); 
              const endDate = `${selectedMonth}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
              const q = query(fsCollection(db, `artifacts/${appId}/scheduledClasses`), where("studentId", "==", student.id), where("classDate", ">=", startDate), where("classDate", "<=", endDate));
              const snap = await getDocs(q);
              const batch = writeBatch(db);
              let updated = 0;
              snap.forEach((doc) => {
                  const d = doc.data();
                  if (!d.attendanceStatus && d.status !== 'cancelled') {
                      batch.update(doc.ref, { attendanceStatus: 'presente', attendanceCheckedAt: new Date(), attendanceSource: 'admin_bulk' });
                      updated++;
                  }
              });
              if (updated > 0) {
                  await batch.commit();
                  alert(`¡Listo! Se actualizaron ${updated} clases.`);
                  setPendingMonthsList(prev => prev.filter(m => m.monthStr !== selectedMonth));
                  setPendingMonthCount(0);
              } else { alert("No se encontraron cambios pendientes."); }
          } catch (error) { console.error(error); alert("Error al actualizar."); }
      }
  };

  const [rejectingId, setRejectingId] = React.useState(null);
  const [rejectNote,  setRejectNote]  = React.useState('');
  const [expandedImg, setExpandedImg] = React.useState(null); // url de imagen expandida

  const isImage = (filename = '', url = '') => {
    const ext = (filename || url).split('.').pop().toLowerCase().split('?')[0];
    return ['jpg','jpeg','png','gif','webp','heic','bmp'].includes(ext);
  };
  const isPdf = (filename = '', url = '') => {
    const ext = (filename || url).split('.').pop().toLowerCase().split('?')[0];
    return ext === 'pdf';
  };

  const sendPushToStudent = async (title, body) => {
    try {
      const fn = httpsCallable(getFunctions(), 'sendPushNotification');
      await fn({ studentIds: [student.id], title, body, appId, url: `https://estudiosandrapaloschi.web.app/#/checkin?a=${appId}` });
    } catch { /* silencioso si no tiene token */ }
  };

  const handleApprove = async (receiptId) => {
    setBusyId(receiptId);
    try {
      await updateReceiptStatus(db, appId, student.id, receiptId, 'approved');
      const firstName = (student.name || '').split(' ')[0];
      await sendPushToStudent(
        'Estudio Sandra Paloschi 🎵',
        `¡Hola ${firstName}! Tu comprobante de pago fue aprobado. ✅ ¡Gracias!`
      );
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setBusyId(null); }
  };

  const handleReject = async (receiptId) => {
    setBusyId(receiptId);
    try {
      const receiptRef = doc(db, `artifacts/${appId}/students/${student.id}/receipts`, receiptId);
      await updateDoc(receiptRef, { status: 'rejected', rejectionNote: rejectNote.trim(), processedAt: serverTimestamp() });
      const firstName = (student.name || '').split(' ')[0];
      const noteText = rejectNote.trim() ? ` Motivo: ${rejectNote.trim()}` : '';
      await sendPushToStudent(
        'Estudio Sandra Paloschi 🎵',
        `Hola ${firstName}, tu comprobante no pudo ser aprobado.${noteText} Por favor contactate con Sandra.`
      );
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setBusyId(null); setRejectingId(null); setRejectNote(''); }
  };

  const handleReopen = async (receiptId) => {
    setBusyId(receiptId);
    try { await updateReceiptStatus(db, appId, student.id, receiptId, 'pending'); }
    catch (e) { alert(`Error: ${e.message}`); }
    finally { setBusyId(null); }
  };

  const fmtDate = (ts) => {
    try {
      const d = ts?.toDate ? ts.toDate() : new Date();
      const now = new Date();
      const diff = Math.floor((now - d) / 60000);
      if (diff < 1) return 'Ahora';
      if (diff < 60) return `Hace ${diff} min`;
      if (diff < 1440) return `Hace ${Math.floor(diff/60)} hs`;
      return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    } catch { return '—'; }
  };

  const statusCfg = {
    pending:  { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved: { label: 'Aprobado',  cls: 'bg-green-100 text-green-800 border-green-200' },
    rejected: { label: 'Rechazado', cls: 'bg-rose-100  text-rose-800  border-rose-200'  },
  };

  const pendingReceipts = receipts.filter(r => r.status === 'pending');
  const otherReceipts   = receipts.filter(r => r.status !== 'pending');

  return (
    <>
      {/* Lightbox imagen expandida */}
      {expandedImg && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setExpandedImg(null)}
        >
          <button className="absolute top-4 right-4 text-white text-3xl font-bold leading-none">×</button>
          <img src={expandedImg} alt="Comprobante" className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" />
        </div>
      )}

      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <div className="flex flex-col" style={{ maxHeight: '90vh' }}>

          {/* ── HEADER ── */}
          <div className="px-5 py-4 border-b bg-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
              <IconReceipt />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900 text-base truncate">{student?.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${displayDebt > 0 ? 'bg-rose-100 text-rose-700' : 'bg-green-100 text-green-700'}`}>
                  {displayDebt > 0 ? `Debe $${displayDebt}` : 'Al día ✓'}
                </span>
                {pendingReceipts.length > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 animate-pulse">
                    {pendingReceipts.length} comprobante{pendingReceipts.length !== 1 ? 's' : ''} pendiente{pendingReceipts.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold flex-shrink-0">×</button>
          </div>

          {/* ── CUERPO ── */}
          <div className="flex-1 overflow-y-auto bg-gray-50">

            {/* Comprobantes pendientes — sección principal */}
            {loading ? (
              <div className="py-12 flex flex-col items-center gap-3">
                <div className="flex items-end gap-1" style={{ height: 24 }}>
                  {[3,5,4,6,3,5,4].map((h, i) => (
                    <div key={i} style={{ width:3, height: `${Math.round(h/6*24)}px`, backgroundColor:'#fda4af', borderRadius:2, animation:`soundwave 0.8s ${i*0.15}s ease-in-out infinite alternate` }}/>
                  ))}
                </div>
              </div>
            ) : receipts.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <div className="text-4xl mb-2">📄</div>
                <p className="text-sm">No hay comprobantes cargados</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">

                {/* Pendientes primero */}
                {pendingReceipts.map(receipt => (
                  <ReceiptCard
                    key={receipt.id}
                    receipt={receipt}
                    busyId={busyId}
                    rejectingId={rejectingId}
                    rejectNote={rejectNote}
                    statusCfg={statusCfg}
                    isImage={isImage}
                    isPdf={isPdf}
                    fmtDate={fmtDate}
                    onExpand={setExpandedImg}
                    onApprove={handleApprove}
                    onStartReject={(id) => { setRejectingId(id); setRejectNote(''); }}
                    onConfirmReject={handleReject}
                    onCancelReject={() => { setRejectingId(null); setRejectNote(''); }}
                    onRejectNoteChange={setRejectNote}
                    onReopen={handleReopen}
                  />
                ))}

                {/* Historial */}
                {otherReceipts.length > 0 && (
                  <>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider pt-2">Historial</p>
                    {otherReceipts.map(receipt => (
                      <ReceiptCard
                        key={receipt.id}
                        receipt={receipt}
                        busyId={busyId}
                        rejectingId={rejectingId}
                        rejectNote={rejectNote}
                        statusCfg={statusCfg}
                        isImage={isImage}
                        isPdf={isPdf}
                        fmtDate={fmtDate}
                        onExpand={setExpandedImg}
                        onApprove={handleApprove}
                        onStartReject={(id) => { setRejectingId(id); setRejectNote(''); }}
                        onConfirmReject={handleReject}
                        onCancelReject={() => { setRejectingId(null); setRejectNote(''); }}
                        onRejectNoteChange={setRejectNote}
                        onReopen={handleReopen}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ── DEUDA Y ASISTENCIA (colapsable, al final) ── */}
            <details className="mx-4 mb-4">
              <summary className="text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none py-2">
                ▸ Otras opciones (deuda · asistencia masiva)
              </summary>
              <div className="mt-3 space-y-3">
                {/* Deuda */}
                <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Saldo actual</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-2xl font-black ${displayDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>${displayDebt}</span>
                      <button onClick={handleEditarDeudaManual} className="p-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition" title="Editar">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                      </button>
                    </div>
                  </div>
                  <button onClick={handleCondonarDeuda} className="w-full sm:w-auto px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg transition flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    Eliminar deuda
                  </button>
                </div>
                {/* Asistencia masiva */}
                <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-3">Asistencia masiva</p>
                  {pendingMonthsList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {pendingMonthsList.map(m => (
                        <button key={m.monthStr} onClick={() => setSelectedMonth(m.monthStr)}
                          className={`px-3 py-1 text-xs rounded-full border font-bold transition ${selectedMonth === m.monthStr ? 'bg-orange-100 border-orange-300 text-orange-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                          {m.label} <span className="ml-1">({m.count})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row items-end gap-2">
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    <button onClick={handleMarcarMesPresente} disabled={pendingMonthCount === 0 || loadingCount}
                      className={`px-4 py-2 text-sm font-bold rounded-lg transition ${pendingMonthCount > 0 ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                      {loadingCount ? '...' : `Marcar ${pendingMonthCount} presentes`}
                    </button>
                  </div>
                </div>
              </div>
            </details>

          </div>
        </div>
      </Modal>
    </>
  );
}
// ============================================================
// POPUP DE EVENTOS PARA ALUMNOS (reemplaza la sección fija)
// ============================================================
// ============================================================
// POPUP DE EVENTOS PARA ALUMNOS (VERSIÓN CON DISEÑO MEJORADO)
// ============================================================
// ============================================================
// POPUP DE EVENTOS PARA ALUMNOS (VERSIÓN CON DISEÑO MEJORADO)
// ============================================================

export const ReceiptUploadBox = ({ db, appId, student }) => {
  const [file, setFile] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [lastUp, setLastUp] = React.useState([]);

  React.useEffect(() => {
    if (!db || !appId || !student?.id) return;
    const col = fsCollection(db, `artifacts/${appId}/students/${student.id}/receipts`);
    const qy = query(col, orderBy("createdAt","desc"), limit(5));
    const unsub = onSnapshot(qy, snap => {
      setLastUp(snap.docs.map(d => ({ id: d.id, ...(d.data()||{}) })));
    });
    return () => unsub && unsub();
  }, [db, appId, student?.id]);

  const onPick = (e) => {

    const f = e.target.files?.[0];
    if (!f) return setFile(null);
    const okTypes = ["application/pdf","image/png","image/jpeg","image/webp","image/jpg","image/heic","image/heif"];
    if (!okTypes.includes(f.type)) { alert("Formato no soportado. Subí PDF o imagen (PNG/JPG/WebP/HEIC)."); e.target.value = ""; return; }
    if (f.size > 15 * 1024 * 1024) { alert("El archivo supera 15MB. Comprimí o subí un PDF más liviano."); e.target.value = ""; return; }
    setFile(f);
  };

  // ✅ Handler corregido
 const doUpload = async () => {
  try {
    if (!db || !appId || !student?.id) { alert("Falta contexto de alumno."); return; }
    if (!file) { alert("Elegí un archivo primero."); return; }
    setBusy(true);

    await waitForAuthReady();

    const storage = getStorage(undefined, "gs://nuevaclase-135ec.appspot.com");
    const uuid = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    const ext  = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `artifacts/${appId}/students/${student.id}/receipts/${uuid}.${ext}`;
    const ctype = file.type || "application/octet-stream";

    const sref = stRef(storage, path);
    // podés usar uploadBytesResumable o uploadBytes; el problema es getDownloadURL, no la subida
    await uploadBytesResumable(sref, file, { contentType: ctype });

    const col = fsCollection(db, `artifacts/${appId}/students/${student.id}/receipts`);
    await fsAddDoc(col, {
      studentId: student.id,
      // 👇 guardamos path y bucket, NO url
      path,
      bucket: "nuevaclase-135ec.appspot.com",
      filename: file.name,
      contentType: ctype,
      size: file.size || 0,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    alert("¡Comprobante enviado! Lo vamos a revisar.");
    setFile(null);
  } catch (e) {
    console.error("[receipt] ERROR", e?.code, e?.message, e);
    alert(`No se pudo subir el comprobante.\n${e?.code || ""} ${e?.message || ""}`.trim());
  } finally {
    setBusy(false);
  }
};


  return (
    <div className="rounded-lg sm:rounded-xl border border-gray-200 bg-white p-4 sm:p-6 mt-3">
      <div className="text-sm sm:text-base font-semibold text-gray-900 mb-2">Enviar comprobante de pago</div>
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        <input type="file" accept=".pdf,image/*" onChange={onPick} className="block w-full text-sm border rounded-lg p-2" />
        <button
          type="button"
          onClick={doUpload}
          disabled={!file || busy}
          className="w-full sm:w-auto text-sm font-medium px-3 py-2 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200 disabled:opacity-50"
        >
          {busy ? "Enviando..." : "Subir comprobante"}
        </button>
      </div>

      {lastUp?.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-gray-600 mb-1">Tus últimos envíos</div>
          <ul className="text-xs text-gray-800 space-y-1">
            {lastUp.map(r => (
  <li key={r.id} className="flex items-center justify-between">
    <span className="break-all">{r.filename || "archivo"}</span>
    <span className={"ml-2 px-2 py-0.5 rounded-full border " + (
      r.status === "approved" ? "bg-green-50 border-green-200 text-green-800"
      : r.status === "rejected" ? "bg-red-50 border-red-200 text-red-700"
      : "bg-amber-50 border-amber-200 text-amber-800"
    )}>
      {r.status || "pending"}
    </span>
  </li>
))}

          </ul>
        </div>
      )}
    </div>
  );
};


const getInitialsColor = (name = '') => {
  const colors = [
    'bg-rose-500', 'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-cyan-500', 'bg-pink-500', 'bg-indigo-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name = '') => {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
};

export function ReceiptsCenter({ db, appId, students }) {
  const [open, setOpen] = React.useState(false);
  const [student, setStudent] = React.useState(null);
  const [studentId, setStudentId] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [pendingMap, setPendingMap] = React.useState({}); // { studentId: count }

  // Escuchar comprobantes pendientes vía collectionGroup, filtrado a alumnos conocidos
  const knownIds = React.useMemo(
    () => new Set((students || []).map(s => s.id)),
    [students]
  );
  React.useEffect(() => {
    if (!db || !appId) return;
    const q = query(collectionGroup(db, 'receipts'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, snap => {
      const map = {};
      snap.docs.forEach(d => {
        const sid = d.ref.parent?.parent?.id;
        if (sid && knownIds.has(sid)) map[sid] = (map[sid] || 0) + 1;
      });
      setPendingMap(map);
    }, () => setPendingMap({}));
    return () => unsub();
  }, [db, appId, knownIds]);

  // Listener de evento global para abrir desde PAGO NUEVO badge
  React.useEffect(() => {
    const handler = (e) => {
      const id = e.detail?.studentId;
      if (!id || !students?.length) return;
      const found = students.find(s => s.id === id);
      if (found) { setStudent(found); setStudentId(id); setOpen(true); }
    };
    window.addEventListener('sp:openReceipts', handler);
    return () => window.removeEventListener('sp:openReceipts', handler);
  }, [students]);

  const handleClose = () => { setOpen(false); setStudent(null); setStudentId(''); };

  const handleStudentSelect = (id) => {
    const selected = (students || []).find(s => s.id === id);
    if (selected) { setStudent(selected); setStudentId(id); setOpen(true); }
  };

  const totalPending = Object.values(pendingMap).reduce((a, b) => a + b, 0);

  // Ordenar: con comprobantes pendientes primero, luego por nombre
  const sortedStudents = React.useMemo(() => {
    const active = (students || []).filter(s => !s.isArchived);
    const q = (searchTerm || '').toLowerCase();
    const filtered = q
      ? active.filter(s => (s.name || s.fullName || '').toLowerCase().includes(q))
      : active;
    return [...filtered].sort((a, b) => {
      const pa = pendingMap[a.id] || 0;
      const pb = pendingMap[b.id] || 0;
      if (pb !== pa) return pb - pa;
      return (a.name || '').localeCompare(b.name || '', 'es');
    });
  }, [students, searchTerm, pendingMap]);

  return (
    <>
      {/* Botón oculto — el sidebar lo dispara con querySelector title="Comprobantes" */}
      <button title="Comprobantes" onClick={() => setOpen(true)} className="hidden" />

      {/* Modal selector de alumnos */}
      <Modal isOpen={open && !student} onClose={handleClose} size="md">
        <div className="flex flex-col" style={{ maxHeight: '80vh' }}>
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                <IconReceipt className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-base">Centro de Comprobantes</h2>
                <p className="text-xs text-gray-500">
                  {totalPending > 0
                    ? <span className="text-amber-600 font-semibold">{totalPending} comprobante{totalPending !== 1 ? 's' : ''} pendiente{totalPending !== 1 ? 's' : ''} de revisión</span>
                    : 'Todos los comprobantes al día'}
                </p>
              </div>
            </div>

            {/* Buscador */}
            <div className="mt-4 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar alumno..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 bg-gray-50"
              />
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto py-2">
            {sortedStudents.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-10">
                {searchTerm ? 'Sin coincidencias.' : 'No hay alumnos.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {sortedStudents.map(s => {
                  const pending = pendingMap[s.id] || 0;
                  const name = s.name || s.fullName || 'Sin nombre';
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => handleStudentSelect(s.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-rose-50 transition-colors text-left"
                      >
                        {/* Avatar */}
                        {s.photoURL ? (
                          <img src={s.photoURL} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-2 ring-white shadow-sm" />
                        ) : (
                          <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white shadow-sm ${getInitialsColor(name)}`}>
                            {getInitials(name)}
                          </div>
                        )}

                        {/* Nombre + info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
                          {s.level && <p className="text-[11px] text-gray-400 truncate">{s.level}</p>}
                        </div>

                        {/* Badge pendiente */}
                        {pending > 0 && (
                          <span className="flex-shrink-0 min-w-[22px] h-[22px] rounded-full bg-amber-500 text-white text-[11px] font-extrabold flex items-center justify-center px-1.5 shadow-sm animate-pulse">
                            {pending}
                          </span>
                        )}

                        {/* Chevron */}
                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal comprobantes del alumno */}
      {student && (
        <ReceiptsModal
          key={studentId}
          db={db}
          appId={appId}
          student={student}
          isOpen={open}
          onClose={handleClose}
        />
      )}
    </>
  );
}

