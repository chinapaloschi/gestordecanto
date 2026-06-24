import { useState, useEffect, memo } from 'react';
import { collection, query, where, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useNewReceiptsFlag } from '../hooks/useNewReceiptsFlag.js';
import { BillingInfoUnified } from './BillingInfoUnified.jsx';
import { NextClassBadge } from './NextClassBadge.jsx';
import { PaymentHistoryModal } from './PaymentHistoryModal.jsx';
import { DebtDetailsModal } from './DebtDetailsModal.jsx';
import { IconTicket } from './Icons.jsx';
import { getInitials } from '../utils/studentHelpers.js';
import { formatMoneyAr } from '../utils/money.js';
import { MaskedAmount } from './MaskedAmount.jsx';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ── Ícono WhatsApp ────────────────────────────────────────────────────────────
const WaIcon = ({ size = 4 }) => (
  <svg className={`w-${size} h-${size}`} fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.557 4.116 1.533 5.847L.057 23.54a.75.75 0 00.915.976l5.876-1.54A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22.5a10.453 10.453 0 01-5.374-1.48l-.385-.23-3.99 1.046 1.064-3.887-.253-.4A10.441 10.441 0 011.5 12C1.5 6.201 6.201 1.5 12 1.5S22.5 6.201 22.5 12 17.799 22.5 12 22.5z"/>
  </svg>
);

const CLASS_TYPE_LABELS = {
  individual: 'Individual',
  grupal: 'Grupal',
  duo: 'Dúo',
  mensual: 'Mensual',
};

const fmtClassDate = (classDate) => {
  try {
    let d;
    if (classDate?.toDate) d = classDate.toDate();
    else if (classDate instanceof Date) d = classDate;
    else if (typeof classDate === 'string') d = new Date(classDate.includes('T') ? classDate : classDate + 'T00:00:00');
    else return '—';
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`;
  } catch { return '—'; }
};

const RemainingClassesModal = ({ student, db, appId, showMessage, onClose }) => {
  const [localStatuses, setLocalStatuses] = useState({});
  const [saving, setSaving] = useState(null);

  // Clases pagadas sin asistencia marcada
  const pendingClasses = ((student.scheduledClassesDetailed) || [])
    .filter(c => c.isPaid && !c.attendanceStatus)
    .sort((a, b) => {
      const toMs = (d) => {
        if (!d) return 0;
        if (d?.toDate) return d.toDate().getTime();
        if (d instanceof Date) return d.getTime();
        return new Date(d).getTime();
      };
      return toMs(a.classDate) - toMs(b.classDate);
    });

  const markAttendance = async (classId, status) => {
    setSaving(classId + status);
    try {
      await updateDoc(doc(db, `artifacts/${appId}/scheduledClasses`, classId), { attendanceStatus: status });
      setLocalStatuses(prev => ({ ...prev, [classId]: status }));
      showMessage && showMessage(`Asistencia marcada: ${status}`, 'success');
    } catch (e) {
      showMessage && showMessage('Error al guardar: ' + e.message, 'error');
    } finally {
      setSaving(null);
    }
  };

  const visibleClasses = pendingClasses.filter(c => !localStatuses[c.id]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="font-bold text-gray-900 text-base">Clases pendientes</h3>
            <p className="text-xs text-gray-500">{student.name} · {visibleClasses.length} clase{visibleClasses.length !== 1 ? 's' : ''} sin marcar</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold">×</button>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {visibleClasses.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">Todas las clases marcadas ✓</p>
          ) : (
            visibleClasses.map(cls => (
              <div key={cls.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{fmtClassDate(cls.classDate)}</p>
                    <p className="text-xs text-gray-500">{cls.classTime || '—'} hs · {CLASS_TYPE_LABELS[cls.classType] || cls.classType || 'Clase'}</p>
                  </div>
                  <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Pagada</span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-gray-100">
                  <button
                    onClick={() => markAttendance(cls.id, 'presente')}
                    disabled={!!saving}
                    className="py-3 text-sm font-bold text-green-600 hover:bg-green-50 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {saving === cls.id + 'presente' ? <span className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin inline-block"/> : '✓'} Presente
                  </button>
                  <button
                    onClick={() => markAttendance(cls.id, 'ausente')}
                    disabled={!!saving}
                    className="py-3 text-sm font-bold text-rose-500 hover:bg-rose-50 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {saving === cls.id + 'ausente' ? <span className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin inline-block"/> : '✗'} Ausente
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: marcar todas presentes */}
        {visibleClasses.length > 1 && (
          <div className="px-4 py-3 border-t">
            <button
              onClick={async () => {
                setSaving('all');
                for (const cls of visibleClasses) {
                  try {
                    await updateDoc(doc(db, `artifacts/${appId}/scheduledClasses`, cls.id), { attendanceStatus: 'presente' });
                    setLocalStatuses(prev => ({ ...prev, [cls.id]: 'presente' }));
                  } catch {}
                }
                setSaving(null);
                showMessage && showMessage('Todas las clases marcadas como presentes.', 'success');
              }}
              disabled={!!saving}
              className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition disabled:opacity-50"
            >
              {saving === 'all' ? 'Guardando...' : `✓ Marcar todas presentes (${visibleClasses.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const StudentCardImpl = ({
  student, onOpenStudentDetailsModal, db, appId, showMessage,
  isExpanded, onToggleExpand, onRestoreStudent,
}) => {
  const [openPay,          setOpenPay]          = useState(false);
  const [showDebtDetails,  setShowDebtDetails]   = useState(false);
  const [notifying,        setNotifying]         = useState(false);
  const [flexCredit,       setFlexCredit]        = useState(null);
  const [showClassesModal, setShowClassesModal]  = useState(false);
  const hasNewReceipt = useNewReceiptsFlag(db, appId, student?.id);

  // Créditos flexibles activos — escucha en tiempo real para reflejar altas/bajas al instante
  useEffect(() => {
    if (!db || !appId || !student?.id || student?.isArchived) { setFlexCredit(null); return; }
    const unsub = onSnapshot(query(
      collection(db, `artifacts/${appId}/payments`),
      where('studentId', '==', student.id),
      where('paymentMethod', '==', 'abono_flexible')
    ), snap => {
      let total = 0, used = 0;
      snap.docs.forEach(d => {
        const d2 = d.data();
        total += (d2.clasesTotal || 0);
        used  += (d2.clasesUsadas || 0);
      });
      setFlexCredit(total > 0 ? { remaining: total - used, total } : null);
    }, () => {});
    return unsub;
  }, [student?.id, db, appId, student?.isArchived]);

  // ── Notificación push de deuda ─────────────────────────────────────────────
  const sendDebtNotification = async (e) => {
    e.stopPropagation();
    if (notifying) return;
    setNotifying(true);
    try {
      const fn = httpsCallable(getFunctions(), 'sendPushNotification');
      const month = new Date().toLocaleDateString('es-AR', { month: 'long' });
      const debt  = formatMoneyAr(student.pendingBalanceWithSurcharge || student.pendingBalance || 0);
      const result = await fn({
        studentIds: [student.id],
        title: 'Estudio Sandra Paloschi 🎵',
        body:  `Hola ${(student.name || '').split(' ')[0]}, tenés ${debt} pendiente del mes de ${month}. ¡Cualquier consulta escribime!`,
        appId,
        url: `https://estudiosandrapaloschi.web.app/#/checkin?a=${appId}`,
      });
      const { sent = 0 } = result.data || {};
      if (sent > 0) {
        showMessage(`🔔 Notificación enviada a ${student.name.split(' ')[0]}.`, 'success');
      } else {
        showMessage(`${student.name.split(' ')[0]} no tiene notificaciones activas. Probá por WhatsApp.`, 'info');
      }
    } catch (err) {
      showMessage('Error al enviar notificación: ' + err.message, 'error');
    } finally {
      setNotifying(false);
    }
  };

  // ── Colores según estado ──────────────────────────────────────────────────
  let borderCls, bgCls, headerBg;
  if (student.isArchived) {
    borderCls = 'border-gray-300'; bgCls = 'bg-gray-50'; headerBg = 'bg-gray-100';
  } else if (hasNewReceipt) {
    borderCls = 'border-amber-400 ring-2 ring-amber-200'; bgCls = 'bg-white'; headerBg = 'bg-amber-50';
  } else if (student.hasAnyUnpaidItems) {
    borderCls = 'border-rose-400'; bgCls = 'bg-white'; headerBg = 'bg-rose-50';
  } else {
    borderCls = 'border-green-400'; bgCls = 'bg-white'; headerBg = 'bg-green-50';
  }

  const debt = student.pendingBalanceWithSurcharge || student.pendingBalance || 0;
  const hasDebt = debt > 0;

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  const waRaw = (student.whatsapp || student.contactInfo || '').replace(/\D/g, '');
  const hasWa = waRaw.length >= 8;
  const firstName = (student.name || '').split(' ')[0];

  const openWa = (msg) => window.open(
    `https://wa.me/549${waRaw}?text=${encodeURIComponent(msg)}`, '_blank'
  );
  const handleWaDebt = (e) => {
    e.stopPropagation();
    const month = new Date().toLocaleDateString('es-AR', { month: 'long' });
    openWa(`Hola ${firstName}, te recuerdo que tenés ${formatMoneyAr(debt)} pendiente del mes de ${month}. ¡Saludos, Sandra! 🎵`);
  };
  const handleWaHi = (e) => {
    e.stopPropagation();
    openWa(`Hola ${firstName}, ¿cómo estás? Te escribo desde el Estudio Sandra Paloschi 🎵`);
  };

  return (
    <>
      <div className={`rounded-xl border-l-4 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden ${borderCls} ${bgCls} ${student.isArchived ? 'opacity-70' : ''}`}>

        {/* ── HEADER ── */}
        <div
          className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${headerBg} relative`}
          onClick={!student.isArchived ? () => onToggleExpand(student.id) : undefined}
        >
          {/* Foto */}
          <div
            className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden ring-2 ring-white shadow cursor-pointer hover:opacity-80 transition-opacity"
            onClick={e => { e.stopPropagation(); onOpenStudentDetailsModal(student); }}
          >
            {student.photoURL ? (
              <img src={student.photoURL} alt="Perfil" className="h-full w-full object-cover"
                loading="lazy" decoding="async" width="48" height="48" />
            ) : (
              <div className={`h-full w-full flex items-center justify-center text-lg font-bold
                ${student.isArchived ? 'bg-gray-200 text-gray-500' : hasDebt ? 'bg-rose-100 text-rose-600' : 'bg-green-100 text-green-600'}`}>
                {getInitials(student.name)}
              </div>
            )}
          </div>

          {/* Nombre + badge */}
          <div className="flex-1 min-w-0">
            <h4
              className="font-black text-gray-900 uppercase text-sm leading-tight truncate hover:text-rose-600 transition-colors cursor-pointer"
              onClick={e => { e.stopPropagation(); onOpenStudentDetailsModal(student); }}
            >
              {student.name}
              {student.hasVisibleTickets && (
                <span className="ml-1 text-amber-500 align-middle"><IconTicket /></span>
              )}
            </h4>

            {/* Estado */}
            {!student.isArchived ? (
              hasDebt ? (
                <span className="inline-flex items-center text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full mt-0.5">
                  🔴 <MaskedAmount>{formatMoneyAr(debt)}</MaskedAmount>
                  {student.aplicaRecargo && <span className="ml-1 opacity-70 text-[10px]">+10%</span>}
                </span>
              ) : (
                <span className="inline-flex items-center text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full mt-0.5">
                  ✅ Al día
                </span>
              )
            ) : (
              <span className="text-xs font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">ARCHIVADO</span>
            )}

            {/* Badge crédito flexible */}
            {flexCredit && !student.isArchived && (
              <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full mt-0.5
                ${flexCredit.remaining > 0 ? 'text-violet-700 bg-violet-100' : 'text-gray-400 bg-gray-100'}`}>
                🎫 {flexCredit.remaining}/{flexCredit.total} clase{flexCredit.total !== 1 ? 's' : ''}
              </span>
            )}

            {/* Vocal + nivel si están disponibles */}
            {(student.vocal && student.vocal !== 'Sin definir') || student.level ? (
              <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                {[student.vocal !== 'Sin definir' && student.vocal, student.level].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>

          {/* Badge PAGO NUEVO — clickeable, abre comprobantes directamente */}
          {hasNewReceipt && !student.isArchived && (
            <button
              onClick={e => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('sp:openReceipts', { detail: { studentId: student.id } }));
              }}
              title="Ver comprobante pendiente"
              className="flex-shrink-0 text-[9px] font-extrabold text-amber-800 bg-amber-300 hover:bg-amber-400 px-2 py-1 rounded-full animate-pulse uppercase tracking-wide transition-colors cursor-pointer"
            >
              PAGO NUEVO
            </button>
          )}

          {/* Chevron (mobile collapse indicator) */}
          {!student.isArchived && (
            <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform sm:hidden ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
            </svg>
          )}
        </div>

        {/* ── STATS ── */}
        {!student.isArchived && (
          <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
            <button
              onClick={() => setShowDebtDetails(true)}
              disabled={!hasDebt}
              className="py-2.5 text-center hover:bg-gray-50 transition disabled:cursor-default"
            >
              <div className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Deuda</div>
              <div className={`text-sm font-black ${hasDebt ? 'text-rose-700' : 'text-gray-300'}`}>
                <MaskedAmount>{hasDebt ? formatMoneyAr(debt) : '$0'}</MaskedAmount>
              </div>
            </button>
            <button
              onClick={() => setShowClassesModal(true)}
              disabled={!(student.totalPaidUnconsumedClasses > 0)}
              className="py-2.5 text-center hover:bg-green-50 transition disabled:cursor-default"
            >
              <div className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Restantes</div>
              <div className={`text-sm font-black ${student.totalPaidUnconsumedClasses > 0 ? 'text-green-700 underline decoration-dotted' : 'text-gray-300'}`}>
                {student.totalPaidUnconsumedClasses || 0}
              </div>
            </button>
            <div className="py-2.5 text-center">
              <div className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Del mes</div>
              <div className="text-sm font-black text-blue-700">{student.totalPaidClassesThisMonth || 0}</div>
            </div>
          </div>
        )}

        {/* ── DETALLE EXPANDIBLE (billing + próxima clase) ── */}
        {!student.isArchived && (
          <div className={`transition-all duration-300 ease-in-out grid
            ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}
            sm:grid-rows-[1fr] sm:opacity-100`}>
            <div className="overflow-hidden">
              <div className="px-4 pt-3 pb-2 space-y-2 border-t border-gray-100">
                <BillingInfoUnified db={db} appId={appId} student={student} onOpenHistory={() => setOpenPay(true)} />
                <NextClassBadge student={student} />
              </div>
            </div>
          </div>
        )}

        {/* ── ACCIONES RÁPIDAS ── */}
        <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
          {student.isArchived ? (
            <button onClick={() => onRestoreStudent(student.id)}
              className="w-full py-2 bg-gray-700 text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition">
              Restaurar
            </button>
          ) : (
            <>
              {/* WhatsApp: "Cobrar" si debe, icono si no */}
              {hasWa && hasDebt && (
                <button onClick={handleWaDebt}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex-shrink-0">
                  <WaIcon size={3.5} /> Cobrar
                </button>
              )}
              {hasWa && !hasDebt && (
                <button onClick={handleWaHi}
                  className="flex items-center justify-center px-2.5 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-xl transition flex-shrink-0" title="Enviar WhatsApp">
                  <WaIcon size={4} />
                </button>
              )}

              {/* 🔔 Notificación push de deuda */}
              {hasDebt && (
                <button
                  onClick={sendDebtNotification}
                  disabled={notifying}
                  title="Notificar por push que debe"
                  className={`flex items-center justify-center px-2.5 py-2 rounded-xl text-xs font-bold transition flex-shrink-0
                    ${notifying
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-200'}`}>
                  {notifying
                    ? <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin"/>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                      </svg>
                  }
                </button>
              )}

              {/* Ver detalles */}
              <button
                onClick={e => { e.stopPropagation(); onOpenStudentDetailsModal(student); }}
                className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition text-center">
                Ver detalles →
              </button>
            </>
          )}
        </div>
      </div>

      <PaymentHistoryModal open={openPay} onClose={() => setOpenPay(false)} db={db} appId={appId} student={student} />
      <DebtDetailsModal isOpen={showDebtDetails} onClose={() => setShowDebtDetails(false)} student={student} db={db} appId={appId} showMessage={showMessage} />
      {showClassesModal && (
        <RemainingClassesModal
          student={student}
          db={db}
          appId={appId}
          showMessage={showMessage}
          onClose={() => setShowClassesModal(false)}
        />
      )}
    </>
  );
};

// El padre recrea el array `studentsWithStats` (y todos sus objetos `student`)
// en cada snapshot de Firestore, aunque este alumno puntual no haya cambiado.
// Comparamos los campos que realmente se usan en el render, no la referencia,
// para evitar re-renderizar las 32 tarjetas cada vez que cambia una sola.
const SCALAR_FIELDS = [
  'id', 'name', 'photoURL', 'isArchived', 'hasAnyUnpaidItems', 'hasVisibleTickets',
  'pendingBalance', 'pendingBalanceWithSurcharge', 'totalPaidClassesThisMonth',
  'totalPaidUnconsumedClasses', 'aplicaRecargo', 'contactInfo', 'whatsapp', 'level', 'vocal',
];

function studentCardPropsEqual(prev, next) {
  if (prev.isExpanded !== next.isExpanded) return false;
  if (prev.db !== next.db || prev.appId !== next.appId) return false;
  if (prev.onToggleExpand !== next.onToggleExpand
    || prev.onOpenStudentDetailsModal !== next.onOpenStudentDetailsModal
    || prev.onRestoreStudent !== next.onRestoreStudent
    || prev.showMessage !== next.showMessage) return false;

  const a = prev.student, b = next.student;
  if (a === b) return true;
  if (!a || !b) return false;
  for (const f of SCALAR_FIELDS) {
    if (a[f] !== b[f]) return false;
  }

  const ca = a.scheduledClassesDetailed, cb = b.scheduledClassesDetailed;
  if (ca !== cb) {
    if (!ca || !cb || ca.length !== cb.length) return false;
    for (let i = 0; i < ca.length; i++) {
      const x = ca[i], y = cb[i];
      if (x.id !== y.id || x.isPaid !== y.isPaid || x.attendanceStatus !== y.attendanceStatus || x.classDate !== y.classDate) return false;
    }
  }
  return true;
}

export const StudentCard = memo(StudentCardImpl, studentCardPropsEqual);
