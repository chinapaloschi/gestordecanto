export const formatMoneyAr = (num) => {
  if (num === '' || num === null || num === undefined) return '';
  const n = Number(num);
  if (Number.isNaN(n)) return '';
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
};

export const parseMoneyAr = (str) => {
  if (str === '' || str === null || str === undefined) return NaN;
  const normalized = String(str).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? NaN : n;
};
