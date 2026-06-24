import React from 'react';
import { formatMoneyAr, parseMoneyAr } from '../utils/money.js';

export function MoneyInput({
  id,
  value,
  onValueChange,
  placeholder = '0',
  required = false,
  disabled = false,
  className = '',
  ...props
}) {
  const [display, setDisplay] = React.useState(
    value === '' || value === null || value === undefined ? '' : formatMoneyAr(value)
  );

  React.useEffect(() => {
    const next =
      value === '' || value === null || value === undefined ? '' : formatMoneyAr(value);
    setDisplay(next);
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    const cleaned = raw.replace(/[^\d.,]/g, '');
    setDisplay(cleaned);
    onValueChange && onValueChange(parseMoneyAr(cleaned));
  };

  const handleBlur = () => {
    let parsed = parseMoneyAr(display);
    if (Number.isNaN(parsed)) {
      setDisplay('');
      onValueChange && onValueChange(NaN);
    } else {
      parsed = Math.round(parsed);
      setDisplay(parsed.toString());
      onValueChange && onValueChange(parsed);
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      required={required}
      disabled={disabled}
      className={className || "w-full p-4 border border-gray-300 rounded-lg focus:ring-rose-500 focus:border-pink-500 rounded-lg sm:rounded-xl text-sm sm:text-base sm:text-sm sm:text-xs"}
      {...props}
    />
  );
}
