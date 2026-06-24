import React from 'react';
import { doc, addDoc as fsAddDoc, collection as fsCollection, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Modal } from './Modal.jsx';
import { ModalHeader } from './Modal.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { IconMic } from './Icons.jsx';

export const EventModal = ({ isOpen, onClose, db, appId, userId, students = [], showMessage, eventToEdit = null }) => {
  const [title, setTitle] = React.useState('');
  const [date, setDate] = React.useState('');
  const [startTime, setStartTime] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [price, setPrice] = React.useState(0);
  const [totalTickets, setTotalTickets] = React.useState(0);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  const [loading, setLoading] = React.useState(false);

  const isEditing = !!eventToEdit?.id;

  React.useEffect(() => {
    if (isOpen) {
      if (isEditing) {
        setTitle(eventToEdit.title || '');
        setDate(eventToEdit.date || '');
        setStartTime(eventToEdit.startTime || '');
        setLocation(eventToEdit.location || '');
        setNotes(eventToEdit.notes || '');
        setPrice(eventToEdit.price || 0);
        setTotalTickets(eventToEdit.totalTickets || 0);
        const participantIds = new Set((eventToEdit.participants || []).map(p => p.id || p.studentId));
        setSelectedIds(participantIds);
      } else {
        setTitle(''); setDate(''); setStartTime(''); setLocation('');
        setNotes(''); setPrice(0); setTotalTickets(280); setSelectedIds(new Set());
      }
    }
  }, [isOpen, eventToEdit, isEditing]);

  const toggleParticipant = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !date || !startTime) {
      showMessage('Completá título, fecha y hora.', 'error');
      return;
    }
    setLoading(true);
    try {
      const participants = students
        .filter(s => selectedIds.has(s.id))
        .map(s => {
          const existing = isEditing ? (eventToEdit.participants || []).find(p => (p.id || p.studentId) === s.id) : null;
          return existing || { id: s.id, name: s.name, ticketsDelivered: 0, ticketsSold: 0, paid: false };
        });

      const eventData = {
        title, price: Number(price) || 0, totalTickets: Number(totalTickets) || 0,
        date, startTime, location, notes, participants,
        participantsCount: participants.length,
        userId
      };

      if (isEditing) {
        const eventRef = doc(db, `artifacts/${appId}/events`, eventToEdit.id);
        await updateDoc(eventRef, eventData);
        showMessage('¡Muestra actualizada con éxito!', 'success');
      } else {
        await fsAddDoc(fsCollection(db, `artifacts/${appId}/events`), {
          ...eventData,
          lastTicketNumberIssued: 0,
          createdAt: serverTimestamp(),
        });
        showMessage('¡Muestra creada con éxito!', 'success');
      }
      onClose();
    } catch (err) {
      console.error('Error guardando evento:', err);
      showMessage(`Error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(s =>
    (s.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <Modal size="xl" isOpen={isOpen} onClose={onClose}>
      <ModalHeader iconNode={<IconMic />} title={isEditing ? "Editar muestra" : "Crear muestra"} subtitle="Función, recital o presentación con entradas" />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título de la muestra</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hora de Inicio</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" required />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lugar</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio de Entrada ($)</label>
            <MoneyInput value={price} onValueChange={setPrice} className="w-full p-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total de Entradas</label>
            <input type="number" value={totalTickets} onChange={(e) => setTotalTickets(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="Ej: 280" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas Adicionales</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows="3" className="w-full p-2 border border-gray-300 rounded-lg"></textarea>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Participantes ({selectedIds.size})</label>
          <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar alumno para agregar..." className="w-full p-2 border border-gray-300 rounded-lg mb-2" />
          <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
            {filteredStudents.map(s => (
              <label key={s.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleParticipant(s.id)} className="h-4 w-4 rounded text-rose-600 focus:ring-rose-500" />
                <span>{s.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="pt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 font-semibold hover:bg-gray-100 transition">Cancelar</button>
          <button type="submit" className="px-6 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-sm transition disabled:opacity-50" disabled={loading}>
            {loading ? 'Guardando...' : (isEditing ? 'Guardar cambios' : 'Crear muestra')}
          </button>
        </div>
      </form>
    </Modal>
  );
};
