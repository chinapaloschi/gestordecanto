import React, { useState } from 'react';
import { Modal } from './Modal.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { formatMoneyAr } from '../utils/money.js';
import { mapClassTypeToSpanish, daysOfWeekFull } from '../utils/classHelpers.js';

const PAYMENT_METHODS = [
  { id: 'transferencia', label: 'Transferencia', icon: '🏦' },
  { id: 'efectivo',      label: 'Efectivo',      icon: '💵' },
  { id: 'mercadopago',   label: 'MercadoPago',   icon: '📱' },
];

// Calcula cuántas veces cae un día de la semana en un período (ej: cuántos martes en Julio 2026)
function countClassesInPeriod(dayOfWeek, nextPeriodLabel) {
  try {
    const meses = { enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11 };
    const parts = (nextPeriodLabel || '').toLowerCase().split(' de ');
    if (parts.length < 2) return null;
    const month = meses[parts[0].trim()];
    const year  = parseInt(parts[1].trim());
    if (month === undefined || isNaN(year)) return null;
    const target = parseInt(dayOfWeek); // 0=Dom, 1=Lun...
    let count = 0;
    const days = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      if (new Date(year, month, d).getDay() === target) count++;
    }
    return count;
  } catch { return null; }
}

// Una card de renovación por paquete
const RenewalCard = ({ pkg, index, onRenew }) => {
  const prevAmount      = pkg.baseAmount || pkg.amount || 0;
  const [newAmount, setNewAmount]   = useState(pkg.amount || 0);
  const [payMethod, setPayMethod]   = useState('transferencia');
  const [confirming, setConfirming] = useState(false);

  const quickOptions = [
    { label: 'Sin cambio',    value: prevAmount },
    { label: '+10%', value: Math.round(prevAmount * 1.10) },
    { label: '+15%', value: Math.round(prevAmount * 1.15) },
  ];

  const diff     = newAmount - prevAmount;
  const diffPct  = prevAmount > 0 ? ((diff / prevAmount) * 100).toFixed(0) : 0;
  const classCount = countClassesInPeriod(pkg.dayOfWeek, pkg.nextPeriodLabel);
  const dayLabel = daysOfWeekFull.find(d => d.value === pkg.dayOfWeek)?.label || '';

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onRenew(pkg, newAmount, payMethod);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* Header de la clase */}
      <div className="bg-gradient-to-r from-violet-700 to-violet-500 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">
              {mapClassTypeToSpanish(pkg.classType)} · {dayLabel} {pkg.startTime}
            </p>
            <p className="text-violet-200 text-xs mt-0.5">
              Próximo período: <strong className="text-white">{pkg.nextPeriodLabel}</strong>
            </p>
          </div>
          {classCount && (
            <div className="text-right bg-white/15 rounded-xl px-3 py-1.5">
              <p className="text-white font-black text-lg leading-none">{classCount}</p>
              <p className="text-violet-200 text-[9px] uppercase tracking-wide">clases</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">

        {/* Matrícula de diciembre */}
        {pkg.isDecemberRenewal && pkg.matricula > 0 && (
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-2xl">🎓</span>
            <div>
              <p className="text-xs font-bold text-amber-800 uppercase">Matrícula anual incluida</p>
              <p className="text-xs text-amber-700">Cuota base {formatMoneyAr(pkg.baseAmount)} + Matrícula {formatMoneyAr(pkg.matricula)}</p>
            </div>
          </div>
        )}

        {/* Comparativa de monto */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Monto del abono</p>

          {/* Monto anterior */}
          <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
            <span>Período anterior</span>
            <span className="font-semibold">{formatMoneyAr(prevAmount)}</span>
          </div>

          {/* Botones rápidos */}
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {quickOptions.map(opt => (
              <button key={opt.label} type="button" onClick={() => setNewAmount(opt.value)}
                className={`py-2 rounded-xl text-[11px] font-bold transition border
                  ${newAmount === opt.value
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-violet-300'}`}>
                {opt.label}
                <span className="block text-[9px] font-normal opacity-80">{formatMoneyAr(opt.value)}</span>
              </button>
            ))}
          </div>

          {/* Input monto */}
          <MoneyInput
            value={newAmount}
            onValueChange={setNewAmount}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition"
            placeholder="0"
          />

          {/* Diferencia */}
          {diff !== 0 && (
            <div className={`mt-2 flex items-center gap-2 text-xs font-semibold ${diff > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              <span>{diff > 0 ? '↑' : '↓'} {diff > 0 ? '+' : ''}{formatMoneyAr(diff)} ({diff > 0 ? '+' : ''}{diffPct}% vs período anterior)</span>
            </div>
          )}
        </div>

        {/* Método de pago */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Método de pago</p>
          <div className="grid grid-cols-3 gap-1.5">
            {PAYMENT_METHODS.map(m => (
              <button key={m.id} type="button" onClick={() => setPayMethod(m.id)}
                className={`py-2 rounded-xl text-[11px] font-bold flex flex-col items-center gap-0.5 transition border
                  ${payMethod === m.id
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-violet-300'}`}>
                <span className="text-base">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Resumen final */}
        <div className={`flex items-center justify-between p-3 rounded-xl font-bold
          ${pkg.isDecemberRenewal && pkg.matricula > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-violet-50 border border-violet-100'}`}>
          <span className="text-sm text-gray-700">Total a cobrar</span>
          <span className="text-lg text-violet-800">{formatMoneyAr(newAmount)}</span>
        </div>

        {/* Botón confirmar */}
        <button onClick={handleConfirm} disabled={confirming}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-700 hover:to-violet-600 text-white font-black text-sm shadow-lg shadow-violet-200 transition disabled:opacity-50 flex items-center justify-center gap-2">
          {confirming
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Generando...</>
            : <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                Confirmar renovación{classCount ? ` (${classCount} clases)` : ''}
              </>
          }
        </button>
      </div>
    </div>
  );
};

export const RenewSubscriptionModal = ({ isOpen, onClose, renewalData, onRenew }) => {
  if (!isOpen || !renewalData) return null;
  const { student, packages } = renewalData;

  // Wrapper para adaptar la firma de onRenew
  const handleRenew = (pkg, amount, payMethod) => {
    return onRenew(student, pkg, amount, payMethod);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {student?.photoURL ? (
              <img src={student.photoURL} className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-2 ring-violet-200" alt="" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-black flex-shrink-0">
                {(student?.name || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-black text-gray-900 text-base truncate">Renovar abono</h2>
              <p className="text-violet-600 text-sm font-semibold truncate">{student?.name}</p>
            </div>
          </div>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50">
          {packages.length > 0 ? (
            packages.map((pkg, index) => (
              <RenewalCard key={index} pkg={pkg} index={index} onRenew={handleRenew} />
            ))
          ) : (
            <div className="text-center py-10 text-gray-500">
              <div className="text-4xl mb-2">📦</div>
              <p className="font-medium">Sin abonos para renovar</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition">
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
};
