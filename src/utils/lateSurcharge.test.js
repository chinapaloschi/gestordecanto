import { describe, it, expect } from 'vitest';
import { isSamePeriodMonth, surchargeApplies, withSurcharge, sumWithSurcharge } from './lateSurcharge.js';

describe('isSamePeriodMonth', () => {
  it('is true when the period and ref date share year+month', () => {
    expect(isSamePeriodMonth('2026-10-01', new Date(2026, 9, 15))).toBe(true);
  });

  it('is false across different months, even the same day-of-month', () => {
    expect(isSamePeriodMonth('2026-09-01', new Date(2026, 9, 1))).toBe(false);
  });

  it('is false for missing/invalid input', () => {
    expect(isSamePeriodMonth('', new Date())).toBe(false);
    expect(isSamePeriodMonth(null, new Date())).toBe(false);
    expect(isSamePeriodMonth('not-a-date', new Date())).toBe(false);
  });
});

describe('surchargeApplies', () => {
  it('does not apply before day 9 of the period month', () => {
    expect(surchargeApplies('2026-10-01', new Date(2026, 9, 8))).toBe(false);
  });

  it('applies from day 9 onward in the period month', () => {
    expect(surchargeApplies('2026-10-01', new Date(2026, 9, 9))).toBe(true);
    expect(surchargeApplies('2026-10-01', new Date(2026, 9, 25))).toBe(true);
  });

  it('never applies to a debt from a previous month, no matter the day', () => {
    // Regresión: el recargo es solo sobre la deuda DEL MES EN CURSO, nunca
    // sobre saldo atrasado de meses anteriores (ver comentario en el código
    // fuente) — este es exactamente el caso que hay que no romper.
    expect(surchargeApplies('2026-08-01', new Date(2026, 9, 20))).toBe(false);
  });
});

describe('withSurcharge', () => {
  it('adds 10% and rounds when the surcharge applies', () => {
    const { amount, applies } = withSurcharge(10000, '2026-10-01', new Date(2026, 9, 15));
    expect(applies).toBe(true);
    expect(amount).toBe(11000);
  });

  it('returns the base amount unchanged when it does not apply', () => {
    const { amount, applies } = withSurcharge(10000, '2026-10-01', new Date(2026, 9, 5));
    expect(applies).toBe(false);
    expect(amount).toBe(10000);
  });
});

describe('sumWithSurcharge', () => {
  it('applies the surcharge item by item based on each item\'s own period', () => {
    const refDate = new Date(2026, 9, 20); // 20 oct — después del día 9
    const items = [
      { amount: 10000, period: '2026-10-01' }, // mes en curso -> +10%
      { amount: 10000, period: '2026-09-01' }, // mes anterior -> sin recargo
    ];
    const { total, anyApplied } = sumWithSurcharge(
      items,
      (i) => i.amount,
      (i) => i.period,
      refDate
    );
    expect(anyApplied).toBe(true);
    expect(total).toBe(11000 + 10000);
  });

  it('reports anyApplied=false when nothing in the list gets a surcharge', () => {
    const refDate = new Date(2026, 9, 20);
    const items = [{ amount: 5000, period: '2026-09-01' }];
    const { total, anyApplied } = sumWithSurcharge(items, (i) => i.amount, (i) => i.period, refDate);
    expect(anyApplied).toBe(false);
    expect(total).toBe(5000);
  });
});
