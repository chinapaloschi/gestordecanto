import { Modal, ModalHeader } from './Modal.jsx';
import { IconCalendar } from './Icons.jsx';

export const CalendarShell = ({ children }) => (
  <div className="w-full">
    {children}
  </div>
);

export const MoveConfirmationModal = ({ isOpen, onClose, onConfirmSingle, onConfirmPackage, isPackage, classData, targetDate, targetTime }) => {
  if (!isOpen) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="p-4">
        <ModalHeader iconNode={<IconCalendar />} title="Reprogramar Clase" subtitle="Se detectó un movimiento en el calendario" />
        <div className="mt-4 text-sm text-gray-600">
          <p>Estás moviendo la clase de <b>{classData?.studentName}</b> al:</p>
          <p className="font-bold text-gray-900 mt-1 mb-3">{targetDate} a las {targetTime} hs</p>
          {isPackage
            ? <p className="mb-4">Esta clase pertenece a un <b>Abono Mensual</b>. ¿Qué deseas hacer?</p>
            : <p className="mb-4">¿Confirmas el cambio de horario para esta clase única?</p>
          }
        </div>
        <div className="flex flex-col gap-2 mt-4">
          <button onClick={onConfirmSingle} className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm text-sm">
            Mover SOLO esta clase
          </button>
          {isPackage && (
            <button onClick={onConfirmPackage} className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold shadow-sm text-sm flex flex-col items-center">
              <span>Mover TODO el paquete</span>
              <span className="text-[10px] font-normal opacity-90">(Esta y todas las futuras)</span>
            </button>
          )}
          <button onClick={onClose} className="w-full py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium text-sm mt-2">Cancelar</button>
        </div>
      </div>
    </Modal>
  );
};
