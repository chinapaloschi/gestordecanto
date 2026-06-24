import React, { useState, useMemo } from 'react';
import { formatMoneyAr } from '../utils/money.js';
import { getInitials } from '../utils/studentHelpers.js';

const WaIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.557 4.116 1.533 5.847L.057 23.54a.75.75 0 00.915.976l5.876-1.54A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22.5a10.453 10.453 0 01-5.374-1.48l-.385-.23-3.99 1.046 1.064-3.887-.253-.4A10.441 10.441 0 011.5 12C1.5 6.201 6.201 1.5 12 1.5S22.5 6.201 22.5 12 17.799 22.5 12 22.5z"/>
  </svg>
);

const FILTERS = [
  { id: 'active',   label: 'Activos'   },
  { id: 'debt',     label: 'Con deuda' },
  { id: 'noclass',  label: 'Sin próxima clase' },
  { id: 'archived', label: 'Archivados' },
];

const SORTS = [
  { id: 'name',      label: 'Nombre' },
  { id: 'debt',      label: 'Deuda' },
  { id: 'restantes', label: 'Restantes' },
];

export function StudentListModal({ isOpen, onClose, students = [], onOpenStudentDetails, onAddStudent, onScheduleClass, scheduledClasses = [] }) {
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('active');
  const [sortBy,  setSortBy]  = useState('name');

  const today = new Date().toISOString().split('T')[0];

  const list = useMemo(() => {
    let base = students;

    if (filter === 'active')   base = base.filter(s => !s.isArchived);
    if (filter === 'debt')     base = base.filter(s => !s.isArchived && s.hasAnyUnpaidItems);
    if (filter === 'noclass')  base = base.filter(s => !s.isArchived && !s.nextClassDate);
    if (filter === 'archived') base = base.filter(s => s.isArchived);

    const q = search.toLowerCase();
    if (q) base = base.filter(s => (s.name || '').toLowerCase().includes(q));

    return [...base].sort((a, b) => {
      if (sortBy === 'debt')      return (b.pendingBalance || 0) - (a.pendingBalance || 0);
      if (sortBy === 'restantes') return (b.totalPaidUnconsumedClasses || 0) - (a.totalPaidUnconsumedClasses || 0);
      return (a.name || '').localeCompare(b.name || '', 'es');
    });
  }, [students, filter, search, sortBy]);

  const counts = useMemo(() => ({
    active:   students.filter(s => !s.isArchived).length,
    debt:     students.filter(s => !s.isArchived && s.hasAnyUnpaidItems).length,
    noclass:  students.filter(s => !s.isArchived && !s.nextClassDate).length,
    archived: students.filter(s => s.isArchived).length,
  }), [students]);

  if (!isOpen) return null;

  const fmtNextClass = (s) => {
    const date = s.nextClassDate || s.scheduledClassesDetailed?.[0]?.classDate;
    if (!date) return null;
    try {
      const [y, m, d] = date.split('-');
      const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
      const dt = new Date(Number(y), Number(m)-1, Number(d));
      return `${dias[dt.getDay()]} ${d}/${m}`;
    } catch { return date; }
  };

  const openWa = (s, e) => {
    e.stopPropagation();
    const raw = (s.whatsapp || s.contactInfo || '').replace(/\D/g, '');
    if (raw.length >= 8) window.open(`https://wa.me/549${raw}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div className="px-5 py-4 border-b flex items-center gap-3 flex-shrink-0">
          <div className="flex-1">
            <h2 className="font-bold text-gray-900 text-lg">Alumnos</h2>
            <p className="text-xs text-gray-500">{counts.active} activos · {counts.debt} con deuda · {counts.archived} archivados</p>
          </div>
          <button
            onClick={onAddStudent}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Agregar
          </button>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold flex-shrink-0">×</button>
        </div>

        {/* ── BÚSQUEDA + FILTROS ── */}
        <div className="px-4 pt-3 pb-2 border-b flex-shrink-0 space-y-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 bg-gray-50"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold border transition ${
                  filter === f.id
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'
                }`}
              >
                {f.label}
                {counts[f.id] > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-black ${filter === f.id ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {counts[f.id]}
                  </span>
                )}
              </button>
            ))}

            <div className="flex-shrink-0 ml-auto flex items-center gap-1 border-l pl-2">
              <span className="text-[10px] text-gray-400 font-bold">Ordenar:</span>
              {SORTS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSortBy(s.id)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${sortBy === s.id ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── LISTA ── */}
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <div className="text-5xl mb-3">👥</div>
              <p className="text-sm">{search ? 'Sin resultados para esa búsqueda' : 'No hay alumnos en esta categoría'}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {list.map(s => {
                const debt     = s.pendingBalanceWithSurcharge || s.pendingBalance || 0;
                const hasDebt  = debt > 0;
                const nextCls  = fmtNextClass(s);
                const restantes = s.totalPaidUnconsumedClasses || 0;
                const waRaw    = (s.whatsapp || s.contactInfo || '').replace(/\D/g, '');
                const hasWa    = waRaw.length >= 8;

                return (
                  <li
                    key={s.id}
                    onClick={() => { onOpenStudentDetails(s); onClose(); }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-rose-50 cursor-pointer transition-colors group"
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {s.photoURL ? (
                        <img src={s.photoURL} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-white shadow" />
                      ) : (
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shadow
                          ${hasDebt ? 'bg-rose-500' : s.isArchived ? 'bg-gray-400' : 'bg-green-500'}`}>
                          {getInitials(s.name)}
                        </div>
                      )}
                      {s.isArchived && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-gray-400 rounded-full border-2 border-white"/>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900 text-sm truncate">{s.name}</span>
                        {hasDebt && (
                          <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {formatMoneyAr(debt)}
                            {s.aplicaRecargo && <span className="ml-0.5 opacity-70">+10%</span>}
                          </span>
                        )}
                        {!hasDebt && !s.isArchived && (
                          <span className="text-[11px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full flex-shrink-0">Al día</span>
                        )}
                        {s.isArchived && (
                          <span className="text-[11px] font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full flex-shrink-0">Archivado</span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {s.level && <span className="text-[11px] text-gray-400">{s.level}</span>}
                        {nextCls ? (
                          <span className="text-[11px] text-gray-500 flex items-center gap-1">
                            <svg className="w-3 h-3 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            {nextCls}
                            {s.nextClassTime && ` · ${s.nextClassTime}`}
                          </span>
                        ) : !s.isArchived && (
                          <span className="text-[11px] text-amber-600">Sin próxima clase</span>
                        )}
                        {restantes > 0 && (
                          <span className="text-[11px] text-green-700 font-semibold">{restantes} restante{restantes !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>

                    {/* Acciones rápidas */}
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {hasWa && (
                        <button
                          onClick={e => openWa(s, e)}
                          title="WhatsApp"
                          className="w-8 h-8 rounded-full bg-green-100 hover:bg-green-200 text-green-700 flex items-center justify-center transition"
                        >
                          <WaIcon />
                        </button>
                      )}
                      {!s.isArchived && (
                        <button
                          onClick={e => { e.stopPropagation(); onScheduleClass(s); }}
                          title="Agendar clase"
                          className="w-8 h-8 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-700 flex items-center justify-center transition"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                        </button>
                      )}
                    </div>

                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="px-5 py-3 border-t bg-gray-50 flex-shrink-0">
          <p className="text-xs text-gray-400 text-center">Mostrando {list.length} de {students.length} alumnos</p>
        </div>
      </div>
    </div>
  );
}
