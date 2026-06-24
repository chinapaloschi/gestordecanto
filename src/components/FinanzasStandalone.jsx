import React, { useState, useEffect, useCallback } from 'react';
import { collection as fsCollection, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { db, auth } from '../firebaseConfig.js';
import { FinancialManagementModal } from './FinancialManagementModal.jsx';

// Versión instalable como PWA aparte (#/finanzas) de la sección "Gestión Financiera".
// Misma data y lógica que el modal del panel principal, pero a pantalla completa
// y con sus propios listeners — así se puede abrir como app independiente sin
// cargar el resto del panel admin.
export function FinanzasStandalone({ appId }) {
  const [userId, setUserId] = useState(null);
  const [students, setStudents] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [extraIncomes, setExtraIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [message, setMessage] = useState({ text: '', type: 'info' });

  const showMessage = useCallback((text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: 'info' }), 5000);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setUserId(user?.uid || null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!db || !appId) return;
    const collectionListeners = [
      { name: 'students', setter: setStudents },
      { name: 'payments', setter: setAllPayments },
      { name: 'extraIncomes', setter: setExtraIncomes },
      { name: 'expenses', setter: setExpenses },
      { name: 'expenseCategories', setter: setExpenseCategories },
    ];
    const unsubscribers = collectionListeners.map(({ name, setter }) => {
      const collectionRef = fsCollection(db, `artifacts/${appId}/${name}`);
      return onSnapshot(collectionRef, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (name === 'expenseCategories') data.sort((a, b) => a.name.localeCompare(b.name));
        setter(data);
      }, (error) => {
        console.error(`Error al obtener ${name}:`, error);
        showMessage(`Error al cargar ${name}: ${error.message}`, 'error');
      });
    });
    return () => unsubscribers.forEach(unsub => unsub());
  }, [appId, showMessage]);

  const handleSignOut = async () => {
    try { await signOut(auth); } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="fixed top-2 right-2 z-[100]">
        <button onClick={handleSignOut}
          className="px-3 py-1.5 text-sm font-semibold bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition">
          Salir
        </button>
      </div>

      {message.text && (
        <div className={`fixed top-2 left-2 right-16 sm:right-auto sm:max-w-sm z-[100] px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg
          ${message.type === 'error' ? 'bg-red-100 text-red-700' : message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          {message.text}
        </div>
      )}

      <FinancialManagementModal
        isOpen={true}
        onClose={handleSignOut}
        allPayments={allPayments}
        extraIncomes={extraIncomes}
        expenses={expenses}
        students={students}
        db={db}
        userId={userId}
        appId={appId}
        showMessage={showMessage}
        expenseCategories={expenseCategories}
      />
    </div>
  );
}
