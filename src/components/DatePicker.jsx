
import { useState, useEffect, useRef } from 'react';

export const DatePicker = ({ value, onChange }) => {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef(null);

  // Parsear la fecha actual (value viene en formato YYYY-MM-DD)
  const [year, month, day] = value.split('-').map(Number);

  // Navegación entre meses (opcional, por ahora solo muestra el mes actual)
  const goToPrevMonth = () => {
    const prevMonth = new Date(year, month - 2, 1);
    const newYear = prevMonth.getFullYear();
    const newMonth = String(prevMonth.getMonth() + 1).padStart(2, '0');
    // Nos quedamos con el mismo día si es posible, si no, el último día del mes anterior
    const lastDayPrevMonth = new Date(newYear, prevMonth.getMonth() + 1, 0).getDate();
    const newDay = Math.min(day, lastDayPrevMonth);
    const newDate = `${newYear}-${newMonth}-${String(newDay).padStart(2, '0')}`;
    onChange(newDate);
  };

  const goToNextMonth = () => {
    const nextMonth = new Date(year, month, 1);
    const newYear = nextMonth.getFullYear();
    const newMonth = String(nextMonth.getMonth() + 1).padStart(2, '0');
    const lastDayNextMonth = new Date(newYear, nextMonth.getMonth() + 1, 0).getDate();
    const newDay = Math.min(day, lastDayNextMonth);
    const newDate = `${newYear}-${newMonth}-${String(newDay).padStart(2, '0')}`;
    onChange(newDate);
  };

  // Generar los días del mes actual
  const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
  const totalDays = daysInMonth(year, month);
  const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = domingo, 1 = lunes...
  // Ajustamos para que la semana empiece en lunes
  const offset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

  // Cerrar el calendario al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={pickerRef}>
      <input
        type="text"
        value={value.split('-').reverse().join('/')} // Muestra DD/MM/YYYY
        onClick={() => setShowPicker(!showPicker)}
        readOnly
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer bg-white w-full"
      />
      {showPicker && (
        <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg p-3 z-50 w-64">
          {/* Cabecera con navegación de meses */}
          <div className="flex justify-between items-center mb-2">
            <button
              onClick={goToPrevMonth}
              className="p-1 hover:bg-gray-200 rounded"
            >
              ←
            </button>
            <span className="font-semibold text-sm">
              {new Date(year, month - 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={goToNextMonth}
              className="p-1 hover:bg-gray-200 rounded"
            >
              →
            </button>
          </div>
          {/* Días de la semana */}
          <div className="grid grid-cols-7 gap-1 text-xs text-center text-gray-500 mb-1">
            {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(d => (
              <div key={d}>{d}</div>
            ))}
          </div>
          {/* Cuadrícula de días */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: offset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map(d => {
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const isSelected = d === day;
              return (
                <button
                  key={d}
                  onClick={() => {
                    onChange(dateStr);
                    setShowPicker(false);
                  }}
                  className={`p-1 text-sm rounded hover:bg-rose-100 ${
                    isSelected ? 'bg-rose-500 text-white' : ''
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
// ============================================
// COMPONENTE DatePicker (selector de fecha personalizado)
// ============================================

// COMPONENTE DASHBOARD COMPLETO (con selector de fecha y lista de clases)
// ============================================================================
