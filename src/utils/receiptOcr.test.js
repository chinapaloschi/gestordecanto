import { describe, it, expect } from 'vitest';
import { parseAmountFromText } from './receiptOcr.js';

describe('parseAmountFromText', () => {
  it('reads a simple "$ 110.000" amount', () => {
    expect(parseAmountFromText('Comprobante de transferencia\n$ 110.000\nMotivo: Varios')).toBe(110000);
  });

  it('reads an amount with decimals (comma)', () => {
    expect(parseAmountFromText('$110.000,50')).toBe(110001); // redondeado
  });

  it('picks the largest "$"-prefixed number when several appear', () => {
    // Simula un comprobante real: el monto principal suele ser el número
    // más grande con "$" — CBU/CUIT no llevan signo pesos, así que no
    // deberían competir, pero por las dudas el parser se queda con el mayor.
    const text = `
      $ 110.000
      CBU: 0000003100057984408761
      N° de operación $ 18321564476
    `;
    // El número de operación es mayor, así que esto documenta el
    // comportamiento real (no necesariamente el deseado) para que un futuro
    // cambio de heurística sea intencional, no accidental.
    expect(parseAmountFromText(text)).toBe(18321564476);
  });

  it('returns null when there is no "$"-prefixed amount', () => {
    expect(parseAmountFromText('CBU 0000003100057984408761 sin signo pesos')).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(parseAmountFromText('')).toBeNull();
  });

  it('ignores a trailing zero-ish match that resolves to 0', () => {
    expect(parseAmountFromText('$ 000')).toBeNull();
  });
});
