import React from 'react';
import { doc, getDoc } from 'firebase/firestore';

export const PublicTicketView = ({ db }) => {
  const [ticket, setTicket] = React.useState(null);
  const [event, setEvent] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const eventId = params.get('e');
    const ticketId = params.get('t');
    const appId = params.get('a');

    if (!eventId || !ticketId || !appId || !db) {
      setError('Ticket inválido.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const ticketRef = doc(db, `artifacts/${appId}/events/${eventId}/tickets/${ticketId}`);
        const ticketSnap = await getDoc(ticketRef);
        if (!ticketSnap.exists()) { setError('Ticket no encontrado.'); setLoading(false); return; }

        const eventRef = doc(db, `artifacts/${appId}/events/${eventId}`);
        const eventSnap = await getDoc(eventRef);

        setTicket({ id: ticketSnap.id, ...ticketSnap.data() });
        setEvent(eventSnap.exists() ? { id: eventSnap.id, ...eventSnap.data() } : null);
      } catch (e) {
        setError('Error al cargar el ticket.');
      } finally {
        setLoading(false);
      }
    })();
  }, [db]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-600">Cargando ticket...</p></div>;
  if (error) return <div className="min-h-screen flex items-center justify-center"><p className="text-red-600">{error}</p></div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-rose-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <img src="/nuevologo.gif" alt="Logo" className="h-20 w-auto mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">{event?.title || 'Evento'}</h1>
        {event?.date && <p className="text-gray-600 mb-1">{event.date} {event.startTime && `· ${event.startTime} hs`}</p>}
        {event?.location && <p className="text-gray-500 text-sm mb-4">{event.location}</p>}
        <div className="border-t pt-4">
          <p className="text-sm text-gray-500">Titular</p>
          <p className="font-semibold text-gray-900">{ticket?.studentName || ticket?.name || '—'}</p>
          {ticket?.seatNumber && <p className="text-sm text-gray-600 mt-1">Asiento: {ticket.seatNumber}</p>}
        </div>
        <p className="mt-4 text-xs text-gray-400">ID: {ticket?.id}</p>
      </div>
    </div>
  );
};
