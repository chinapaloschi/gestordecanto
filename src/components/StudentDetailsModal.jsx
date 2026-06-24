import React, { useState, useEffect } from 'react';
import { collection as fsCollection, doc, getDocs, deleteDoc, updateDoc, increment, query, where, orderBy, limit } from 'firebase/firestore';
import { Modal } from './Modal.jsx';
import { formatMoneyAr } from '../utils/money.js';
import { formatDateToDDMMYYYY, mapClassTypeToSpanish } from '../utils/classHelpers.js';
import { ProfilePictureUploader } from './UploadComponents.jsx';
import { RepertoireModal } from './RepertoireModals.jsx';
import { CertificateGeneratorModal } from './CertificateModals.jsx';
import { ReceiptsModal } from './ReceiptsComponents.jsx';
import { UnpaidClassDeleteButton } from './PortalAlumnoComponents.jsx';
import { isPresent, isAbsent } from '../utils/studentHelpers.js';
import {
  IconPlusCircle, IconRefresh, IconCalendar, IconCreditCard,
  IconMusic, IconReceipt, IconAward, IconArchive, IconTrash, IconEdit,
} from './Icons.jsx';

const VOCAL_TYPES = ['Sin definir','Soprano','Mezzo-soprano','Contralto','Tenor','Barítono','Bajo'];
const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 transition';
const labelCls = 'block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5';

// ── Icono WhatsApp ────────────────────────────────────────────────────────────
const WaIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.557 4.116 1.533 5.847L.057 23.54a.75.75 0 00.915.976l5.876-1.54A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22.5a10.453 10.453 0 01-5.374-1.48l-.385-.23-3.99 1.046 1.064-3.887-.253-.4A10.441 10.441 0 011.5 12C1.5 6.201 6.201 1.5 12 1.5S22.5 6.201 22.5 12 17.799 22.5 12 22.5z"/>
  </svg>
);

// ── Botón secundario ──────────────────────────────────────────────────────────
const SecBtn = ({ icon, label, onClick, iconColor = 'text-gray-500', danger = false }) => (
  <button onClick={onClick}
    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl transition border text-center
      ${danger ? 'bg-red-50 hover:bg-red-100 border-red-100' : 'bg-gray-50 hover:bg-gray-100 border-gray-100'}`}>
    <span className={iconColor}>{icon}</span>
    <span className={`text-[10px] font-semibold leading-tight ${danger ? 'text-red-600' : 'text-gray-600'}`}>{label}</span>
  </button>
);

// ── Historial de notas de clase ───────────────────────────────────────────────
const ClassNotesHistory = ({ db, appId, studentId }) => {
  const [classNotesList, setClassNotesList] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    if (!db || !appId || !studentId) return;
    let cancelled = false;
    const loadNotes = async () => {
      setLoadingNotes(true);
      try {
        const q = query(
          fsCollection(db, `artifacts/${appId}/scheduledClasses`),
          where('studentId', '==', studentId),
          orderBy('classDate', 'desc'),
          limit(30)
        );
        const snap = await getDocs(q);
        const withNotes = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => c.classNotes && c.classNotes.trim());
        if (!cancelled) setClassNotesList(withNotes);
      } catch {} finally { if (!cancelled) setLoadingNotes(false); }
    };
    loadNotes();
    return () => { cancelled = true; };
  }, [db, appId, studentId]);

  if (!classNotesList.length && !loadingNotes) return null;

  const fmt = (dateStr) => {
    try {
      const [y,m,d] = (dateStr || '').split('-');
      return `${d}/${m}/${y}`;
    } catch { return dateStr; }
  };

  return (
    <div className="border border-indigo-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setNotesOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 transition text-left">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
            Notas de clase ({classNotesList.length})
          </span>
        </div>
        <svg className={`w-4 h-4 text-indigo-400 transition-transform ${notesOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {notesOpen && (
        <div className="divide-y divide-indigo-50 max-h-56 overflow-y-auto">
          {loadingNotes ? (
            <div className="p-4 text-center text-xs text-gray-400">Cargando...</div>
          ) : classNotesList.map(cls => (
            <div key={cls.id} className="px-3 py-2.5 hover:bg-indigo-50/50 transition">
              <p className="text-[10px] font-bold text-indigo-400 uppercase mb-0.5">
                {fmt(cls.classDate)} · {cls.startTime || cls.classTime || ''}
              </p>
              <p className="text-sm text-gray-700 leading-snug whitespace-pre-wrap">{cls.classNotes}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const StudentDetailsModal = ({
  onClose, studentData, db, userId, appId, showMessage,
  onDeleteStudentRequest, onGenerateCertificate, initialEditMode = false,
  onOpenScheduleClassModal, onOpenMarkPaymentModal, onOpenRenewSubscriptionModal,
  onOpenRescheduleClassModal, onArchiveStudentRequest,
}) => {
  const [localStudent,   setLocalStudent]   = useState(studentData);
  const [isEditing,      setIsEditing]      = useState(initialEditMode);
  const [saving,         setSaving]         = useState(false);
  const [showWaMenu,     setShowWaMenu]     = useState(false);
  const [showRepertoire, setShowRepertoire] = useState(false);
  const [showReceipts,   setShowReceipts]   = useState(false);

  // Data fetched
  const [nextClass,      setNextClass]      = useState(null);
  const [recentClasses,  setRecentClasses]  = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);
  const [flexCredits,    setFlexCredits]    = useState([]);
  const [adjustingFlexId, setAdjustingFlexId] = useState(null);
  const [registeringFlexPaymentId, setRegisteringFlexPaymentId] = useState(null);

  // Suma o resta una clase del total de un Abono Flexible (para corregirlo sobre la marcha,
  // ya que al crearlo no siempre se sabe cuántas clases va a haber realmente en el mes)
  const adjustFlexTotal = async (fc, delta) => {
    if (adjustingFlexId) return;
    const newTotal = (fc.clasesTotal || 0) + delta;
    if (newTotal < (fc.clasesUsadas || 0) || newTotal < 1) return;
    setAdjustingFlexId(fc.id);
    try {
      await updateDoc(doc(db, `artifacts/${appId}/payments`, fc.id), { clasesTotal: increment(delta) });
      setFlexCredits(prev => prev.map(c => c.id === fc.id ? { ...c, clasesTotal: newTotal } : c));
      showMessage(delta > 0 ? '+1 clase agregada al abono.' : 'Se quitó 1 clase del abono.', 'success');
    } catch (e) { showMessage('Error: ' + e.message, 'error'); }
    finally { setAdjustingFlexId(null); }
  };

  // Registra el cobro de 1 clase de un Abono Flexible "por clase" (pago incremental).
  // Cuando se cobran todas las clases del abono, queda marcado como pagado en su totalidad.
  const registerFlexClassPayment = async (fc) => {
    if (registeringFlexPaymentId) return;
    const total = fc.clasesTotal || 0;
    const paidSoFar = fc.clasesPagadas || 0;
    if (paidSoFar >= total) return;
    setRegisteringFlexPaymentId(fc.id);
    try {
      const newPaid = paidSoFar + 1;
      const updates = { clasesPagadas: increment(1) };
      if (newPaid >= total) { updates.isPaidForPackage = true; updates.paidAt = new Date(); }
      await updateDoc(doc(db, `artifacts/${appId}/payments`, fc.id), updates);
      setFlexCredits(prev => prev.map(c => c.id === fc.id
        ? { ...c, clasesPagadas: newPaid, ...(newPaid >= total ? { isPaidForPackage: true } : {}) }
        : c));
      showMessage(newPaid >= total
        ? `💰 Cobro registrado: abono completamente pagado (${newPaid}/${total} clases).`
        : `💰 Cobro registrado: ${newPaid}/${total} clases pagadas.`, 'success');
    } catch (e) { showMessage('Error: ' + e.message, 'error'); }
    finally { setRegisteringFlexPaymentId(null); }
  };

  // Edit form
  const [editedName,    setEditedName]    = useState(studentData?.name || '');
  const [editedDni,     setEditedDni]     = useState(studentData?.dni || '');
  const [editedWa,      setEditedWa]      = useState(studentData?.whatsapp || '');
  const [editedEmail,   setEditedEmail]   = useState(studentData?.email || '');
  const [editedBirth,   setEditedBirth]   = useState(studentData?.birthDate || '');
  const [editedVocal,   setEditedVocal]   = useState(studentData?.vocal || 'Sin definir');
  const [editedLevel,   setEditedLevel]   = useState(studentData?.level || 'Principiante');
  const [editedNotes,   setEditedNotes]   = useState(studentData?.notes || '');
  const [editedReceipt, setEditedReceipt] = useState(studentData?.manualReceiptEnabled || false);

  useEffect(() => {
    if (studentData) {
      setLocalStudent(studentData);
      setEditedName(studentData.name || '');
      setEditedDni(studentData.dni || '');
      setEditedWa(studentData.whatsapp || '');
      setEditedEmail(studentData.email || '');
      setEditedBirth(studentData.birthDate || '');
      setEditedVocal(studentData.vocal || 'Sin definir');
      setEditedLevel(studentData.level || 'Principiante');
      setEditedNotes(studentData.notes || '');
      setEditedReceipt(studentData.manualReceiptEnabled || false);
    }
  }, [studentData]);

  // Fetch data from Firestore
  useEffect(() => {
    if (!db || !appId || !localStudent?.id) return;
    const sid = localStudent.id;
    const today = new Date().toISOString().split('T')[0];

    // Próxima clase
    getDocs(query(
      fsCollection(db, `artifacts/${appId}/scheduledClasses`),
      where('studentId', '==', sid), where('classDate', '>=', today),
      orderBy('classDate'), orderBy('startTime'), limit(1)
    )).then(s => { if (!s.empty) setNextClass(s.docs[0].data()); }).catch(() => {});

    // Últimas 8 clases (asistencias dots)
    getDocs(query(
      fsCollection(db, `artifacts/${appId}/scheduledClasses`),
      where('studentId', '==', sid), where('classDate', '<', today),
      orderBy('classDate', 'desc'), limit(8)
    )).then(s => setRecentClasses(s.docs.map(d => d.data()).reverse())).catch(() => {});

    // Últimos 3 pagos
    getDocs(query(
      fsCollection(db, `artifacts/${appId}/payments`),
      where('studentId', '==', sid),
      orderBy('createdAt', 'desc'), limit(3)
    )).then(s => setRecentPayments(s.docs.map(d => ({ id: d.id, ...d.data() })))).catch(() => {});

    // Abonos flexibles activos (incluye los "por clase" que todavía están pendientes de cobro)
    getDocs(query(
      fsCollection(db, `artifacts/${appId}/payments`),
      where('studentId', '==', sid),
      where('paymentMethod', '==', 'abono_flexible')
    )).then(s => {
      setFlexCredits(s.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(c => (c.clasesTotal || 0) > (c.clasesUsadas || 0) || c.isPaidForPackage === false));
    }).catch(() => {});
  }, [localStudent?.id, db, appId]);

  if (!localStudent) return null;

  const firstName = (localStudent.name || '').split(' ')[0];
  const debt = localStudent.pendingBalance || 0;
  const hasDebt = debt > 0;
  const waRaw = (localStudent.whatsapp || localStudent.contactInfo || '').replace(/\D/g, '');
  const hasWa = waRaw.length >= 8;

  const openWa = (msg) => {
    if (!hasWa) { showMessage('No hay número de WhatsApp guardado. Editá el perfil.', 'error'); return; }
    window.open(`https://wa.me/549${waRaw}?text=${encodeURIComponent(msg)}`, '_blank');
    setShowWaMenu(false);
  };

  const month = new Date().toLocaleDateString('es-AR', { month: 'long' });
  const waMsgs = [
    hasDebt && {
      label: '💰 Recordatorio de pago',
      color: 'text-red-700',
      bg: 'hover:bg-red-50',
      msg: `Hola ${firstName}, te recuerdo que tenés ${formatMoneyAr(debt)} pendiente del mes de ${month}. Cualquier consulta escribime. ¡Saludos, Sandra! 🎵`,
    },
    {
      label: '📅 Recordar clase',
      color: 'text-blue-700',
      bg: 'hover:bg-blue-50',
      msg: `Hola ${firstName}, te recuerdo tu clase de mañana. ¡Hasta pronto! 🎵`,
    },
    {
      label: '👋 Saludo general',
      color: 'text-green-700',
      bg: 'hover:bg-green-50',
      msg: `Hola ${firstName}, ¿cómo estás? Te escribo desde el Estudio Sandra Paloschi 🎵`,
    },
  ].filter(Boolean);

  const handleAction = (action, shouldClose = true) => {
    if (action) action(localStudent);
    if (shouldClose) onClose();
  };

  const toggleManualReceipt = async (val) => {
    setLocalStudent(p => ({ ...p, manualReceiptEnabled: val }));
    try {
      await updateDoc(doc(db, `artifacts/${appId}/students`, localStudent.id), { manualReceiptEnabled: val });
    } catch {
      setLocalStudent(p => ({ ...p, manualReceiptEnabled: !val }));
    }
  };

  const handleSave = async () => {
    if (!editedName.trim() || !editedDni.trim()) {
      showMessage('Nombre y DNI son obligatorios.', 'error'); return;
    }
    setSaving(true);
    try {
      const updates = {
        name: editedName.trim(), dni: editedDni.trim(),
        whatsapp: editedWa.trim(), email: editedEmail.trim(),
        birthDate: editedBirth || null, vocal: editedVocal,
        level: editedLevel, notes: editedNotes.trim(),
        manualReceiptEnabled: editedReceipt,
        contactInfo: [editedWa, editedEmail].filter(Boolean).join(' / ') || localStudent.contactInfo || '-',
      };
      await updateDoc(doc(db, `artifacts/${appId}/students`, localStudent.id), updates);
      setLocalStudent(p => ({ ...p, ...updates }));
      showMessage('Perfil actualizado.', 'success');
      setIsEditing(false);
    } catch (err) {
      showMessage('Error: ' + err.message, 'error');
    } finally { setSaving(false); }
  };

  // ── MODO EDICIÓN ────────────────────────────────────────────────────────────
  if (isEditing) return (
    <>
      <div className="bg-white rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-rose-600 to-rose-500 px-5 py-4 flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-xl"><IconEdit /></div>
          <div>
            <h3 className="text-white font-bold">Editar Perfil</h3>
            <p className="text-rose-200 text-xs">Modificá los datos de {firstName}</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Nombre completo *</label>
              <input type="text" value={editedName} onChange={e => setEditedName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>DNI *</label>
              <input type="text" value={editedDni} onChange={e => setEditedDni(e.target.value)} className={inputCls} inputMode="numeric" />
            </div>
            <div>
              <label className={labelCls}>📅 Nacimiento</label>
              <input type="date" value={editedBirth} onChange={e => setEditedBirth(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>📱 WhatsApp</label>
              <input type="tel" value={editedWa} onChange={e => setEditedWa(e.target.value)} className={inputCls} placeholder="11 2345-6789" />
            </div>
            <div>
              <label className={labelCls}>📧 Email</label>
              <input type="email" value={editedEmail} onChange={e => setEditedEmail(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Clasificación vocal</label>
              <select value={editedVocal} onChange={e => setEditedVocal(e.target.value)} className={inputCls}>
                {VOCAL_TYPES.map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Nivel</label>
              <select value={editedLevel} onChange={e => setEditedLevel(e.target.value)} className={inputCls}>
                {['Principiante','Intermedio','Avanzado'].map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Notas</label>
              <textarea value={editedNotes} onChange={e => setEditedNotes(e.target.value)} rows={3}
                className={inputCls + ' resize-none'} placeholder="Observaciones..." />
            </div>
            <div className="col-span-2 flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <input type="checkbox" id="rcpt" checked={editedReceipt} onChange={e => setEditedReceipt(e.target.checked)}
                className="h-4 w-4 text-rose-600 rounded" />
              <label htmlFor="rcpt" className="text-xs text-gray-600 cursor-pointer">Habilitar carga de comprobantes</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50 transition">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
      <RepertoireModal isOpen={false} onClose={() => {}} db={db} appId={appId} studentId={localStudent.id} showMessage={showMessage} />
    </>
  );

  // ── MODO VISUALIZACIÓN ──────────────────────────────────────────────────────
  return (
    <>
      <div className="bg-white rounded-xl overflow-hidden">

        {/* HEADER */}
        <div className={`px-5 pt-5 pb-4 ${hasDebt ? 'bg-red-50' : 'bg-emerald-50'}`}>
          <div className="flex items-start gap-4">
            <ProfilePictureUploader db={db} appId={appId} student={localStudent} setStudent={setLocalStudent} />
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-gray-900 text-lg uppercase leading-tight">{localStudent.name}</h2>
                <button onClick={() => setIsEditing(true)} className="p-1 rounded-full hover:bg-black/10 text-gray-400 flex-shrink-0" title="Editar perfil">
                  <IconEdit />
                </button>
              </div>

              {/* Badge deuda */}
              {hasDebt ? (
                <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
                  🔴 Debe {formatMoneyAr(debt)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                  ✅ Al día
                </span>
              )}

              {/* Vocal + nivel */}
              {(localStudent.vocal && localStudent.vocal !== 'Sin definir') || localStudent.level ? (
                <p className="text-xs text-gray-400 mt-1">
                  {[localStudent.vocal !== 'Sin definir' && localStudent.vocal, localStudent.level].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>
          </div>

          {/* WhatsApp */}
          <div className="mt-3 relative" onMouseLeave={() => setShowWaMenu(false)}>
            {hasWa ? (
              <>
                <button onClick={() => setShowWaMenu(p => !p)}
                  className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition shadow-sm">
                  <WaIcon /> WhatsApp
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                {showWaMenu && (
                  <div className="absolute top-10 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl min-w-[240px] overflow-hidden">
                    {waMsgs.map(m => (
                      <button key={m.label} onClick={() => openWa(m.msg)}
                        className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 last:border-0 transition ${m.bg}`}>
                        <p className={`font-bold ${m.color}`}>{m.label}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{m.msg}</p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <button onClick={() => setIsEditing(true)} className="text-xs text-gray-400 underline italic hover:text-gray-600 transition">
                + Agregar WhatsApp al perfil
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* PRÓXIMA CLASE */}
          {nextClass && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <div>
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Próxima clase</p>
                <p className="text-sm font-semibold text-blue-900">
                  {formatDateToDDMMYYYY(new Date(nextClass.classDate + 'T12:00:00'))} · {nextClass.startTime} hs
                </p>
              </div>
            </div>
          )}

          {/* DOTS ASISTENCIAS */}
          {recentClasses.length > 0 && (
            <div>
              <p className={labelCls}>Últimas {recentClasses.length} clases</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {recentClasses.map((cls, i) => {
                  const p = isPresent(cls.attendanceStatus);
                  const a = isAbsent(cls.attendanceStatus);
                  return (
                    <div key={i} title={`${cls.classDate} ${cls.startTime}`}
                      className={`w-5 h-5 rounded-full flex-shrink-0 border-2 border-white shadow-sm
                        ${p ? 'bg-green-500' : a ? 'bg-red-400' : 'bg-gray-200'}`}
                    />
                  );
                })}
                <span className="ml-1 text-xs text-gray-400">
                  <span className="text-green-600 font-bold">{recentClasses.filter(c => isPresent(c.attendanceStatus)).length} ✓</span>
                  {' · '}
                  <span className="text-red-500 font-bold">{recentClasses.filter(c => isAbsent(c.attendanceStatus)).length} ✗</span>
                  {' · '}
                  <span className="text-gray-400">{recentClasses.filter(c => !isPresent(c.attendanceStatus) && !isAbsent(c.attendanceStatus)).length} —</span>
                </span>
              </div>
            </div>
          )}

          {/* ACCIONES */}
          <div className="space-y-2">
            {/* Primary */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleAction(onOpenScheduleClassModal)}
                className="flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition shadow-md shadow-blue-100">
                <IconPlusCircle /> Programar
              </button>
              <button
                onClick={() => handleAction(onOpenMarkPaymentModal)}
                disabled={!localStudent.hasAnyUnpaidItems}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition shadow-md
                  ${localStudent.hasAnyUnpaidItems ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-100' : 'bg-gray-100 text-gray-300 cursor-default'}`}
              >
                <IconCreditCard /> Marcar Pago
              </button>
            </div>

            {/* Secondary grid */}
            <div className="grid grid-cols-4 gap-1.5">
              <SecBtn icon={<IconRefresh/>}  label="Renovar"      onClick={() => handleAction(onOpenRenewSubscriptionModal, false)} iconColor="text-green-600" />
              <SecBtn icon={<IconCalendar/>} label="Cambiar\nHorario" onClick={() => handleAction(onOpenRescheduleClassModal)} iconColor="text-orange-500" />
              <SecBtn icon={<IconMusic/>}    label="Repertorio"   onClick={() => setShowRepertoire(true)} iconColor="text-purple-600" />
              <SecBtn icon={<IconReceipt/>}  label="Comprobantes" onClick={() => setShowReceipts(true)}  iconColor="text-slate-600" />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <SecBtn icon={<IconAward/>}   label="Certificado" onClick={() => handleAction(onGenerateCertificate, false)} iconColor="text-indigo-600" />
              <SecBtn icon={<IconArchive/>} label="Archivar"    onClick={() => handleAction(onArchiveStudentRequest)}       iconColor="text-gray-500" />
              <UnpaidClassDeleteButton db={db} appId={appId} student={localStudent}
                renderTrigger={({ onClick }) => (
                  <SecBtn icon={<IconTrash/>} label="Elim. Clase" onClick={onClick} iconColor="text-red-500" danger />
                )}
              />
              <SecBtn icon={<IconTrash/>} label="Elim. Alumno" onClick={() => handleAction(onDeleteStudentRequest)} iconColor="text-red-500" danger />
            </div>
          </div>

          {/* ÚLTIMOS PAGOS */}
          {recentPayments.length > 0 && (
            <div>
              <p className={labelCls}>Últimos pagos</p>
              <div className="space-y-1.5">
                {recentPayments.map(p => {
                  let dateLabel = '—';
                  try {
                    if (p.periodStartDate) {
                      dateLabel = new Date(p.periodStartDate + 'T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                    } else if (p.createdAt?.seconds) {
                      dateLabel = new Date(p.createdAt.seconds * 1000).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
                    }
                  } catch {}
                  return (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                      <div>
                        <p className="font-semibold text-gray-800 text-xs capitalize">{dateLabel}</p>
                        <p className="text-[10px] text-gray-400">{p.paymentMethod === 'monthly_package_payment' ? 'Abono mensual' : p.paymentMethod === 'abono_flexible' ? 'Abono flexible' : 'Clase suelta'}</p>
                      </div>
                      <span className="font-bold text-emerald-700 text-sm">{formatMoneyAr(p.amount || p.monto || p.total || 0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ABONOS FLEXIBLES ACTIVOS */}
          {flexCredits.length > 0 && (
            <div>
              <p className={labelCls}>🎫 Abonos Flexibles</p>
              <div className="space-y-2">
                {flexCredits.map(fc => {
                  const rem = (fc.clasesTotal || 0) - (fc.clasesUsadas || 0);
                  const porClasePendiente = fc.cobroPorClase && !fc.isPaidForPackage;
                  const todoJuntoPendiente = !fc.cobroPorClase && !fc.isPaidForPackage;
                  const clasesPagadas = fc.clasesPagadas || 0;
                  const montoPorClase = fc.montoPorClase || (fc.clasesTotal ? Math.round((fc.amount || 0) / fc.clasesTotal) : 0);
                  return (
                    <div key={fc.id} className="bg-violet-50 border border-violet-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-violet-900">
                          {rem > 0
                            ? <>{rem} clase{rem !== 1 ? 's' : ''} restante{rem !== 1 ? 's' : ''} de {fc.clasesTotal}</>
                            : <>✅ Las {fc.clasesTotal} clases ya se dictaron</>}
                        </p>
                        <p className="text-xs text-violet-600">
                          {fc.periodStartDate ? `Mes: ${new Date(fc.periodStartDate + 'T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}` : ''} · ${new Intl.NumberFormat('es-AR').format(fc.amount || 0)}
                        </p>
                      </div>
                      {/* Barra de progreso + ajuste de cantidad */}
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div className="w-20 h-2 bg-violet-200 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-600 rounded-full transition-all"
                            style={{ width: `${(fc.clasesUsadas || 0) / (fc.clasesTotal || 1) * 100}%` }}/>
                        </div>
                        <p className="text-[9px] text-violet-500">{fc.clasesUsadas || 0}/{fc.clasesTotal} usadas</p>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => adjustFlexTotal(fc, -1)}
                            disabled={adjustingFlexId === fc.id || (fc.clasesTotal || 0) <= Math.max(1, fc.clasesUsadas || 0)}
                            title="Quitar una clase de este abono"
                            className="w-5 h-5 rounded bg-violet-100 text-violet-600 hover:bg-violet-200 disabled:opacity-30 font-black text-xs leading-none flex items-center justify-center transition">−</button>
                          <span className="text-[9px] text-violet-400 font-semibold">ajustar</span>
                          <button
                            onClick={() => adjustFlexTotal(fc, 1)}
                            disabled={adjustingFlexId === fc.id}
                            title="Sumar una clase a este abono"
                            className="w-5 h-5 rounded bg-violet-100 text-violet-600 hover:bg-violet-200 disabled:opacity-30 font-black text-xs leading-none flex items-center justify-center transition">+</button>
                        </div>
                      </div>
                      {/* Botón cancelar */}
                      <button
                        onClick={async () => {
                          const piezas = [];
                          if (rem > 0) piezas.push(`las ${rem} clase${rem !== 1 ? 's' : ''} restante${rem !== 1 ? 's' : ''}`);
                          if (!fc.isPaidForPackage) piezas.push(`la deuda pendiente de $${new Intl.NumberFormat('es-AR').format(fc.amount || 0)}`);
                          const detalle = piezas.length ? ` Se eliminará ${piezas.join(' y ')}.` : '';
                          if (!window.confirm(`¿Anular este abono flexible de ${fc.clasesTotal} clases?${detalle} Esta acción no se puede deshacer.`)) return;
                          try {
                            await deleteDoc(doc(db, `artifacts/${appId}/payments`, fc.id));
                            setFlexCredits(prev => prev.filter(c => c.id !== fc.id));
                            showMessage('Abono flexible anulado.', 'success');
                          } catch (e) { showMessage('Error: ' + e.message, 'error'); }
                        }}
                        className="p-1.5 rounded-lg bg-red-100 text-red-500 hover:bg-red-200 transition flex-shrink-0"
                        title="Anular abono flexible">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </div>
                    {porClasePendiente && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border-t border-amber-200">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-amber-800">💸 Cobro por clase: {clasesPagadas}/{fc.clasesTotal} pagadas</p>
                          <p className="text-[10px] text-amber-600">${new Intl.NumberFormat('es-AR').format(montoPorClase)} c/u · queda pendiente ${new Intl.NumberFormat('es-AR').format(Math.max((fc.amount || 0) - clasesPagadas * montoPorClase, 0))}</p>
                        </div>
                        <button
                          onClick={() => registerFlexClassPayment(fc)}
                          disabled={registeringFlexPaymentId === fc.id}
                          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition disabled:opacity-50 flex items-center gap-1.5">
                          {registeringFlexPaymentId === fc.id
                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                            : '💰'} Registrar cobro de 1 clase
                        </button>
                      </div>
                    )}
                    {todoJuntoPendiente && (
                      <div className="px-3 py-2 bg-amber-50 border-t border-amber-200">
                        <p className="text-[11px] font-bold text-amber-800">⏳ Pendiente de cobro — ${new Intl.NumberFormat('es-AR').format(fc.amount || 0)}</p>
                        <p className="text-[10px] text-amber-600">Cuando te pague el total, marcalo como cobrado con el botón <strong>"Marcar Pago"</strong> de arriba.</p>
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* NOTAS DEL DOCENTE */}
          {localStudent.notes && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Notas</p>
              <p className="text-sm text-amber-900 leading-relaxed">{localStudent.notes}</p>
            </div>
          )}

          {/* HISTORIAL DE NOTAS DE CLASE */}
          <ClassNotesHistory db={db} appId={appId} studentId={localStudent.id} />

          {/* INFO SECUNDARIA */}
          <div className="text-xs text-gray-400 space-y-0.5 pt-1 border-t border-gray-100">
            <p>DNI: {localStudent.dni || '—'}</p>
            {localStudent.email && <p>Email: {localStudent.email}</p>}
            {localStudent.birthDate && (
              <p>Nacimiento: {new Date(localStudent.birthDate + 'T12:00:00').toLocaleDateString('es-AR')}</p>
            )}
          </div>

          {/* Toggle comprobantes */}
          <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50 transition -mx-1">
            <span className="text-xs text-gray-400 flex-1">Habilitar carga de comprobantes</span>
            <div className="relative flex-shrink-0">
              <input type="checkbox" className="sr-only peer"
                checked={localStudent.manualReceiptEnabled || false}
                onChange={e => toggleManualReceipt(e.target.checked)} />
              <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-rose-600
                after:content-[''] after:absolute after:top-0.5 after:left-0.5
                after:bg-white after:border after:border-gray-300 after:rounded-full
                after:h-4 after:w-4 after:transition-all
                peer-checked:after:translate-x-4 peer-checked:after:border-white" />
            </div>
          </label>

        </div>
      </div>

      <RepertoireModal isOpen={showRepertoire} onClose={() => setShowRepertoire(false)}
        db={db} appId={appId} studentId={localStudent.id} showMessage={showMessage} />
      <ReceiptsModal isOpen={showReceipts} onClose={() => setShowReceipts(false)}
        db={db} appId={appId} student={{ ...localStudent, debt: localStudent.pendingBalance || 0 }} />
    </>
  );
};
