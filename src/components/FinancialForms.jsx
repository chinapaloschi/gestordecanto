import { useState, useEffect } from 'react';
import { collection as fsCollection, addDoc as fsAddDoc, doc, deleteDoc } from 'firebase/firestore';
import { MoneyInput } from './MoneyInput.jsx';
import { parseMoneyAr } from '../utils/money.js';

export const AddExtraIncomeForm = ({ db, userId, appId, showMessage, onClose }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedAmount = parseMoneyAr(amount);
    if (!date || !description.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      showMessage('Por favor, completa todos los campos con valores válidos.', 'error'); return;
    }
    if (!userId) { showMessage('Error: Usuario no autenticado.', 'error'); return; }
    setLoading(true);
    try {
      await fsAddDoc(fsCollection(db, `artifacts/${appId}/extraIncomes`), { date, description: description.trim(), amount: parsedAmount, recordedAt: new Date(), userId });
      showMessage('Ingreso extra añadido exitosamente!', 'success');
      onClose && onClose();
    } catch (e) {
      showMessage(`Error al añadir ingreso: ${e.message}`, 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-white p-6 rounded-lg sm:rounded-xl shadow-lg border border-gray-200">
      <h2 className="text-lg font-bold text-gray-800 mb-6">Añadir Ingreso Extra</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="incomeDate" className="block text-sm font-medium text-gray-700 mb-2">Fecha del Ingreso</label>
          <input type="date" id="incomeDate" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" required />
        </div>
        <div>
          <label htmlFor="incomeDescription" className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
          <input type="text" id="incomeDescription" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="Ej: Venta de equipo" required />
        </div>
        <div>
          <label htmlFor="incomeAmount" className="block text-sm font-medium text-gray-700 mb-2">Monto</label>
          <MoneyInput id="incomeAmount" value={amount} onValueChange={setAmount} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="0" required />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-100">Cancelar</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar Ingreso'}
          </button>
        </div>
      </form>
    </div>
  );
};

export const ManageExpenseCategoriesModal = ({ db, userId, appId, showMessage, onClose, expenseCategories, onCategoriesUpdate }) => {
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.trim()) { showMessage('El nombre de la categoría no puede estar vacío.', 'error'); return; }
    if (expenseCategories.find(cat => cat.name.toLowerCase() === newCategory.trim().toLowerCase())) {
      showMessage('Esa categoría ya existe.', 'error'); return;
    }
    setLoading(true);
    try {
      await fsAddDoc(fsCollection(db, `artifacts/${appId}/expenseCategories`), { name: newCategory.trim(), createdAt: new Date() });
      showMessage('Categoría añadida exitosamente!', 'success');
      setNewCategory('');
    } catch (error) {
      showMessage(`Error al añadir categoría: ${error.message}`, 'error');
    } finally { setLoading(false); }
  };

  const handleDeleteCategory = async (categoryId) => {
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/expenseCategories`, categoryId));
      showMessage('Categoría eliminada.', 'success');
    } catch (error) {
      showMessage(`Error al eliminar categoría: ${error.message}`, 'error');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg sm:rounded-xl shadow-lg border border-gray-200">
      <h2 className="text-sm sm:text-base sm:text-sm font-bold text-gray-800 mb-6">Gestionar Categorías de Egresos</h2>
      <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
        <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
          className="flex-grow p-4 border border-gray-300 rounded-lg focus:ring-rose-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          placeholder="Nueva categoría de gasto" />
        <button type="submit" className="px-4 sm:px-6 py-2 sm:py-3 bg-rose-600 text-white rounded-lg font-semibold hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2" disabled={loading}>
          {loading ? '...' : 'Añadir'}
        </button>
      </form>
      <ul className="space-y-2 max-h-60 overflow-y-auto">
        {expenseCategories.length > 0 ? expenseCategories.map(cat => (
          <li key={cat.id} className="flex justify-between items-center p-2 bg-gray-100 rounded-md">
            <span>{cat.name}</span>
            <button onClick={() => handleDeleteCategory(cat.id)} className="p-1 text-red-500 hover:text-red-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </li>
        )) : <p className="text-gray-500 text-sm">No hay categorías personalizadas.</p>}
      </ul>
    </div>
  );
};

export const AddExpenseForm = ({ db, userId, appId, showMessage, onClose, expenseCategories }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expenseCategories.length > 0 && !category) setCategory(expenseCategories[0].name);
  }, [expenseCategories, category]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedAmount = parseMoneyAr(amount);
    if (!date || isNaN(parsedAmount) || parsedAmount <= 0 || !category) {
      showMessage('Por favor, completa la fecha, categoría y un monto válido.', 'error'); return;
    }
    if (!userId) { showMessage('Error: Usuario no autenticado.', 'error'); return; }
    setLoading(true);
    try {
      await fsAddDoc(fsCollection(db, `artifacts/${appId}/expenses`), { date, description: description.trim(), amount: parsedAmount, category, recordedAt: new Date(), userId });
      showMessage('Egreso añadido exitosamente!', 'success');
      onClose && onClose();
    } catch (e) {
      showMessage(`Error al añadir egreso: ${e.message}`, 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-white p-6 rounded-lg sm:rounded-xl shadow-lg border border-gray-200">
      <h2 className="text-lg font-bold text-gray-800 mb-6">Añadir Nuevo Egreso</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="expenseDate" className="block text-sm font-medium text-gray-700 mb-2">Fecha del Egreso</label>
          <input type="date" id="expenseDate" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" required />
        </div>
        <div>
          <label htmlFor="expenseCategory" className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
          <select id="expenseCategory" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" required>
            {expenseCategories.length === 0
              ? <option disabled>No hay categorías</option>
              : expenseCategories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)
            }
          </select>
        </div>
        <div>
          <label htmlFor="expenseDescription" className="block text-sm font-medium text-gray-700 mb-2">Descripción (Opcional)</label>
          <input type="text" id="expenseDescription" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="Ej: Alquiler del estudio" />
        </div>
        <div>
          <label htmlFor="expenseAmount" className="block text-sm font-medium text-gray-700 mb-2">Monto</label>
          <MoneyInput id="expenseAmount" value={amount} onValueChange={setAmount} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="0" required />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-100">Cancelar</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar Egreso'}
          </button>
        </div>
      </form>
    </div>
  );
};
