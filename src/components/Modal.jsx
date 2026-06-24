import { useEffect } from 'react';

export const Modal = ({ isOpen, onClose, title, footer, children, size = 'xl' }) => {
  if (!isOpen) return null;

  useEffect(() => {
    return () => {};
  }, []);

  const width =
    size === 'sm'   ? 'max-w-md' :
    size === 'md'   ? 'max-w-xl' :
    size === 'lg'   ? 'max-w-2xl' :
    size === 'xl'   ? 'max-w-3xl' :
    size === '2xl'  ? 'max-w-4xl' :
    size === '3xl'  ? 'max-w-5xl' :
    size === '4xl'  ? 'max-w-6xl' :
    size === 'full' ? 'max-w-full sm:max-w-[90vw]' :
    'max-w-xl';

  return (
    <div className="fixed inset-0 z-50 bg-gray-600/50 p-0 sm:p-4 flex items-stretch sm:items-center sm:justify-center">
      <div className={`bg-white w-full ${width} rounded-none sm:rounded-2xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh] sm:h-auto max-max-h-[90vh] sm:max-h-[90vh] overflow-x-hidden`}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b bg-white pt-[env(safe-area-inset-top)]">
          <h2 className="text-sm sm:text-base sm:text-sm font-semibold text-gray-900">{title || ''}</h2>
          {typeof onClose === 'function' && (
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="w-8 h-8 rounded-full bg-gray-200 hover:bg-rose-500 hover:text-white transition grid place-items-center"
            >
              ×
            </button>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 overflow-y-auto pb-24 [padding-bottom:env(safe-area-inset-bottom)]">
          {children}
        </div>

        <div className="sticky bottom-0 z-10 px-4 sm:px-6 py-2 sm:py-3 border-t bg-white pb-[env(safe-area-inset-bottom)]">
          {footer ? (
            footer
          ) : (
            <div className="flex justify-end gap-2 mt-4 mb-4">
              <button
                onClick={onClose}
                className="px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base rounded-lg sm:rounded-xl bg-gray-800 text-white text-sm sm:text-base sm:text-sm font-semibold hover:bg-gray-900 transition"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ModalHeader = ({ icon = "💬", iconNode = null, title = "", subtitle = "" }) => (
  <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b px-4 sm:px-6 pt-[env(safe-area-inset-top)]">
    <div className="py-3 sm:py-4">
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left sm:gap-3">
        <div className="h-10 w-10 sm:h-9 sm:w-9 rounded-xl sm:rounded-lg bg-gray-900 text-white grid place-items-center shadow-sm mb-2 sm:mb-0">
          {iconNode ? iconNode : <span className="text-base leading-none">{icon}</span>}
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-gray-900">{title}</h2>
          {subtitle ? <p className="text-[11px] text-gray-600">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  </div>
);
