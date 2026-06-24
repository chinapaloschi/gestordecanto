import React, { useState, useEffect, useMemo } from 'react';

import { collection as fsCollection, query, where, onSnapshot } from 'firebase/firestore';

import { Modal, ModalHeader } from './Modal.jsx';

import { ScanTicketsView } from './EventModals.jsx';

import { formatDateToDDMMYYYY } from '../utils/classHelpers.js';

import { IconCalendar, IconTicket } from './Icons.jsx';

import { waitForAuthReady, updateReceiptStatus, markStudentReceiptsAsSeen } from '../utils/authHelpers.js';

import FullCalendar from '@fullcalendar/react';

import dayGridPlugin from '@fullcalendar/daygrid';

import interactionPlugin from '@fullcalendar/interaction';

import { mapClassTypeToSpanish } from '../utils/classHelpers.js';

import { isPresent, isAbsent } from '../utils/studentHelpers.js';
import { getInitials } from '../utils/studentHelpers.js';
export const PublicEventsPortal = ({ db, appId }) => {

  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(true);

  const [selectedEvent, setSelectedEvent] = useState(null);

  const [showScanModal, setShowScanModal] = useState(false);



  // --- Iconos necesarios para el escáner ---

  const IconQrCode = () => (

    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

      <rect x="3" y="3" width="6" height="6" /><path d="M15 3h6v6h-6z" /><path d="M3 15h6v6H3z" /><path d="M15 15h6" /><path d="M15 21h6" />

    </svg>

  );

  

  useEffect(() => {

    // Carga de la librería para leer QRs

    const qrScript = document.createElement('script');

    qrScript.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";

    qrScript.async = true;

    document.body.appendChild(qrScript);

    return () => { document.body.removeChild(qrScript); };

  }, []);



  useEffect(() => {

    if (!db || !appId) return;

    const ensureAuthAndFetch = async () => {

      setLoading(true);

      await waitForAuthReady();

      const eventsCol = fsCollection(db, `artifacts/${appId}/events`);

      const q = query(eventsCol, orderBy("date", "desc"));

      const unsub = onSnapshot(q, (snap) => {

        setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));

        setLoading(false);

      }, (error) => {

        console.error("Error al cargar eventos públicos:", error);

        setLoading(false);

      });

      return unsub;

    };

    const unsubscribePromise = ensureAuthAndFetch();

    return () => { unsubscribePromise.then(unsub => unsub && unsub()); };

  }, [db, appId]);



  const fmtDate = (iso, time) => {

    if (!iso) return "";

    try {

      const d = new Date(iso + 'T00:00:00Z');

      const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

      const dd = dias[d.getUTCDay()];

      const dia = String(d.getUTCDate()).padStart(2, "0");

      const mes = String(d.getUTCMonth() + 1).padStart(2, "0");

      const anio = d.getUTCFullYear();

      const hhmm = (time || "").slice(0, 5);

      return `${dd} ${dia}/${mes}/${anio}${hhmm ? ` – ${hhmm} hs` : ""}`;

    } catch { return ""; }

  };



  const showMessage = (text, type = 'info') => {

    alert(`[${type.toUpperCase()}] ${text}`);

  };



  if (selectedEvent) {

    return (

      <>

        <div className="min-h-screen bg-gray-100 p-4 sm:p-8">

          <div className="max-w-4xl mx-auto">

            <button onClick={() => setSelectedEvent(null)} className="mb-4 px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition">

              ← Volver a todos los eventos

            </button>

            <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">

              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">

                <div>

                  <h1 className="text-3xl font-bold text-gray-900">{selectedEvent.title}</h1>

                  <p className="text-lg text-rose-600 font-semibold mt-1">{fmtDate(selectedEvent.date, selectedEvent.startTime)}</p>

                  {selectedEvent.location && <p className="text-gray-600 mt-2">📍 {selectedEvent.location}</p>}

                </div>

                <button onClick={() => setShowScanModal(true)} className="flex-shrink-0 w-full sm:w-auto px-5 py-3 bg-gray-800 text-white font-semibold rounded-lg hover:bg-black transition flex items-center justify-center gap-2">

                  <IconQrCode />

                  Escanear Entradas

                </button>

              </div>

              <hr className="my-6" />

              <h2 className="text-xl font-bold text-gray-800 mb-4">Participantes</h2>

              {selectedEvent.participants && selectedEvent.participants.length > 0 ? (

                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">

                  {selectedEvent.participants.sort((a, b) => a.name.localeCompare(b.name)).map(p => (

                    <li key={p.id} className="text-center">

                      <div className="h-24 w-24 mx-auto rounded-full bg-rose-100 flex items-center justify-center ring-2 ring-white shadow">

                        <span className="font-semibold text-3xl text-rose-500">{getInitials(p.name)}</span>

                      </div>

                      <p className="mt-2 font-semibold text-gray-700">{p.name}</p>

                    </li>

                  ))}

                </ul>

              ) : (<p className="text-gray-500">No hay participantes confirmados.</p>)}

            </div>

          </div>

        </div>

        <ScanTicketsView

          isOpen={showScanModal}

          onClose={() => setShowScanModal(false)}

          db={db}

          appId={appId}

          event={selectedEvent}

          showMessage={showMessage}

        />

      </>

    );

  }



  return (

    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white">

      <div className="max-w-4xl mx-auto p-4 sm:p-8">

        <header className="text-center mb-8">

          <img src={LOGO_URL} alt="Logo Estudio" className="h-40 w-auto mx-auto mb-4" />

          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Muestras y Eventos</h1>

          <p className="mt-2 text-lg text-gray-600">Conocé nuestras próximas presentaciones</p>

        </header>

        {loading ? (

          <p className="text-center text-gray-500">Cargando eventos...</p>

        ) : (

          <div className="space-y-6">

            {events.map(event => (

              <div key={event.id} className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-shadow p-6">

                <div className="flex flex-col sm:flex-row justify-between sm:items-center">

                  <div>

                    <p className="font-semibold text-rose-600">{fmtDate(event.date, event.startTime)}</p>

                    <h2 className="text-2xl font-bold text-gray-800">{event.title}</h2>

                    <p className="text-gray-500">{event.location || 'Lugar a confirmar'}</p>

                  </div>

                  <div className="mt-4 sm:mt-0">

                    <button onClick={() => setSelectedEvent(event)} className="px-6 py-3 bg-gray-800 text-white font-semibold rounded-lg hover:bg-black transition">

                      Ver Detalles

                    </button>

                  </div>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

    </div>

  );

};





export const FullCalendarView = ({ scheduledClasses, students, onClassClick }) => {



  const classEvents = React.useMemo(() => {

    const groups = new Map();

    // Agrupamos clases grupales/corales por hora y tipo

    scheduledClasses.forEach(cls => {

      const isGroup = cls.studentType !== 'individual';

      const key = isGroup ? `${cls.classDate}-${cls.startTime}-${cls.studentType}` : cls.id;

      if (!groups.has(key)) {

        groups.set(key, []);

      }

      groups.get(key).push(cls);

    });



    return Array.from(groups.values()).map(group => {

      const firstClass = group[0];

      const title = firstClass.studentType === 'individual'

        ? firstClass.studentName

        : `${mapClassTypeToSpanish(firstClass.studentType)} (${group.length})`;



      let backgroundColor = '#3B82F6'; // Azul (Individual) por defecto

      let borderColor = '#1D4ED8';



      if (firstClass.studentType === 'group') {

        backgroundColor = '#F59E0B'; // Ámbar

        borderColor = '#B45309';

      } else if (firstClass.studentType === 'choir') {

        backgroundColor = '#EC4899'; // Rosa

        borderColor = '#9D174D';

      }

      

      if (!firstClass.isPaid && firstClass.monthlyPaymentRefId) {

        backgroundColor = '#D1D5DB'; // Gris (Pendiente de abono)

        borderColor = '#6B7280';

      }



      const isPresente = group.every(c => isPresent(c.attendanceStatus));

      const isAusente = group.every(c => isAbsent(c.attendanceStatus));



      if (isPresente) {

        backgroundColor = '#10B981'; // Verde (Presente)

        borderColor = '#047857';

      } else if (isAusente) {

        backgroundColor = '#EF4444'; // Rojo (Ausente)

        borderColor = '#B91C1C';

      }



      return {

        id: firstClass.id,

        title: title,

        start: `${firstClass.classDate}T${firstClass.startTime}`,

        allDay: false,

        extendedProps: {

          classGroup: group // Guardamos el grupo de clases para el click

        },

        backgroundColor,

        borderColor

      };

    });

  }, [scheduledClasses]);



  const handleEventClick = (clickInfo) => {

    if (onClassClick && clickInfo.event.extendedProps.classGroup) {

      onClassClick(clickInfo.event.extendedProps.classGroup);

    }

  };



  return (

    <div className="full-calendar-container bg-white p-4 rounded-xl shadow-lg border border-gray-200">

      <style>{`

        .fc-event { font-size: 0.75rem; padding: 2px 4px; }

        .fc-daygrid-day.fc-day-today { background-color: #fef2f2 !important; }

        .fc-toolbar-title { font-size: 1.25rem !important; }

        .fc-button { background-color: #4B5563 !important; border: none !important; }

        .fc-button-primary:hover { background-color: #1F2937 !important; }

        .fc-button-primary:disabled { background-color: #9CA3AF !important; }

      `}</style>

      <FullCalendar

        plugins={[dayGridPlugin, interactionPlugin]}

        initialView="dayGridMonth"

        locale="es"

        headerToolbar={{

          left: 'prev,next today',

          center: 'title',

          right: 'dayGridMonth,dayGridWeek'

        }}

        events={classEvents}

        eventClick={handleEventClick}

        height="auto"

        buttonText={{

          today: 'Hoy',

          month: 'Mes',

          week: 'Semana',

        }}

      />

    </div>

  );

};


