import React from 'react';
import { collection as fsCollection, query, where, onSnapshot } from 'firebase/firestore';
import { paths } from '../constants.js';
import { isValidMonthlyPayment } from './paymentHelpers.js';

export function useMergedValidatedPayments(db, appId, studentId) {
  const [payments, setPayments] = React.useState([]);

  React.useEffect(() => {
    if (!db || !appId || !studentId) {
      setPayments([]);
      return;
    }

    let unsub1 = null, unsub2 = null, alive = true;

    const toMs = (raw) => {
      if (!raw) return 0;
      if (raw instanceof Date) return raw.getTime();
      if (typeof raw?.toDate === "function") return raw.toDate().getTime();
      if (typeof raw === "object" && typeof raw.seconds === "number") return new Date(raw.seconds * 1000).getTime();
      const d = new Date(raw);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    const paidAmount = (data) => {
      const raw = data?.amount ?? data?.monto ?? data?.total ?? data?.totalAmount ?? data?.value ?? data?.importe;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    const norm = (docSnap) => {
      const data = docSnap.data() || {};
      const note = data.concept || data.concepto || data.note || data.nota || "Paquete mensual";

      const paymentDateValue =
        data.paidAt || data.paymentDate || data.fechaPago || data.date || data.createdAt;
      const finalPaymentDate = paymentDateValue ? new Date(toMs(paymentDateValue)) : null;

      const ultimateTimestamp = Math.max(
        toMs(data.modalMarkedAt),
        toMs(data.markedAt),
        toMs(data.confirmedAt),
        toMs(data.confirmadoAt),
        toMs(data.updatedAt),
        toMs(data.paidAt),
        toMs(data.paymentDate),
        toMs(data.fechaPago),
        toMs(data.date),
        toMs(data.recordedAt),
        toMs(data.createdAt)
      );

      return {
        id: docSnap.id,
        date: finalPaymentDate,
        amount: paidAmount(data),
        concept: note,
        _order: ultimateTimestamp,
      };
    };

    const applyMerge = (studDocs, globDocs) => {
      const all = [
        ...studDocs.filter(d => isValidMonthlyPayment(d.data() || {})).map(norm),
        ...globDocs.filter(d => isValidMonthlyPayment(d.data() || {})).map(norm),
      ];

      const index = new Map();
      for (const p of all) {
        const key = [
          p.date ? `${String(p.date.getDate()).padStart(2,"0")}/${String(p.date.getMonth()+1).padStart(2,"0")}/${p.date.getFullYear()}` : "",
          Number.isFinite(Number(p.amount)) ? Number(p.amount).toFixed(2) : "",
          String(p.concept || "").toLowerCase().trim()
        ].join("|");

        if (index.has(key)) {
          index.set(key, { ...index.get(key), ...p });
        } else {
          index.set(key, p);
        }
      }

      const list = Array.from(index.values()).sort(
        (a, b) => (b._order || 0) - (a._order || 0)
      );

      if (alive) setPayments(list);
    };

    try {
      const subRef = fsCollection(db, paths.studentPayments(appId, studentId));
      unsub1 = onSnapshot(subRef, (snap) => {
        unsub1._lastSnap = snap.docs || [];
        applyMerge(unsub1._lastSnap, unsub2?._lastSnap || []);
      });

      const globRef = fsCollection(db, paths.payments(appId));
      const globQ = query(globRef, where("studentId", "==", studentId));
      unsub2 = onSnapshot(globQ, (snap) => {
        unsub2._lastSnap = snap.docs || [];
        applyMerge(unsub1?._lastSnap || [], unsub2._lastSnap);
      });
    } catch (e) { console.error("useMergedValidatedPayments error:", e); }

    return () => {
      alive = false;
      try { unsub1 && unsub1(); } catch {}
      try { unsub2 && unsub2(); } catch {}
    };
  }, [db, appId, studentId]);

  return payments;
}
