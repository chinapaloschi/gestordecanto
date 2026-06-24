import React from 'react';
import { collection as fsCollection, doc as fsDoc, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { paths } from '../constants.js';
import { isPaidRecord } from './paymentHelpers.js';

export function useLatestPackagePaid(db, appId, studentId) {
  const [state, setState] = React.useState({
    checking: true,
    isLatestPackagePaid: false,
    latestMonthlyRefId: null,
  });

  React.useEffect(() => {
    let cancel = false;
    let unsubClass = null;
    let unsubPay = null;

    const cleanup = () => {
      try { unsubClass && unsubClass(); } catch {}
      try { unsubPay && unsubPay(); } catch {}
    };

    if (!db || !appId || !studentId) {
      setState({ checking: false, isLatestPackagePaid: false, latestMonthlyRefId: null });
      return cleanup;
    }

    const qLatest = query(
      fsCollection(db, paths.scheduledClasses(appId)),
      where("studentId", "==", studentId),
      orderBy("classDate", "desc"),
      limit(1)
    );

    unsubClass = onSnapshot(qLatest, (snap) => {
      const docSnap = snap.docs[0];
      const data = docSnap ? docSnap.data() : null;
      const monthlyRef = data?.monthlyPaymentRefId || null;

      if (!monthlyRef) {
        if (!cancel) setState({ checking: false, isLatestPackagePaid: false, latestMonthlyRefId: null });
        if (unsubPay) { try { unsubPay(); } catch {} unsubPay = null; }
        return;
      }

      if (unsubPay) { try { unsubPay(); } catch {} unsubPay = null; }

      unsubPay = onSnapshot(
        fsDoc(db, `${paths.payments(appId)}/${monthlyRef}`),
        (psnap) => {
          const pdata = psnap.exists() ? (psnap.data() || {}) : {};
          const paid = pdata?.isPaidForPackage === true && isPaidRecord(pdata);
          if (!cancel) setState({ checking: false, isLatestPackagePaid: paid, latestMonthlyRefId: monthlyRef });
        },
        () => {
          if (!cancel) setState({ checking: false, isLatestPackagePaid: false, latestMonthlyRefId: monthlyRef });
        }
      );
    }, () => {
      if (!cancel) setState({ checking: false, isLatestPackagePaid: false, latestMonthlyRefId: null });
    });

    return () => { cancel = true; cleanup(); };
  }, [db, appId, studentId]);

  return state;
}
