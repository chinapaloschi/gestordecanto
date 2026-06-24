import React from 'react';
import { collection as fsCollection, query, where, onSnapshot } from 'firebase/firestore';
import { paths } from '../constants.js';
import { isValidMonthlyPayment } from './paymentHelpers.js';

export function useHasPaidThisMonth(db, appId, studentId) {
  const [state, setState] = React.useState({ checking: true, hasPaidThisMonth: false });

  React.useEffect(() => {
    let cancel = false;
    let unsub1 = null, unsub2 = null;

    if (!db || !appId || !studentId) {
      setState({ checking: false, hasPaidThisMonth: false });
      return () => {};
    }

    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();

    let lastSub = [], lastGlob = [];

    const toDate = (raw) => {
      if (!raw) return null;
      if (raw instanceof Date) return raw;
      if (raw.toDate) return raw.toDate();
      if (typeof raw === "object" && typeof raw.seconds === "number") return new Date(raw.seconds * 1000);
      const dt = new Date(raw); return isNaN(dt.getTime()) ? null : dt;
    };

    const recompute = () => {
      let paid = false;
      const check = (arr) => {
        arr.forEach(d => {
          const data = d.data ? (d.data() || {}) : d;
          if (!isValidMonthlyPayment(data)) return;
          const dt = toDate(data.paidAt || data.paymentDate || data.fechaPago);
          if (!dt) return;
          if (dt.getFullYear() === y && dt.getMonth() === m) paid = true;
        });
      };
      check(lastSub); check(lastGlob);
      if (!cancel) setState({ checking: false, hasPaidThisMonth: paid });
    };

    unsub1 = onSnapshot(
      fsCollection(db, paths.studentPayments(appId, studentId)),
      (snap) => { lastSub = snap.docs; recompute(); },
      () => { if (!cancel) setState(prev => ({ ...prev, checking: false })); }
    );

    unsub2 = onSnapshot(
      query(fsCollection(db, paths.payments(appId)), where("studentId", "==", studentId)),
      (snap) => { lastGlob = snap.docs; recompute(); },
      () => { if (!cancel) setState(prev => ({ ...prev, checking: false })); }
    );

    return () => {
      cancel = true;
      try { unsub1 && unsub1(); } catch {}
      try { unsub2 && unsub2(); } catch {}
    };
  }, [db, appId, studentId]);

  return state;
}
