export const toLocalYYYYMMDD = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getLocalToday = () => toLocalYYYYMMDD(new Date());

export const getDayNameFromDate = (dateString) => {
  const date = new Date(dateString + 'T00:00:00');
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[date.getDay()];
};

export const generateTimeOptions = (interval = 30) => {
  const times = [];
  for (let h = 8; h <= 20; h++) {
    const hour = h < 10 ? `0${h}` : `${h}`;
    times.push(`${hour}:00`);
    if (interval === 30 && h < 20) times.push(`${hour}:30`);
  }
  return times;
};
