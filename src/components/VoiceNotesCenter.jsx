import React from 'react';
import { collection as fsCollection, collectionGroup, doc, query, where, orderBy, onSnapshot, updateDoc } from 'firebase/firestore';
import { Modal } from './Modal.jsx';
import { getInitials } from '../utils/studentHelpers.js';

const fmtDate = (ts) => {
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};
const fmtDur = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`;

function StudentVoiceNotesModal({ db, appId, student, isOpen, onClose }) {
  const [notes, setNotes] = React.useState([]);

  React.useEffect(() => {
    if (!db || !appId || !student?.id) return;
    const q = query(
      fsCollection(db, `artifacts/${appId}/students/${student.id}/voiceNotes`),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    return unsub;
  }, [db, appId, student?.id]);

  const markReviewed = async (id) => {
    try {
      await updateDoc(doc(db, `artifacts/${appId}/students/${student.id}/voiceNotes`, id), {
        status: 'reviewed', reviewedAt: new Date(),
      });
    } catch {}
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="px-5 pt-5 pb-4 border-b flex items-center gap-3">
          {student.photoURL
            ? <img src={student.photoURL} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            : <div className="w-10 h-10 rounded-full bg-rose-400 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{getInitials(student.name || student.fullName)}</div>}
          <div>
            <h2 className="font-bold text-gray-900 text-base">{student.name || student.fullName}</h2>
            <p className="text-xs text-gray-500">{notes.length} grabación{notes.length !== 1 ? 'es' : ''}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notes.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">Todavía no mandó ninguna grabación.</p>
          ) : notes.map(n => (
            <div key={n.id} className={`rounded-xl border p-3 space-y-2 ${n.status === 'pending_review' ? 'border-amber-300 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">{fmtDate(n.createdAt)} · {fmtDur(n.durationSecs)}</p>
                {n.status === 'pending_review'
                  ? <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex-shrink-0">Sin escuchar</span>
                  : <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">Escuchada</span>}
              </div>
              <audio src={n.url} controls className="w-full h-8" />
              {n.status === 'pending_review' && (
                <button onClick={() => markReviewed(n.id)}
                  className="w-full py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-100 transition">
                  Marcar como escuchada
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function VoiceNotesCenter({ db, appId, students }) {
  const [open, setOpen] = React.useState(false);
  const [student, setStudent] = React.useState(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [pendingMap, setPendingMap] = React.useState({});

  const knownIds = React.useMemo(() => new Set((students || []).map(s => s.id)), [students]);

  // Escuchar grabaciones sin escuchar vía collectionGroup, filtrado a alumnos conocidos
  React.useEffect(() => {
    if (!db || !appId) return;
    const q = query(collectionGroup(db, 'voiceNotes'), where('status', '==', 'pending_review'));
    const unsub = onSnapshot(q, snap => {
      const map = {};
      snap.docs.forEach(d => {
        const sid = d.ref.parent?.parent?.id;
        if (sid && knownIds.has(sid)) map[sid] = (map[sid] || 0) + 1;
      });
      setPendingMap(map);
    }, () => setPendingMap({}));
    return () => unsub();
  }, [db, appId, knownIds]);

  const handleClose = () => { setOpen(false); setStudent(null); };
  const handleStudentSelect = (id) => {
    const selected = (students || []).find(s => s.id === id);
    if (selected) setStudent(selected);
  };

  const totalPending = Object.values(pendingMap).reduce((a, b) => a + b, 0);

  const sortedStudents = React.useMemo(() => {
    const active = (students || []).filter(s => !s.isArchived);
    const q = (searchTerm || '').toLowerCase();
    const filtered = q ? active.filter(s => (s.name || s.fullName || '').toLowerCase().includes(q)) : active;
    return [...filtered].sort((a, b) => {
      const pa = pendingMap[a.id] || 0, pb = pendingMap[b.id] || 0;
      if (pb !== pa) return pb - pa;
      return (a.name || '').localeCompare(b.name || '', 'es');
    });
  }, [students, searchTerm, pendingMap]);

  return (
    <>
      {/* Botón oculto — el sidebar lo dispara con querySelector title="Grabaciones" */}
      <button title="Grabaciones" onClick={() => setOpen(true)} className="hidden" />

      <Modal isOpen={open && !student} onClose={handleClose} size="md">
        <div className="flex flex-col" style={{ maxHeight: '80vh' }}>
          <div className="px-5 pt-5 pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>
              </div>
              <div>
                <h2 className="font-bold text-gray-900 text-base">Grabaciones de alumnos</h2>
                <p className="text-xs text-gray-500">
                  {totalPending > 0
                    ? <span className="text-amber-600 font-semibold">{totalPending} sin escuchar</span>
                    : 'Todo escuchado'}
                </p>
              </div>
            </div>
            <div className="mt-4 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar alumno..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 bg-gray-50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {sortedStudents.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-10">
                {searchTerm ? 'Sin coincidencias.' : 'No hay alumnos.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {sortedStudents.map(s => {
                  const pending = pendingMap[s.id] || 0;
                  const name = s.name || s.fullName || 'Sin nombre';
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => handleStudentSelect(s.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-rose-50 transition-colors text-left"
                      >
                        {s.photoURL ? (
                          <img src={s.photoURL} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-2 ring-white shadow-sm" />
                        ) : (
                          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white bg-rose-400 shadow-sm">
                            {getInitials(name)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
                        </div>
                        {pending > 0 && (
                          <span className="flex-shrink-0 min-w-[22px] h-[22px] rounded-full bg-amber-500 text-white text-[11px] font-extrabold flex items-center justify-center px-1.5 shadow-sm animate-pulse">
                            {pending}
                          </span>
                        )}
                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Modal>

      {student && (
        <StudentVoiceNotesModal
          key={student.id}
          db={db}
          appId={appId}
          student={student}
          isOpen={open}
          onClose={handleClose}
        />
      )}
    </>
  );
}
