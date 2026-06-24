import React from 'react';
import { collection as fsCollection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { paths } from '../constants.js';

export function useStudentReceipts(db, appId, studentId) {
  const [receipts, setReceipts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!db || !appId || !studentId) {
      setReceipts([]);
      setLoading(false);
      return;
    }
    const col = fsCollection(db, paths.studentReceipts(appId, studentId));
    const qy = query(col, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(qy, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      setReceipts(list);
      setLoading(false);
    }, (error) => {
      console.error("useStudentReceipts error:", error);
      setLoading(false);
    });

    return () => unsub && unsub();
  }, [db, appId, studentId]);

  return { receipts, loading };
}
