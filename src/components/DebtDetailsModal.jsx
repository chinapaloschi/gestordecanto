import { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Modal } from './Modal.jsx';
import { ModalHeader } from './Modal.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { IconBanknote } from './Icons.jsx';
import { formatMoneyAr } from '../utils/money.js';
import { daysOfWeekFull, formatDateToDDMMYYYY, mapClassTypeToSpanish } from '../utils/classHelpers.js';

export const DebtDetailsModal = ({ isOpen, onClose, student, db, appId, showMessage }) => {
  const [editedAmounts, setEditedAmounts] = useState({});
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    if (student?.unpaidItems) {
      const initialAmounts = {};
      student.unpaidItems.forEach(item => {
        initialAmounts[item.id] = item.price || item.amount || 0;
      });
      setEditedAmounts(initialAmounts);
    }
  }, [student]);

  const handleAmountChange = (id, newAmount) => {
    setEditedAmounts(prev => ({ ...prev, [id]: newAmount }));
  };

  const handleSaveAmount = async (item) => {
    setLoadingId(item.id);
    const newAmount = editedAmounts[item.id];

    if (isNaN(newAmount) || newAmount < 0) {
      showMessage('Por favor, ingresá un monto válido.', 'error');
      setLoadingId(null);
      return;
    }

    try {
      let docRef;
      let fieldToUpdate;

      if (item.type === 'package') {
        docRef = doc(db, `artifacts/${appId}/payments`, item.id);
        fieldToUpdate = 'amount';
      } else {
        docRef = doc(db, `artifacts/${appId}/scheduledClasses`, item.id);
        fieldToUpdate = 'price';
      }

      await updateDoc(docRef, { [fieldToUpdate]: newAmount });
      showMessage('Monto actualizado con éxito.', 'success');
    } catch (error) {
      console.error("Error updating amount:", error);
      showMessage(`Error al guardar: ${error.message}`, 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const getLabel = (item) => {
    if (item.type === 'package') {
      const [year, month] = (item.periodStartDate || '').split('-').map(Number);
      const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      const classTypeSpanish = mapClassTypeToSpanish(item.classType);
      const dayOfWeekLabel = daysOfWeekFull.find(d => d.value === String(item.dayOfWeek))?.label || '';
      return `Abono ${classTypeSpanish} (${dayOfWeekLabel} ${item.startTime}) - ${monthName || 'Fecha inválida'}`;
    } else if (item.type === 'flex_credit') {
      const [year, month] = (item.periodStartDate || '').split('-').map(Number);
      const monthName = year ? new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : '';
      return `Abono Flexible por clase (${item.clasesPagadas || 0}/${item.clasesTotal || 0} cobradas) - ${monthName || 'Fecha inválida'}`;
    } else {
      const classTypeSpanish = mapClassTypeToSpanish(item.studentType || item.classType);
      return `Clase ${classTypeSpanish} - ${formatDateToDDMMYYYY(item.classDate)} ${item.startTime}`;
    }
  };

  const totalDebt = student?.unpaidItems?.reduce((sum, item) => sum + (Number(editedAmounts[item.id]) || 0), 0) || 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="p-4 sm:p-6">
        <ModalHeader
          iconNode={<IconBanknote />}
          title="Detalle de Deuda"
          subtitle={`Alumno: ${student?.name}`}
        />

        <div className="mt-6 space-y-3 max-h-96 overflow-y-auto">
          {(student?.unpaidItems || []).length > 0 ? (
            student.unpaidItems.map(item => (
              <div key={item.id} className="p-3 bg-white rounded-lg border border-gray-200">
                <p className="text-sm font-semibold text-gray-800">{getLabel(item)}</p>
                {item.type === 'flex_credit' ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-gray-700">{formatMoneyAr(item.amount || 0)}</span>
                    <span className="text-[10px] text-gray-400">Se ajusta solo al registrar cobros desde la ficha del alumno</span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-grow">
                      <MoneyInput
                        value={editedAmounts[item.id] || 0}
                        onValueChange={(newAmount) => handleAmountChange(item.id, newAmount)}
                        className="w-full"
                      />
                    </div>
                    <button
                      onClick={() => handleSaveAmount(item)}
                      disabled={loadingId === item.id}
                      className="px-4 py-2 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
                    >
                      {loadingId === item.id ? '...' : 'Guardar'}
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-center text-sm text-gray-500 py-4">Este alumno no tiene deudas pendientes.</p>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
          <span className="text-base font-bold text-gray-800">Total:</span>
          <span className="text-xl font-bold text-rose-700">${formatMoneyAr(totalDebt)}</span>
        </div>
      </div>
    </Modal>
  );
};
