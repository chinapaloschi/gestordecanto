import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_FULL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} de ${MONTH_FULL[d.getMonth()]}`;
}

const STATUS_LABELS = {
  pending:   { label: 'Pendiente',  bg: 'bg-yellow-100', text: 'text-yellow-700' },
  confirmed: { label: 'Confirmado', bg: 'bg-green-100',  text: 'text-green-700'  },
  rejected:  { label: 'Rechazado',  bg: 'bg-red-100',    text: 'text-red-600'    },
};

export function TrialRequestsPanel({ db, appId, onClose, onConvertToStudent }) {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDuration, setEditDuration] = useState(60);

  useEffect(() => {
    if (!db || !appId) return;
    const unsub = onSnapshot(
      query(collection(db, `artifacts/${appId}/trialRequests`), orderBy('createdAt', 'desc')),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return unsub;
  }, [db, appId]);

  const setStatus = (req, status) =>
    updateDoc(doc(db, `artifacts/${appId}/trialRequests`, req.id), { status, updatedAt: new Date() });

  const handleDelete = (req) => {
    if (!window.confirm(`¿Eliminar la solicitud de ${req.name}?`)) return;
    deleteDoc(doc(db, `artifacts/${appId}/trialRequests`, req.id));
  };

  const startEdit = (req) => {
    setEditingId(req.id);
    setEditDate(req.date || '');
    setEditTime(req.startTime || '');
    setEditDuration(req.duration || 60);
  };

  const saveEdit = async (req) => {
    await updateDoc(doc(db, `artifacts/${appId}/trialRequests`, req.id), {
      date: editDate, startTime: editTime, duration: Number(editDuration), updatedAt: new Date(),
    });
    setEditingId(null);
  };

  const waLink = (whatsapp, name, date, time) => {
    const clean = whatsapp.replace(/\D/g, '');
    const num = clean.startsWith('54') ? clean : `54${clean}`;
    const msg = encodeURIComponent(`¡Hola ${name}! Te confirmo tu clase en el Estudio de Canto Sandra Paloschi para el ${fmtDate(date)} a las ${time} hs. ¡Cualquier consulta avisame! 🎵`);
    return `https://wa.me/${num}?text=${msg}`;
  };

  const filtered = requests
    .filter(r => filter === 'all' || r.status === filter)
    .filter(r => !search.trim() || (r.name || '').toLowerCase().includes(search.trim().toLowerCase()));

  const counts = {
    pending:   requests.filter(r => r.status === 'pending').length,
    confirmed: requests.filter(r => r.status === 'confirmed').length,
    rejected:  requests.filter(r => r.status === 'rejected').length,
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-black text-gray-900">Pre-inscriptos</h2>
            <p className="text-xs text-gray-400 mt-0.5">Solicitudes de clase</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg">×</button>
        </div>

        {/* Filtros + buscador */}
        <div className="px-5 pt-4 pb-3 flex-shrink-0 space-y-2.5">
          <div className="flex gap-2">
            {[
              { key: 'pending',   label: `Pendientes (${counts.pending})`   },
              { key: 'confirmed', label: `Confirmados (${counts.confirmed})` },
              { key: 'all',       label: 'Todos'                             },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition ${filter === f.key ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre..."
              className="w-full px-3 py-2 pl-8 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 bg-gray-50" />
            <svg className="w-4 h-4 text-gray-300 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"/>
            </svg>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-sm">No hay solicitudes {filter === 'pending' ? 'pendientes' : filter === 'confirmed' ? 'confirmadas' : ''}.</p>
            </div>
          ) : (
            filtered.map(req => {
              const st = STATUS_LABELS[req.status] || STATUS_LABELS.pending;
              const isEditing = editingId === req.id;
              return (
                <div key={req.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-gray-900 text-sm">{req.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                        {req.convertedToStudentId && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">🎓 Ya es alumno</span>
                        )}
                      </div>
                      {req.date && !isEditing && (
                        <p className="text-xs text-gray-500 mt-1">{fmtDate(req.date)} · {req.startTime} hs · {req.duration} min</p>
                      )}
                    </div>
                    <button onClick={() => handleDelete(req)} className="text-gray-300 hover:text-red-500 transition p-1 flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>

                  {/* Edición de horario */}
                  {isEditing ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Fecha</label>
                          <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white" />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Hora</label>
                          <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white" />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Min</label>
                          <select value={editDuration} onChange={e => setEditDuration(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                            {[30, 45, 60, 90].map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(req)}
                          className="flex-1 text-xs font-bold py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition">Guardar</button>
                        <button onClick={() => setEditingId(null)}
                          className="flex-1 text-xs font-bold py-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 mb-3">
                      <p className="text-xs text-gray-600">📱 {req.whatsapp}</p>
                      {req.email && <p className="text-xs text-gray-600">✉️ {req.email}</p>}
                      {req.notes && <p className="text-xs text-gray-500 italic bg-gray-50 rounded-lg px-2 py-1.5 mt-2">"{req.notes}"</p>}
                    </div>
                  )}

                  {!isEditing && (
                    <div className="flex gap-2 flex-wrap">
                      {req.status === 'pending' && (
                        <button onClick={() => startEdit(req)}
                          className="text-xs font-bold px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 transition">
                          🕐 Editar horario
                        </button>
                      )}
                      {req.status !== 'confirmed' && (
                        <button onClick={() => setStatus(req, 'confirmed')}
                          className="text-xs font-bold px-3 py-1.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition">
                          ✓ Confirmar
                        </button>
                      )}
                      {req.status !== 'rejected' && (
                        <button onClick={() => setStatus(req, 'rejected')}
                          className="text-xs font-bold px-3 py-1.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition">
                          ✗ Rechazar
                        </button>
                      )}
                      {req.status === 'pending' && (
                        <button onClick={() => { setStatus(req, 'confirmed'); window.open(waLink(req.whatsapp, req.name, req.date, req.startTime), '_blank'); }}
                          className="text-xs font-bold px-3 py-1.5 bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition">
                          💬 Confirmar y enviar WA
                        </button>
                      )}
                      {req.status === 'confirmed' && req.whatsapp && (
                        <a href={waLink(req.whatsapp, req.name, req.date, req.startTime)} target="_blank" rel="noreferrer"
                          className="text-xs font-bold px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition">
                          💬 Abrir WA
                        </a>
                      )}
                      {req.status === 'confirmed' && !req.convertedToStudentId && (
                        <button onClick={() => onConvertToStudent && onConvertToStudent(req)}
                          className="text-xs font-bold px-3 py-1.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition">
                          🎓 Convertir en alumno
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
