import React, { useState, useEffect } from 'react';
import { doc, writeBatch, collection as fsCollection, addDoc as fsAddDoc } from 'firebase/firestore';
import { toLocalYYYYMMDD } from '../utils/dateHelpers.js';
import { MoneyInput } from './MoneyInput.jsx';
import { FacturaModal } from './FacturaModal.jsx';
import { PostPaymentActionsModal } from './PostPaymentActionsModal.jsx';
import { formatMoneyAr } from '../utils/money.js';
import { formatDateToDDMMYYYY, mapClassTypeToSpanish } from '../utils/classHelpers.js';

const PAYMENT_METHODS = [
  { id: 'efectivo',      label: 'Efectivo',      icon: '💵' },
  { id: 'transferencia', label: 'Transferencia',  icon: '🏦' },
  { id: 'mercadopago',   label: 'MercadoPago',   icon: '📱' },
];

export const MarkPaymentForm = ({
  db, userId, appId, showMessage, onClose,
  initialSelectedStudent, scheduledClasses, allPayments, initialPaymentId,
}) => {
  const [amount,              setAmount]              = useState('');
  const [originalAmount,      setOriginalAmount]      = useState(0);
  const [paymentDate,         setPaymentDate]         = useState(new Date().toISOString().split('T')[0]);
  const [selectedItemToPay,   setSelectedItemToPay]   = useState('');
  const [paymentMethod,       setPaymentMethod]       = useState('transferencia');
  const [loading,             setLoading]             = useState(false);
  const [itemsToPayForStudent, setItemsToPayForStudent] = useState([]);
  const [showPostPaymentActions, setShowPostPaymentActions] = useState(false);
  const [paymentDataForActions,  setPaymentDataForActions]  = useState(null);
  const [showFactura,            setShowFactura]            = useState(false);

  // ── Abono Flexible ────────────────────────────────────────────────────────
  const [showFlexForm,  setShowFlexForm]  = useState(false);
  const [flexAmount,    setFlexAmount]    = useState('');
  const [flexClases,    setFlexClases]    = useState('4');
  const [flexPayMethod, setFlexPayMethod] = useState('transferencia');
  const [flexCobroMode, setFlexCobroMode] = useState('adelantado'); // 'adelantado' | 'por_clase'
  const [flexLoading,   setFlexLoading]   = useState(false);

  const handleCreateFlexCredit = async () => {
    const amt = Number(String(flexAmount).replace(/\./g,'').replace(',','.'));
    const cls = parseInt(flexClases) || 0;
    if (!amt || amt <= 0)  { showMessage('Ingresá un monto válido.', 'error'); return; }
    if (!cls || cls <= 0)  { showMessage('Ingresá la cantidad de clases.', 'error'); return; }
    if (!userId)           { showMessage('Error de autenticación.', 'error'); return; }
    setFlexLoading(true);
    try {
      const now      = new Date();
      const start    = new Date(now.getFullYear(), now.getMonth(), 1);
      const porClase = flexCobroMode === 'por_clase';
      await fsAddDoc(fsCollection(db, `artifacts/${appId}/payments`), {
        studentId:           student.id,
        studentName:         student.name,
        paymentMethod:       'abono_flexible',
        paymentMethodType:   flexPayMethod,
        amount:              amt,
        clasesTotal:         cls,
        clasesUsadas:        0,
        isPaidForPackage:    false,
        periodStartDate:     toLocalYYYYMMDD(start),
        ...(porClase ? { cobroPorClase: true, montoPorClase: Math.round(amt / cls), clasesPagadas: 0 } : {}),
        createdAt:           now,
        userId,
      });
      showMessage(porClase
        ? `✅ Abono Flexible creado: ${cls} clases. Quedó como deuda — la vas a poder cobrar clase por clase desde la ficha del alumno.`
        : `✅ Abono Flexible creado: ${cls} clases. Quedó como deuda hasta que marqués el pago completo desde "Marcar Pago".`, 'success');
      setShowFlexForm(false);
      setPaymentDataForActions({ alumno: student.name, fecha: formatDateToDDMMYYYY(toLocalYYYYMMDD(now)), concepto: `Abono Flexible – ${cls} clases`, monto: formatMoneyAr(amt) });
      setShowPostPaymentActions(true);
    } catch (e) {
      showMessage('Error: ' + e.message, 'error');
    } finally { setFlexLoading(false); }
  };

  const __getNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const __getBaseAmountFromItem = (it) =>
    __getNumber(it?.data?.amount ?? it?.data?.price ?? it?.amount ?? it?.price ?? 0);

  const totalConRecargo = React.useMemo(() => {
    const item = itemsToPayForStudent.find(it => it.id === selectedItemToPay);
    const totalBase = item ? __getBaseAmountFromItem(item) : 0;
    const dd = Number(String(paymentDate || '').split('-')[2] || '1');
    const aplicaRecargo = dd > 8;
    const totalHoy = aplicaRecargo ? Math.round(totalBase * 1.1) : totalBase;
    return { totalHoy, aplicaRecargo, totalBase, recargo: totalHoy - totalBase };
  }, [itemsToPayForStudent, selectedItemToPay, paymentDate]);

  const calculateAndSetAmount = (baseAmount, dateString) => {
    let amt = Number(baseAmount) || 0;
    if (dateString) {
      const day = Number(String(dateString).split('-')[2] || '1');
      if (day > 8) amt = amt * 1.10;
    }
    setAmount(Math.round(amt));
  };

  useEffect(() => {
    if (!initialSelectedStudent || !scheduledClasses || !allPayments) return;
    const studentId = initialSelectedStudent.id;
    const items = [];
    scheduledClasses
      .filter(cls => cls.studentId === studentId && !cls.isPaid && cls.scheduleType === 'single')
      .forEach(cls => items.push({
        id: cls.id, type: 'single_class',
        label: `${formatDateToDDMMYYYY(cls.classDate)} ${cls.startTime} · ${mapClassTypeToSpanish(cls.studentType)} (${cls.duration} min)`,
        data: cls,
      }));
    allPayments
      .filter(mp => mp.studentId === studentId && !mp.isPaidForPackage && mp.paymentMethod === 'monthly_package_payment')
      .forEach(mp => {
        const [year, month] = mp.periodStartDate.split('-').map(Number);
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        items.push({ id: mp.id, type: 'monthly_package', label: `Abono Mensual — ${monthName}`, data: mp });
      });
    allPayments
      .filter(mp => mp.studentId === studentId && !mp.isPaidForPackage && mp.paymentMethod === 'abono_flexible' && !mp.cobroPorClase)
      .forEach(mp => {
        const [year, month] = mp.periodStartDate.split('-').map(Number);
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        items.push({ id: mp.id, type: 'flex_credit', label: `Abono Flexible — ${monthName} (${mp.clasesTotal || 0} clases)`, data: mp });
      });
    items.sort((a, b) => (a.data.classDate || a.data.periodStartDate).localeCompare(b.data.classDate || b.data.periodStartDate));
    setItemsToPayForStudent(items);

    const itemToSelect = initialPaymentId ? items.find(item => item.id === initialPaymentId) : items[0];
    if (itemToSelect) {
      setSelectedItemToPay(itemToSelect.id);
      const baseAmt = __getBaseAmountFromItem(itemToSelect);
      setOriginalAmount(baseAmt);
      calculateAndSetAmount(baseAmt, new Date().toISOString().split('T')[0]);
    } else {
      setSelectedItemToPay(''); setAmount(''); setOriginalAmount(0);
    }
    setPaymentDate(new Date().toISOString().split('T')[0]);
  }, [initialSelectedStudent, scheduledClasses, allPayments, initialPaymentId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const selectedItem = itemsToPayForStudent.find(item => item.id === selectedItemToPay);
      const parsedAmount = Number(amount);
      const paymentDateObj = new Date(paymentDate + 'T12:00:00');
      const batch = writeBatch(db);

      if (selectedItem.type === 'single_class') {
        batch.update(doc(db, `artifacts/${appId}/scheduledClasses`, selectedItem.id), {
          isPaid: true, price: parsedAmount, paymentMethod,
        });
      } else if (selectedItem.type === 'monthly_package') {
        batch.update(doc(db, `artifacts/${appId}/payments`, selectedItem.id), {
          isPaidForPackage: true, paymentDate: paymentDateObj, amount: parsedAmount,
          paidAt: paymentDateObj, status: 'paid', updatedAt: new Date(), paymentMethod,
        });
        for (const classId of selectedItem.data.associatedClassIds) {
          batch.update(doc(db, `artifacts/${appId}/scheduledClasses`, classId), { isPaid: true });
        }
      } else if (selectedItem.type === 'flex_credit') {
        batch.update(doc(db, `artifacts/${appId}/payments`, selectedItem.id), {
          isPaidForPackage: true, paymentDate: paymentDateObj, amount: parsedAmount,
          paidAt: paymentDateObj, status: 'paid', updatedAt: new Date(),
          paymentMethod: 'abono_flexible',
          paidVia: paymentMethod,
        });
      }
      await batch.commit();
      showMessage('¡Pago marcado exitosamente!', 'success');
      setPaymentDataForActions({
        alumno: initialSelectedStudent.name,
        fecha: formatDateToDDMMYYYY(paymentDate),
        concepto: selectedItem.label,
        monto: formatMoneyAr(parsedAmount),
        metodoPago: PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label || paymentMethod,
        whatsapp: (initialSelectedStudent.whatsapp || initialSelectedStudent.contactInfo || '').replace(/\D/g, ''),
      });
      setShowPostPaymentActions(true);
    } catch (err) {
      console.error('Error marking payment:', err);
      showMessage(`Error al marcar el pago: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const student = initialSelectedStudent;
  const initials = (student?.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const debt = student?.pendingBalanceWithSurcharge || student?.pendingBalance || 0;
  const hasItems = itemsToPayForStudent.length > 0;

  return (
    <>
      <div className="bg-white rounded-xl overflow-hidden">

        {/* ── HEADER con info del alumno ── */}
        <div className="bg-gradient-to-r from-teal-700 to-teal-500 px-5 py-5">
          <div className="flex items-center gap-4">
            {/* Foto */}
            <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-white/30 shadow-lg">
              {student?.photoURL ? (
                <img src={student.photoURL} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-white/20 flex items-center justify-center text-xl font-black text-white">
                  {initials}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-black text-lg uppercase leading-tight truncate">{student?.name}</h2>
              {debt > 0 ? (
                <span className="inline-block text-xs font-bold text-teal-100 bg-white/20 px-2 py-0.5 rounded-full mt-0.5">
                  Debe {formatMoneyAr(debt)}
                </span>
              ) : (
                <span className="inline-block text-xs font-bold text-teal-100 mt-0.5">✅ Al día</span>
              )}
            </div>
          </div>

          {/* Alerta de recargo */}
          {totalConRecargo.aplicaRecargo && totalConRecargo.totalBase > 0 && (
            <div className="mt-3 flex items-center gap-2 bg-amber-400/30 border border-amber-300/50 rounded-xl px-3 py-2">
              <span className="text-amber-200 text-lg">⚠️</span>
              <div>
                <p className="text-amber-100 text-xs font-bold">Se aplica recargo del 10%</p>
                <p className="text-amber-200 text-[10px]">El pago es después del día 8 del mes</p>
              </div>
              <span className="ml-auto text-amber-100 font-black text-sm">+{formatMoneyAr(totalConRecargo.recargo)}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Elemento a pagar */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              Elemento a pagar
            </label>
            {hasItems ? (
              <select value={selectedItemToPay}
                onChange={e => {
                  const selected = itemsToPayForStudent.find(item => item.id === e.target.value);
                  setSelectedItemToPay(e.target.value);
                  if (selected) {
                    const baseAmt = __getBaseAmountFromItem(selected);
                    setOriginalAmount(baseAmt);
                    calculateAndSetAmount(baseAmt, paymentDate);
                  }
                }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 transition bg-white"
                required>
                {itemsToPayForStudent.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            ) : (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm text-gray-500 text-center">
                Sin clases o paquetes pendientes de pago
              </div>
            )}
          </div>

          {hasItems && (
            <>
              {/* Fecha */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Fecha del pago
                </label>
                <input type="date" value={paymentDate}
                  onChange={e => { setPaymentDate(e.target.value); calculateAndSetAmount(originalAmount, e.target.value); }}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 transition"
                  required />
              </div>

              {/* Monto + botones rápidos */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Monto del pago
                </label>
                <MoneyInput value={amount} onValueChange={setAmount}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 transition"
                  placeholder="0" required />

                {/* Botones de monto rápido */}
                {totalConRecargo.totalBase > 0 && (
                  <div className="flex gap-2 mt-2">
                    <button type="button"
                      onClick={() => setAmount(totalConRecargo.totalBase)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition border
                        ${Number(amount) === totalConRecargo.totalBase
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-teal-400'}`}>
                      {formatMoneyAr(totalConRecargo.totalBase)}
                      <span className="block text-[9px] font-normal opacity-70">sin recargo</span>
                    </button>
                    {totalConRecargo.aplicaRecargo && (
                      <button type="button"
                        onClick={() => setAmount(totalConRecargo.totalHoy)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition border
                          ${Number(amount) === totalConRecargo.totalHoy
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400'}`}>
                        {formatMoneyAr(totalConRecargo.totalHoy)}
                        <span className="block text-[9px] font-normal opacity-70">con +10%</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Método de pago */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  Método de pago
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.id} type="button" onClick={() => setPaymentMethod(m.id)}
                      className={`py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition border
                        ${paymentMethod === m.id
                          ? 'bg-teal-600 text-white border-teal-600 shadow-md'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-teal-300'}`}>
                      <span className="text-base">{m.icon}</span>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resumen */}
              <div className={`p-3 rounded-xl border text-sm ${totalConRecargo.aplicaRecargo ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-100'}`}>
                <div className="flex justify-between items-center text-gray-600">
                  <span>Monto base</span>
                  <span className="font-semibold">{formatMoneyAr(totalConRecargo.totalBase)}</span>
                </div>
                {totalConRecargo.aplicaRecargo && (
                  <div className="flex justify-between items-center mt-1 text-amber-700">
                    <span>Recargo +10%</span>
                    <span className="font-semibold">+{formatMoneyAr(totalConRecargo.recargo)}</span>
                  </div>
                )}
                <div className={`flex justify-between items-center mt-2 pt-2 border-t font-black text-base ${totalConRecargo.aplicaRecargo ? 'border-amber-200 text-amber-800' : 'border-teal-200 text-teal-800'}`}>
                  <span>Total a cobrar</span>
                  <span>{formatMoneyAr(totalConRecargo.totalHoy)}</span>
                </div>
              </div>

              {/* Botón emitir factura */}
              <button type="button" onClick={() => setShowFactura(true)}
                className="w-full py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-sm font-bold transition flex items-center justify-center gap-2">
                🧾 Emitir Factura C (AFIP)
              </button>

              {/* Separador */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-200"/>
                <span className="text-xs text-gray-400">o</span>
                <div className="flex-1 h-px bg-gray-200"/>
              </div>

              {/* Botón Abono Flexible */}
              <button type="button" onClick={() => setShowFlexForm(p => !p)}
                className={`w-full py-2.5 rounded-xl border text-sm font-bold transition flex items-center justify-center gap-2
                  ${showFlexForm ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-700'}`}>
                🎫 {showFlexForm ? 'Cancelar Abono Flexible' : 'Crear Abono Flexible (sin horario fijo)'}
              </button>

              {/* Formulario Abono Flexible */}
              {showFlexForm && (
                <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-2xl mt-0.5">🎫</span>
                    <div>
                      <p className="font-bold text-violet-900 text-sm">Abono Flexible</p>
                      <p className="text-xs text-violet-600">El alumno paga el mes pero las clases se agendan semana a semana según disponibilidad.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-violet-600 uppercase tracking-widest mb-1">Monto</label>
                      <MoneyInput value={flexAmount} onValueChange={v => setFlexAmount(String(v))}
                        className="w-full px-3 py-2.5 border border-violet-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" placeholder="0"/>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-violet-600 uppercase tracking-widest mb-1">Clases incluidas</label>
                      <select value={flexClases} onChange={e => setFlexClases(e.target.value)}
                        className="w-full px-3 py-2.5 border border-violet-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white">
                        {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} clase{n > 1 ? 's' : ''}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Forma de cobro */}
                  <div>
                    <label className="block text-[10px] font-bold text-violet-600 uppercase tracking-widest mb-1">¿Cómo te lo va a pagar?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setFlexCobroMode('adelantado')}
                        className={`p-2.5 rounded-xl text-left border transition
                          ${flexCobroMode === 'adelantado' ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-violet-200 text-gray-600 hover:border-violet-300'}`}>
                        <p className="text-xs font-bold">💰 Todo junto</p>
                        <p className={`text-[10px] ${flexCobroMode === 'adelantado' ? 'text-violet-100' : 'text-gray-400'}`}>Te paga el total de una sola vez</p>
                      </button>
                      <button type="button" onClick={() => setFlexCobroMode('por_clase')}
                        className={`p-2.5 rounded-xl text-left border transition
                          ${flexCobroMode === 'por_clase' ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-violet-200 text-gray-600 hover:border-violet-300'}`}>
                        <p className="text-xs font-bold">📅 Por clase</p>
                        <p className={`text-[10px] ${flexCobroMode === 'por_clase' ? 'text-violet-100' : 'text-gray-400'}`}>Te va pagando clase a clase</p>
                      </button>
                    </div>
                    <p className="mt-1.5 text-[10px] text-violet-600 bg-white border border-violet-200 rounded-lg px-2.5 py-1.5">
                      {flexCobroMode === 'por_clase'
                        ? <>El abono queda como <strong>deuda pendiente</strong> y vas a poder <strong>registrar el cobro de cada clase</strong> desde la ficha del alumno a medida que te paga.</>
                        : <>El abono queda como <strong>deuda pendiente</strong> hasta que confirmes que te pagó el total — ahí lo marcás como cobrado desde <strong>"Marcar Pago"</strong>.</>}
                    </p>
                  </div>

                  {/* Método de pago */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {PAYMENT_METHODS.map(m => (
                      <button key={m.id} type="button" onClick={() => setFlexPayMethod(m.id)}
                        className={`py-2 rounded-xl text-[11px] font-bold flex flex-col items-center gap-0.5 transition border
                          ${flexPayMethod === m.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300'}`}>
                        <span>{m.icon}</span>{m.label}
                      </button>
                    ))}
                  </div>

                  <button type="button" onClick={handleCreateFlexCredit} disabled={flexLoading}
                    className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-sm transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-violet-200">
                    {flexLoading
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Creando...</>
                      : <>🎫 Confirmar Abono Flexible ({flexClases} clases)</>}
                  </button>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-black shadow-md shadow-teal-200 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Guardando...</>
                    : <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                        </svg>
                        Confirmar Pago
                      </>
                  }
                </button>
              </div>
            </>
          )}

          {!hasItems && (
            <button type="button" onClick={onClose}
              className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition">
              Cerrar
            </button>
          )}
        </form>
      </div>

      <PostPaymentActionsModal
        isOpen={showPostPaymentActions}
        onClose={() => { setShowPostPaymentActions(false); onClose(); }}
        paymentData={paymentDataForActions}
        showMessage={showMessage}
      />

      <FacturaModal
        isOpen={showFactura}
        onClose={() => setShowFactura(false)}
        montoSugerido={amount}
        alumnoSugerido={student?.name || ''}
      />
    </>
  );
};
