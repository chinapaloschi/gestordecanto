export const GracePeriodNotice = ({ shouldShow }) => {
  if (!shouldShow) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-100 p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-amber-600 pt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-amber-900">Aviso sobre tus clases</h3>
          <p className="text-sm text-amber-800 mt-1">
            Estás viendo tus clases programadas hasta el día 8. La lista completa de clases del mes aparecerá aquí una vez que se procese tu pago.
          </p>
        </div>
      </div>
    </div>
  );
};

export const NextMonthInfoBox = ({ pkg }) => {
  if (!pkg) return null;
  const periodDate = new Date(pkg.periodStartDate + 'T12:00:00');
  const monthName = periodDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return (
    <div className="rounded-lg sm:rounded-xl border border-blue-200 bg-blue-50 p-4 mt-4 text-center">
      <p className="font-semibold text-blue-800">✅ ¡Ya tenés tu abono para {capitalizedMonth} programado!</p>
      <p className="text-xs text-blue-700 mt-1">Si no vas a poder asistir, por favor avisanos con anticipación para poder liberar tu lugar.</p>
    </div>
  );
};
