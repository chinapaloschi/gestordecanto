import React, { useState, useMemo } from 'react';
import { PublicCheckInViewPIN } from './PublicCheckInViewPIN.jsx';
import { getInitials } from '../utils/studentHelpers.js';

// Deja a Sandra elegir un alumno y ver el portal público exactamente como lo
// ve ese alumno — entra directo con sus datos (sin DNI/PIN), sin persistir
// sesión ni registrar notificaciones push a nombre suyo en este dispositivo.
// Es la vista REAL y funcional, no una maqueta: cualquier acción que se haga
// ahí adentro (marcar asistencia, subir un comprobante) escribe de verdad.
export function StudentPreviewModal({ db, appId, students, onClose }) {
  const [search, setSearch] = useState('');
  const [previewStudent, setPreviewStudent] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const active = (students || []).filter(s => !s.isArchived);
    const list = q ? active.filter(s => (s.name || s.fullName || '').toLowerCase().includes(q)) : active;
    return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
  }, [students, search]);

  if (previewStudent) {
    return (
      <div className="fixed inset-0 z-[100] bg-white overflow-y-auto">
        <PublicCheckInViewPIN
          db={db}
          forcedAppId={appId}
          forcedStudent={previewStudent}
          onExitPreview={() => setPreviewStudent(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ maxHeight: '80vh' }}>
      <div className="px-5 pt-5 pb-4 border-b border-gray-100">
        <h2 className="font-bold text-gray-900 text-base">Ver portal como alumno</h2>
        <p className="text-xs text-gray-500 mt-0.5">Elegí un alumno para ver exactamente lo que ve en su portal.</p>
        <div className="mt-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar alumno..."
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 bg-gray-50"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">Sin coincidencias.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map(s => (
              <li key={s.id}>
                <button
                  onClick={() => setPreviewStudent(s)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-rose-50 transition-colors text-left"
                >
                  {s.photoURL ? (
                    <img src={s.photoURL} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-2 ring-white shadow-sm" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white bg-rose-400 shadow-sm">
                      {getInitials(s.name || s.fullName)}
                    </div>
                  )}
                  <span className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">{s.name || s.fullName || 'Sin nombre'}</span>
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="px-5 py-3 border-t border-amber-100 bg-amber-50">
        <p className="text-[11px] text-amber-700">⚠️ Es la vista real del alumno — marcar presente/ausente o subir un comprobante ahí adentro hace el cambio de verdad.</p>
      </div>
      <div className="px-5 pb-5 pt-3">
        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition">Cerrar</button>
      </div>
    </div>
  );
}
