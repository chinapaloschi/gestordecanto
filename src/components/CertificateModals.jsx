import { useState } from 'react';
import { Modal, ModalHeader } from './Modal.jsx';
import { IconAward } from './Icons.jsx';

export const CertificateGeneratorModal = ({ isOpen, onClose, student, onGenerate }) => {
  const [modality, setModality] = useState('Individual');
  const [year, setYear] = useState(new Date().getFullYear());

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} footer={null} size="sm">
      <div className="bg-white p-4 sm:p-6 rounded-lg sm:rounded-xl">
        <ModalHeader iconNode={<IconAward />} title="Generar Certificado" subtitle={`Para el alumno: ${student.name}`} />
        <form onSubmit={(e) => { e.preventDefault(); onGenerate(student, modality, year); }} className="space-y-4 mt-6">
          <div>
            <label htmlFor="modality" className="block text-sm font-medium text-gray-700 mb-1">Modalidad del Curso</label>
            <select id="modality" value={modality} onChange={(e) => setModality(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-rose-500 focus:border-rose-500 transition">
              <option value="Individual">Individual</option>
              <option value="Grupal">Grupal</option>
              <option value="Coral">Coral</option>
            </select>
          </div>
          <div>
            <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1">Año del Ciclo Lectivo</label>
            <input type="number" id="year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Ej: 2025"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-rose-500 focus:border-rose-500 transition" />
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 font-semibold hover:bg-gray-100 transition">Cancelar</button>
            <button type="submit" className="px-6 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-sm transition">Generar</button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export const CertificateModal = ({ isOpen, onClose, studentData, modality, year, showMessage }) => {
  if (!isOpen || !studentData) return null;

  const handlePrint = async () => {
    const certificateElement = document.getElementById('certificate-content');
    if (!certificateElement || !window.html2canvas || !window.jspdf) {
      showMessage('Error: No se pudieron cargar las librerías para generar el PDF.', 'error');
      return;
    }
    try {
      const canvas = await window.html2canvas(certificateElement, { scale: 3, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      let imgW = pdfWidth, imgH = pdfWidth / ratio;
      if (imgH > pdfHeight) { imgH = pdfHeight; imgW = pdfHeight * ratio; }
      pdf.addImage(imgData, 'PNG', (pdfWidth - imgW) / 2, (pdfHeight - imgH) / 2, imgW, imgH);
      pdf.save(`certificado-${studentData.name.replace(/ /g, '_')}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      showMessage('Error al generar el PDF.', 'error');
    }
  };

  const currentDate = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 text-sm sm:text-base sm:text-sm">
      <div className="bg-white rounded-lg sm:rounded-xl shadow-2xl p-4 sm:p-6 relative max-w-5xl w-full flex flex-col max-h-[90vh] text-sm sm:text-base sm:text-sm overflow-y-auto">
        <div className="overflow-y-auto flex-grow">
          <div id="certificate-content" className="p-8 border-4 border-gray-300 bg-white rounded-lg sm:rounded-xl">
            <div className="text-center">
              <img src="/nuevologo.gif" alt="Logo Estudio de Canto" className="h-40 w-auto object-contain mx-auto mb-4" />
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">ESTUDIO DE CANTO SANDRA PALOSCH</h1>
              <p className="text-sm sm:text-base sm:text-sm text-gray-600 mt-4">Certificado de Finalización</p>
            </div>
            <div className="mt-12 text-center text-gray-700">
              <p className="mb-4">Se otorga el presente certificado a</p>
              <p className="text-4xl font-semibold text-rose-600 mb-6 uppercase">{studentData.name}</p>
              <p className="text-4xl text-gray-800">
                Por haber completado satisfactoriamente el programa de estudios de Canto en su modalidad {modality}, correspondiente al ciclo lectivo {year}.
              </p>
            </div>
            <div className="mt-16 flex justify-between items-end">
              <div className="text-center">
                <img src="https://res.cloudinary.com/dgtwruyzj/image/upload/v1754065137/WhatsApp_Image_2025-07-21_at_11.43.30_AM-Photoroom_qi6wgn.png" alt="Firma Sandra Paloschi" className="h-24 w-auto mx-auto" />
                <p className="border-t-2 border-gray-400 pt-2 px-8 text-lg font-medium text-gray-900">Sandra Paloschi</p>
                <p className="text-sm text-gray-600">Directora</p>
              </div>
              <div className="text-center"><p className="text-sm text-gray-600">{currentDate}</p></div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex-shrink-0 flex justify-end gap-2 mt-4 mb-4 space-x-4">
          <button onClick={onClose} className="px-4 sm:px-6 py-1 bg-gray-300 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-gray-400">CERRAR</button>
          <button onClick={handlePrint} className="px-4 sm:px-6 py-1 bg-rose-600 text-white font-semibold rounded-lg shadow-md hover:bg-rose-700">DESCARGAR PDF</button>
        </div>
      </div>
    </div>
  );
};
