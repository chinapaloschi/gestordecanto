import React from 'react';
import { useMergedValidatedPayments } from '../hooks/useMergedValidatedPayments.js';
import { MaskedAmount } from './MaskedAmount.jsx';

export const BillingInfoUnified = ({ db, appId, student, onOpenHistory }) => {
  const payments = useMergedValidatedPayments(db, appId, student?.id);

  const fmtLong = (d) => {
    try {
      return (d instanceof Date ? d : new Date(d)).toLocaleDateString("es-AR", {
        weekday: "short", day: "2-digit", month: "short", year: "numeric"
      }).replace(/\./g, '');
    } catch { return "—"; }
  };

  const fmtMoney = (n) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);

  const last = payments[0] || null;
  const nextDue = last?.date ? new Date(last.date.getFullYear(), last.date.getMonth() + 1, 8) : null;
  const now = new Date();
  const isLate = nextDue ? now > new Date(nextDue.getFullYear(), nextDue.getMonth(), 8, 23, 59, 59, 999) : false;

  const isClickable = typeof onOpenHistory === 'function';
  const containerProps = isClickable
    ? { onClick: onOpenHistory, className: 'cursor-pointer hover:shadow-md transition-all', title: 'Ver historial de pagos' }
    : {};

  if (!last) {
    return (
      <div className="rounded-lg border p-3 bg-yellow-50 border-yellow-200">
        <p className="text-xs text-center text-yellow-800 font-medium">Sin pagos registrados.</p>
      </div>
    );
  }

  const boxTone = isLate ? "bg-red-50/80 border-red-200" : "bg-green-50/80 border-green-200";

  return (
    <div
      className={`rounded-lg border p-3 ${boxTone} ${containerProps.className || ''}`}
      onClick={containerProps.onClick}
      title={containerProps.title}
    >
      <div className="space-y-1 text-sm text-gray-800">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
          <span className="text-gray-600">Último pago:</span>
          <b className="font-semibold text-gray-900">
            {fmtLong(last.date)}
            {Number.isFinite(last.amount) && (
              <MaskedAmount placeholder=" — ••••••">{` — $${fmtMoney(last.amount)}`}</MaskedAmount>
            )}
          </b>
        </div>
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 flex-shrink-0 ${isLate ? 'text-red-600' : 'text-blue-600'}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
          <span className="text-gray-600">Vence:</span>
          <b className={`font-semibold ${isLate ? 'text-red-700' : 'text-gray-900'}`}>{fmtLong(nextDue)}</b>
        </div>
      </div>
    </div>
  );
};
