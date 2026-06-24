import { collection as fsCollection, doc, getDoc, updateDoc, deleteDoc, query, where, getDocs, runTransaction } from 'firebase/firestore';

export async function cancelScheduledClass({ db, appId, classId, notify = true }) {
  try {
    const classRef = doc(db, `artifacts/${appId}/scheduledClasses/${classId}`);
    const classSnap = await getDoc(classRef);
    if (!classSnap.exists()) { if (notify) alert("La clase no existe."); return false; }
    const data = classSnap.data() || {};
    if (String(data.status || "").toLowerCase() === "cancelled") {
      if (notify) alert("La clase ya estaba cancelada.");
      return true;
    }
    await updateDoc(classRef, { status: "cancelled" });
    if (notify) alert("Clase cancelada.");
    return true;
  } catch (e) {
    console.error("cancelScheduledClass", e);
    if (notify) alert("No se pudo cancelar la clase.");
    return false;
  }
}

export async function hardDeleteScheduledClass({ db, appId, classId, notify = true }) {
  try {
    const classRef = doc(db, `artifacts/${appId}/scheduledClasses/${classId}`);
    const classSnap = await getDoc(classRef);
    if (!classSnap.exists()) { if (notify) alert("La clase no existe."); return false; }
    const c = classSnap.data() || {};

    if (c.isPaid) {
      if (notify) alert("No se puede borrar: la clase figura como pagada. Usá 'Cancelar'.");
      return false;
    }

    const monthlyRefId = c.monthlyPaymentRefId || null;
    let monthlyDoc = null;
    if (monthlyRefId) {
      const mRef = doc(db, `artifacts/${appId}/payments/${monthlyRefId}`);
      const mSnap = await getDoc(mRef);
      if (mSnap.exists()) {
        monthlyDoc = { ref: mRef, data: mSnap.data() || {} };
        if (monthlyDoc.data.isPaidForPackage === true) {
          if (notify) alert("No se puede borrar: pertenece a un paquete mensual abonado. Usá 'Cancelar'.");
          return false;
        }
      }
    }

    let paymentThatReferences = null;
    try {
      const qy = query(
        fsCollection(db, `artifacts/${appId}/payments`),
        where("associatedClassIds", "array-contains", classId)
      );
      const snap = await getDocs(qy);
      if (!snap.empty) paymentThatReferences = snap.docs[0];
    } catch {}

    if (paymentThatReferences && paymentThatReferences.data()?.isPaidForPackage === true) {
      if (notify) alert("No se puede borrar: está asociada a un paquete abonado. Usá 'Cancelar'.");
      return false;
    }

    await runTransaction(db, async (tx) => {
      if (monthlyDoc) {
        const d = monthlyDoc.data;
        const nextIds = (Array.isArray(d.associatedClassIds) ? d.associatedClassIds : []).filter(id => id !== classId);
        const nextCount = Math.max(0, Number(d.numClassesGenerated || 0) - 1);
        tx.update(monthlyDoc.ref, { associatedClassIds: nextIds, numClassesGenerated: nextCount });
      }
      if (paymentThatReferences && !paymentThatReferences.data()?.isPaidForPackage) {
        const pref = doc(db, `artifacts/${appId}/payments/${paymentThatReferences.id}`);
        const pd = paymentThatReferences.data() || {};
        const nextIds = (Array.isArray(pd.associatedClassIds) ? pd.associatedClassIds : []).filter(id => id !== classId);
        tx.update(pref, { associatedClassIds: nextIds });
      }
      tx.delete(classRef);
    });

    if (notify) alert("Clase eliminada definitivamente.");
    return true;
  } catch (e) {
    console.error("hardDeleteScheduledClass", e);
    if (notify) alert("No se pudo eliminar la clase.");
    return false;
  }
}

export async function hardDeleteUnpaidMonthlyPackage({ db, appId, monthlyPaymentId, alsoDeletePaymentDoc = true, notify = true }) {
  try {
    if (!monthlyPaymentId) { if (notify) alert("Falta monthlyPaymentId"); return false; }
    const payRef = doc(db, `artifacts/${appId}/payments/${monthlyPaymentId}`);
    const paySnap = await getDoc(payRef);
    if (!paySnap.exists()) { if (notify) alert("No se encontró el registro del paquete."); return false; }
    const pd = paySnap.data() || {};
    if (pd.isPaidForPackage === true) {
      if (notify) alert("No se puede eliminar: el paquete ya está abonado.");
      return false;
    }
    const ids = Array.isArray(pd.associatedClassIds) ? pd.associatedClassIds.slice() : [];
    if (!ids.length) {
      if (alsoDeletePaymentDoc) { await deleteDoc(payRef); if (notify) alert("Paquete eliminado."); }
      else if (notify) alert("Paquete sin clases asociadas.");
      return true;
    }

    const classRefs = ids.map(cid => doc(db, `artifacts/${appId}/scheduledClasses/${cid}`));
    const classSnaps = await Promise.all(classRefs.map(r => getDoc(r)));
    const deletable = [];
    for (let i = 0; i < classSnaps.length; i++) {
      const s = classSnaps[i];
      if (s.exists()) {
        const c = s.data() || {};
        if (String(c.status || "").toLowerCase() === "scheduled" && !c.isPaid) deletable.push(classRefs[i]);
      }
    }

    await runTransaction(db, async (tx) => {
      deletable.forEach(r => tx.delete(r));
      const remaining = ids.filter((_, idx) => !deletable.includes(classRefs[idx]));
      tx.update(payRef, {
        associatedClassIds: remaining,
        numClassesGenerated: Math.max(0, Number(pd.numClassesGenerated || 0) - deletable.length)
      });
      if (alsoDeletePaymentDoc && remaining.length === 0) tx.delete(payRef);
    });

    if (notify) alert(`Paquete eliminado. Clases borradas: ${deletable.length}.`);
    return true;
  } catch (e) {
    console.error("hardDeleteUnpaidMonthlyPackage", e);
    if (notify) alert("No se pudo eliminar el paquete.");
    return false;
  }
}
