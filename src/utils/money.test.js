import { describe, it, expect } from 'vitest';
import { formatMoneyAr, parseMoneyAr } from './money.js';

describe('formatMoneyAr', () => {
  it('formats with Argentine thousands separators', () => {
    expect(formatMoneyAr(110000)).toBe('110.000');
    expect(formatMoneyAr(1234567)).toBe('1.234.567');
  });

  it('drops decimals', () => {
    expect(formatMoneyAr(1999.9)).toBe('2.000');
  });

  it('returns empty string for empty/null/undefined/NaN input', () => {
    expect(formatMoneyAr('')).toBe('');
    expect(formatMoneyAr(null)).toBe('');
    expect(formatMoneyAr(undefined)).toBe('');
    expect(formatMoneyAr('not a number')).toBe('');
  });

  it('formats zero as "0", not empty', () => {
    expect(formatMoneyAr(0)).toBe('0');
  });
});

describe('parseMoneyAr', () => {
  it('parses Argentine-formatted strings (dot thousands, comma decimal)', () => {
    expect(parseMoneyAr('110.000')).toBe(110000);
    expect(parseMoneyAr('1.234.567')).toBe(1234567);
    expect(parseMoneyAr('110.000,50')).toBe(110000.5);
  });

  it('parses a plain digit string', () => {
    expect(parseMoneyAr('5000')).toBe(5000);
  });

  it('returns NaN for empty/null/undefined', () => {
    expect(parseMoneyAr('')).toBeNaN();
    expect(parseMoneyAr(null)).toBeNaN();
    expect(parseMoneyAr(undefined)).toBeNaN();
  });

  it('round-trips with formatMoneyAr for whole pesos', () => {
    const amount = 85000;
    expect(parseMoneyAr(formatMoneyAr(amount))).toBe(amount);
  });
});
