export const isPresent = (v) => {
  const s = String(v || '').toLowerCase();
  return s === 'presente' || s === 'present';
};

export const isAbsent = (v) => {
  const s = String(v || '').toLowerCase();
  return s === 'ausente' || s === 'absent';
};

export const getInitials = (name = '') => {
  return name
    .split(' ')
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};
