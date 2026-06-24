export function isPaidRecord(data) {
  if (!data) return false;
  const status = String(data?.status || "").toLowerCase();
  if (status === "pending" || status === "unpaid" || data.isPending === true || data.pending === true) return false;
  const explicitPaid = data?.isPaid === true || data?.paid === true || status === "paid";
  const hasPaymentDate = !!(data.paidAt || data.paymentDate || data.fechaPago);
  return explicitPaid || hasPaymentDate;
}

export function isValidMonthlyPayment(data) {
  if (!data) return false;
  const concept = String(data?.concept || data?.concepto || "").toLowerCase();
  const isPkg = data?.isPaidForPackage === true || /paquete|mensual/.test(concept);
  if (!isPkg) return false;
  return isPaidRecord(data);
}

export function __getExpectedAmountFromStudent(student) {
  const cand = [
    student?.monthlyFee, student?.monthly_amount, student?.monthlyAmount,
    student?.expectedAmount, student?.expected_amount, student?.expected,
    student?.packagePrice, student?.package_price, student?.price,
    student?.precio, student?.fee, student?.monto, student?.abono,
    student?.cuota, student?.importe
  ];
  for (const v of cand) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function __getPaidAmount(data) {
  const raw = data?.amount ?? data?.monto ?? data?.total ?? data?.totalAmount ?? data?.value ?? data?.importe;
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function __hasModalMarkers(data) {
  return (
    data?.confirmed === true ||
    data?.confirmado === true ||
    data?.markedFromModal === true ||
    !!data?.markedBy ||
    !!data?.confirmedBy ||
    !!data?.paymentSource ||
    !!data?.paymentMethod || !!data?.method
  );
}

export function getPaymentStatusForHistory(data, student) {
  if (!data) return 'ignore';
  const isPkg = data?.isPaidForPackage === true;
  if (!isPkg) return 'ignore';
  if (!__hasModalMarkers(data)) return 'ignore';

  const status = String(data?.status || '').toLowerCase();
  const isPendingFlag = data?.isPending === true || data?.pending === true || status === 'pending' || status === 'unpaid';
  if (isPendingFlag) return 'pending';

  const paid = isPaidRecord(data);
  if (!paid) return 'pending';

  const expected = __getExpectedAmountFromStudent(student);
  const paidAmt = __getPaidAmount(data);
  if (expected > 0 && paidAmt < expected) return 'partial';
  return 'paid';
}
