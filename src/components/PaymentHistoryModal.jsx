import React from 'react';
import { collection as fsCollection, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { Modal } from './Modal.jsx';
import { formatMoneyAr } from '../utils/money.js';
import { isValidMonthlyPayment, getPaymentStatusForHistory } from '../hooks/paymentHelpers.js';
import { exportPaymentPDF, sharePayment } from '../utils/paymentPDF.js';

const fmtDDMMYYYY = (d) => {
  try {
    const x = d instanceof Date ? d : new Date(d);
    return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`;
  } catch { return "—"; }
};

const toMs = (raw) => {
  if (!raw) return 0;
  if (raw instanceof Date) return raw.getTime();
  if (raw?.toDate) return raw.toDate().getTime();
  if (typeof raw === "object" && typeof raw.seconds === "number") return new Date(raw.seconds * 1000).getTime();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const paidAmount = (data) => {
  const raw = data?.amount ?? data?.monto ?? data?.total ?? data?.totalAmount ?? data?.value ?? data?.importe;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

export const PaymentHistoryModal = ({ open, onClose, db, appId, student }) => {
  const [rows, setRows] = React.useState([]);

  React.useEffect(() => {
    if (!open || !db || !appId || !student?.id) return;
    let unsub1 = null, unsub2 = null, alive = true;

    const norm = (docSnap, scope, serial) => {
      const data = docSnap.data() || {};
      const note = data.concept || data.concepto || data.note || data.nota || "Paquete mensual";
      const paymentDateValue = data.paidAt || data.paymentDate || data.fechaPago || data.date || data.createdAt;
      const finalPaymentDate = paymentDateValue ? new Date(toMs(paymentDateValue)) : null;
      const ultimateTimestamp =
        toMs(data.updatedAt) ||
        toMs(data.paidAt) ||
        toMs(data.paymentDate) ||
        toMs(data.fechaPago) ||
        toMs(data.recordedAt) ||
        toMs(data.createdAt);
      const amount = paidAmount(data);
      const path = scope === "student"
        ? `artifacts/${appId}/students/${student.id}/payments/${docSnap.id}`
        : `artifacts/${appId}/payments/${docSnap.id}`;
      return { id: docSnap.id, date: finalPaymentDate, amount, note, paths: [path], _order: ultimateTimestamp, _created: ultimateTimestamp, _serial: serial };
    };

    const rebuild = (studDocs, globDocs) => {
      const pass = (docSnap) => {
        const data = docSnap.data() || {};
        if (!isValidMonthlyPayment(data)) return false;
        const st = getPaymentStatusForHistory(data, student);
        return st === "paid" || st === "partial";
      };

      const all = [
        ...studDocs.filter(pass).map((d, i) => norm(d, "student", i)),
        ...globDocs.filter(pass).map((d, i) => norm(d, "global", (studDocs?.length || 0) + i)),
      ];

      const index = new Map();
      for (const p of all) {
        const key = [
          p.date ? `${String(p.date.getDate()).padStart(2, "0")}/${String(p.date.getMonth() + 1).padStart(2, "0")}/${p.date.getFullYear()}` : "",
          Number.isFinite(Number(p.amount)) ? Number(p.amount).toFixed(2) : "",
          String(p.note || "").toLowerCase().trim()
        ].join("|");

        if (index.has(key)) {
          const prev = index.get(key);
          index.set(key, { ...prev, ...p, paths: Array.from(new Set([...(prev.paths || []), ...(p.paths || [])])) });
        } else {
          index.set(key, p);
        }
      }

      const list = Array.from(index.values()).sort((a, b) => {
        const dayA = a.date ? new Date(a.date.getFullYear(), a.date.getMonth(), a.date.getDate()).getTime() : 0;
        const dayB = b.date ? new Date(b.date.getFullYear(), b.date.getMonth(), b.date.getDate()).getTime() : 0;
        if (dayB !== dayA) return dayB - dayA;
        const orderDiff = (b._order || 0) - (a._order || 0);
        if (orderDiff !== 0) return orderDiff;
        return (b._serial || 0) - (a._serial || 0);
      });

      if (alive) setRows(list);
    };

    try {
      const subRef = fsCollection(db, `artifacts/${appId}/students/${student.id}/payments`);
      unsub1 = onSnapshot(subRef, (snap) => {
        unsub1._lastSnap = snap.docs || [];
        rebuild(unsub1._lastSnap, unsub2?._lastSnap || []);
      });

      const globRef = fsCollection(db, `artifacts/${appId}/payments`);
      const globQ = query(globRef, where("studentId", "==", student.id));
      unsub2 = onSnapshot(globQ, (snap) => {
        unsub2._lastSnap = snap.docs || [];
        rebuild(unsub1?._lastSnap || [], unsub2._lastSnap);
      });
    } catch (e) {
      console.error("PaymentHistoryModal listeners error:", e);
    }

    return () => {
      alive = false;
      try { unsub1 && unsub1(); } catch {}
      try { unsub2 && unsub2(); } catch {}
    };
  }, [open, db, appId, student?.id]);

  if (!open) return null;

  return (
    <Modal isOpen={open} onClose={onClose} title={`Historial de pagos — ${student?.name}`} size="lg">
      <div className="text-sm text-gray-700">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 p-4">Sin pagos registrados.</div>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 overflow-hidden">
            {rows.map((r, i) => (
              <li key={`${r.id}-${i}`} className="px-3 py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    {fmtDDMMYYYY(r.date)}
                    {r._order && ` a las ${new Date(r._order).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
                  </div>
                  <div className="text-xs text-gray-700 italic">{r.note || ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="font-semibold">${formatMoneyAr(r.amount)}</div>
                  <button
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-emerald-500 text-white hover:bg-emerald-600"
                    onClick={() => exportPaymentPDF({ alumno: student?.name || "", fecha: fmtDDMMYYYY(r.date), concepto: r.note || "Paquete mensual", monto: formatMoneyAr(r.amount) })}
                    title="Descargar comprobante"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3v12m0 0l-4-4m4 4l4-4m-8 7h8a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2" /></svg>
                  </button>
                  <button
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-blue-500 text-white hover:bg-blue-600"
                    onClick={() => sharePayment({ alumno: student?.name || "", fecha: fmtDDMMYYYY(r.date), concepto: r.note || "Paquete mensual", monto: formatMoneyAr(r.amount) })}
                    title="Compartir comprobante"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98"/><path d="M15.41 6.51L8.59 10.49"/></svg>
                  </button>
                  <button
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-rose-600 text-white hover:bg-rose-700"
                    onClick={async () => {
                      if (!window.confirm("¿Seguro que querés eliminar este pago?")) return;
                      try {
                        if (Array.isArray(r.paths) && r.paths.length) {
                          await Promise.allSettled(r.paths.map(p => deleteDoc(doc(db, p))));
                        }
                      } catch { alert("No se pudo eliminar el pago."); }
                    }}
                    title="Eliminar pago"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black">Cerrar</button>
      </div>
    </Modal>
  );
};
