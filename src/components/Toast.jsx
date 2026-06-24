export const Toast = ({ open, kind = "success", children }) => {
  if (!open) return null;
  const base =
    "fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-lg sm:rounded-xl shadow-lg text-sm sm:text-base sm:text-sm";
  const styles =
    kind === "success" ? "bg-green-600 text-white" :
    kind === "error"   ? "bg-rose-600 text-white" :
                         "bg-gray-800 text-white";
  return <div className={`${base} ${styles}`} role="status" aria-live="polite">{children}</div>;
};
