import { Modal } from './Modal.jsx';
import { exportPaymentReceiptPDFWithLogo } from '../utils/paymentPDF.js';
import { sharePayment } from '../utils/paymentPDF.js';
import { IconDownload, IconShare } from './Icons.jsx';

export const PostPaymentActionsModal = ({ isOpen, onClose, paymentData, showMessage }) => {
  if (!isOpen) return null;

  const handleDownload = async () => {
    try { await exportPaymentReceiptPDFWithLogo(paymentData); }
    catch { showMessage('No se pudo generar el PDF.', 'error'); }
  };

  const handleShare = async () => {
    try { await sharePayment(paymentData); }
    catch { showMessage('No se pudo compartir el comprobante.', 'error'); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="p-4 sm:p-6 text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">¡Pago Registrado!</h3>
        <p className="mt-2 text-sm text-gray-600">¿Qué te gustaría hacer a continuación?</p>

        <div className="mt-6 space-y-3">
          <button onClick={handleDownload} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-800 text-white font-semibold hover:bg-black transition">
            <IconDownload /> Descargar Comprobante (PDF)
          </button>
          <button onClick={handleShare} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200 transition">
            <IconShare /> Compartir Comprobante
          </button>
        </div>

        <div className="mt-6">
          <button onClick={onClose} className="w-full px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Finalizar</button>
        </div>
      </div>
    </Modal>
  );
};
