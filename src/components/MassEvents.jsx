import React, { useState, useEffect } from 'react';
import { writeBatch, collection as fsCollection, doc, getDocs, addDoc as fsAddDoc, deleteDoc, query, where, orderBy, updateDoc, serverTimestamp , getDoc , onSnapshot , setDoc, getCountFromServer } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Modal, ModalHeader } from './Modal.jsx';
import { IconCalendar, IconEdit, IconTrash } from './Icons.jsx';
import { formatDateToDDMMYYYY } from '../utils/classHelpers.js';
import { auth } from '../firebaseConfig.js';

import { waitForAuthReady, updateReceiptStatus, markStudentReceiptsAsSeen } from '../utils/authHelpers.js';

// Notifica por push a un grupo de alumnos (llega aunque tengan la app cerrada)
const sendEventPush = async (appId, studentIds, body) => {
  if (!studentIds.length) return 0;
  try {
    const fns = getFunctions();
    const callFn = httpsCallable(fns, 'sendPushNotification');
    const result = await callFn({ studentIds, title: 'Estudio Sandra Paloschi 🎵', body, appId, url: `/#/checkin?a=${appId}` });
    return result.data?.sent || 0;
  } catch (err) {
    console.error('Push de evento falló:', err);
    return 0;
  }
};
export const MassEventsAdminModal = ({ isOpen, onClose, db, appId, students, showMessage }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [viewAttendeesEvent, setViewAttendeesEvent] = useState(null);
  const [attendeesByOption, setAttendeesByOption] = useState({});
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState([{ date: '', startTime: '19:00', description: '' }]);
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [summaryByEvent, setSummaryByEvent] = useState({});
  const [pendingAttendees, setPendingAttendees] = useState([]);
  const [remindingId, setRemindingId] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Cargar lista de eventos
  useEffect(() => {
    if (!isOpen || !db || !appId) return;
    const q = query(fsCollection(db, `artifacts/${appId}/massEvents`), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const evs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEvents(evs);
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    return () => unsub();
  }, [isOpen, db, appId]);

  // Resumen por evento: fechas, cantidad de opciones y confirmados/invitados
  useEffect(() => {
    if (!isOpen || !db || !appId || events.length === 0) { setSummaryByEvent({}); return; }
    let cancelled = false;
    const today = new Date().toISOString().split('T')[0];
    (async () => {
      const entries = await Promise.all(events.map(async (ev) => {
        try {
          const attendeesCol = fsCollection(db, `artifacts/${appId}/massEvents/${ev.id}/attendees`);
          const optionsCol = fsCollection(db, `artifacts/${appId}/massEvents/${ev.id}/options`);
          const [totalSnap, confirmedSnap, optionsSnap] = await Promise.all([
            getCountFromServer(attendeesCol),
            getCountFromServer(query(attendeesCol, where('confirmed', '==', true))),
            getDocs(optionsCol),
          ]);
          const dates = optionsSnap.docs.map(d => d.data().date).filter(Boolean).sort();
          return [ev.id, {
            total: totalSnap.data().count,
            confirmed: confirmedSnap.data().count,
            optionsCount: optionsSnap.size,
            firstDate: dates[0] || null,
            lastDate: dates[dates.length - 1] || null,
            isPast: dates.length > 0 && dates[dates.length - 1] < today,
          }];
        } catch {
          return [ev.id, null];
        }
      }));
      if (!cancelled) setSummaryByEvent(Object.fromEntries(entries.filter(([, v]) => v)));
    })();
    return () => { cancelled = true; };
  }, [isOpen, events, db, appId]);

  // Limpiar formulario al salir del modo creación/edición
  useEffect(() => {
    if (!creating && !editingEvent) {
      setTitle(''); setDescription(''); setOptions([{ date: '', startTime: '19:00', description: '' }]);
      setSelectedStudentIds(new Set()); setSelectAll(false); setStudentSearch('');
    }
  }, [creating, editingEvent]);

  // Función para cargar datos del evento a editar
  const loadEventData = async (eventId) => {
    try {
      // Cargar opciones
      const optionsSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${eventId}/options`));
      const opts = optionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOptions(opts.length ? opts : [{ date: '', startTime: '19:00', description: '' }]);

      // Cargar asistentes (attendees)
      const attendeesSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${eventId}/attendees`));
      const selectedIds = new Set(attendeesSnap.docs.map(doc => doc.id));
      setSelectedStudentIds(selectedIds);
      setSelectAll(selectedIds.size === students.length);
    } catch (err) {
      console.error("Error cargando datos del evento:", err);
      showMessage("No se pudieron cargar las opciones o participantes.", "error");
    }
  };

  // Cuando se setea editingEvent, cargar sus datos
  useEffect(() => {
    if (editingEvent && editingEvent.id) {
      loadEventData(editingEvent.id);
    }
  }, [editingEvent, db, appId, students]);

  const handleSelectAll = (checked) => {
    setSelectAll(checked);
    setSelectedStudentIds(checked ? new Set(students.map(s => s.id)) : new Set());
  };

  const toggleStudent = (id) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectAll(false);
  };

  const addOption = () => {
    setOptions([...options, { date: '', startTime: '19:00', description: '' }]);
  };

  const removeOption = (index) => {
    if (options.length === 1) {
      showMessage('Debe haber al menos una opción de fecha.', 'error');
      return;
    }
    const newOptions = [...options];
    newOptions.splice(index, 1);
    setOptions(newOptions);
  };

  const updateOption = (index, field, value) => {
    const newOptions = [...options];
    newOptions[index][field] = value;
    setOptions(newOptions);
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      showMessage('Completá el título.', 'error');
      return;
    }
    const validOptions = options.filter(opt => opt.date && opt.startTime);
    if (validOptions.length === 0) {
      showMessage('Agregá al menos una opción de fecha y hora.', 'error');
      return;
    }
    if (selectedStudentIds.size === 0) {
      showMessage('Seleccioná al menos un alumno.', 'error');
      return;
    }
    setCreating(true);
    setSaving(true);
    try {
      const cleanTitle = title.trim();
      const eventData = {
        title: cleanTitle,
        description: description.trim(),
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || 'admin',
        hasOptions: true,
      };
      let eventId;
      if (editingEvent) {
        eventId = editingEvent.id;

        // Si se va a sacar de la lista a alguien que ya había confirmado asistencia,
        // se pierde su confirmación — avisamos antes de continuar.
        const currentAttendeesSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${eventId}/attendees`));
        const currentIds = new Set(currentAttendeesSnap.docs.map(d => d.id));
        const removingConfirmed = currentAttendeesSnap.docs.filter(d => !selectedStudentIds.has(d.id) && d.data().confirmed);
        if (removingConfirmed.length) {
          const names = removingConfirmed.map(d => d.data().studentName).join(', ');
          const plural = removingConfirmed.length !== 1;
          if (!window.confirm(`${names} ya ${plural ? 'habían' : 'había'} confirmado su asistencia. Si ${plural ? 'los' : 'lo'} sacás de la convocatoria, se pierde esa confirmación. ¿Continuar de todos modos?`)) {
            setCreating(false);
            setSaving(false);
            return;
          }
        }

        await updateDoc(doc(db, `artifacts/${appId}/massEvents`, eventId), eventData);
        // Actualizar opciones: eliminar existentes y volver a crear
        const optionsSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${eventId}/options`));
        const batch = writeBatch(db);
        optionsSnap.forEach(docSnap => batch.delete(docSnap.ref));
        for (const opt of options) {
          if (opt.date && opt.startTime) {
            const optRef = doc(fsCollection(db, `artifacts/${appId}/massEvents/${eventId}/options`));
            batch.set(optRef, {
              date: opt.date,
              startTime: opt.startTime,
              description: opt.description || '',
            });
          }
        }

        // Eliminar los que ya no están seleccionados
        for (const id of currentIds) {
          if (!selectedStudentIds.has(id)) {
            batch.delete(doc(db, `artifacts/${appId}/massEvents/${eventId}/attendees/${id}`));
          }
        }
        // Agregar los nuevos seleccionados
        const newlyAddedIds = [];
        for (const studentId of selectedStudentIds) {
          if (!currentIds.has(studentId)) {
            const studentObj = students.find(s => s.id === studentId);
            if (studentObj) {
              newlyAddedIds.push(studentId);
              const attendeeRef = doc(db, `artifacts/${appId}/massEvents/${eventId}/attendees/${studentId}`);
              batch.set(attendeeRef, {
                studentId,
                studentName: studentObj.name || studentObj.fullName,
                confirmed: false,
                confirmedAt: null,
                selectedOptionId: null,
              });
            }
          }
        }

        await batch.commit(); // ✅ Solo un commit

        // Avisamos por push solo a quienes recién se suman, para no spamear a los que ya sabían
        let pushNote = '';
        if (newlyAddedIds.length) {
          const sent = await sendEventPush(appId, newlyAddedIds, `Te sumaron a la convocatoria "${cleanTitle}". Elegí tu fecha en la app 🎶`);
          if (sent) pushNote = ` + ${sent} notificación${sent !== 1 ? 'es' : ''} push a los nuevos invitados`;
        }
        showMessage(`Evento actualizado.${pushNote}`, 'success');
      } else {
        // Crear nuevo evento
        const docRef = await fsAddDoc(fsCollection(db, `artifacts/${appId}/massEvents`), eventData);
        eventId = docRef.id;
        const batch = writeBatch(db);
        // Crear opciones
        for (const opt of options) {
          if (opt.date && opt.startTime) {
            const optRef = doc(fsCollection(db, `artifacts/${appId}/massEvents/${eventId}/options`));
            batch.set(optRef, {
              date: opt.date,
              startTime: opt.startTime,
              description: opt.description || '',
            });
          }
        }
        // Crear asistentes
        for (const studentId of selectedStudentIds) {
          const studentObj = students.find(s => s.id === studentId);
          if (studentObj) {
            const attendeeRef = doc(db, `artifacts/${appId}/massEvents/${eventId}/attendees`, studentId);
            batch.set(attendeeRef, {
              studentId,
              studentName: studentObj.name || studentObj.fullName,
              confirmed: false,
              confirmedAt: null,
              selectedOptionId: null,
            });
          }
        }
        await batch.commit();

        const sent = await sendEventPush(appId, [...selectedStudentIds], `Nueva convocatoria: "${cleanTitle}". Elegí tu fecha en la app 🎶`);
        showMessage(`Evento creado y enviado a ${selectedStudentIds.size} alumno${selectedStudentIds.size !== 1 ? 's' : ''}${sent ? ` + ${sent} notificación${sent !== 1 ? 'es' : ''} push` : ''}.`, 'success');
      }
      setCreating(false);
      setEditingEvent(null);
      setSaving(false);
    } catch (err) {
      console.error(err);
      showMessage(`Error: ${err.message}`, 'error');
      setCreating(false);
      setSaving(false);
    }
  };

  // Duplica un evento (título, descripción y fechas) sin invitados, para reutilizarlo como plantilla
  const handleDuplicateEvent = async (event) => {
    setDuplicatingId(event.id);
    try {
      const optionsSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${event.id}/options`));
      const newTitle = `${event.title} (copia)`;
      const newEventData = {
        title: newTitle,
        description: event.description || '',
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || 'admin',
        hasOptions: true,
      };
      const docRef = await fsAddDoc(fsCollection(db, `artifacts/${appId}/massEvents`), newEventData);
      const batch = writeBatch(db);
      optionsSnap.forEach(d => {
        const { date, startTime, description: optDesc } = d.data();
        const optRef = doc(fsCollection(db, `artifacts/${appId}/massEvents/${docRef.id}/options`));
        batch.set(optRef, { date: date || '', startTime: startTime || '19:00', description: optDesc || '' });
      });
      await batch.commit();
      showMessage(`Evento duplicado como "${newTitle}". Revisá las fechas y elegí a quién invitar antes de guardarlo.`, 'success');
      // Lo abrimos directo en modo edición para ajustar fechas e invitados
      setEditingEvent({ id: docRef.id, ...newEventData });
      setTitle(newTitle);
      setDescription(newEventData.description);
      setCreating(true);
    } catch (err) {
      showMessage(`Error al duplicar: ${err.message}`, 'error');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDeleteEvent = async (event) => {
    if (!window.confirm(`¿Eliminar el evento "${event.title}"? También se borrarán todas las opciones y confirmaciones.`)) return;
    try {
      const eventRef = doc(db, `artifacts/${appId}/massEvents`, event.id);
      const optionsSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${event.id}/options`));
      const attendeesSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${event.id}/attendees`));
      const batch = writeBatch(db);
      optionsSnap.forEach(d => batch.delete(d.ref));
      attendeesSnap.forEach(d => batch.delete(d.ref));
      batch.delete(eventRef);
      await batch.commit();
      showMessage('Evento eliminado.', 'success');
    } catch (err) {
      showMessage(`Error: ${err.message}`, 'error');
    }
  };

  const handleViewAttendees = async (event) => {
    setViewAttendeesEvent(event);
    setAttendeesLoading(true);
    try {
      const optionsSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${event.id}/options`));
      const optionsMap = {};
      optionsSnap.forEach(doc => {
        optionsMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      const attendeesSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${event.id}/attendees`));
      const attendees = attendeesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Separamos a quienes ya eligieron fecha de quienes todavía no respondieron,
      // para no mezclarlos bajo una etiqueta confusa de "opción desconocida"
      const confirmed = attendees.filter(a => a.confirmed && a.selectedOptionId);
      const pending = attendees.filter(a => !a.confirmed)
        .sort((a, b) => a.studentName.localeCompare(b.studentName));
      const byOption = {};
      confirmed.forEach(a => {
        const optId = a.selectedOptionId;
        if (!byOption[optId]) byOption[optId] = [];
        byOption[optId].push(a);
      });
      const result = {};
      for (const [optId, list] of Object.entries(byOption)) {
        const option = optionsMap[optId];
        result[optId] = {
          optionLabel: option ? `${formatDateToDDMMYYYY(option.date)} · ${option.startTime} hs${option.description ? ` (${option.description})` : ''}` : 'Opción eliminada',
          attendees: list.sort((a,b) => a.studentName.localeCompare(b.studentName))
        };
      }
      setAttendeesByOption(result);
      setPendingAttendees(pending);
    } catch (err) {
      console.error(err);
      showMessage('No se pudo cargar la lista.', 'error');
    } finally {
      setAttendeesLoading(false);
    }
  };

  // Reenvía un push solo a quienes todavía no confirmaron asistencia a este evento
  const handleRemindPending = async () => {
    if (!viewAttendeesEvent || !pendingAttendees.length) return;
    setRemindingId(viewAttendeesEvent.id);
    try {
      const sent = await sendEventPush(
        appId,
        pendingAttendees.map(a => a.studentId),
        `Recordatorio: todavía no confirmaste tu asistencia a "${viewAttendeesEvent.title}". ¡Elegí tu fecha en la app! ⏰`
      );
      showMessage(
        sent ? `Recordatorio enviado a ${pendingAttendees.length} alumno${pendingAttendees.length !== 1 ? 's' : ''} (${sent} notificación${sent !== 1 ? 'es' : ''} push).` : 'No se pudo enviar el recordatorio push.',
        sent ? 'success' : 'warn'
      );
    } catch (err) {
      showMessage(`Error: ${err.message}`, 'error');
    } finally {
      setRemindingId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="flex flex-col h-[calc(100svh-4rem)] sm:max-h-[80vh]">
        <ModalHeader iconNode={<IconCalendar />} title="Eventos Masivos" subtitle="Creá convocatorias con múltiples fechas" />
        <div className="p-4 border-b border-gray-200">
          <button onClick={() => { setEditingEvent(null); setCreating(true); }} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700">
            + Nuevo evento
          </button>
        </div>
        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          {(creating || editingEvent) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg flex-shrink-0">
                  {editingEvent ? '✏️' : '🎭'}
                </div>
                <h3 className="font-black text-gray-900">{editingEvent ? 'Editar convocatoria' : 'Nueva convocatoria'}</h3>
              </div>
              <form onSubmit={handleSaveEvent} className="space-y-5">

                {/* Datos básicos */}
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Título</p>
                    <input type="text" placeholder="Ej: Muestra de fin de año" value={title} onChange={e => setTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-300 transition" required />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Descripción <span className="normal-case font-medium text-gray-300">(opcional)</span></p>
                    <textarea placeholder="Contales de qué se trata, qué necesitan llevar, etc." value={description} onChange={e => setDescription(e.target.value)} rows={2}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-300 transition resize-none" />
                  </div>
                </div>

                {/* Opciones de fecha/hora */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Fechas a elegir</p>
                  <div className="space-y-2">
                    {options.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50">
                        <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-600 text-xs font-black flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                        <input type="date" value={opt.date} onChange={e => updateOption(idx, 'date', e.target.value)}
                          className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 transition" required />
                        <input type="time" value={opt.startTime} onChange={e => updateOption(idx, 'startTime', e.target.value)}
                          className="px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 transition w-[5.5rem]" required />
                        <input type="text" placeholder="Ej: Función 1" value={opt.description} onChange={e => updateOption(idx, 'description', e.target.value)}
                          className="flex-1 min-w-0 px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 transition" />
                        <button type="button" onClick={() => removeOption(idx)} title="Quitar esta fecha"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition flex-shrink-0">
                          <IconTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addOption}
                    className="mt-2 w-full py-2 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-400 hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50 transition">
                    + Agregar otra fecha
                  </button>
                </div>

                {/* Selección de alumnos */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Invitar a</p>
                    <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                      {selectedStudentIds.size} seleccionado{selectedStudentIds.size !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm">🔎</span>
                      <input type="text" placeholder="Buscar alumno..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-300 transition" />
                    </div>
                    <button type="button" onClick={() => handleSelectAll(!selectAll)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap ${selectAll ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-rose-300 hover:text-rose-600'}`}>
                      {selectAll ? '✓ Todos' : 'Seleccionar todos'}
                    </button>
                  </div>
                  <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
                    {students
                      .filter(s => (s.name || s.fullName || '').toLowerCase().includes(studentSearch.trim().toLowerCase()))
                      .map(s => {
                        const checked = selectedStudentIds.has(s.id);
                        const label = s.name || s.fullName;
                        return (
                          <label key={s.id} className={`flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition ${checked ? 'bg-rose-50/70' : 'hover:bg-gray-50'}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleStudent(s.id)} className="w-4 h-4 accent-rose-600 flex-shrink-0" />
                            <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[10px] font-black flex items-center justify-center flex-shrink-0">
                              {(label || '?').trim().charAt(0).toUpperCase()}
                            </span>
                            <span className={`truncate ${checked ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>{label}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => { setCreating(false); setEditingEvent(null); }}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-[0.98] disabled:opacity-50 transition shadow-sm flex items-center gap-2">
                    {saving ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</> : (editingEvent ? 'Guardar cambios' : 'Crear y enviar')}
                  </button>
                </div>
              </form>
            </div>
          )}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
              <div className="w-6 h-6 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
              <p className="text-xs font-medium">Cargando eventos...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
              <div className="text-3xl mb-2">🎭</div>
              <p className="font-bold text-gray-700 text-sm">Todavía no creaste ninguna convocatoria</p>
              <p className="text-xs text-gray-400 mt-1">Tocá "+ Nuevo evento" para invitar a tus alumnos a una función, muestra o evento especial.</p>
            </div>
          ) : (
            events.map(ev => {
              const meta = summaryByEvent[ev.id];
              const dateLabel = meta?.firstDate
                ? (meta.firstDate === meta.lastDate
                    ? formatDateToDDMMYYYY(meta.firstDate)
                    : `${formatDateToDDMMYYYY(meta.firstDate)} – ${formatDateToDDMMYYYY(meta.lastDate)}`)
                : null;
              return (
                <div key={ev.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-gray-800">{ev.title}</h4>
                        {meta?.isPast && <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Finalizado</span>}
                      </div>
                      {ev.description && <p className="text-sm text-gray-500 mt-0.5">{ev.description}</p>}
                      <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-gray-500">
                        {dateLabel && (
                          <span className="inline-flex items-center gap-1">
                            📅 {dateLabel}{meta.optionsCount > 1 ? ` · ${meta.optionsCount} opciones` : ''}
                          </span>
                        )}
                        {meta && (
                          <span className="inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                            ✅ {meta.confirmed}/{meta.total} confirmaron
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => handleViewAttendees(ev)} className="px-3 py-1.5 text-xs font-bold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition">
                        Ver confirmados
                      </button>
                      <button onClick={() => handleDuplicateEvent(ev)} disabled={duplicatingId === ev.id} title="Duplicar evento"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition disabled:opacity-40">
                        {duplicatingId === ev.id ? <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" /> : <span className="text-base leading-none">⧉</span>}
                      </button>
                      <button onClick={() => {
                        setEditingEvent(ev);
                        setTitle(ev.title);
                        setDescription(ev.description || '');
                        setCreating(true);
                      }} title="Editar evento"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition">
                        <IconEdit />
                      </button>
                      <button onClick={() => handleDeleteEvent(ev)} title="Eliminar evento"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      {viewAttendeesEvent && (
        <Modal isOpen={!!viewAttendeesEvent} onClose={() => { setViewAttendeesEvent(null); setPendingAttendees([]); setAttendeesByOption({}); }} size="lg">
          <div className="p-4">
            <h3 className="font-bold text-lg">{viewAttendeesEvent.title} - Confirmaciones por opción</h3>
            {attendeesLoading ? <div className="flex justify-center py-6 gap-1 items-end" style={{ height: 44 }}>
              {[3,5,4,6,3,5,4].map((h,i) => <div key={i} style={{ width:3, height:`${Math.round(h/6*28)}px`, backgroundColor:'#fda4af', borderRadius:2, animation:`soundwave 0.8s ${i*0.15}s ease-in-out infinite alternate` }}/>)}
              <style>{`@keyframes soundwave{from{transform:scaleY(.2);opacity:.5}to{transform:scaleY(1);opacity:1}}`}</style>
            </div> : (
              <div className="mt-2 space-y-4">
                {pendingAttendees.length > 0 && (
                  <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="font-semibold text-amber-800">⏳ Pendientes de confirmar ({pendingAttendees.length})</h4>
                      <button onClick={handleRemindPending} disabled={remindingId === viewAttendeesEvent.id}
                        className="px-2.5 py-1 text-xs font-bold bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-50 transition flex items-center gap-1.5">
                        {remindingId === viewAttendeesEvent.id
                          ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
                          : '🔔 Recordar por push'}
                      </button>
                    </div>
                    <ul className="mt-2 list-disc list-inside text-sm text-amber-900">
                      {pendingAttendees.map(a => <li key={a.studentId}>{a.studentName}</li>)}
                    </ul>
                  </div>
                )}
                {Object.keys(attendeesByOption).length === 0 ? (
                  pendingAttendees.length === 0 && <p className="text-sm text-gray-500">No hay invitados todavía.</p>
                ) : (
                  Object.entries(attendeesByOption).map(([optId, data]) => (
                    <div key={optId} className="border rounded-lg p-3">
                      <h4 className="font-semibold text-rose-700">✅ {data.optionLabel} <span className="text-gray-400 font-normal">({data.attendees.length})</span></h4>
                      <ul className="mt-2 list-disc list-inside">
                        {data.attendees.map(a => (
                          <li key={a.studentId}>{a.studentName}</li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </Modal>
  );
};
export const MassEventsStudentSection = ({ db, appId, student }) => {
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState(null);
  const [selectedOption, setSelectedOption] = useState({});
  const showMessage = (text, type) => alert(`${type}: ${text}`);

  useEffect(() => {
    if (!db || !appId || !student?.id) return;

    const today = new Date().toISOString().split('T')[0];
    // Los documentos de evento no tienen un campo "date" propio (las fechas viven
    // en la subcolección "options"), así que no podemos ordenar por eso en el query.
    const q = query(fsCollection(db, `artifacts/${appId}/massEvents`));

    const unsub = onSnapshot(q, async (snap) => {
      const evList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const enriched = await Promise.all(evList.map(async (ev) => {
        // 🔑 CLAVE: Verificar si el alumno tiene un documento attendee
        const attendeeRef = doc(db, `artifacts/${appId}/massEvents/${ev.id}/attendees/${student.id}`);
        const attendeeSnap = await getDoc(attendeeRef);
        if (!attendeeSnap.exists()) return null; // ← Si no existe, ignorar evento

        // Cargar opciones del evento y quedarnos solo con las que todavía no pasaron
        const optionsSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${ev.id}/options`));
        const options = optionsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(opt => opt.date >= today)
          .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));
        if (!options.length) return null;

        const confirmed = attendeeSnap.data().confirmed;
        const selectedOptionId = attendeeSnap.data().selectedOptionId || null;
        return { ...ev, confirmed, selectedOptionId, options, earliestDate: options[0].date };
      }));
      const pendingEvents = enriched
        .filter(ev => ev !== null && !ev.confirmed)
        .sort((a, b) => (a.earliestDate || '').localeCompare(b.earliestDate || ''));
      setEvents(pendingEvents);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsub();
  }, [db, appId, student?.id]);

  const handleConfirm = async (eventId) => {
    const optionId = selectedOption[eventId];
    if (!optionId) {
      showMessage('Por favor, seleccioná una fecha/hora para este evento.', 'error');
      return;
    }
    setConfirmingId(eventId);
    try {
      await waitForAuthReady();
      const attendeeRef = doc(db, `artifacts/${appId}/massEvents/${eventId}/attendees/${student.id}`);
      await setDoc(attendeeRef, {
        confirmed: true,
        confirmedAt: serverTimestamp(),
        selectedOptionId: optionId,
      }, { merge: true });
      showMessage('Asistencia confirmada. ¡Gracias!', 'success');
      setEvents(prev => prev.filter(ev => ev.id !== eventId));
    } catch (err) {
      console.error(err);
      showMessage('No se pudo confirmar. Intenta de nuevo.', 'error');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleOptionChange = (eventId, optionId) => {
    setSelectedOption(prev => ({ ...prev, [eventId]: optionId }));
  };

  if (loading) return <div className="text-sm text-gray-500">Cargando eventos...</div>;
  if (events.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 mt-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        Eventos próximos
      </h3>
      <div className="space-y-3">
        {events.map(ev => (
          <div key={ev.id} className="border-l-4 border-rose-300 bg-gray-50 p-3 rounded-r-lg">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-gray-800">{ev.title}</p>
                <p className="text-xs text-gray-600">
                  {ev.options.length === 1
                    ? `${formatDateToDDMMYYYY(ev.options[0].date)} · ${ev.options[0].startTime} hs`
                    : `${ev.options.length} fechas posibles — elegí la tuya`}
                </p>
                {ev.description && <p className="text-sm text-gray-700 mt-1">{ev.description}</p>}
              </div>
              <div>
                {ev.confirmed ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">✅ Confirmado</span>
                ) : (
                  <div className="flex flex-col items-end gap-2">
                    <select
                      value={selectedOption[ev.id] || ''}
                      onChange={(e) => handleOptionChange(ev.id, e.target.value)}
                      className="text-xs border rounded p-1"
                    >
                      <option value="">Elegir opción</option>
                      {ev.options.map(opt => (
                        <option key={opt.id} value={opt.id}>{formatDateToDDMMYYYY(opt.date)} · {opt.startTime}{opt.description ? ` (${opt.description})` : ''}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleConfirm(ev.id)}
                      disabled={confirmingId === ev.id}
                      className="px-3 py-1 text-xs font-semibold bg-rose-100 text-rose-700 rounded-full hover:bg-rose-200 disabled:opacity-50"
                    >
                      {confirmingId === ev.id ? '...' : 'Confirmar asistencia'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};