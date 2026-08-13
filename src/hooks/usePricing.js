import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

// Tarifario central: precio de lista por tipo de clase y duración. Antes no
// existía ningún lugar así — cada precio se tipeaba a mano en el formulario
// de agendar, en Renovar, etc. Este documento es sólo un DEFAULT: nada obliga
// a usarlo, sigue siendo posible cobrar un monto distinto (becas, casos
// puntuales), pero ahora hay un precio "de lista" contra el cual comparar.
export function pricingDocRef(db, appId) {
  return doc(db, `artifacts/${appId}/settings/pricing`);
}

export const DEFAULT_PRICING = {
  individual: { 60: 0 },
  group: { 60: 0, 90: 0 },
  choir: { 60: 0, 90: 0 },
};

export function usePricing(db, appId) {
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !appId) return;
    const unsub = onSnapshot(pricingDocRef(db, appId), (snap) => {
      setPricing(snap.exists() ? { ...DEFAULT_PRICING, ...snap.data() } : DEFAULT_PRICING);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [db, appId]);

  return { pricing, loading };
}

export async function savePricing(db, appId, pricing) {
  await setDoc(pricingDocRef(db, appId), { ...pricing, updatedAt: new Date() }, { merge: true });
}

// classType: 'individual' | 'group' | 'choir'. duration: 60 | 90 (number o string).
export function getTariff(pricing, classType, duration) {
  const byType = pricing?.[classType];
  if (!byType) return 0;
  return Number(byType[duration] ?? byType[String(duration)] ?? 0) || 0;
}
