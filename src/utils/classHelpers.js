export const daysOfWeekFull = [
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
];

export const formatDateToDDMMYYYY = (dateStringOrDateObject) => {
  let date;
  if (dateStringOrDateObject instanceof Date) {
    date = dateStringOrDateObject;
  } else if (typeof dateStringOrDateObject === 'string') {
    const [year, month, day] = dateStringOrDateObject.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else if (dateStringOrDateObject && typeof dateStringOrDateObject.toDate === 'function') {
    date = dateStringOrDateObject.toDate();
  } else {
    return '';
  }
  if (isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export const mapClassTypeToSpanish = (type) => {
  switch (type) {
    case 'individual': return 'Individual';
    case 'group':      return 'Grupal';
    case 'choir':      return 'Coral';
    default:           return type;
  }
};
