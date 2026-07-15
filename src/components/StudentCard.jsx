import { useState, memo } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { DebtDetailsModal } from './DebtDetailsModal.jsx';
import { getInitials } from '../utils/studentHelpers.js';
import { formatMoneyAr } from '../utils/money.js';
import { MaskedAmount } from './MaskedAmount.jsx';
import { getFunctions, httpsCallable } from 'firebase/functions';

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

const WaIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.557 4.116 1.533 5.847L.057 23.54a.75.75 0 00.915.976l5.876-1.54A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22.5a10.453 10.453 0 01-5.374-1.48l-.385-.23-3.99 1.046 1.064-3.887-.253-.4A10.441 10.441 0 011.5 12C1.5 6.201 6.201 1.5 12 1.5S22.5 6.201 22.5 12 17.799 22.5 12 22.5z"/>
  </svg>
);

// Modal liviano para clases restantes
const RemainingClassesModal = ({ student, db, appId, showMessage, onClose }) => {
  const [localStatuses, setLocalStatuses] = useState({});
  const [saving, setSaving] = useState(null);

  const pendingClasses = ((student.scheduledClassesDetailed) || [])
    .filter(c => c.isPaid && !c.attendanceStatus)
    .sort((a, b) => new Date(a.classDate) - new Date(b.classDate));

  const markAttendance = async (classId, status) => {
    setSaving(classId + status);
    try {
      await updateDoc(doc(db, `artifacts/${appId}/scheduledClasses`, classId), { attendanceStatus: status });
      setLocalStatuses(prev => ({ ...prev, [classId]: status }));
      showMessage?.(`Clase marcada como ${status}.`, 'success');
    } catch (e) {
      showMessage?.('Error: ' + e.message, 'error');
    } finally { setSaving(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-black text-gray-900 text-sm">Clases restantes — {student.name?.split(' ')[0]}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {pendingClasses.length === 0
            ? <p className="text-center text-gray-400 text-sm py-8">Sin clases pendientes</p>
            : pendingClasses.map(cls => {
                const status = localStatuses[cls.id] || cls.attendanceStatus;
                const d = new Date(cls.classDate + 'T12:00:00');
                const label = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
                return (
                  <div key={cls.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-800">{label} · {cls.startTime}hs</span>
                      <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Pagada</span>
                    </div>
                    {!status && (
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => markAttendance(cls.id, 'presente')} disabled={!!saving}
                          className="py-2 text-xs font-bold text-green-600 bg-green-50 hover:bg-green-100 rounded-xl transition disabled:opacity-50">
                          {saving === cls.id + 'presente' ? '...' : '✓ Presente'}
                        </button>
                        <button onClick={() => markAttendance(cls.id, 'ausente')} disabled={!!saving}
                          className="py-2 text-xs font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-xl transition disabled:opacity-50">
                          {saving === cls.id + 'ausente' ? '...' : '✗ Ausente'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
          }
        </div>
        <div className="px-4 py-3 border-t">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

// ── Tarjeta de alumno con foto circular ──────────────────────────────────────
const StudentCardImpl = ({
  student, onOpenStudentDetailsModal, db, appId, showMessage,
  onRestoreStudent, hasNewReceipt,
}) => {
  const [showDebtDetails,  setShowDebtDetails]  = useState(false);
  const [showClassesModal, setShowClassesModal] = useState(false);
  const [notifying,        setNotifying]        = useState(false);

  const debt       = student.pendingBalanceWithSurcharge || student.pendingBalance || 0;
  const hasDebt    = debt > 0;
  const flexCredit = student.flexCredit || null;
  const waRaw      = (student.whatsapp || student.contactInfo || '').replace(/\D/g, '');
  const hasWa      = waRaw.length >= 8;
  const firstName  = (student.name || '').split(' ')[0];

  const openWa = (msg) => window.open(`https://wa.me/549${waRaw}?text=${encodeURIComponent(msg)}`, '_blank');
  const handleWaDebt = (e) => {
    e.stopPropagation();
    const month = new Date().toLocaleDateString('es-AR', { month: 'long' });
    openWa(`Hola ${firstName}, te recuerdo que tenés ${formatMoneyAr(debt)} pendiente del mes de ${month}. ¡Saludos, Sandra! 🎵`);
  };
  const handleWaHi = (e) => {
    e.stopPropagation();
    openWa(`Hola ${firstName}, ¿cómo estás? Te escribo desde el Estudio Sandra Paloschi 🎵`);
  };

  const sendDebtNotification = async (e) => {
    e.stopPropagation();
    if (notifying) return;
    setNotifying(true);
    try {
      const fn = httpsCallable(getFunctions(), 'sendPushNotification');
      const month = new Date().toLocaleDateString('es-AR', { month: 'long' });
      await fn({
        studentIds: [student.id],
        title: 'Estudio Sandra Paloschi 🎵',
        body: `Hola ${firstName}, tenés ${formatMoneyAr(debt)} pendiente del mes de ${month}. ¡Cualquier consulta escribime!`,
        appId,
        url: `https://estudiosandrapaloschi.web.app/#/checkin?a=${appId}`,
      });
      showMessage?.(`🔔 Notificación enviada a ${firstName}.`, 'success');
    } catch (err) {
      showMessage?.('Error al enviar: ' + err.message, 'error');
    } finally { setNotifying(false); }
  };

  // Color del ring del avatar según estado
  const ringColor = student.isArchived
    ? 'ring-gray-300'
    : hasNewReceipt
    ? 'ring-amber-400'
    : hasDebt
    ? 'ring-rose-400'
    : 'ring-green-400';

  const avatarBg = student.isArchived
    ? 'bg-gray-200 text-gray-400'
    : hasDebt
    ? 'bg-rose-100 text-rose-500'
    : 'bg-green-100 text-green-600';

  return (
    <>
      <div className={`bg-white rounded-2xl shadow-sm border transition-shadow
        ${student.isArchived ? 'border-gray-200 opacity-70' : hasDebt ? 'border-rose-100' : 'border-gray-100'}`}
      >
        {/* ── Cabecera con avatar y nombre ── */}
        <div
          className="flex flex-col items-center pt-5 pb-3 px-3 cursor-pointer"
          onClick={() => onOpenStudentDetailsModal(student)}
        >
          {/* Avatar circular */}
          <div className="relative mb-3">
            <div className={`w-16 h-16 rounded-full overflow-hidden ring-2 ${ringColor} ring-offset-2 shadow`}>
              {student.photoURL ? (
                <img
                  src={student.photoURL}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  width="64"
                  height="64"
                />
              ) : (
                <div className={`w-full h-full flex items-center justify-center text-xl font-black ${avatarBg}`}>
                  {getInitials(student.name)}
                </div>
              )}
            </div>

            {/* Punto de estado en el ring */}
            {!student.isArchived && (
              <span className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white
                ${hasNewReceipt ? 'bg-amber-400' : hasDebt ? 'bg-rose-500' : 'bg-green-500'}`}
              />
            )}
          </div>

          {/* Nombre */}
          <h3 className="font-black text-gray-900 text-sm text-center leading-tight line-clamp-2 uppercase w-full">
            {student.name}
          </h3>

          {/* Sub-info: nivel/voz */}
          {((student.vocal && student.vocal !== 'Sin definir') || student.level) && (
            <p className="text-[10px] text-gray-400 text-center mt-0.5 truncate w-full">
              {[student.vocal !== 'Sin definir' && student.vocal, student.level].filter(Boolean).join(' · ')}
            </p>
          )}

          {/* Badge de estado */}
          <div className="mt-2">
            {student.isArchived ? (
              <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full uppercase">
                Archivado
              </span>
            ) : hasNewReceipt ? (
              <span className="text-[10px] font-extrabold bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full uppercase">
                Comprobante ⏳
              </span>
            ) : hasDebt ? (
              <button
                onClick={e => { e.stopPropagation(); setShowDebtDetails(true); }}
                className="text-[11px] font-extrabold bg-rose-100 text-rose-600 hover:bg-rose-200 px-2.5 py-0.5 rounded-full transition"
              >
                <MaskedAmount>{formatMoneyAr(debt)}</MaskedAmount>
                {student.aplicaRecargo && <span className="ml-1 text-[9px] opacity-80">+10%</span>}
              </button>
            ) : (
              <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full uppercase">
                Al día ✓
              </span>
            )}
          </div>
        </div>

        {/* ── Stats ── */}
        {!student.isArchived && (
          <div className="mx-3 mb-3 grid grid-cols-3 gap-1 rounded-xl bg-gray-50 p-2">
            <button
              onClick={() => setShowClassesModal(true)}
              disabled={!student.totalPaidUnconsumedClasses}
              className="text-center disabled:cursor-default"
            >
              <div className="text-[8px] text-gray-400 font-bold uppercase tracking-wide">Rest.</div>
              <div className={`text-base font-black leading-tight ${student.totalPaidUnconsumedClasses > 0 ? 'text-green-700 underline decoration-dotted' : 'text-gray-300'}`}>
                {student.totalPaidUnconsumedClasses || 0}
              </div>
            </button>
            <div className="text-center border-x border-gray-200">
              <div className="text-[8px] text-gray-400 font-bold uppercase tracking-wide">Mes</div>
              <div className="text-base font-black text-blue-700 leading-tight">
                {student.totalPaidClassesThisMonth || 0}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[8px] text-gray-400 font-bold uppercase tracking-wide">
                {flexCredit ? 'Flex' : 'Tickets'}
              </div>
              <div className={`text-base font-black leading-tight ${flexCredit ? 'text-violet-600' : 'text-gray-300'}`}>
                {flexCredit ? `${flexCredit.remaining}` : (student.hasVisibleTickets ? '🎫' : '—')}
              </div>
            </div>
          </div>
        )}

        {/* ── Última clase / último pago ── */}
        {!student.isArchived && (student.lastClassDate || student.lastPaymentDate) && (
          <div className="mx-3 mb-2 flex gap-2 text-[10px] text-gray-400">
            {student.lastClassDate && (
              <span className="flex items-center gap-0.5 min-w-0 truncate">
                <svg className="w-3 h-3 flex-shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                {fmtDate(student.lastClassDate)}
              </span>
            )}
            {student.lastClassDate && student.lastPaymentDate && (
              <span className="text-gray-200">·</span>
            )}
            {student.lastPaymentDate && (
              <span className="flex items-center gap-0.5 min-w-0 truncate">
                <svg className="w-3 h-3 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                {fmtDate(student.lastPaymentDate)}
              </span>
            )}
          </div>
        )}

        {/* ── Acciones ── */}
        <div className="px-3 pb-3 flex gap-1.5">
          {student.isArchived ? (
            <button
              onClick={() => onRestoreStudent(student.id)}
              className="flex-1 py-2 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
            >
              Restaurar
            </button>
          ) : (
            <>
              {hasWa && (
                <button
                  onClick={hasDebt ? handleWaDebt : handleWaHi}
                  title={hasDebt ? 'Recordar deuda por WhatsApp' : 'WhatsApp'}
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-green-100 hover:bg-green-200 text-green-700 transition flex-shrink-0"
                >
                  <WaIcon/>
                </button>
              )}

              {hasDebt && (
                <button
                  onClick={sendDebtNotification}
                  disabled={notifying}
                  title="Notificación push"
                  className="flex items-center justify-center w-9 h-9 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-500 transition flex-shrink-0 disabled:opacity-40"
                >
                  {notifying
                    ? <div className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin"/>
                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                      </svg>
                  }
                </button>
              )}

              <button
                onClick={() => onOpenStudentDetailsModal(student)}
                className="flex-1 h-9 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition flex items-center justify-center gap-1"
              >
                Ver perfil
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      <DebtDetailsModal isOpen={showDebtDetails} onClose={() => setShowDebtDetails(false)} student={student} db={db} appId={appId} showMessage={showMessage}/>
      {showClassesModal && (
        <RemainingClassesModal student={student} db={db} appId={appId} showMessage={showMessage} onClose={() => setShowClassesModal(false)}/>
      )}
    </>
  );
};

const SCALAR_FIELDS = [
  'id', 'name', 'photoURL', 'isArchived', 'hasAnyUnpaidItems', 'hasVisibleTickets',
  'pendingBalance', 'pendingBalanceWithSurcharge', 'totalPaidClassesThisMonth',
  'totalPaidUnconsumedClasses', 'aplicaRecargo', 'contactInfo', 'whatsapp', 'level', 'vocal',
  'lastClassDate', 'lastPaymentDate',
];

function studentCardPropsEqual(prev, next) {
  if (prev.hasNewReceipt !== next.hasNewReceipt) return false;
  if (prev.db !== next.db || prev.appId !== next.appId) return false;
  if (prev.onOpenStudentDetailsModal !== next.onOpenStudentDetailsModal
    || prev.onRestoreStudent !== next.onRestoreStudent
    || prev.showMessage !== next.showMessage) return false;

  const a = prev.student, b = next.student;
  if (a === b) return true;
  if (!a || !b) return false;
  for (const f of SCALAR_FIELDS) {
    if (a[f] !== b[f]) return false;
  }
  const fa = a.flexCredit, fb = b.flexCredit;
  if ((fa == null) !== (fb == null)) return false;
  if (fa && fb && (fa.remaining !== fb.remaining || fa.total !== fb.total)) return false;

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
