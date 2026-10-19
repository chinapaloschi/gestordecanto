// Lectura automática del monto de un comprobante (captura de transferencia)
// usando OCR en el navegador (Tesseract.js, cargado on-demand desde un CDN —
// mismo patrón que jsPDF en MainApp.jsx). No hay backend ni costo de API
// involucrados. Pensado para los comprobantes de Mercado Pago/bancos que ya
// vemos en la app: texto digital nítido tipo "$ 110.000".

let tesseractLoadPromise = null;

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (tesseractLoadPromise) return tesseractLoadPromise;
  tesseractLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
    script.onload = () => resolve();
    script.onerror = () => { tesseractLoadPromise = null; reject(new Error('No se pudo cargar el lector de texto.')); };
    document.head.appendChild(script);
  });
  return tesseractLoadPromise;
}

// Busca montos con el formato argentino típico de estos comprobantes
// ("$ 110.000", "$110.000,50") y se queda con el que tenga más dígitos —
// en una captura de transferencia, el monto principal casi siempre es el
// número más grande precedido de "$" (CBU/CUIT no llevan signo pesos).
export function parseAmountFromText(text) {
  const matches = [...text.matchAll(/\$\s*([\d.,]{3,})/g)].map(m => m[1]);
  if (matches.length === 0) return null;

  const toNumber = (raw) => {
    const cleaned = raw.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  const candidates = matches.map(toNumber).filter(n => n && n > 0);
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

export async function ocrAmountFromImage(url) {
  await loadTesseract();
  const { data } = await window.Tesseract.recognize(url, 'spa');
  return parseAmountFromText(data.text || '');
}
