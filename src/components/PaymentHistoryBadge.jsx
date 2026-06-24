import React, { useEffect } from 'react';
import { collection as fsCollection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { mapClassTypeToSpanish } from '../utils/classHelpers.js';

const parseDateAny = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const fmtDDMMYYYY = (d) => {
  if (!d) return '—';
  try {
    const x = d instanceof Date ? d : new Date(d);
    return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
  } catch { return '—'; }
};

export const PaymentHistoryBadge = ({ db, appId, student, onOpen }) => {
  const [last, setLast] = React.useState(null);
  const [due, setDue] = React.useState(null);
  const [okThisMonth, setOkThisMonth] = React.useState(false);

  useEffect(() => {
    let alive = true;
    if (!db || !appId || !student?.id) return;
    (async () => {
      try {
        let latest = null;
        try {
          const col = fsCollection(db, `artifacts/${appId}/students/${student.id}/payments`);
          const qs = query(col, orderBy("paymentDate", "desc"), limit(1));
          const snap = await getDocs(qs);
          if (!snap.empty) latest = snap.docs[0].data();
        } catch {}

        if (!latest) {
          try {
            const col = fsCollection(db, `artifacts/${appId}/payments`);
            const qs = query(col, where("studentId", "==", student.id), limit(20));
            const snap = await getDocs(qs);
            if (!snap.empty) {
              let best = null;
              snap.forEach(d => {
                const x = d.data();
                if (!best) { best = x; return; }
                const da = x.paymentDate || x.paidAt || x.fechaPago || x.date || x.createdAt;
                const dbb = best.paymentDate || best.paidAt || best.fechaPago || best.date || best.createdAt;
                const ta = da?.toDate ? da.toDate().getTime() : new Date(da).getTime();
                const tb = dbb?.toDate ? dbb.toDate().getTime() : new Date(dbb).getTime();
                if ((ta || 0) > (tb || 0)) best = x;
              });
              latest = best;
            }
          } catch {}
        }

        const paidAt = parseDateAny(latest?.paymentDate || latest?.paidAt || latest?.fechaPago || latest?.date || latest?.createdAt);
        const rawAmt = latest?.amount ?? latest?.monto ?? latest?.total ?? latest?.totalAmount ?? latest?.value ?? latest?.importe;
        const amount = Number.isFinite(Number(rawAmt)) ? Number(rawAmt) : null;
        const pm = (latest?.paymentMethod || "").toString();
        const rawType = latest?.classType || latest?.studentType || latest?.type || "";
        const typeEs = mapClassTypeToSpanish(rawType);
        const label = pm.includes("single_class") ? `Clase ${typeEs}` : pm.includes("monthly_package") ? "Paquete mensual" : (typeEs || "");
        if (alive && paidAt) setLast({ date: paidAt, amount, label });

        const now = new Date();
        const eighth = (y, m) => new Date(y, m, 8, 23, 59, 59, 999);
        const sameYM = (a, b) => a?.getFullYear?.() === b.getFullYear() && a?.getMonth?.() === b.getMonth();
        let dueThis = eighth(now.getFullYear(), now.getMonth());
        let ok = false;
        if (paidAt && sameYM(paidAt, now)) { ok = true; dueThis = eighth(now.getFullYear(), now.getMonth() + 1); }
        if (alive) { setOkThisMonth(ok); setDue(dueThis); }
      } catch (e) { console.warn("PaymentHistoryBadge:", e); }
    })();
    return () => { alive = false; };
  }, [db, appId, student?.id]);

  const late = due && new Date() > due && !okThisMonth;
  const toneColor = late ? "text-red-600" : okThisMonth ? "text-green-600" : "text-amber-600";

  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 text-gray-700">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        <div>
          <span>Último pago: </span>
          <span className="font-semibold">{last?.date ? fmtDDMMYYYY(last.date) : "—"}</span>
          <button onClick={onOpen} className="ml-2 text-blue-600 hover:underline text-xs">(Ver historial)</button>
        </div>
      </div>
      <div className="flex items-center gap-2 text-gray-700 mt-1">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <div>
          <span>Próximo Vence: </span>
          <span className={`font-semibold ${toneColor}`}>{due ? fmtDDMMYYYY(due) : "—"}</span>
        </div>
      </div>
    </div>
  );
};
