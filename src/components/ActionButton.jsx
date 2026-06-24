export const ActionButton = ({ icon, children, onClick, className = '', isDangerous = false, iconClassName = '' }) => {
  const baseClasses = "flex items-center w-full p-3 rounded-lg transition-colors text-sm font-medium border";
  const colorClasses = isDangerous
    ? "text-red-700 bg-white hover:bg-red-50 border-gray-200 hover:border-red-200"
    : "text-gray-800 bg-gray-50 hover:bg-gray-100 border-gray-200";

  return (
    <button onClick={onClick} className={`${baseClasses} ${colorClasses} ${className}`}>
      <span className={`mr-3 ${isDangerous ? 'text-red-600' : iconClassName}`}>{icon}</span>
      <span>{children}</span>
    </button>
  );
};
