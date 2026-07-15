import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const DURATIONS = [30, 45, 60, 90];
const DAY_L = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MON_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}
function fmtLong(dateStr) {
  if (!dateStr) return 'Sin fecha';
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAY_L[d.getDay()]} ${d.getDate()} de ${MON_L[d.getMonth()]}`;
}

const DEFAULT_FORM = { date: '', startTime: '10:00', duration: '60', classType: 'individual' };

export function AvailableSlotsManager({ db, appId, onClose }) {
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !appId) return;
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, `artifacts/${appId}/availableSlots`),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));
        setSlots(list);
        setLoadError('');
        setLoading(false);
      },
      err => {
        console.error('[AvailableSlotsManager] Error leyendo availableSlots:', err);
        setLoadError(err?.message || 'Error desconocido al leer los turnos.');
        setLoading(false);
      }
    );
    return unsub;
  }, [db, appId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.date) return;
    setSaving(true);
    try {
      await addDoc(collection(db, `artifacts/${appId}/availableSlots`), {
        date: form.date,
        startTime: form.startTime,
        duration: Number(form.duration),
        classType: form.classType,
        isActive: true,
        createdAt: new Date(),
      });
      setForm(p => ({ ...DEFAULT_FORM, startTime: p.startTime, duration: p.duration, classType: p.classType }));
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const toggleActive = (slot) =>
    updateDoc(doc(db, `artifacts/${appId}/availableSlots`, slot.id), { isActive: !slot.isActive });

  const handleDelete = (slot) => {
    if (!window.confirm(`¿Eliminar el turno del ${fmtLong(slot.date)} a las ${slot.startTime}?`)) return;
    deleteDoc(doc(db, `artifacts/${appId}/availableSlots`, slot.id));
  };

  const today = todayStr();
  const pasados = slots.filter(s => s.date && s.date < today);
  const proximos = slots.filter(s => !s.date || s.date >= today);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-black text-gray-900">Disponibilidad de turnos</h2>
            <p className="text-xs text-gray-400 mt-0.5">Fechas puntuales que verán los futuros alumnos</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Formulario para agregar */}
          <form onSubmit={handleAdd} className="bg-rose-50 border border-rose-100 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-black text-rose-700 uppercase tracking-widest">Agregar turno disponible</p>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Fecha</label>
              <input type="date" required min={today} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-400" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Horario</label>
                <input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-400" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Duración</label>
                <select value={form.duration} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-400">
                  {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tipo</label>
                <select value={form.classType} onChange={e => setForm(p => ({ ...p, classType: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-400">
                  <option value="individual">Individual</option>
                  <option value="grupal">Grupal</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={saving || !form.date}
              className="w-full py-2.5 bg-rose-600 text-white font-bold text-sm rounded-xl hover:bg-rose-700 transition disabled:opacity-50">
              {saving ? 'Guardando...' : '+ Agregar turno'}
            </button>
          </form>

          {/* Lista de turnos */}
          {loadError ? (
            <div className="text-center py-6 px-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
              <p className="text-2xl mb-2">⚠️</p>
              <p className="text-sm font-bold">No se pudieron cargar los turnos</p>
              <p className="text-xs mt-1 break-words">{loadError}</p>
              <p className="text-xs mt-2 text-red-500">Puede ser un problema de permisos en Firestore. Avisale a soporte con este mensaje.</p>
            </div>
          ) : loading ? (
            <div className="text-center py-8 text-gray-300">
              <p className="text-sm">Cargando turnos...</p>
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-3xl mb-2">📅</p>
              <p className="text-sm">No hay turnos configurados.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {proximos.length > 0 && (
                <div className="space-y-2">
                  {proximos.map(slot => (
                    <div key={slot.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${slot.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 capitalize">{fmtLong(slot.date)} · {slot.startTime} hs</p>
                        <p className="text-xs text-gray-400 mt-0.5">{slot.duration} min · {slot.classType === 'individual' ? '👤 Individual' : '👥 Grupal'}</p>
                      </div>
                      <button onClick={() => toggleActive(slot)}
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg transition ${slot.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
                        {slot.isActive ? 'Activo' : 'Inactivo'}
                      </button>
                      <button onClick={() => handleDelete(slot)} className="text-gray-300 hover:text-red-500 transition p-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {pasados.length > 0 && (
                <details className="text-xs text-gray-400">
                  <summary className="cursor-pointer font-bold uppercase tracking-wider">Fechas pasadas ({pasados.length})</summary>
                  <div className="space-y-2 mt-2">
                    {pasados.map(slot => (
                      <div key={slot.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 opacity-60">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-600 capitalize">{fmtLong(slot.date)} · {slot.startTime} hs</p>
                          <p className="text-xs text-gray-400 mt-0.5">{slot.duration} min · {slot.classType === 'individual' ? '👤 Individual' : '👥 Grupal'}</p>
                        </div>
                        <button onClick={() => handleDelete(slot)} className="text-gray-300 hover:text-red-500 transition p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
