import React, { useState, useEffect, useCallback } from 'react';
import { collection as fsCollection, addDoc as fsAddDoc, doc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ModalHeader } from './Modal.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { IconCalendar } from './Icons.jsx';
import { formatMoneyAr } from '../utils/money.js';
import { formatDateToDDMMYYYY, mapClassTypeToSpanish, daysOfWeekFull } from '../utils/classHelpers.js';
import { getLocalToday, toLocalYYYYMMDD, generateTimeOptions } from '../utils/dateHelpers.js';
import { cancelScheduledClass, hardDeleteScheduledClass, hardDeleteUnpaidMonthlyPackage } from '../utils/classActions.js';
const fldLabel = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5';
const fldInput = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 transition bg-white';

const MONTH_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAY_ES   = ['L','M','M','J','V','S','D'];

function ClassDatePicker({ value, onChange, blockedSlots = [], scheduledClasses = [], allowPast = false }) {
  const [open, setOpen] = React.useState(false);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // Agrupar clases por fecha para mostrar ocupación
  const classesByDate = React.useMemo(() => {
    const map = {};
    (scheduledClasses || []).forEach(cls => {
      if (!cls.classDate) return;
      if (cls.status === 'cancelled') return;
      if (!map[cls.classDate]) map[cls.classDate] = [];
      map[cls.classDate].push(cls);
    });
    return map;
  }, [scheduledClasses]);

  const [view, setView] = React.useState(() => {
    const d = value ? new Date(value + 'T12:00:00') : today;
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const fmt = (y, m, d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const toDisplay = (str) => {
    if (!str) return null;
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  };

  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstDow    = new Date(view.y, view.m, 1).getDay();
  const offset      = firstDow === 0 ? 6 : firstDow - 1;

  const prevMonth = () => setView(v => v.m === 0 ? {y: v.y-1, m:11} : {y: v.y, m: v.m-1});
  const nextMonth = () => setView(v => v.m === 11? {y: v.y+1, m:0}  : {y: v.y, m: v.m+1});

  const blockedSet = new Set((blockedSlots||[]).map(s => s.date));

  const CalendarGrid = () => (
    <div className="mt-2 bg-white rounded-2xl border border-rose-100 shadow-md p-4">
      {/* Nav del mes */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth}
          className="p-2 rounded-xl hover:bg-gray-100 transition text-gray-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
        </button>
        <span className="font-bold text-gray-800 text-sm capitalize">
          {MONTH_ES[view.m]} {view.y}
        </span>
        <button type="button" onClick={nextMonth}
          className="p-2 rounded-xl hover:bg-gray-100 transition text-gray-600">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      {/* Cabecera días */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAY_ES.map((d, i) => (
          <div key={i} className="text-[10px] font-bold text-gray-400 text-center">{d}</div>
        ))}
      </div>

      {/* Grid de días */}
      <div className="grid grid-cols-7 gap-1.5">
        {Array(offset).fill(null).map((_, i) => <div key={`e${i}`}/>)}
        {Array.from({length: daysInMonth}, (_, i) => i + 1).map(day => {
          const dateStr    = fmt(view.y, view.m, day);
          const isBlocked  = blockedSet.has(dateStr);
          const isPast     = dateStr < todayStr;
          const isSel      = dateStr === value;
          const isToday2   = dateStr === todayStr;
          const disabled   = isBlocked || (isPast && !allowPast);
          const dayClasses = classesByDate[dateStr] || [];
          const clsCount   = dayClasses.length;

          return (
            <button key={day} type="button" disabled={disabled}
              onClick={() => { onChange(dateStr); setOpen(false); }}
              title={isBlocked ? '🚫 Día bloqueado' : (isPast && !allowPast) ? 'Fecha pasada' : clsCount > 0 ? `${clsCount} clase${clsCount>1?'s':''} agendadas` : 'Día libre'}
              className={`h-10 w-full rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center relative gap-0.5
                ${isSel     ? 'bg-rose-600 text-white shadow-md scale-105' :
                  isBlocked  ? 'bg-red-50 text-red-200 cursor-not-allowed' :
                  (isPast && !allowPast) ? 'text-gray-200 cursor-not-allowed' :
                  isPast     ? 'text-gray-400 hover:bg-gray-50' :
                  isToday2   ? 'ring-2 ring-rose-400 text-rose-600 bg-rose-50' :
                  clsCount > 0 ? 'bg-amber-50 text-amber-800 hover:bg-amber-100' :
                               'hover:bg-green-50 hover:text-green-700 text-gray-700'}`}>
              <span>{isBlocked ? '🚫' : day}</span>
              {/* Indicador de clases */}
              {!isBlocked && !(isPast && !allowPast) && clsCount > 0 && !isSel && (
                <div className="flex gap-0.5">
                  {Array.from({length: Math.min(clsCount, 3)}).map((_, i) => (
                    <div key={i} className={`w-1 h-1 rounded-full ${clsCount >= 4 ? 'bg-red-400' : clsCount >= 2 ? 'bg-amber-500' : 'bg-amber-400'}`}/>
                  ))}
                </div>
              )}
              {!isBlocked && !isPast && clsCount === 0 && !isSel && !isToday2 && (
                <div className="w-1 h-1 rounded-full bg-green-400"/>
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"/>Libre</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>Con clases</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>Muy ocupado</span>
        <span className="flex items-center gap-1">🚫 Bloqueado</span>
      </div>
    </div>
  );

  // Panel de horarios del día seleccionado
  const selectedDayClasses = value ? (classesByDate[value] || []).sort((a,b) => a.startTime.localeCompare(b.startTime)) : [];
  const isSelectedBlocked  = value ? blockedSet.has(value) : false;

  return (
    <div>
      {/* Trigger */}
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 border rounded-xl text-sm transition
          ${open ? 'border-rose-400 ring-2 ring-rose-200 bg-rose-50' : 'border-gray-200 hover:border-rose-300 bg-white'}
          ${value ? 'text-gray-900' : 'text-gray-400'}`}>
        <svg className="w-4 h-4 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        <span className="flex-1 text-left font-medium">
          {value ? toDisplay(value) : 'Tocá para elegir fecha'}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {/* Calendario INLINE */}
      {open && <CalendarGrid />}

      {/* Horarios del día seleccionado (siempre visible cuando hay fecha) */}
      {value && !open && !isSelectedBlocked && (
        <div className={`mt-2 p-3 rounded-xl border text-xs
          ${selectedDayClasses.length === 0
            ? 'bg-green-50 border-green-200'
            : 'bg-amber-50 border-amber-200'}`}>
          {selectedDayClasses.length === 0 ? (
            <p className="text-green-700 font-bold text-center">✅ Día libre — sin clases agendadas</p>
          ) : (
            <>
              <p className="font-bold text-amber-700 mb-2 uppercase tracking-wide" style={{fontSize:'9px'}}>
                Horarios ocupados ese día:
              </p>
              <div className="space-y-1">
                {selectedDayClasses.map((cls, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-amber-100">
                    <span className="font-black text-amber-800 tabular-nums w-10">{cls.startTime}</span>
                    <span className="text-[9px] text-gray-400">—</span>
                    <span className="font-black text-amber-800 tabular-nums w-10">{cls.endTime}</span>
                    <span className="flex-1 text-gray-600 truncate">{cls.studentName}</span>
                    <span className="text-[9px] text-gray-400 flex-shrink-0">{cls.studentType === 'individual' ? 'Indiv.' : cls.studentType === 'group' ? 'Grup.' : 'Coral'}</span>
                  </div>
                ))}
              </div>
              <p className="text-amber-600 text-[9px] mt-2 text-center">
                Elegí un horario que no se superponga
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const SingleClassFields = ({ classType, setClassType, classDate, setClassDate, startTime, setStartTime, duration, setDuration, price, setPrice, isRescheduling, hideMonto, blockedSlots, scheduledClasses, allowPast = false }) => (
    <div className="space-y-3">
        {/* Tipo + Duración en fila */}
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label className={fldLabel}>Tipo de clase</label>
                <select value={classType} onChange={e => setClassType(e.target.value)}
                    className={fldInput} required disabled={isRescheduling}>
                    <option value="individual">Individual</option>
                    <option value="group">Grupal</option>
                    <option value="choir">Coro</option>
                </select>
            </div>
            <div>
                <label className={fldLabel}>Duración</label>
                <select value={duration} onChange={e => setDuration(e.target.value)}
                    className={fldInput} required disabled={isRescheduling || classType === 'individual'}>
                    <option value="60">60 min</option>
                    {classType !== 'individual' && <option value="90">90 min</option>}
                </select>
            </div>
        </div>
        {/* Fecha + Hora en fila */}
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label className={fldLabel}>Fecha</label>
                <ClassDatePicker value={classDate} onChange={setClassDate} blockedSlots={blockedSlots} scheduledClasses={scheduledClasses} allowPast={allowPast} />
            </div>
            <div>
                <label className={fldLabel}>Hora de inicio</label>
                <select value={startTime} onChange={e => setStartTime(e.target.value)}
                    className={fldInput} required>
                    <option value="" disabled>-- Hora --</option>
                    {generateTimeOptions(classType === 'individual' ? 60 : 30).map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
            </div>
        </div>
        {/* Monto: solo si no es reprogramación ni usa saldo flex */}
        {!isRescheduling && !hideMonto && (
            <div>
                <label className={fldLabel}>Monto (clase única)</label>
                <MoneyInput value={price} onValueChange={setPrice}
                    placeholder="Ej: 50.000"
                    className={fldInput} required/>
            </div>
        )}
        {/* Badge informativo cuando usa saldo flexible */}
        {hideMonto && !isRescheduling && (
            <div className="flex items-center gap-2 p-3 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-700 font-medium">
                <span>🎫</span>
                <span>Esta clase se marcará como <strong>pagada</strong> usando tu saldo flexible</span>
            </div>
        )}
    </div>
);

// --- Monthly Class Fields Component (REDISEÑADO) ---
export function MonthlyClassFields({
    monthlyClassType, setMonthlyClassType,
    monthlyDayOfWeek, setMonthlyDayOfWeek,
    monthlyStartTime, setMonthlyStartTime,
    monthlyDuration,  setMonthlyDuration,
    monthlyAmount,    setMonthlyAmount,
    monthlyStartDate, setMonthlyStartDate,
    isRescheduling,
    includeMatricula, setIncludeMatricula,
    blockedSlots = [], scheduledClasses = [],
    notifyStudent = false, setNotifyStudent = () => {},
}) {
    // Selector de mes: navegar con flechas
    const initMonth = () => {
        if (monthlyStartDate) {
            const [y, m] = monthlyStartDate.split('-').map(Number);
            return { y, m: m - 1 };
        }
        const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() };
    };
    const [viewMon, setViewMon] = React.useState(initMonth);

    // Sincronizar viewMon → monthlyStartDate
    React.useEffect(() => {
        const s = `${viewMon.y}-${String(viewMon.m + 1).padStart(2,'0')}-01`;
        if (s !== monthlyStartDate) setMonthlyStartDate(s);
    }, [viewMon]);

    const prevMon = () => setViewMon(v => v.m === 0 ? {y:v.y-1, m:11} : {y:v.y, m:v.m-1});
    const nextMon = () => setViewMon(v => v.m === 11? {y:v.y+1, m:0}  : {y:v.y, m:v.m+1});
    const monthLabel = `${MONTH_ES[viewMon.m]} ${viewMon.y}`;

    // Preview de fechas a generar
    const previewDates = React.useMemo(() => {
        if (!monthlyDayOfWeek) return [];
        const { y, m } = viewMon;
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const results = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(y, m, d);
            if (date.getDay() !== parseInt(monthlyDayOfWeek)) continue;
            const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isBlocked  = blockedSlots.some(s => s.date === dateStr);
            const hasConflict = scheduledClasses.some(c =>
                c.classDate === dateStr && c.startTime === monthlyStartTime && c.status !== 'cancelled');
            results.push({ dateStr, d, isBlocked, hasConflict });
        }
        return results;
    }, [monthlyDayOfWeek, viewMon, monthlyStartTime, blockedSlots, scheduledClasses]);

    const validCount    = previewDates.filter(d => !d.isBlocked).length;
    const blockedCount  = previewDates.filter(d => d.isBlocked).length;
    const conflictCount = previewDates.filter(d => d.hasConflict && !d.isBlocked).length;

    const baseVal      = Number(monthlyAmount) || 0;
    const matriculaVal = Math.round(baseVal * 0.50);
    const totalVal     = baseVal + matriculaVal;

    const formatDay = (dateStr) => {
        const [,, d] = dateStr.split('-');
        return `${parseInt(d)}/${viewMon.m + 1}`;
    };

    return (
        <div className="space-y-4">
            {/* Tipo + Duración */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className={fldLabel}>Tipo de clase</label>
                    <select value={monthlyClassType} onChange={e => setMonthlyClassType(e.target.value)}
                        className={fldInput} required disabled={isRescheduling}>
                        <option value="individual">Individual</option>
                        <option value="group">Grupal</option>
                        <option value="choir">Coro</option>
                    </select>
                </div>
                <div>
                    <label className={fldLabel}>Duración</label>
                    <select value={monthlyDuration} onChange={e => setMonthlyDuration(e.target.value)}
                        className={fldInput} required disabled={isRescheduling || monthlyClassType === 'individual'}>
                        <option value="60">60 min</option>
                        {monthlyClassType !== 'individual' && <option value="90">90 min</option>}
                    </select>
                </div>
            </div>

            {/* Día + Hora */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className={fldLabel}>Día de la semana</label>
                    <select value={monthlyDayOfWeek} onChange={e => setMonthlyDayOfWeek(e.target.value)}
                        className={fldInput} required>
                        {daysOfWeekFull.filter(d => d.value !== '0').map(d => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={fldLabel}>Hora de inicio</label>
                    <select value={monthlyStartTime} onChange={e => setMonthlyStartTime(e.target.value)}
                        className={fldInput} required>
                        {generateTimeOptions(monthlyClassType === 'individual' ? 60 : 30).map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Selector de mes con flechas */}
            {!isRescheduling && (
                <div>
                    <label className={fldLabel}>Mes del abono</label>
                    <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                        <button type="button" onClick={prevMon}
                            className="px-4 py-2.5 hover:bg-gray-100 transition text-gray-600 border-r border-gray-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                        </button>
                        <span className="flex-1 text-center font-bold text-gray-800 text-sm capitalize">{monthLabel}</span>
                        <button type="button" onClick={nextMon}
                            className="px-4 py-2.5 hover:bg-gray-100 transition text-gray-600 border-l border-gray-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Preview de fechas generadas */}
            {!isRescheduling && previewDates.length > 0 && (
                <div className={`p-3 rounded-xl border ${conflictCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Clases a generar</p>
                        <div className="flex gap-2">
                            <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">{validCount} clase{validCount!==1?'s':''}</span>
                            {blockedCount > 0 && <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">{blockedCount} bloqueado{blockedCount!==1?'s':''}</span>}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {previewDates.map(({dateStr, d, isBlocked, hasConflict}) => (
                            <span key={dateStr}
                                className={`text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1
                                    ${isBlocked    ? 'bg-red-100 text-red-400 line-through' :
                                      hasConflict   ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-400' :
                                                      'bg-white text-gray-700 border border-gray-200'}`}
                                title={isBlocked ? 'Día bloqueado — se omitirá' : hasConflict ? 'Ya hay clase a esta hora' : ''}>
                                {isBlocked ? '🚫' : hasConflict ? '⚠️' : '✓'} {formatDay(dateStr)}
                            </span>
                        ))}
                    </div>
                    {conflictCount > 0 && (
                        <p className="text-[10px] text-amber-700 mt-2">⚠️ {conflictCount} fecha{conflictCount!==1?'s':''} tienen conflicto de horario con otra clase existente</p>
                    )}
                </div>
            )}

            {/* Monto */}
            {!isRescheduling && (
                <div className="space-y-3">
                    <div>
                        <label className={fldLabel}>Monto mensual (abono base)</label>
                        <MoneyInput value={monthlyAmount} onValueChange={setMonthlyAmount}
                            placeholder="Ej: 100.000"
                            className={fldInput} required/>
                    </div>

                    {/* Matrícula */}
                    <label className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-100 transition">
                        <input type="checkbox" checked={includeMatricula} onChange={e => setIncludeMatricula(e.target.checked)}
                            className="h-4 w-4 text-rose-600 rounded"/>
                        <div>
                            <p className="text-sm font-semibold text-gray-800">Incluir Matrícula Anual (+50%)</p>
                            <p className="text-xs text-gray-500">Se suma la mitad del abono al total</p>
                        </div>
                    </label>

                    {/* Cálculo total */}
                    {baseVal > 0 && (
                        <div className={`p-3 rounded-xl border text-sm ${includeMatricula ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-100'}`}>
                            {includeMatricula ? (
                                <>
                                    <div className="flex justify-between text-gray-600"><span>Abono base</span><span className="font-semibold">${new Intl.NumberFormat('es-AR').format(baseVal)}</span></div>
                                    <div className="flex justify-between text-amber-700"><span>Matrícula (50%)</span><span className="font-semibold">+ ${new Intl.NumberFormat('es-AR').format(matriculaVal)}</span></div>
                                    <div className="flex justify-between font-black text-base text-amber-900 border-t border-amber-200 mt-1 pt-1"><span>Total a cobrar</span><span>${new Intl.NumberFormat('es-AR').format(totalVal)}</span></div>
                                </>
                            ) : (
                                <div className="flex justify-between font-black text-base text-emerald-900"><span>Total a cobrar</span><span>${new Intl.NumberFormat('es-AR').format(baseVal)}</span></div>
                            )}
                        </div>
                    )}

                    {/* Notificación push */}
                    <label className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-200 rounded-xl cursor-pointer hover:bg-violet-100 transition">
                        <div className="relative flex-shrink-0">
                            <input type="checkbox" checked={notifyStudent} onChange={e => setNotifyStudent(e.target.checked)} className="sr-only peer"/>
                            <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-violet-600
                                after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white
                                after:border after:rounded-full after:h-4 after:w-4 after:transition-all
                                peer-checked:after:translate-x-4"/>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-violet-900">🔔 Notificar al alumno</p>
                            <p className="text-xs text-violet-600">Le llega una notificación en la app con las fechas de sus clases</p>
                        </div>
                    </label>
                </div>
            )}
        </div>
    );
}

// --- Schedule Class Form Component (ACTUALIZADO CON LÓGICA DE MATRÍCULA) ---
export const ScheduleClassForm = ({ db, userId, appId, showMessage, onClose, editingClassData, isRescheduling, scheduledClasses, initialSelectedStudent, blockedSlots, initialDate, initialTime }) => {
    const isEditing = editingClassData && editingClassData.id;
    const currentStudent = initialSelectedStudent || editingClassData?.studentDetails;
    const todayFormatted = getLocalToday();

    const [classDate, setClassDate] = useState(initialDate || '');
    const [startTime, setStartTime] = useState(initialTime || '');
    const [duration, setDuration] = useState('60');
    const [topicLink, setTopicLink] = useState(editingClassData?.topicLink || '');
    // ▼▼▼ PEGA ESTO JUSTO DEBAJO DE 'useState' ▼▼▼
    useEffect(() => {
        if (editingClassData) {
            // Si hay datos, rellenamos el tipo de clase y el link
            if (editingClassData.studentType) {
                setClassType(editingClassData.studentType);
            }
            if (editingClassData.topicLink) {
                setTopicLink(editingClassData.topicLink);
            }
        }
    }, [editingClassData]);
    // ▲▲▲ FIN DEL PEGADO ▲▲▲
    const [classType, setClassType] = useState('individual');
    const [price, setPrice] = useState('');
    const [loading, setLoading] = useState(false);
    const [localMessage, setLocalMessage] = useState({ text: '', type: 'info' });

    const [selectedClassToRescheduleId, setSelectedClassToRescheduleId] = useState('');
    const [availableClassesToReschedule, setAvailableClassesToReschedule] = useState([]);
    const [rescheduleTargetScheduleType, setRescheduleTargetScheduleType] = useState(null);
    const [rescheduleReason, setRescheduleReason] = useState('');
    const [sendWhatsapp, setSendWhatsapp]   = useState(false);
    const [moveAll, setMoveAll]             = useState(false);
    const [newDayOfWeek, setNewDayOfWeek]   = useState('');

    // ── Saldo Flexible existente (para usar al agendar clase única) ────────────
    const [flexCredits, setFlexCredits]     = useState([]);
    const [useFlexCredit, setUseFlexCredit] = useState(false);
    const [selectedFlexId, setSelectedFlexId] = useState('');

    // ── Crear nuevo Abono Flexible ──────────────────────────────────────────────
    const [flexNewAmount,    setFlexNewAmount]    = useState('');
    const [flexNewClases,    setFlexNewClases]    = useState('4');
    const [flexNewPayMethod, setFlexNewPayMethod] = useState('transferencia');
    const [flexNewCobroMode, setFlexNewCobroMode] = useState('adelantado'); // 'adelantado' | 'por_clase'

    const FLEX_PAY_METHODS = [
      { id:'efectivo', label:'Efectivo', icon:'💵' },
      { id:'transferencia', label:'Transferencia', icon:'🏦' },
      { id:'mercadopago', label:'MercadoPago', icon:'📱' },
    ];

    const handleCreateFlexCredit = async () => {
      const amt = Number(String(flexNewAmount).replace(/\./g,'').replace(',','.'));
      const cls = parseInt(flexNewClases) || 0;
      if (!amt || amt <= 0) { showLocalMessage('Ingresá un monto válido.', 'error'); return; }
      if (!cls)             { showLocalMessage('Seleccioná la cantidad de clases.', 'error'); return; }
      if (!userId)          { showLocalMessage('Error de autenticación.', 'error'); return; }
      setLoading(true);
      try {
        const now      = new Date();
        const start    = new Date(now.getFullYear(), now.getMonth(), 1);
        const porClase = flexNewCobroMode === 'por_clase';
        await fsAddDoc(fsCollection(db, `artifacts/${appId}/payments`), {
          studentId:        currentStudent.id,
          studentName:      currentStudent.name,
          paymentMethod:    'abono_flexible',
          paymentMethodType: flexNewPayMethod,
          amount:           amt,
          clasesTotal:      cls,
          clasesUsadas:     0,
          isPaidForPackage: false,
          periodStartDate:  toLocalYYYYMMDD(start),
          ...(porClase ? { cobroPorClase: true, montoPorClase: Math.round(amt / cls), clasesPagadas: 0 } : {}),
          createdAt:        now,
          userId,
        });
        showMessage(porClase
          ? `✅ Abono Flexible creado: ${cls} clase${cls > 1 ? 's' : ''} para ${currentStudent.name}. Quedó como deuda — vas a poder registrar el cobro de cada clase desde su ficha.`
          : `✅ Abono Flexible creado: ${cls} clase${cls > 1 ? 's' : ''} para ${currentStudent.name}. Quedó como deuda hasta que marqués el pago completo desde "Marcar Pago".`, 'success');
        onClose?.();
      } catch (e) {
        showLocalMessage('Error: ' + e.message, 'error');
      } finally { setLoading(false); }
    };

    useEffect(() => {
      if (!currentStudent?.id || !db || !appId || isRescheduling || isEditing) return;
      getDocs(query(
        fsCollection(db, `artifacts/${appId}/payments`),
        where('studentId', '==', currentStudent.id),
        where('paymentMethod', '==', 'abono_flexible')
      )).then(snap => {
        const credits = snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, ...data, remaining: (data.clasesTotal || 0) - (data.clasesUsadas || 0) };
        }).filter(c => c.remaining > 0);
        setFlexCredits(credits);
        if (credits.length > 0) { setUseFlexCredit(true); setSelectedFlexId(credits[0].id); }
      }).catch(() => {});
    }, [currentStudent?.id, db, appId, isRescheduling, isEditing]);

    const [scheduleType, setScheduleType] = useState('monthly');
    const [monthlyClassType, setMonthlyClassType] = useState('individual');
    const [monthlyDayOfWeek, setMonthlyDayOfWeek] = useState('1');
    const [monthlyStartTime, setMonthlyStartTime] = useState('08:00');
    const [monthlyDuration, setMonthlyDuration] = useState('60');
    const [monthlyStartDate, setMonthlyStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [monthlyAmount, setMonthlyAmount] = useState('');
    
    // ✅ NUEVO ESTADO PARA LA MATRÍCULA
    const [includeMatricula, setIncludeMatricula] = useState(false);
    const [notifyStudent,    setNotifyStudent]    = useState(true);

    const showLocalMessage = (text, type = 'info') => {
        setLocalMessage({ text, type });
        setTimeout(() => setLocalMessage({ text: '', type: 'info' }), 5000);
    };

    useEffect(() => {
        if (!currentStudent) {
            setClassDate(''); setStartTime(''); setDuration('60'); setClassType('individual'); setPrice('');
            setSelectedClassToRescheduleId(''); setAvailableClassesToReschedule([]);
            setScheduleType('monthly'); setMonthlyDayOfWeek('1'); setMonthlyStartTime('08:00');
            setMonthlyDuration('60'); setMonthlyStartDate(new Date().toISOString().split('T')[0]);
            setMonthlyAmount(''); setMonthlyClassType('individual');
            setRescheduleTargetScheduleType(null); setLocalMessage({ text: '', type: 'info' });
            setIncludeMatricula(false); // Reset matrícula
            return;
        }

        if (isRescheduling) {
            const today = getLocalToday();
            const classesForReschedule = scheduledClasses.filter(cls => {
                const isUnconsumed = cls.attendanceStatus === null || cls.attendanceStatus === undefined;
                return cls.studentId === currentStudent.id && cls.isPaid === true && isUnconsumed && cls.classDate >= today;
            }).sort((a, b) => a.classDate.localeCompare(b.classDate) || a.startTime.localeCompare(b.startTime));
            setAvailableClassesToReschedule(classesForReschedule);

            if (classesForReschedule.length > 0) {
                const selectedClass = classesForReschedule[0];
                setSelectedClassToRescheduleId(selectedClass.id);
                if (selectedClass.scheduleType === 'single' || selectedClass.scheduleType === 'monthly') {
                    setClassDate(selectedClass.classDate);
                    setStartTime(selectedClass.startTime);
                    setDuration(String(selectedClass.duration));
                }
                setClassType(selectedClass.studentType);
                setPrice(String(selectedClass.price));
                setRescheduleTargetScheduleType(selectedClass.scheduleType);
            } else {
                setSelectedClassToRescheduleId(''); setClassDate(''); setStartTime(''); setDuration('60');
                setClassType('individual'); setPrice(''); setRescheduleTargetScheduleType(null);
            }
        } else if (isEditing && editingClassData) {
            const classToEdit = editingClassData;
            setScheduleType(classToEdit.scheduleType || 'single');
            setClassDate(classToEdit.classDate || '');
            setStartTime(classToEdit.startTime || '');
            setDuration(classToEdit.duration != null ? String(classToEdit.duration) : '60');
            setClassType(classToEdit.studentType || 'individual');
            setPrice(classToEdit.price != null ? String(classToEdit.price) : '');
            setRescheduleTargetScheduleType(null);
        } else { // New class creation
            setScheduleType('monthly'); setClassDate(''); setStartTime(''); setDuration('60');
            setClassType('individual'); setPrice(''); setMonthlyDayOfWeek('1'); setMonthlyStartTime('08:00');
            setMonthlyDuration('60'); setMonthlyStartDate(new Date().toISOString().split('T')[0]);
            setMonthlyAmount(''); setMonthlyClassType('individual'); setRescheduleTargetScheduleType(null);
            setIncludeMatricula(false);
        }
        setLocalMessage({ text: '', type: 'info' });
    }, [currentStudent, editingClassData, isEditing, isRescheduling, scheduledClasses]);

    useEffect(() => {
        if (!isRescheduling) {
            if (scheduleType === 'single' && classType === 'individual') {
                setDuration('60');
            } else if (scheduleType === 'monthly' && monthlyClassType === 'individual') {
                setMonthlyDuration('60');
            }
        }
    }, [classType, monthlyClassType, scheduleType, isRescheduling]);

    const handleClassToRescheduleChange = (e) => {
        const selectedId = e.target.value;
        setSelectedClassToRescheduleId(selectedId);
        const selectedClass = availableClassesToReschedule.find(cls => cls.id === selectedId);
        if (selectedClass) {
            setClassType(selectedClass.studentType);
            setPrice(String(selectedClass.price));
            setDuration(String(selectedClass.duration));
            setRescheduleTargetScheduleType(selectedClass.scheduleType);
            setClassDate(selectedClass.classDate);
            setStartTime(selectedClass.startTime);
        }
        setLocalMessage({ text: '', type: 'info' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalMessage({ text: '', type: 'info' });
        if (!userId) {
            showMessage('Error: Usuario no autenticado.', 'error');
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const studentName = currentStudent.name;
            const studentId = currentStudent.id;

            if (isRescheduling) {
                // ── MOVER TODAS LAS CLASES FUTURAS ───────────────────────────
                if (moveAll) {
                    if (!startTime) {
                        showLocalMessage('Seleccioná la nueva hora.', 'error');
                        setLoading(false); return;
                    }
                    const batch = writeBatch(db);
                    let count = 0;
                    for (const cls of availableClassesToReschedule) {
                        let targetDate = cls.classDate;
                        // Si cambió el día de la semana, calcular la nueva fecha en la misma semana
                        if (newDayOfWeek && newDayOfWeek !== '') {
                            const orig = new Date(cls.classDate + 'T12:00:00');
                            const diff = parseInt(newDayOfWeek) - orig.getDay();
                            orig.setDate(orig.getDate() + diff);
                            targetDate = toLocalYYYYMMDD(orig);
                        }
                        if (blockedSlots.some(s => s.date === targetDate)) continue;
                        const dur = parseInt(cls.duration || duration || 60);
                        const endDt = new Date(`${targetDate}T${startTime}:00`);
                        endDt.setMinutes(endDt.getMinutes() + dur);
                        const newEnd = `${String(endDt.getHours()).padStart(2,'0')}:${String(endDt.getMinutes()).padStart(2,'0')}`;
                        batch.update(doc(db, `artifacts/${appId}/scheduledClasses`, cls.id), {
                            classDate: targetDate, startTime, endTime: newEnd,
                            rescheduleReason: rescheduleReason || null, rescheduledAt: new Date(),
                        });
                        count++;
                    }
                    await batch.commit();
                    showMessage(`✅ ${count} clase${count !== 1 ? 's' : ''} reprogramada${count !== 1 ? 's' : ''} exitosamente.`, 'success');
                    if (sendWhatsapp) {
                        const waRaw = (currentStudent.whatsapp || currentStudent.contactInfo || '').replace(/\D/g, '');
                        if (waRaw.length >= 8) {
                            const fn = (currentStudent.name || '').split(' ')[0];
                            const dayStr = newDayOfWeek ? (daysOfWeekFull.find(d => d.value === newDayOfWeek)?.label || '') : 'el horario habitual';
                            const msg = `Hola ${fn}, a partir de ahora tu clase es los ${dayStr} a las ${startTime} hs. ¡Saludos, Sandra! 🎵`;
                            window.open(`https://wa.me/549${waRaw}?text=${encodeURIComponent(msg)}`, '_blank');
                        }
                    }
                    onClose && onClose(); setLoading(false); return;
                }

                // ── MOVER UNA SOLA CLASE ─────────────────────────────────────
                if (!selectedClassToRescheduleId) {
                    showLocalMessage('Por favor, selecciona una clase a re-programar.', 'error');
                    setLoading(false);
                    return;
                }
                if (blockedSlots.some(slot => slot.date === classDate)) {
                    showLocalMessage('No se puede reprogramar una clase a un día bloqueado.', 'error');
                    setLoading(false);
                    return;
                }
                if (!classDate || !startTime || !duration) {
                    showLocalMessage('Por favor, completa la nueva fecha, hora de inicio y duración.', 'error');
                    setLoading(false);
                    return;
                }
                const newStartDate = new Date(`${classDate}T${startTime}:00`);
                newStartDate.setMinutes(newStartDate.getMinutes() + parseInt(duration));
                const newEndTime = `${newStartDate.getHours().toString().padStart(2, '0')}:${newStartDate.getMinutes().toString().padStart(2, '0')}`;

                const classesOnTargetDateQuery = query(fsCollection(db, `artifacts/${appId}/scheduledClasses`), where('classDate', '==', classDate));
                const classesOnTargetDateSnapshot = await getDocs(classesOnTargetDateQuery);
                const classesOnTargetDate = classesOnTargetDateSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const newClassStartMinutes = (parseInt(startTime.split(':')[0]) * 60) + parseInt(startTime.split(':')[1]);
                const newClassEndMinutes = newClassStartMinutes + parseInt(duration);

                const overlappingClass = classesOnTargetDate.find(existingCls => {
                    if (existingCls.id === selectedClassToRescheduleId) return false;
                    if (existingCls.status !== 'scheduled' && existingCls.status != null) return false;
                    const existingClassStartMinutes = (parseInt(existingCls.startTime.split(':')[0]) * 60) + parseInt(existingCls.startTime.split(':')[1]);
                    const existingClassEndMinutes = existingClassStartMinutes + existingCls.duration;
                    const hasTimeOverlap = (newClassStartMinutes < existingClassEndMinutes && newClassEndMinutes > existingClassStartMinutes);
                    if (hasTimeOverlap && (classType === 'individual' || existingCls.studentType === 'individual')) return true;
                    return false;
                });

                if (overlappingClass) {
                    showLocalMessage(`¡Uy! El horario ${startTime} del ${formatDateToDDMMYYYY(classDate)} se superpone con la clase de ${overlappingClass.studentName}.`, 'error');
                    setLoading(false);
                    return;
                }

                await updateDoc(doc(db, `artifacts/${appId}/scheduledClasses`, selectedClassToRescheduleId), {
                    classDate, startTime, endTime: newEndTime, duration: parseInt(duration),
                    rescheduleReason: rescheduleReason || null,
                    rescheduledAt: new Date(),
                });
                showMessage('Clase re-programada exitosamente!', 'success');

                // WhatsApp notification
                if (sendWhatsapp) {
                    const waRaw = (currentStudent.whatsapp || currentStudent.contactInfo || '').replace(/\D/g, '');
                    if (waRaw.length >= 8) {
                        const fn = (currentStudent.name || '').split(' ')[0];
                        const dayStr = new Date(classDate + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
                        const msg = `Hola ${fn}, tu clase fue reprogramada al ${dayStr} a las ${startTime} hs. ¡Saludos, Sandra! 🎵`;
                        window.open(`https://wa.me/549${waRaw}?text=${encodeURIComponent(msg)}`, '_blank');
                    }
                }

            } else if (scheduleType === 'single') {
                // ... (Lógica de clase única sin cambios)
                if (blockedSlots.some(slot => slot.date === classDate)) {
                    showLocalMessage('No se puede programar una clase en un día bloqueado.', 'error');
                    setLoading(false);
                    return;
                }
                if (!classDate || !startTime || !duration || !classType || (price === '' && !useFlexCredit)) {
                    showLocalMessage('Por favor, completa todos los campos para la clase única.', 'error');
                    setLoading(false);
                    return;
                }
                const startDate = new Date(`${classDate}T${startTime}:00`);
                startDate.setMinutes(startDate.getMinutes() + parseInt(duration));
                const endTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;
                
                const classesOnTargetDateQuery = query(fsCollection(db, `artifacts/${appId}/scheduledClasses`), where('classDate', '==', classDate));
                const classesOnTargetDateSnapshot = await getDocs(classesOnTargetDateQuery);
                const classesOnTargetDate = classesOnTargetDateSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const newClassStartMinutes = (parseInt(startTime.split(':')[0]) * 60) + parseInt(startTime.split(':')[1]);
                const newClassEndMinutes = newClassStartMinutes + parseInt(duration);

                const overlappingClass = classesOnTargetDate.find(existingCls => {
                    if (isEditing && existingCls.id === editingClassData.id) return false;
                    if (existingCls.status !== 'scheduled' && existingCls.status != null) return false;
                    const existingClassStartMinutes = (parseInt(existingCls.startTime.split(':')[0]) * 60) + parseInt(existingCls.startTime.split(':')[1]);
                    const existingClassEndMinutes = existingClassStartMinutes + existingCls.duration;
                    const hasTimeOverlap = (newClassStartMinutes < existingClassEndMinutes && newClassEndMinutes > existingClassStartMinutes);
                    if (hasTimeOverlap && (classType === 'individual' || existingCls.studentType === 'individual')) return true;
                    return false;
                });

                if (overlappingClass) {
                    showLocalMessage(`¡Uy! El horario ${startTime} del ${formatDateToDDMMYYYY(classDate)} se superpone con la clase de ${overlappingClass.studentName}.`, 'error');
                    setLoading(false);
                    return;
                }

                const classData = { studentId, studentName, studentType: classType, classDate, startTime, endTime, duration: parseInt(duration), price: useFlexCredit ? 0 : Number(price), isPaid: isEditing ? (editingClassData.isPaid === true) : false, userId, scheduledAt: isEditing && editingClassData.scheduledAt ? editingClassData.scheduledAt : new Date(), scheduleType: 'single', attendanceStatus: isEditing && editingClassData.attendanceStatus !== undefined ? editingClassData.attendanceStatus : null, status: 'scheduled',topicLink: topicLink || null, };
                if (isEditing) {
                    await updateDoc(doc(db, `artifacts/${appId}/scheduledClasses`, editingClassData.id), classData);
                    showMessage('Clase actualizada exitosamente!', 'success');
                } else {
                    // Si usa saldo flexible: marcar como pagada y descontar del saldo
                    if (useFlexCredit && selectedFlexId) {
                      const flexData = { ...classData, isPaid: true, scheduleType: 'single', flexiblePaymentId: selectedFlexId };
                      await fsAddDoc(fsCollection(db, `artifacts/${appId}/scheduledClasses`), flexData);
                      await updateDoc(doc(db, `artifacts/${appId}/payments`, selectedFlexId), { clasesUsadas: increment(1) });
                      showMessage('✅ Clase agendada y descontada del saldo flexible.', 'success');
                    } else {
                      await fsAddDoc(fsCollection(db, `artifacts/${appId}/scheduledClasses`), classData);
                      showMessage('Clase única programada exitosamente! (Pendiente de pago)', 'success');
                    }
                }

            } else { // Monthly schedule
                if (!monthlyClassType || !monthlyDayOfWeek || !monthlyStartTime || !monthlyDuration || !monthlyAmount || !monthlyStartDate) {
                    showLocalMessage('Error: Por favor, completa todos los campos de la clase mensual.', 'error');
                    setLoading(false);
                    return;
                }
                
                // ✅ CÁLCULO DE LA MATRÍCULA
                let finalAmount = Number(monthlyAmount);
                if (includeMatricula) {
                    const matricula = Math.round(finalAmount * 0.50);
                    finalAmount = finalAmount + matricula;
                }

                const [year, month, day] = monthlyStartDate.split('-').map(Number);
                const startPeriodDate = new Date(year, month - 1, day);
                const classesToAdd = [];
                const skippedBlockedDays = [];
                const actualYear = startPeriodDate.getFullYear();
                const actualMonth = startPeriodDate.getMonth();
                const daysInMonth = new Date(actualYear, actualMonth + 1, 0).getDate();

                for (let d = 1; d <= daysInMonth; d++) {
                    const date = new Date(actualYear, actualMonth, d);
                    if (date.getDay() === parseInt(monthlyDayOfWeek)) {
                        const formattedDate = toLocalYYYYMMDD(date);

                        if (blockedSlots.some(slot => slot.date === formattedDate)) {
                            skippedBlockedDays.push(formattedDate);
                            continue;
                        }

                        const classStartTime = monthlyStartTime;
                        const classDuration = parseInt(monthlyDuration);
                        const tempStartDate = new Date(`${formattedDate}T${classStartTime}:00`);
                        tempStartDate.setMinutes(tempStartDate.getMinutes() + classDuration);
                        const endTime = `${tempStartDate.getHours().toString().padStart(2, '0')}:${tempStartDate.getMinutes().toString().padStart(2, '0')}`;

                        const classesOnTargetDateQuery = query(fsCollection(db, `artifacts/${appId}/scheduledClasses`), where('classDate', '==', formattedDate));
                        const classesOnTargetDateSnapshot = await getDocs(classesOnTargetDateQuery);
                        const classesOnTargetDate = classesOnTargetDateSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        const newClassStartMinutes = (parseInt(classStartTime.split(':')[0]) * 60) + parseInt(classStartTime.split(':')[1]);
                        const newClassEndMinutes = newClassStartMinutes + classDuration;

                        const overlappingClass = classesOnTargetDate.find(existingCls => {
                            if (existingCls.status !== 'scheduled' && existingCls.status != null) return false;
                            const existingClassStartMinutes = (parseInt(existingCls.startTime.split(':')[0]) * 60) + parseInt(existingCls.startTime.split(':')[1]);
                            const existingClassEndMinutes = existingClassStartMinutes + existingCls.duration;
                            const hasTimeOverlap = (newClassStartMinutes < existingClassEndMinutes && newClassEndMinutes > existingClassStartMinutes);
                            if (hasTimeOverlap && (monthlyClassType === 'individual' || existingCls.studentType === 'individual')) return true;
                            return false;
                        });

                        if (overlappingClass) {
                            showLocalMessage(`¡Uy! El horario ${classStartTime} del ${formatDateToDDMMYYYY(formattedDate)} se superpone con la clase de ${overlappingClass.studentName}.`, 'error');
                            setLoading(false);
                            return;
                        }

                        classesToAdd.push({ studentId, studentName, studentType: monthlyClassType, classDate: formattedDate, startTime: classStartTime, endTime, duration: classDuration, isPaid: false, userId, scheduledAt: new Date(), scheduleType: 'monthly', attendanceStatus: null, status: 'scheduled',topicLink: topicLink || null });
                    }
                }

                if (classesToAdd.length === 0) {
                    let errorMessage = 'No se pudieron generar clases para el mes y día seleccionados.';
                    if(skippedBlockedDays.length > 0) {
                        errorMessage += ' Todos los días correspondientes estaban bloqueados.'
                    }
                    showLocalMessage(errorMessage, 'error');
                    setLoading(false);
                    return;
                }

                const batch = writeBatch(db);
                const monthlyPaymentRef = doc(fsCollection(db, `artifacts/${appId}/payments`));
                const classIds = [];
                
                for (const cls of classesToAdd) {
                    const classRef = doc(fsCollection(db, `artifacts/${appId}/scheduledClasses`));
                    batch.set(classRef, { ...cls, monthlyPaymentRefId: monthlyPaymentRef.id });
                    classIds.push(classRef.id);
                }

                batch.set(monthlyPaymentRef, { 
                    studentId, 
                    studentName, 
                    amount: finalAmount, // ✅ GUARDAMOS EL TOTAL CON MATRÍCULA
                    baseAmount: Number(monthlyAmount), // Opcional: para registro interno
                    matriculaIncluded: includeMatricula, // Opcional: Flag
                    paymentDate: '',
                    status: 'pending',
                    paidAt: null, 
                    periodStartDate: monthlyStartDate, 
                    periodEndDate: toLocalYYYYMMDD(new Date(actualYear, actualMonth + 1, 0)), 
                    classType: monthlyClassType, 
                    dayOfWeek: monthlyDayOfWeek, 
                    startTime: monthlyStartTime, 
                    duration: parseInt(monthlyDuration), 
                    numClassesGenerated: classesToAdd.length, 
                    recordedAt: new Date(), 
                    paymentMethod: 'monthly_package_payment', 
                    isPaidForPackage: false, 
                    associatedClassIds: classIds, 
                    userId 
                });
                
                await batch.commit();
                
                // Notificación push al alumno (no bloquea)
                if (notifyStudent) {
                  try {
                    const monthLabel = new Date(monthlyStartDate + 'T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                    const fn = httpsCallable(getFunctions(), 'sendPushNotification');
                    fn({
                      studentIds: [studentId],
                      title: 'Estudio Sandra Paloschi 🎵',
                      body: `Hola ${studentName.split(' ')[0]}, tus clases de ${monthLabel} fueron programadas (${classesToAdd.length} clase${classesToAdd.length !== 1 ? 's' : ''}). ¡Nos vemos pronto!`,
                      appId,
                      url: `/#/checkin?a=${appId}`,
                    }).catch(() => {});
                  } catch {}
                }

                let successMessage = `Clases mensuales programadas! (${classesToAdd.length} clases).`;
                if (includeMatricula) successMessage += ' (Incluye Matrícula)';
                if (skippedBlockedDays.length > 0) {
                    const formattedSkippedDays = skippedBlockedDays.map(formatDateToDDMMYYYY).join(', ');
                    successMessage += ` Se omitieron los días bloqueados: ${formattedSkippedDays}.`;
                }
                showMessage(successMessage, 'success');
            }
            onClose && onClose();
        } catch (e) {
            console.error("Error scheduling class: ", e);
            showLocalMessage(`Error: ${e.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };
    
    // Clase actualmente seleccionada para reprogramar
    const selectedRescheduleClass = availableClassesToReschedule.find(c => c.id === selectedClassToRescheduleId);
    const hasWa = (currentStudent?.whatsapp || currentStudent?.contactInfo || '').replace(/\D/g, '').length >= 8;

    // ── MODO REPROGRAMAR: diseño completamente nuevo ──────────────────────────
    if (isRescheduling) return (
        <div className="bg-white rounded-xl overflow-hidden">
            {/* Header ámbar */}
            <div className="bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-4">
                <div className="flex items-center gap-3">
                    {currentStudent?.photoURL ? (
                        <img src={currentStudent.photoURL} className="w-12 h-12 rounded-full object-cover ring-2 ring-white/30 flex-shrink-0" alt="" />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white font-black text-xl flex-shrink-0">
                            {(currentStudent?.name || '?')[0].toUpperCase()}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h2 className="text-white font-black text-base">Cambiar Horario</h2>
                        <p className="text-orange-100 text-sm truncate">{currentStudent?.name}</p>
                    </div>
                    <div className="flex-shrink-0 bg-white/15 rounded-xl px-3 py-1.5 text-center">
                        <p className="text-white font-black text-lg leading-none">{availableClassesToReschedule.length}</p>
                        <p className="text-orange-200 text-[9px] uppercase tracking-wide">clase{availableClassesToReschedule.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">

                {availableClassesToReschedule.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <div className="text-4xl mb-2">📅</div>
                        <p className="font-medium">Sin clases futuras para reprogramar</p>
                        <p className="text-xs text-gray-400 mt-1">Solo se muestran clases pagas y pendientes de asistencia</p>
                    </div>
                ) : (
                    <>
                        {/* Toggle: esta clase / todas las futuras */}
                        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                            <button type="button" onClick={() => setMoveAll(false)}
                                className={`flex-1 py-2.5 text-xs font-bold transition ${!moveAll ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                📅 Solo esta clase
                            </button>
                            <button type="button" onClick={() => setMoveAll(true)}
                                className={`flex-1 py-2.5 text-xs font-bold transition border-l border-gray-200 ${moveAll ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                                📆 Todas las futuras ({availableClassesToReschedule.length})
                            </button>
                        </div>

                        {/* ── MOVER UNA SOLA CLASE ── */}
                        {!moveAll && (<>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Clase a mover</label>
                                <select value={selectedClassToRescheduleId} onChange={handleClassToRescheduleChange}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white" required>
                                    {availableClassesToReschedule.map(cls => (
                                        <option key={cls.id} value={cls.id}>
                                            {formatDateToDDMMYYYY(cls.classDate)} · {cls.startTime} — {mapClassTypeToSpanish(cls.studentType)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Preview antes → después */}
                            {selectedRescheduleClass && classDate && startTime && (
                                <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-100 rounded-xl text-sm">
                                    <div className="flex-1 text-center">
                                        <p className="text-[9px] text-gray-400 uppercase font-bold mb-0.5">Actual</p>
                                        <p className="font-bold text-gray-700 text-xs">{formatDateToDDMMYYYY(selectedRescheduleClass.classDate)}</p>
                                        <p className="text-gray-500 text-xs">{selectedRescheduleClass.startTime} hs</p>
                                    </div>
                                    <div className="text-orange-500 font-black text-lg">→</div>
                                    <div className="flex-1 text-center">
                                        <p className="text-[9px] text-orange-500 uppercase font-bold mb-0.5">Nueva</p>
                                        <p className="font-black text-orange-700 text-xs">{formatDateToDDMMYYYY(classDate)}</p>
                                        <p className="text-orange-600 text-xs font-semibold">{startTime} hs</p>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Nueva fecha</label>
                                <input type="date" value={classDate} onChange={e => setClassDate(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition" required />
                            </div>
                        </>)}

                        {/* ── MOVER TODAS ── */}
                        {moveAll && (
                            <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">📆</span>
                                    <div>
                                        <p className="font-bold text-orange-800 text-sm">
                                            {availableClassesToReschedule.length} clases serán reprogramadas
                                        </p>
                                        <p className="text-orange-600 text-xs">
                                            {availableClassesToReschedule[0]?.classDate && `Desde ${formatDateToDDMMYYYY(availableClassesToReschedule[0].classDate)} en adelante`}
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1">Nuevo día (opcional — si cambia el día de la semana)</label>
                                    <select value={newDayOfWeek} onChange={e => setNewDayOfWeek(e.target.value)}
                                        className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                                        <option value="">Mismo día de la semana</option>
                                        {daysOfWeekFull.filter(d => d.value !== '0').map(d => (
                                            <option key={d.value} value={d.value}>{d.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* Nueva hora (siempre visible) */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                                {moveAll ? 'Nueva hora para todas' : 'Nueva hora'}
                            </label>
                            <select value={startTime} onChange={e => setStartTime(e.target.value)}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition bg-white" required>
                                <option value="" disabled>-- Seleccioná --</option>
                                {generateTimeOptions(60).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>

                        {/* Motivo */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Motivo del cambio</label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {[
                                    { id: 'illness',          label: '🤒 Enfermedad' },
                                    { id: 'travel',           label: '✈️ Viaje' },
                                    { id: 'student_request',  label: '👤 Pedido alumno' },
                                    { id: 'teacher_request',  label: '👩‍🏫 Pedido Sandra' },
                                ].map(r => (
                                    <button key={r.id} type="button" onClick={() => setRescheduleReason(r.id)}
                                        className={`py-2 rounded-xl text-xs font-semibold transition border ${rescheduleReason === r.id ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-orange-300'}`}>
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* WhatsApp notification */}
                        {hasWa && (
                            <label className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-xl cursor-pointer">
                                <input type="checkbox" checked={sendWhatsapp} onChange={e => setSendWhatsapp(e.target.checked)}
                                    className="w-4 h-4 text-green-600 rounded" />
                                <div>
                                    <p className="text-sm font-semibold text-green-800">📱 Notificar por WhatsApp</p>
                                    <p className="text-xs text-green-600">Se abrirá WhatsApp con el mensaje pre-armado para {currentStudent?.name?.split(' ')[0]}</p>
                                </div>
                            </label>
                        )}

                        {/* Error/info */}
                        {localMessage.text && (
                            <div className={`p-3 rounded-xl text-sm ${localMessage.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                                {localMessage.text}
                            </div>
                        )}

                        {/* Botones */}
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={onClose}
                                className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition">
                                Cancelar
                            </button>
                            <button type="submit"
                                disabled={loading || (!moveAll && (!selectedClassToRescheduleId || !classDate)) || !startTime}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white text-sm font-black shadow-md shadow-orange-200 transition disabled:opacity-50 flex items-center justify-center gap-2">
                                {loading
                                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Guardando...</>
                                    : <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                                        </svg>
                                        {moveAll
                                            ? `Reprogramar ${availableClassesToReschedule.length} clases`
                                            : 'Confirmar cambio de horario'}
                                      </>
                                }
                            </button>
                        </div>
                    </>
                )}
            </form>
        </div>
    );

    // ── MODO NUEVO / EDITAR: diseño renovado ──────────────────────────────────
    const stuInitials = (currentStudent?.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const totalFlexRemaining = flexCredits.reduce((s, c) => s + c.remaining, 0);

    const TYPE_OPTIONS = [
      { id:'monthly',  icon:'📅', label:'Abono Mensual',   desc:'Horario fijo todo el mes' },
      { id:'single',   icon:'🎯', label:'Clase Única',      desc:'Una clase suelta' },
      { id:'flexible', icon:'🎫', label:'Abono Flexible',   desc:'Paga ahora, clases semana a semana' },
    ];

    return (
      <div className="bg-white rounded-xl overflow-hidden">

        {/* ── HEADER ── */}
        <div className="bg-gradient-to-r from-rose-700 to-pink-500 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-white/20 ring-2 ring-white/30 flex items-center justify-center">
              {currentStudent?.photoURL
                ? <img src={currentStudent.photoURL} alt="" className="w-full h-full object-cover"/>
                : <span className="text-white font-black text-base">{stuInitials}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-black text-base">{isEditing ? 'Editar Clase' : 'Programar Clase'}</h2>
              <p className="text-rose-100 text-sm truncate">{currentStudent?.name || 'Sin alumno'}</p>
            </div>
            {totalFlexRemaining > 0 && (
              <span className="flex-shrink-0 text-xs font-bold bg-white/20 text-white px-2 py-1 rounded-full">
                🎫 {totalFlexRemaining} clase{totalFlexRemaining !== 1 ? 's' : ''} flex.
              </span>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* Acciones de edición */}
          {isEditing && editingClassData?.id && (
            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 space-y-2">
              <p className="text-xs text-gray-700 font-medium">Opciones de esta clase:</p>
              <div className="flex gap-2">
                <button type="button"
                  onClick={async () => { if (window.confirm('¿Cancelar esta clase?')) await cancelScheduledClass({ db, appId, classId: editingClassData.id }); }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold">Cancelar clase</button>
                <button type="button"
                  onClick={async () => { if (window.confirm('¿ELIMINAR? (Irreversible)')) await hardDeleteScheduledClass({ db, appId, classId: editingClassData.id }); }}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold">Eliminar</button>
              </div>
            </div>
          )}

          {/* Selector de tipo */}
          {!isEditing && !isRescheduling && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Tipo de programación</p>
              <div className="grid grid-cols-3 gap-2">
                {TYPE_OPTIONS.map(t => (
                  <button key={t.id} type="button" onClick={() => setScheduleType(t.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition text-center
                      ${scheduleType === t.id
                        ? t.id === 'flexible'
                          ? 'bg-violet-600 border-violet-600 text-white'
                          : 'bg-rose-600 border-rose-600 text-white'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    <span className="text-2xl">{t.icon}</span>
                    <span className="text-[10px] font-black leading-tight">{t.label}</span>
                    <span className={`text-[9px] leading-tight ${scheduleType === t.id ? 'text-white/80' : 'text-gray-400'}`}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── ABONO FLEXIBLE: formulario de creación ── */}
          {!isEditing && scheduleType === 'flexible' && (
            <div className="space-y-4">
              <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl text-sm text-violet-800">
                <p className="font-semibold mb-1">¿Cómo funciona?</p>
                <p className="text-xs text-violet-600">El alumno paga ahora el mes. Las clases las vas agendando semana a semana según disponibilidad. Cada vez que programás una clase se descuenta automáticamente del saldo.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Monto del mes</label>
                  <MoneyInput value={flexNewAmount} onValueChange={v => setFlexNewAmount(String(v))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" placeholder="0"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Clases incluidas</label>
                  <select value={flexNewClases} onChange={e => setFlexNewClases(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white">
                    {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} clase{n>1?'s':''}</option>)}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                💡 Tip: si todavía no sabés cuántas clases van a salir este mes, cargá un número aproximado (lo más común). Después, desde la ficha del alumno vas a poder <strong>sumar o restar clases</strong> a este abono para ajustarlo a la realidad, sin tener que cancelarlo y crear uno nuevo.
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">¿Cómo te lo va a pagar?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setFlexNewCobroMode('adelantado')}
                    className={`p-2.5 rounded-xl text-left border transition
                      ${flexNewCobroMode === 'adelantado' ? 'bg-violet-600 border-violet-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-violet-300'}`}>
                    <p className="text-xs font-bold">💰 Todo junto</p>
                    <p className={`text-[10px] ${flexNewCobroMode === 'adelantado' ? 'text-violet-100' : 'text-gray-400'}`}>Te paga el total de una sola vez</p>
                  </button>
                  <button type="button" onClick={() => setFlexNewCobroMode('por_clase')}
                    className={`p-2.5 rounded-xl text-left border transition
                      ${flexNewCobroMode === 'por_clase' ? 'bg-violet-600 border-violet-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-violet-300'}`}>
                    <p className="text-xs font-bold">📅 Por clase</p>
                    <p className={`text-[10px] ${flexNewCobroMode === 'por_clase' ? 'text-violet-100' : 'text-gray-400'}`}>Te va pagando clase a clase</p>
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-violet-600 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5">
                  {flexNewCobroMode === 'por_clase'
                    ? <>El abono queda como <strong>deuda pendiente</strong> y desde la ficha del alumno vas a poder <strong>registrar el cobro de cada clase</strong> a medida que te paga.</>
                    : <>El abono queda como <strong>deuda pendiente</strong> hasta que confirmes que te pagó el total — ahí lo marcás como cobrado desde <strong>"Marcar Pago"</strong>.</>}
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Método de pago</label>
                <div className="grid grid-cols-3 gap-2">
                  {FLEX_PAY_METHODS.map(m => (
                    <button key={m.id} type="button" onClick={() => setFlexNewPayMethod(m.id)}
                      className={`py-2.5 rounded-xl text-[11px] font-bold flex flex-col items-center gap-0.5 transition border
                        ${flexNewPayMethod === m.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-violet-300'}`}>
                      <span className="text-base">{m.icon}</span>{m.label}
                    </button>
                  ))}
                </div>
              </div>
              {localMessage.text && (
                <div className={`p-3 rounded-xl text-sm ${localMessage.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700'}`}>
                  {localMessage.text}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition">Cancelar</button>
                <button type="button" onClick={handleCreateFlexCredit} disabled={loading}
                  className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-black shadow-md shadow-violet-200 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Creando...</>
                    : <>🎫 Crear Abono Flexible ({flexNewClases} clase{parseInt(flexNewClases)>1?'s':''})</>}
                </button>
              </div>
            </div>
          )}

          {/* ── ABONO MENSUAL / CLASE ÚNICA: formulario existente ── */}
          {(isEditing || isRescheduling || scheduleType !== 'flexible') && (
            <>
              {/* Banner saldo flexible al agendar clase única */}
              {!isEditing && !isRescheduling && scheduleType === 'single' && flexCredits.length > 0 && (
                <div className={`p-3 rounded-xl border-2 transition ${useFlexCredit ? 'bg-violet-50 border-violet-400' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>🎫</span>
                      <div>
                        <p className="font-bold text-violet-900 text-xs">Saldo Flexible disponible</p>
                        <p className="text-[10px] text-violet-600">{totalFlexRemaining} clase{totalFlexRemaining !== 1 ? 's' : ''} — usás 1 al confirmar</p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-gray-500">{useFlexCredit ? 'Usar saldo' : 'No usar'}</span>
                      <div className="relative">
                        <input type="checkbox" checked={useFlexCredit} onChange={e => setUseFlexCredit(e.target.checked)} className="sr-only peer"/>
                        <div className="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-violet-600
                          after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white
                          after:border after:rounded-full after:h-4 after:w-4 after:transition-all
                          peer-checked:after:translate-x-4"/>
                      </div>
                    </label>
                  </div>
                  {useFlexCredit && <p className="text-[10px] text-violet-700 mt-1.5 bg-violet-100 px-2 py-1 rounded-lg">✅ La clase quedará pagada y se descuenta del saldo</p>}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {isRescheduling ? (
                  <SingleClassFields classType={classType} setClassType={setClassType} classDate={classDate} setClassDate={setClassDate} startTime={startTime} setStartTime={setStartTime} duration={duration} setDuration={setDuration} price={price} setPrice={setPrice} isRescheduling={isRescheduling} blockedSlots={blockedSlots} scheduledClasses={scheduledClasses} allowPast={true} />
                ) : scheduleType === 'single' ? (
                  <SingleClassFields classType={classType} setClassType={setClassType} classDate={classDate} setClassDate={setClassDate} startTime={startTime} setStartTime={setStartTime} duration={duration} setDuration={setDuration} price={price} setPrice={setPrice} isRescheduling={isRescheduling} hideMonto={useFlexCredit} blockedSlots={blockedSlots} scheduledClasses={scheduledClasses} allowPast={true} />
                ) : (
                  <MonthlyClassFields
                    monthlyClassType={monthlyClassType} setMonthlyClassType={setMonthlyClassType}
                    monthlyDayOfWeek={monthlyDayOfWeek} setMonthlyDayOfWeek={setMonthlyDayOfWeek}
                    monthlyStartTime={monthlyStartTime} setMonthlyStartTime={setMonthlyStartTime}
                    monthlyDuration={monthlyDuration} setMonthlyDuration={setMonthlyDuration}
                    monthlyAmount={monthlyAmount} setMonthlyAmount={setMonthlyAmount}
                    monthlyStartDate={monthlyStartDate} setMonthlyStartDate={setMonthlyStartDate}
                    isRescheduling={isRescheduling}
                    includeMatricula={includeMatricula} setIncludeMatricula={setIncludeMatricula}
                    blockedSlots={blockedSlots} scheduledClasses={scheduledClasses}
                    notifyStudent={notifyStudent} setNotifyStudent={setNotifyStudent}
                  />
                )}

                {(classType === 'coral' || classType === 'grupal') && (
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                    <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">Link del Tema / Material</label>
                    <input type="url" placeholder="Pegar link (YouTube, Drive...)" value={topicLink}
                      onChange={e => setTopicLink(e.target.value)}
                      className="w-full p-2 text-sm border border-indigo-200 rounded outline-none focus:ring-2 focus:ring-indigo-500 bg-white"/>
                    <p className="text-[10px] text-indigo-500 mt-1">Se mostrará en el portal de los alumnos.</p>
                  </div>
                )}

                {localMessage.text && (
                  <div className={`p-3 rounded-xl text-sm ${localMessage.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700'}`}>
                    {localMessage.text}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={onClose}
                    className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition">Cancelar</button>
                  <button type="submit" disabled={loading || (isRescheduling && !selectedClassToRescheduleId)}
                    className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-black shadow-md shadow-rose-200 transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Guardando...</>
                      : <>{isRescheduling ? '📅 Re-programar' : isEditing ? '✏️ Actualizar' : scheduleType === 'single' && useFlexCredit ? '🎫 Programar (saldo flex.)' : '✓ Programar'}</>}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    );
};
