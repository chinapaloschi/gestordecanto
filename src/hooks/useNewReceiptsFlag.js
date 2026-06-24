import React from 'react';
import { collection as fsCollection, query, where, onSnapshot } from 'firebase/firestore';
import { paths } from '../constants.js';

export function useNewReceiptsFlag(db, appId, studentId) {
  const [hasNew, setHasNew] = React.useState(false);

  React.useEffect(() => {
    if (!db || !appId || !studentId) { setHasNew(false); return; }
    try {
      const col = fsCollection(db, paths.studentReceipts(appId, studentId));
      const qy = query(col, where("status", "==", "pending"));

      const unsub = onSnapshot(qy, snap => {
        setHasNew(snap.size > 0);
      }, () => {
        setHasNew(false);
      });

      return () => unsub && unsub();
    } catch (e) {
      setHasNew(false);
    }
  }, [db, appId, studentId]);

  return hasNew;
}
