// Recargo por mora: 10% desde el día 9 del mes, y sólo sobre la deuda del
// mes en curso — nunca sobre saldo arrastrado de meses anteriores.
//
// Ver [[MainApp.jsx pendingBalanceWithSurcharge]], [[MarkPaymentForm.jsx
// totalConRecargo]] y el portal del alumno — las tres pantallas deben decidir
// "¿corresponde recargo?" de la misma forma, así que esa decisión vive acá.

export const LATE_SURCHARGE_RATE = 1.10;
export const LATE_SURCHARGE_DAY = 9;

export function isSamePeriodMonth(periodDateStr, refDate) {
  if (!periodDateStr) return false;
  const d = new Date(String(periodDateStr) + 'T12:00:00');
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === refDate.getFullYear() && d.getMonth() === refDate.getMonth();
}

export function surchargeApplies(periodDateStr, refDate) {
  return refDate.getDate() >= LATE_SURCHARGE_DAY && isSamePeriodMonth(periodDateStr, refDate);
}

export function withSurcharge(baseAmount, periodDateStr, refDate) {
  const applies = surchargeApplies(periodDateStr, refDate);
  return { amount: applies ? Math.round(baseAmount * LATE_SURCHARGE_RATE) : baseAmount, applies };
}

// Suma una lista de ítems de deuda, aplicando el recargo ítem por ítem según
// el período propio de cada uno (nunca sobre backlog de meses anteriores).
export function sumWithSurcharge(items, getAmount, getPeriodDate, refDate = new Date()) {
  let total = 0;
  let anyApplied = false;
  for (const item of items) {
    const { amount, applies } = withSurcharge(getAmount(item), getPeriodDate(item), refDate);
    total += amount;
    if (applies) anyApplied = true;
  }
  return { total, anyApplied };
}
