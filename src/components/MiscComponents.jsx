import React, { useState, useEffect, useRef } from 'react';
import { collection as fsCollection, doc, getDocs, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp , getDoc , setDoc } from 'firebase/firestore';
import { Modal, ModalHeader } from './Modal.jsx';
import { formatMoneyAr } from '../utils/money.js';
import { formatDateToDDMMYYYY } from '../utils/classHelpers.js';
import { IconCalendar, IconTicket, IconDownload, IconShare } from './Icons.jsx';
import { exportPaymentReceiptPDFWithLogo } from '../utils/paymentPDF.js';
import { sharePayment } from '../utils/paymentPDF.js';
import { waitForAuthReady, updateReceiptStatus, markStudentReceiptsAsSeen } from '../utils/authHelpers.js';
// --- File Type Icon Helper ---
export const EventConfirmationPopup = ({ isOpen, onClose, db, appId, student, showMessage }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState(null);
  const [selectedOption, setSelectedOption] = useState({});

  useEffect(() => {
    if (!isOpen || !db || !appId || !student?.id) return;

    const today = new Date().toISOString().split('T')[0];
    const q = query(
      fsCollection(db, `artifacts/${appId}/massEvents`),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, async (snap) => {
      const evList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const enriched = await Promise.all(evList.map(async (ev) => {
        // 🔑 CLAVE: Verificar si el alumno tiene un documento attendee
        const attendeeRef = doc(db, `artifacts/${appId}/massEvents/${ev.id}/attendees/${student.id}`);
        const attendeeSnap = await getDoc(attendeeRef);
        if (!attendeeSnap.exists()) return null;

        const optionsSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${ev.id}/options`));
        const options = optionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const hasFutureOption = options.some(opt => opt.date >= today);
        if (!hasFutureOption) return null;

        const confirmed = attendeeSnap.data().confirmed;
        const selectedOptionId = attendeeSnap.data().selectedOptionId;
        return { ...ev, confirmed, selectedOptionId, options };
      }));
      const pendingEvents = enriched.filter(ev => ev !== null && !ev.confirmed);
      setEvents(pendingEvents);
      setLoading(false);
      if (pendingEvents.length === 0 && isOpen) {
        onClose();
      }
    });
    return () => unsub();
  }, [isOpen, db, appId, student?.id]);

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
      if (showMessage) showMessage('Asistencia confirmada. ¡Gracias!', 'success');
      setEvents(prev => prev.filter(ev => ev.id !== eventId));
    } catch (err) {
      console.error(err);
      if (showMessage) showMessage('No se pudo confirmar. Intenta de nuevo.', 'error');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleOptionChange = (eventId, optionId) => {
    setSelectedOption(prev => ({ ...prev, [eventId]: optionId }));
  };

  if (!isOpen) return null;

  const formatDateSpanish = (dateStr) => {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('-');
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const getDayName = (dateStr) => {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('-');
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('es-ES', { weekday: 'long' });
    } catch {
      return '';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="flex flex-col h-[calc(100svh-4rem)] sm:max-h-[80vh]">
        <div className="bg-gradient-to-r from-rose-600 to-pink-500 p-4 sm:p-5 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Eventos próximos</h2>
              <p className="text-rose-100 text-sm">Elegí una fecha/hora y confirmá tu asistencia</p>
            </div>
          </div>
          <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-4 sm:p-5 bg-gray-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-rose-500 border-t-transparent"></div>
              <p className="mt-3 text-gray-500">Cargando eventos...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="w-16 h-16 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500">No hay eventos pendientes de confirmación.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {events.map(ev => {
                const isConfirming = confirmingId === ev.id;
                const selectedOptId = selectedOption[ev.id];
                return (
                  <div key={ev.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all hover:shadow-md">
                    <div className="bg-rose-50 px-4 py-3 border-b border-rose-100">
                      <h3 className="font-bold text-lg text-gray-800">{ev.title}</h3>
                      {ev.description && <p className="text-sm text-gray-600 mt-0.5">{ev.description}</p>}
                    </div>
                    <div className="p-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Elegí una opción:
                      </p>
                      <div className="space-y-2">
                        {ev.options.map(opt => {
                          const isSelected = selectedOptId === opt.id;
                          return (
                            <label key={opt.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-rose-500 bg-rose-50 ring-2 ring-rose-200' : 'border-gray-200 hover:border-rose-300 hover:bg-gray-50'}`} onClick={() => handleOptionChange(ev.id, opt.id)}>
                              <input type="radio" name={`event-${ev.id}`} value={opt.id} checked={isSelected} onChange={() => handleOptionChange(ev.id, opt.id)} className="w-4 h-4 text-rose-600 focus:ring-rose-500" />
                              <div className="flex-1">
                                <div className="font-semibold text-gray-800">{formatDateSpanish(opt.date)}</div>
                                <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                                  <span className="flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{opt.startTime} hs</span>
                                  <span className="capitalize">{getDayName(opt.date)}</span>
                                  {opt.description && <span className="text-rose-600">({opt.description})</span>}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      <button onClick={() => handleConfirm(ev.id)} disabled={isConfirming || !selectedOptId} className={`mt-4 w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${!selectedOptId ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : isConfirming ? 'bg-rose-400 text-white cursor-wait' : 'bg-rose-600 text-white hover:bg-rose-700 shadow-md hover:shadow-lg active:scale-[0.98]'}`}>
                        {isConfirming ? (<><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>Confirmando...</>) : (<><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Confirmar asistencia</>)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 bg-white">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors">Cerrar</button>
        </div>
      </div>
    </Modal>
  );
};
// ============================================================
// COMPONENTE: Mis eventos confirmados (para el portal público)
// ============================================================
export const ConfirmedEventsSection = ({ db, appId, student }) => {
  const [confirmedEvents, setConfirmedEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!db || !appId || !student?.id) {
      setConfirmedEvents([]);
      setLoading(false);
      return;
    }

    const eventsQuery = query(
      fsCollection(db, `artifacts/${appId}/massEvents`),
      orderBy("createdAt", "desc")
    );

    const unsubEvents = onSnapshot(eventsQuery, async (eventsSnap) => {
      const eventsList = eventsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const confirmedList = [];

      for (const ev of eventsList) {
        const attendeeRef = doc(db, `artifacts/${appId}/massEvents/${ev.id}/attendees/${student.id}`);
        const attendeeSnap = await getDoc(attendeeRef);
        if (attendeeSnap.exists() && attendeeSnap.data().confirmed === true) {
          const selectedOptionId = attendeeSnap.data().selectedOptionId;
          if (selectedOptionId) {
            const optionRef = doc(db, `artifacts/${appId}/massEvents/${ev.id}/options/${selectedOptionId}`);
            const optionSnap = await getDoc(optionRef);
            if (optionSnap.exists()) {
              const optionData = optionSnap.data();
              confirmedList.push({
                eventId: ev.id,
                title: ev.title,
                description: ev.description,
                selectedDate: optionData.date,
                selectedTime: optionData.startTime,
                optionDescription: optionData.description,
                confirmedAt: attendeeSnap.data().confirmedAt?.toDate?.() || null
              });
            }
          }
        }
      }
      setConfirmedEvents(confirmedList);
      setLoading(false);
    });

    return () => unsubEvents();
  }, [db, appId, student?.id]);

  if (loading) return null;
  if (confirmedEvents.length === 0) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-4 mb-4">
      <h3 className="text-sm font-semibold text-green-800 flex items-center gap-2 mb-3">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Mis eventos confirmados
      </h3>
      <div className="space-y-2">
        {confirmedEvents.map(ev => (
          <div key={ev.eventId} className="bg-white rounded-lg p-3 border border-green-200 shadow-sm">
            <p className="font-bold text-gray-800">{ev.title}</p>
            {ev.description && <p className="text-xs text-gray-600 mt-0.5">{ev.description}</p>}
            <p className="text-sm text-green-700 mt-2 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatDate(ev.selectedDate)} · {ev.selectedTime} hs
              {ev.optionDescription && <span className="ml-2 text-xs bg-green-100 px-2 py-0.5 rounded-full">({ev.optionDescription})</span>}
            </p>
            {ev.confirmedAt && (
              <p className="text-[10px] text-gray-400 mt-1">
                Confirmado el {ev.confirmedAt.toLocaleDateString('es-AR')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
