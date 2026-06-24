import React, { useState, useMemo, useEffect } from 'react';
import { collection as fsCollection, collectionGroup, query, where, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { isPresent, isAbsent } from '../utils/studentHelpers.js';
import { formatMoneyAr } from '../utils/money.js';
import { useAmountsHidden } from '../context/PrivacyContext.jsx';

// ── Helpers ──────────────────────────────────────────────────────────────────
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const monthPrefix = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
};

const fmtHoy = () => new Date().toLocaleDateString('es-AR', {
  weekday: 'long', day: 'numeric', month: 'long'
});

// ── Alerta de cumpleaños ─────────────────────────────────────────────────────
function BirthdayBanner({ students }) {
  const today  = new Date();
  const mm     = today.getMonth() + 1;
  const dd     = today.getDate();

  const birthdays = useMemo(() => {
    return (students || []).filter(s => {
      if (!s.birthDate || s.isArchived) return false;
      try {
        const b = new Date(s.birthDate + 'T00:00:00');
        // Check today AND next 2 days
        for (let offset = 0; offset <= 2; offset++) {
          const check = new Date(today);
          check.setDate(check.getDate() + offset);
          if (b.getMonth() + 1 === check.getMonth() + 1 && b.getDate() === check.getDate()) {
            return true;
          }
        }
      } catch {}
      return false;
    }).map(s => {
      const b = new Date(s.birthDate + 'T00:00:00');
      const isToday = b.getMonth() + 1 === mm && b.getDate() === dd;
      return { ...s, isToday };
    });
  }, [students]);

  if (!birthdays.length) return null;

  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
      <span className="text-2xl flex-shrink-0">🎂</span>
      <div className="flex-1">
        {birthdays.map(s => (
          <p key={s.id} className="text-sm text-amber-800 font-semibold">
            {s.isToday ? '¡Hoy es el cumpleaños' : 'Próximo cumpleaños'} de{' '}
            <span className="font-black">{s.name}</span>
            {!s.isToday && (() => {
              const b = new Date(s.birthDate + 'T00:00:00');
              const diff = new Date(new Date().getFullYear(), b.getMonth(), b.getDate()) - new Date(new Date().getFullYear(), today.getMonth(), today.getDate());
              const days = Math.round(diff / 86400000);
              return <span className="font-normal text-amber-600"> — en {days} día{days !== 1 ? 's' : ''}</span>;
            })()}
          </p>
        ))}
      </div>
    </div>
  );
}

// ── Asistencia pendiente (hoy + atrasadas) ───────────────────────────────────
function UnmarkedAttendanceBanner({ scheduledClasses, students, onOpenAttendance, db, appId }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [localStatus, setLocalStatus] = useState({});
  const [busyId, setBusyId] = useState(null);

  const unmarked = useMemo(() => {
    return (scheduledClasses || [])
      .filter(c => {
        if (!c.classDate || c.status === 'cancelled') return false;
        if (localStatus[c.id]) return false; // ya lo marqué localmente, sacarlo de la lista
        try {
          const dt = new Date(c.classDate + 'T00:00:00');
          return dt <= today && !isPresent(c.attendanceStatus) && !isAbsent(c.attendanceStatus);
        } catch { return false; }
      })
      .sort((a, b) => {
        const dateCmp = (a.classDate || '').localeCompare(b.classDate || '');
        if (dateCmp !== 0) return dateCmp;
        return (a.startTime || a.classTime || '').localeCompare(b.startTime || b.classTime || '');
      });
  }, [scheduledClasses, localStatus]);

  const mark = async (cls, status) => {
    if (!db || !appId) return;
    setBusyId(cls.id);
    try {
      await updateDoc(doc(db, `artifacts/${appId}/scheduledClasses`, cls.id), { attendanceStatus: status });
      setLocalStatus(prev => ({ ...prev, [cls.id]: status }));
    } catch {} finally { setBusyId(null); }
  };

  if (!unmarked.length) return null;

  const isToday = (d) => d === todayKey();
  const oldest = unmarked[0];
  const atrasadasCount = unmarked.filter(c => !isToday(c.classDate)).length;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="text-xl flex-shrink-0">⏰</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-amber-900">
            {unmarked.length} clase{unmarked.length !== 1 ? 's' : ''} sin marcar presente/ausente
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            {atrasadasCount > 0
              ? `Incluye ${atrasadasCount} de días anteriores — la más vieja es del ${formatDateShort(oldest.classDate)}.`
              : 'Todas son de hoy.'}
          </p>
        </div>
      </div>
      <div className="mt-2.5 space-y-1 max-h-52 overflow-y-auto">
        {unmarked.slice(0, 12).map(cls => {
          const stu = (students || []).find(s => s.id === cls.studentId);
          const name = stu?.name || cls.studentName || 'Alumno';
          const busy = busyId === cls.id;
          return (
            <div key={cls.id}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-amber-200">
              <button onClick={() => onOpenAttendance && onOpenAttendance([cls])}
                className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <span className="text-[11px] font-bold text-amber-700 tabular-nums flex-shrink-0">{formatDateShort(cls.classDate)}</span>
                <span className="text-xs text-gray-700 font-medium truncate flex-1">{name}</span>
                <span className="text-[11px] text-gray-400 flex-shrink-0">{cls.startTime || cls.classTime || ''}</span>
              </button>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => mark(cls, 'presente')} disabled={busy}
                  title="Marcar presente"
                  className="w-7 h-7 rounded-lg text-xs font-bold bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600 transition disabled:opacity-40">
                  ✓
                </button>
                <button onClick={() => mark(cls, 'ausente')} disabled={busy}
                  title="Marcar ausente"
                  className="w-7 h-7 rounded-lg text-xs font-bold bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 transition disabled:opacity-40">
                  ✗
                </button>
              </div>
            </div>
          );
        })}
        {unmarked.length > 12 && (
          <p className="text-[11px] text-amber-600 text-center pt-1">+ {unmarked.length - 12} más</p>
        )}
      </div>
    </div>
  );
}

function formatDateShort(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  } catch { return dateStr || ''; }
}

// ── Métricas ──────────────────────────────────────────────────────────────────
function MetricCard({ icon, value, label, color = 'gray', sub = '', isMoney = false }) {
  const { amountsHidden } = useAmountsHidden();
  const colors = {
    rose:   { card: 'bg-rose-50 border-rose-100', val: 'text-rose-700', icon: 'text-rose-400' },
    green:  { card: 'bg-green-50 border-green-100', val: 'text-green-700', icon: 'text-green-400' },
    blue:   { card: 'bg-blue-50 border-blue-100', val: 'text-blue-700', icon: 'text-blue-400' },
    amber:  { card: 'bg-amber-50 border-amber-100', val: 'text-amber-700', icon: 'text-amber-400' },
    gray:   { card: 'bg-gray-50 border-gray-100', val: 'text-gray-700', icon: 'text-gray-400' },
    purple: { card: 'bg-purple-50 border-purple-100', val: 'text-purple-700', icon: 'text-purple-400' },
  };
  const c = colors[color] || colors.gray;
  return (
    <div className={`rounded-xl border p-3 ${c.card}`}>
      <div className={`mb-1.5 ${c.icon}`}>{icon}</div>
      <div className={`text-xl font-black leading-none ${c.val}`}>{isMoney && amountsHidden ? '••••••' : value}</div>
      <div className="text-[11px] font-medium text-gray-500 mt-1 leading-tight">{label}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Clases de hoy ─────────────────────────────────────────────────────────────
function TodayClasses({ classes, students, db, appId, onOpenAttendance }) {
  const [localStatus, setLocalStatus] = useState({});

  const mark = async (cls, status) => {
    try {
      await updateDoc(doc(db, `artifacts/${appId}/scheduledClasses`, cls.id), { attendanceStatus: status });
      setLocalStatus(prev => ({ ...prev, [cls.id]: status }));
    } catch {}
  };

  if (!classes.length) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">Sin clases programadas para hoy</div>
    );
  }

  return (
    <div className="space-y-1.5">
      {classes.map(cls => {
        const status    = localStatus[cls.id] || cls.attendanceStatus;
        const present   = isPresent(status);
        const absent    = isAbsent(status);
        const stu       = (students || []).find(s => s.id === cls.studentId);
        const name      = stu?.name || cls.studentName || 'Alumno';
        const hasDebt   = (stu?.pendingBalance || 0) > 0;

        return (
          <div key={cls.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors
              ${present ? 'bg-green-50 border-green-200' : absent ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
            {/* Hora */}
            <span className="text-sm font-black text-gray-700 tabular-nums flex-shrink-0 w-12">
              {cls.startTime || cls.classTime || '—'}
            </span>

            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white
              ${hasDebt ? 'bg-rose-400' : 'bg-green-400'}`}>
              {name[0]?.toUpperCase()}
            </div>

            {/* Nombre */}
            <button
              onClick={() => onOpenAttendance && onOpenAttendance([cls])}
              className="flex-1 text-left min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
              {hasDebt && <p className="text-[10px] text-rose-500 font-semibold">Debe {formatMoneyAr(stu.pendingBalance)}</p>}
            </button>

            {/* Botones asistencia */}
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => mark(cls, present ? null : 'presente')}
                className={`w-8 h-8 rounded-lg text-sm font-bold transition
                  ${present ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'}`}>
                ✓
              </button>
              <button
                onClick={() => mark(cls, absent ? null : 'ausente')}
                className={`w-8 h-8 rounded-lg text-sm font-bold transition
                  ${absent ? 'bg-red-400 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500'}`}>
                ✗
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Pendientes ────────────────────────────────────────────────────────────────
function PendingAlerts({ studentsWithStats, pendingReceiptsCount, onOpenReceipts }) {
  const debtors = useMemo(() =>
    (studentsWithStats || []).filter(s => !s.isArchived && (s.pendingBalance || 0) > 0),
  [studentsWithStats]);

  const items = [
    pendingReceiptsCount > 0 && {
      icon: '🟡', color: 'text-amber-700 bg-amber-50 border-amber-200',
      label: `${pendingReceiptsCount} comprobante${pendingReceiptsCount !== 1 ? 's' : ''} sin revisar`,
      action: onOpenReceipts,
    },
    debtors.length > 0 && {
      icon: '🔴', color: 'text-rose-700 bg-rose-50 border-rose-200',
      label: `${debtors.length} alumno${debtors.length !== 1 ? 's' : ''} con deuda este mes`,
    },
  ].filter(Boolean);

  if (!items.length) {
    return (
      <div className="flex items-center gap-2 text-green-600 text-sm font-semibold">
        <span>✅</span><span>Todo al día</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <button key={i} onClick={item.action}
          disabled={!item.action}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left text-sm font-semibold transition
            ${item.color} ${item.action ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}>
          <span>{item.icon}</span>
          <span>{item.label}</span>
          {item.action && <svg className="w-3.5 h-3.5 ml-auto opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>}
        </button>
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function TodayDashboard({
  studentsWithStats, scheduledClasses, allPayments,
  db, appId, onOpenAttendance, onOpenReceipts,
}) {
  const [pendingReceipts, setPendingReceipts] = useState(0);
  const today = todayKey();
  const month = monthPrefix();

  // Escuchar comprobantes pendientes
  useEffect(() => {
    if (!db || !appId) return;
    try {
      const q = query(collectionGroup(db, 'receipts'), where('status', '==', 'pending'));
      const unsub = onSnapshot(q, snap => setPendingReceipts(snap.size), () => {});
      return () => unsub();
    } catch { return undefined; }
  }, [db, appId]);

  // Clases de hoy ordenadas por hora
  const todayClasses = useMemo(() =>
    (scheduledClasses || [])
      .filter(c => c.classDate === today && c.status !== 'cancelled')
      .sort((a, b) => (a.startTime || a.classTime || '').localeCompare(b.startTime || b.classTime || '')),
  [scheduledClasses, today]);

  // Métricas del mes
  const metrics = useMemo(() => {
    const active   = (studentsWithStats || []).filter(s => !s.isArchived).length;
    const monthPay = (allPayments || []).filter(p => {
      const d = p.paidAt?.toDate ? p.paidAt.toDate() : p.paidAt ? new Date(p.paidAt) : null;
      return d && `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === month && p.amount > 0;
    });
    const revenue = monthPay.reduce((a, p) => a + (Number(p.amount) || 0), 0);

    const pendingAmount = (studentsWithStats || [])
      .filter(s => !s.isArchived && (s.pendingBalance || 0) > 0)
      .reduce((sum, s) => sum + (s.pendingBalance || 0), 0);
    const totalIfAllPaid = revenue + pendingAmount;

    const monthClasses = (scheduledClasses || []).filter(c =>
      (c.classDate || '').startsWith(month) && c.status !== 'cancelled'
    );
    const attended = monthClasses.filter(c => isPresent(c.attendanceStatus)).length;
    const rate = monthClasses.length > 0 ? Math.round(attended / monthClasses.length * 100) : 0;
    const weekStart = (() => {
      const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d;
    })();
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const weekClasses = (scheduledClasses || []).filter(c => {
      if (!c.classDate || c.status === 'cancelled') return false;
      const d = new Date(c.classDate + 'T00:00:00');
      return d >= weekStart && d <= weekEnd;
    }).length;

    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const unmarkedCount = (scheduledClasses || []).filter(c => {
      if (!c.classDate || c.status === 'cancelled') return false;
      try {
        const dt = new Date(c.classDate + 'T00:00:00');
        return dt <= today0 && !isPresent(c.attendanceStatus) && !isAbsent(c.attendanceStatus);
      } catch { return false; }
    }).length;

    return { active, revenue, rate, weekClasses, pendingAmount, totalIfAllPaid, unmarkedCount };
  }, [studentsWithStats, allPayments, scheduledClasses, month]);

  const [open, setOpen] = useState(true);

  return (
    <div className="mb-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition text-left">
        <div>
          <h2 className="font-black text-gray-900 text-sm">Panel de hoy</h2>
          <p className="text-xs text-gray-400 capitalize">{fmtHoy()}</p>
        </div>
        <div className="flex items-center gap-2">
          {metrics.unmarkedCount > 0 && (
            <span className="text-[11px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full animate-pulse">
              ⏰ {metrics.unmarkedCount} sin marcar
            </span>
          )}
          {pendingReceipts > 0 && (
            <span className="text-[11px] font-bold bg-rose-500 text-white px-2 py-0.5 rounded-full animate-pulse">
              {pendingReceipts} comprobante{pendingReceipts !== 1 ? 's' : ''}
            </span>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-50">

          {/* Asistencia sin marcar (hoy + atrasadas) — lo más urgente, arriba de todo */}
          <div className="pt-3">
            <UnmarkedAttendanceBanner
              scheduledClasses={scheduledClasses}
              students={studentsWithStats}
              onOpenAttendance={onOpenAttendance}
              db={db}
              appId={appId}
            />
          </div>

          {/* Cumpleaños */}
          {studentsWithStats?.length > 0 && (
            <BirthdayBanner students={studentsWithStats} />
          )}

          {/* Métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <MetricCard
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
              value={metrics.active} label="Alumnos activos" color="blue" />
            <MetricCard
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>}
              value={formatMoneyAr(metrics.revenue)} label="Cobrado este mes" color="green" isMoney />
            <MetricCard
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
              value={formatMoneyAr(metrics.pendingAmount)} label="Por cobrar" color="rose" isMoney />
            <MetricCard
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>}
              value={formatMoneyAr(metrics.totalIfAllPaid)} label="Facturación del mes" color="purple" isMoney />
            <MetricCard
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>}
              value={`${metrics.rate}%`} label="Asistencia del mes" color={metrics.rate >= 70 ? 'green' : 'amber'} />
            <MetricCard
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>}
              value={metrics.weekClasses} label="Clases esta semana" color="rose" />
          </div>

          {/* Clases de hoy */}
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Clases de hoy · {todayClasses.length}
            </p>
            <TodayClasses
              classes={todayClasses}
              students={studentsWithStats}
              db={db}
              appId={appId}
              onOpenAttendance={onOpenAttendance}
            />
          </div>

          {/* Pendientes */}
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Pendientes</p>
            <PendingAlerts
              studentsWithStats={studentsWithStats}
              pendingReceiptsCount={pendingReceipts}
              onOpenReceipts={onOpenReceipts}
            />
          </div>
        </div>
      )}
    </div>
  );
}
