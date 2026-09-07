import React, { useState, useEffect, useMemo } from 'react';
import {
  collection as fsCollection, addDoc as fsAddDoc, doc, getDoc, setDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { Modal } from './Modal.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { IconTrash } from './Icons.jsx';
import { formatMoneyAr, parseMoneyAr } from '../utils/money.js';
import { formatDateToDDMMYYYY } from '../utils/classHelpers.js';
import { getLocalToday } from '../utils/dateHelpers.js';

// Servicios fijos (luz, gas, teléfono, cable, etc.) — la plantilla vive en su
// propia colección y se mantiene mes a mes; "pagado este mes" no es un campo
// propio, se deriva de si existe un egreso (artifacts/{appId}/expenses) con
// fixedPaymentTemplateId apuntando a esta plantilla y fecha del mes en curso.
// Así el pago cuenta para el total de Egresos como cualquier otro gasto, sin
// cargarlo dos veces.
export function FixedPaymentsPanel({ db, appId, userId, showMessage, expenses = [] }) {
  const [templates, setTemplates] = useState([]);
  const [notifyDay, setNotifyDay] = useState(10);
  const [notifyDayInput, setNotifyDayInput] = useState('10');
  const [savingDay, setSavingDay] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  const [payingId, setPayingId] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => getLocalToday());
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    if (!db || !appId) return;
    const q = query(fsCollection(db, `artifacts/${appId}/fixedPayments`), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return unsub;
  }, [db, appId]);

  useEffect(() => {
    if (!db || !appId) return;
    getDoc(doc(db, `artifacts/${appId}/fixedPaymentSettings/config`)).then(snap => {
      const v = snap.exists() ? (Number(snap.data()?.notifyDay) || 10) : 10;
      setNotifyDay(v);
      setNotifyDayInput(String(v));
    }).catch(() => {});
  }, [db, appId]);

  const periodKey = useMemo(() => getLocalToday().slice(0, 7), []);
  const periodLabel = useMemo(() => {
    const [y, m] = periodKey.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  }, [periodKey]);

  // Último egreso de este período por plantilla (si hay más de uno, el más
  // reciente gana — no debería pasar en uso normal, pero no hay que crashear).
  const paidMap = useMemo(() => {
    const map = {};
    (expenses || []).forEach(e => {
      if (!e.fixedPaymentTemplateId) return;
      const ymd = typeof e.date === 'string' ? e.date : '';
      if (ymd.slice(0, 7) !== periodKey) return;
      const prev = map[e.fixedPaymentTemplateId];
      if (!prev || ymd > prev.date) map[e.fixedPaymentTemplateId] = e;
    });
    return map;
  }, [expenses, periodKey]);

  const activeTemplates = templates.filter(t => t.isActive !== false);

  const saveNotifyDay = async () => {
    const n = parseInt(notifyDayInput, 10);
    if (!n || n < 1 || n > 28) { showMessage('Ingresá un día válido (1 a 28).', 'error'); return; }
    setSavingDay(true);
    try {
      await setDoc(doc(db, `artifacts/${appId}/fixedPaymentSettings/config`), { notifyDay: n }, { merge: true });
      setNotifyDay(n);
      showMessage('Día de aviso actualizado.', 'success');
    } catch (e) {
      showMessage('Error: ' + e.message, 'error');
    } finally { setSavingDay(false); }
  };

  const addTemplate = async () => {
    const name = newName.trim();
    if (!name) return;
    setAddBusy(true);
    try {
      const maxOrder = templates.reduce((m, t) => Math.max(m, t.order || 0), 0);
      await fsAddDoc(fsCollection(db, `artifacts/${appId}/fixedPayments`), {
        name, isActive: true, order: maxOrder + 1, createdAt: serverTimestamp(),
      });
      setNewName('');
      setShowAddModal(false);
    } catch (e) {
      showMessage('Error: ' + e.message, 'error');
    } finally { setAddBusy(false); }
  };

  const deactivateTemplate = async (t) => {
    if (!window.confirm(`¿Dejar de rastrear "${t.name}"? Los egresos ya cargados no se borran.`)) return;
    try {
      await updateDoc(doc(db, `artifacts/${appId}/fixedPayments`, t.id), { isActive: false });
    } catch (e) { showMessage('Error: ' + e.message, 'error'); }
  };

  const openPayForm = (t) => {
    setPayingId(t.id);
    setPayAmount('');
    setPayDate(getLocalToday());
  };

  const confirmPay = async (t) => {
    const amount = parseMoneyAr(payAmount);
    if (!amount || isNaN(amount) || amount <= 0) { showMessage('Ingresá un monto válido.', 'error'); return; }
    if (!userId) { showMessage('Error: Usuario no autenticado.', 'error'); return; }
    setPayBusy(true);
    try {
      await fsAddDoc(fsCollection(db, `artifacts/${appId}/expenses`), {
        date: payDate,
        description: t.name,
        amount,
        category: 'Servicios Fijos',
        recordedAt: new Date(),
        userId,
        fixedPaymentTemplateId: t.id,
      });
      showMessage(`${t.name} marcado como pagado.`, 'success');
      setPayingId(null);
    } catch (e) {
      showMessage('Error: ' + e.message, 'error');
    } finally { setPayBusy(false); }
  };

  const undoPay = async (record) => {
    if (!window.confirm(`¿Marcar "${record.description}" como no pagado? Se borra el egreso registrado (${formatMoneyAr(record.amount)}).`)) return;
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/expenses`, record.id));
    } catch (e) { showMessage('Error: ' + e.message, 'error'); }
  };

  return (
    <div className="space-y-4">
      {/* Config: día de aviso */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-2 flex-wrap text-sm">
        <span className="text-gray-600">Avisarme si un servicio sigue sin pagar a partir del día</span>
        <input type="number" min="1" max="28" value={notifyDayInput}
          onChange={e => setNotifyDayInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
          className="w-14 px-2 py-1.5 border border-gray-300 rounded-lg text-center font-bold" />
        <span className="text-gray-600">del mes.</span>
        {notifyDayInput !== String(notifyDay) && notifyDayInput !== '' && (
          <button onClick={saveNotifyDay} disabled={savingDay}
            className="px-3 py-1.5 text-xs font-bold bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50">
            {savingDay ? 'Guardando...' : 'Guardar'}
          </button>
        )}
      </div>

      {/* Grid de servicios */}
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-gray-800 text-sm capitalize">Servicios fijos — {periodLabel}</h4>
        <button onClick={() => setShowAddModal(true)}
          className="px-3 py-2 text-xs font-bold bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition">
          + Servicio
        </button>
      </div>

      {activeTemplates.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-100">
          <div className="text-3xl mb-2">💡</div>
          <p className="font-medium text-sm">Todavía no agregaste ningún servicio fijo.</p>
          <p className="text-xs mt-1">Luz, gas, teléfono, celular, cable...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeTemplates.map(t => {
            const paidRecord = paidMap[t.id];
            const isPaid = !!paidRecord;
            const isPaying = payingId === t.id;
            return (
              <div key={t.id} className={`rounded-xl border p-4 transition-colors ${isPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-bold text-gray-900 text-sm">{t.name}</span>
                  <button onClick={() => deactivateTemplate(t)} title="Dejar de rastrear este servicio"
                    className="text-gray-300 hover:text-rose-500 transition flex-shrink-0">
                    <IconTrash />
                  </button>
                </div>

                {isPaid ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-emerald-700 font-black text-sm">✓ Pagado</p>
                      <p className="text-[11px] text-emerald-600 truncate">{formatMoneyAr(paidRecord.amount)} · {formatDateToDDMMYYYY(paidRecord.date)}</p>
                    </div>
                    <button onClick={() => undoPay(paidRecord)}
                      className="text-[11px] text-gray-400 hover:text-rose-500 underline flex-shrink-0">
                      Deshacer
                    </button>
                  </div>
                ) : isPaying ? (
                  <div className="space-y-2">
                    <MoneyInput value={payAmount} onValueChange={setPayAmount} placeholder="Monto pagado"
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm" autoFocus />
                    <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm" />
                    <div className="flex gap-2">
                      <button onClick={() => setPayingId(null)}
                        className="flex-1 py-2 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition">
                        Cancelar
                      </button>
                      <button onClick={() => confirmPay(t)} disabled={payBusy}
                        className="flex-1 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition">
                        {payBusy ? '...' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => openPayForm(t)}
                    className="w-full py-2 text-xs font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg transition">
                    ✗ Sin pagar — marcar pagado
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Nuevo servicio fijo" size="sm">
        <div className="space-y-4">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTemplate()}
            placeholder="Ej: Luz, Gas, Internet..."
            className="w-full p-2 border border-gray-300 rounded-lg" autoFocus />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={addTemplate} disabled={addBusy || !newName.trim()}
              className="px-4 py-2 rounded-lg bg-gray-800 text-white font-semibold hover:bg-gray-900 disabled:opacity-50">
              {addBusy ? 'Agregando...' : 'Agregar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
