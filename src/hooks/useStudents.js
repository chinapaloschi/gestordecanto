import React from 'react';
import { collection as fsCollection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { paths } from '../constants.js';

export function useStudents(db, appId) {
  const [students, setStudents] = React.useState([]);

  React.useEffect(() => {
    if (!db || !appId) return;
    try {
      const q = query(fsCollection(db, paths.students(appId)), orderBy("name", "asc"));
      const unsub = onSnapshot(q, snap => {
        setStudents(snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })));
      });
      return () => unsub && unsub();
    } catch (e) {
      console.warn("useStudents error", e);
    }
  }, [db, appId]);

  return students;
}
