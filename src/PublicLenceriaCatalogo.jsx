// PublicLenceriaCatalogo.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { collection as fsCollection, onSnapshot, query, orderBy } from 'firebase/firestore';

// --- Tus componentes y helpers ---
const formatMoneyAr = (num) => {
  if (num === '' || num === null || num === undefined) return '';
  const n = Number(num);
  if (Number.isNaN(n)) return '';
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
};

const LOGO_URL = "/logolenceria.jpeg";
const PERSONAL_PAY_QR_URL = "/qr-personal-pay.png";

function ImageGalleryModal({ images, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  if (!images || images.length === 0) return null;
  const goToPrevious = () => setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  const goToNext = () => setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  return (
    <div className="fixed inset-0 z-[70] bg-black bg-opacity-80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <img src={images[currentIndex]} alt={`Vista ampliada ${currentIndex + 1}`} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl" />
        <button onClick={goToPrevious} className="absolute top-1/2 left-2 -translate-y-1/2 bg-white/30 text-black rounded-full p-2 hover:bg-white/50 transition">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={goToNext} className="absolute top-1/2 right-2 -translate-y-1/2 bg-white/30 text-black rounded-full p-2 hover:bg-white/50 transition">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
          {currentIndex + 1} / {images.length}
        </div>
      </div>
    </div>
  );
}

function PersonalPayModal({ isOpen, onClose, item }) {
  if (!isOpen || !item) return null;
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => alert("¡Monto copiado!"));
  };
  const precioFinal = item.precioTransferencia;
  return (
    <div className="fixed inset-0 z-[70] bg-black bg-opacity-70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-800">Pagá con QR</h3>
        <p className="text-sm text-gray-600 mt-1">Escaneá con Personal Pay o cualquier billetera virtual.</p>
        <div className="my-4">
          <img src={PERSONAL_PAY_QR_URL} alt="Código QR" className="w-48 h-48 mx-auto rounded-lg border-4 border-gray-200" />
        </div>
        <div className="bg-gray-50 p-3 rounded-lg border">
          <p className="text-sm text-gray-600">Tenés que transferir:</p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className="text-2xl font-bold text-gray-900">$ {formatMoneyAr(precioFinal)}</p>
            <button onClick={() => handleCopy(precioFinal.toString())} className="px-2 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded hover:bg-gray-300">Copiar</button>
          </div>
        </div>
        <button onClick={onClose} className="mt-6 w-full px-4 py-2 bg-gray-800 text-white font-semibold rounded-lg hover:bg-black">Entendido</button>
      </div>
    </div>
  );
}

// ▼▼▼ NUEVO COMPONENTE PARA ELEGIR PAGO ▼▼▼
function PaymentChoiceModal({ isOpen, onClose, item }) {
  const [view, setView] = useState('choice'); // 'choice', 'alias', 'qr'
  
  useEffect(() => {
    if (isOpen) { setView('choice'); }
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text).then(() => alert(`¡${label} copiado!`));
  };

  const renderChoiceView = () => (
    <>
      <h3 className="text-lg font-bold text-gray-800">Elige tu método de pago</h3>
      <p className="text-sm text-gray-600 mt-1">¿Cómo preferís abonar tu conjunto?</p>
      <div className="mt-6 space-y-3">
        <button 
          onClick={() => setView('qr')}
          className="w-full flex items-center gap-3 p-4 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition"
        >
          <img src="https://img.icons8.com/color/48/mercado-pago.png" alt="QR" className="w-8 h-8"/>
          <div>
            <p className="font-semibold text-left text-gray-800">Pagar con QR</p>
            <p className="text-xs text-left text-gray-500">Usa Mercado Pago o cualquier billetera virtual.</p>
          </div>
        </button>
        <button 
          onClick={() => setView('alias')}
          className="w-full flex items-center gap-3 p-4 border-2 border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          <div>
            <p className="font-semibold text-left text-gray-800">Transferencia / Alias</p>
            <p className="text-xs text-left text-gray-500">Desde Personal Pay o tu home banking.</p>
          </div>
        </button>
      </div>
    </>
  );

  const renderAliasView = () => (
    <>
      <button onClick={() => setView('choice')} className="text-sm text-blue-600 hover:underline mb-2">‹ Volver a las opciones</button>
      <h3 className="text-lg font-bold text-gray-800">Datos para Transferencia</h3>
      <div className="mt-4 bg-gray-50 p-4 rounded-lg border">
        <p className="text-sm text-gray-600">Alias de Personal Pay:</p>
        <div className="flex items-center justify-between gap-2 mt-1">
            <p className="text-xl font-mono font-bold text-gray-900">Grecelingerie</p>
            <button onClick={() => handleCopy('Grecelingerie', 'Alias')} className="px-3 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded hover:bg-gray-300">Copiar</button>
        </div>
      </div>
      <div className="mt-3 bg-gray-50 p-3 rounded-lg border">
          <p className="text-sm text-gray-600">Tenés que transferir:</p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className="text-2xl font-bold text-gray-900">$ {formatMoneyAr(item.precioTransferencia)}</p>
            <button onClick={() => handleCopy(item.precioTransferencia.toString(), 'Monto')} className="px-2 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded hover:bg-gray-300">Copiar</button>
          </div>
      </div>
    </>
  );
  
  return (
    <div className="fixed inset-0 z-[70] bg-black bg-opacity-70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
        {view === 'choice' && renderChoiceView()}
        {view === 'alias' && renderAliasView()}
        {view === 'qr' && <PersonalPayModal isOpen={true} onClose={() => setView('choice')} item={item} />}
        
        <button onClick={onClose} className="mt-6 w-full px-4 py-2 bg-gray-800 text-white font-semibold rounded-lg hover:bg-black">
          {view === 'choice' ? 'Cerrar' : 'Entendido'}
        </button>
      </div>
    </div>
  );
}

// ▼▼▼ REEMPLAZA TU COMPONENTE 'ProductDetailModal' CON ESTA VERSIÓN CORREGIDA ▼▼▼

function ProductDetailModal({ item, onClose, onBuyClick, onImageClick }) {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        setCurrentIndex(0);
    }, [item]);
    
    if (!item) return null;

    const { nombre, color, stockPorTalle, precioEfectivo, precioTransferencia, photoURLs, photoURL } = item;
    const isOutOfStock = Object.values(stockPorTalle || {}).reduce((sum, current) => sum + (current || 0), 0) === 0;
    const hasMultipleImages = photoURLs && photoURLs.length > 1;
    const currentImage = hasMultipleImages ? photoURLs[currentIndex] : (photoURLs?.[0] || photoURL);

    const goToPrevious = (e) => { e.stopPropagation(); const isFirstSlide = currentIndex === 0; setCurrentIndex(isFirstSlide ? photoURLs.length - 1 : currentIndex - 1); };
    const goToNext = (e) => { e.stopPropagation(); const isLastSlide = currentIndex === photoURLs.length - 1; setCurrentIndex(isLastSlide ? 0 : currentIndex + 1); };
    
    let displayName = nombre;
    const nameParts = nombre.split(' ');
    if (nameParts.length > 1 && /^[A-Z0-9]+$/i.test(nameParts[0])) { displayName = nameParts.slice(1).join(' '); }
    const availableSizes = Object.entries(stockPorTalle || {}).filter(([talle, stock]) => stock > 0).map(([talle]) => talle).join(' / ');
    const whatsappLink = `https://wa.me/5492216141254?text=${encodeURIComponent(`¡Hola! Me interesa el conjunto *${displayName}*. ¿Sigue disponible?`)}`;

    const productUrl = window.location.href;
    const shareText = encodeURIComponent(`¡Mirá este conjunto increíble! "${displayName}" de Grèce Lingerie. Disponible en:`);
    const instagramCaption = encodeURIComponent(`¡Mirá este conjunto increíble! "${displayName}" de Grèce Lingerie.\n\n#GreceLingerie #Lenceria #Conjunto #ModaIntima`);
    
    const shareLinks = {
        whatsapp: `https://api.whatsapp.com/send?text=${shareText}%20${encodeURIComponent(productUrl)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productUrl)}`,
        twitter: `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(productUrl)}`,
        instagram: `https://www.instagram.com/grecelingerie/?caption=${instagramCaption}&utm_source=ig_web_copy_link`
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black bg-opacity-60 flex items-center justify-center p-4" onClick={onClose}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl flex flex-col sm:flex-row max-h-[95vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="w-full sm:w-1/2 relative flex-shrink-0" onClick={() => hasMultipleImages && onImageClick(photoURLs)}>
              {currentImage && (<img src={currentImage} alt={displayName} className="w-full h-auto max-h-[45vh] sm:h-full object-contain sm:object-cover rounded-t-lg sm:rounded-l-lg sm:rounded-r-none" />)}
              {hasMultipleImages && (
                <>
                  <button onClick={goToPrevious} className="absolute top-1/2 left-2 -translate-y-1/2 bg-black/30 text-white rounded-full p-2 hover:bg-black/50 transition"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                  <button onClick={goToNext} className="absolute top-1/2 right-2 -translate-y-1/2 bg-black/30 text-white rounded-full p-2 hover:bg-black/50 transition"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">{currentIndex + 1} / {photoURLs.length}</div>
                </>
              )}
               {isOutOfStock && (<div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-t-lg sm:rounded-l-lg sm:rounded-r-none"><span className="text-white font-bold text-lg tracking-widest bg-black bg-opacity-50 px-4 py-2 rounded">AGOTADO</span></div>)}
            </div>

            <div className="w-full sm:w-1/2 p-4 flex flex-col text-center flex-1">
              <div className="flex-shrink-0">
                  <h2 className="text-xl font-bold text-gray-800 uppercase">{displayName}</h2>
                  <p className="text-sm text-gray-500 capitalize">{color}</p>
              </div>
              
              <div className="flex-grow flex flex-col justify-center py-2 px-4">
              <div className="grid grid-cols-2 gap-3 border-t pt-2 mt-2">
    <div><p className="text-xs font-semibold text-gray-500">Efectivo</p><p className="text-xl font-bold text-green-700">${formatMoneyAr(precioEfectivo)}</p></div>
    <div><p className="text-xs font-semibold text-gray-500">Transferencia / QR</p><p className="text-xl font-bold text-blue-700">${formatMoneyAr(precioTransferencia)}</p></div>
</div>
                <div className="border-t pt-2 mt-2"><h4 className="text-xs uppercase font-bold text-gray-500 mb-1">Talles Disponibles</h4><p className="text-base font-bold text-gray-800 tracking-wider">{availableSizes || "Consultar"}</p></div>
              </div>

              <div className="flex-shrink-0">
                <div className="pt-2 border-t px-4">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Compartir en:</p>
                  <div className="flex justify-center items-center gap-4">
                    {/* --- ICONO DE WHATSAPP CORREGIDO CON EL SVG QUE PROPORCIONASTE --- */}
                    <a href={shareLinks.whatsapp} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" className="h-5 w-5" viewBox="0 0 16 16">
                            <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/>
                        </svg>
                    </a>
                    {/* Facebook */}
                    <a href={shareLinks.facebook} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-1.5c-1 0-1.5.5-1.5 1.5V12h3l-.5 3h-2.5v6.8c4.56-.93 8-4.96 8-9.8z"/></svg>
                    </a>
                    {/* Instagram */}
                    <a href={shareLinks.instagram} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-pink-100 text-pink-600 hover:bg-pink-200 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.85s-.011 3.584-.069 4.85c-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.85-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.85s.012-3.584.07-4.85c.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.85-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948s-.014-3.667-.072-4.947c-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.162 6.162 6.162 6.162-2.759 6.162-6.162-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4s1.791-4 4-4 4 1.79 4 4-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                    </a>
                    {/* Twitter */}
                    <a href={shareLinks.twitter} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-sky-100 text-sky-600 hover:bg-sky-200 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.46 6c-.77.35-1.6.58-2.46.67.88-.53 1.56-1.37 1.88-2.38-.83.49-1.74.85-2.7 1.03A4.37 4.37 0 0016.1 4c-2.38 0-4.3 1.92-4.3 4.3 0 .34.04.67.11.98C8.28 9.09 5.15 7.38 3 4.79c-.35.6-.55 1.29-.55 2.04 0 1.49.76 2.81 1.91 3.58-.7-.02-1.36-.21-1.94-.53v.05c0 2.08 1.48 3.82 3.44 4.21a4.34 4.34 0 01-1.93.07 4.3 4.3 0 004 3c-1.47 1.15-3.34 1.83-5.36 1.83-.35 0-.69-.02-1.03-.06C3.44 20.29 5.7 21 8.12 21c7.35 0 11.37-6.08 11.37-11.37 0-.17 0-.34-.01-.51.78-.57 1.45-1.28 1.98-2.08z"/></svg>
                    </a>
                  </div>
                </div>
                <div className="mt-4 px-4">
                  {isOutOfStock ? ( <div className="block w-full bg-gray-300 text-gray-500 text-center py-2 rounded-lg text-sm font-semibold cursor-not-allowed">Agotado</div>) : (
                      <div className="w-full grid grid-cols-2 gap-3">
                        <button onClick={() => onBuyClick(item)} className="w-full bg-blue-500 text-white text-center py-2 rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors">Comprar</button>
                        <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="w-full bg-green-500 text-white text-center py-2 rounded-lg text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center">Consultar</a>
                      </div>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="absolute top-2 right-2 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
        </div>
    );
}
export default function PublicLenceriaCatalogo({ db, appId }) {
  // ▼▼▼ AÑADÍ ESTE BLOQUE ▼▼▼
  React.useEffect(() => {
    // Establece el título de la pestaña cuando el catálogo se carga
    document.title = 'Grèce Lingerie - Catálogo';

    // Opcional: Devuelve el título original cuando el componente se "desmonta"
    return () => {
      document.title = 'Estudio Sandra Paloschi'; // (O el título que tengas en tu index.html)
    };
  }, []); // El array vacío [] significa que esto se ejecuta solo una vez
  // ▲▲▲ FIN DEL BLOQUE NUEVO ▲▲▲
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [galleryImages, setGalleryImages] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemForPaymentChoice, setItemForPaymentChoice] = useState(null);

  const [talleFilter, setTalleFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [sortBy, setSortBy] = useState('nombreAsc');

  useEffect(() => {
    if (!db || !appId) return;
    setLoading(true);
    const q = query(fsCollection(db, `artifacts/${appId}/lenceriaStock`), orderBy("nombre", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => { console.error("Error al cargar:", error); setLoading(false); });
    return () => unsub();
  }, [db, appId]);
  
  const uniqueTalles = useMemo(() => {
    const talles = new Set();
    items.forEach(item => { if (item.stockPorTalle) { Object.keys(item.stockPorTalle).forEach(talle => talles.add(talle)); } });
    return Array.from(talles).sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
  }, [items]);

  const uniqueColors = useMemo(() => {
    const colors = new Set(items.map(item => item.color?.toUpperCase()).filter(Boolean));
    return Array.from(colors).sort();
  }, [items]);

  const filteredAndSortedItems = useMemo(() => {
    let processedItems = [...items];
    if (talleFilter) { processedItems = processedItems.filter(item => item.stockPorTalle && (item.stockPorTalle[talleFilter] || 0) > 0); }
    if (colorFilter) { processedItems = processedItems.filter(item => item.color?.toUpperCase() === colorFilter.toUpperCase()); }
    if (sortBy === 'precioAsc') processedItems.sort((a, b) => (a.precioTransferencia || 0) - (b.precioTransferencia || 0));
    if (sortBy === 'precioDesc') processedItems.sort((a, b) => (b.precioTransferencia || 0) - (a.precioTransferencia || 0));
    return processedItems;
  }, [items, talleFilter, colorFilter, sortBy]);

  const handleResetFilters = () => { setTalleFilter(''); setColorFilter(''); setSortBy('nombreAsc'); };

  return (
    <>
      <div className="min-h-screen bg-rose-50 font-sans">
        <header className="bg-white shadow-md py-6 text-center sticky top-0 z-10">
          <div className="flex flex-col items-center justify-center">
            <img src={LOGO_URL} alt="Grece Lingerie Logo" className="h-24 mb-2" />
            <h1 className="text-2xl font-bold tracking-widest text-gray-900 uppercase">Catálogo</h1>
          </div>
        </header>

        <div className="p-4 bg-white border-b border-t border-gray-200 sticky top-[137px] z-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-6xl mx-auto">
            <select value={talleFilter} onChange={(e) => setTalleFilter(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"><option value="">Todos los Talles</option>{uniqueTalles.map(talle => <option key={talle} value={talle}>{talle}</option>)}</select>
            <select value={colorFilter} onChange={(e) => setColorFilter(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"><option value="">Todos los Colores</option>{uniqueColors.map(color => <option key={color} value={color}>{color}</option>)}</select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"><option value="nombreAsc">Ordenar por Nombre</option><option value="precioAsc">Precio: más bajo</option><option value="precioDesc">Precio: más alto</option></select>
            <button onClick={handleResetFilters} className="w-full p-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300">Limpiar Filtros</button>
          </div>
        </div>

        {loading ? (<div className="flex flex-col justify-center items-center p-20 gap-3"><div className="flex gap-1 items-end" style={{height:36}}>{[3,5,4,6,3,5,4].map((h,i)=><div key={i} style={{width:3,height:`${Math.round(h/6*28)}px`,backgroundColor:'#fda4af',borderRadius:2,animation:`soundwave 0.8s ${i*0.15}s ease-in-out infinite alternate`}}/>)}</div></div>) : 
         filteredAndSortedItems.length === 0 ? (<p className="text-center text-gray-600 p-10">No se encontraron productos.</p>) : 
         (<div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredAndSortedItems.map(item => {
              const mainImage = item.photoURLs?.[0] || item.photoURL;
              const isOutOfStock = Object.values(item.stockPorTalle || {}).reduce((sum, current) => sum + (current || 0), 0) === 0;
              let displayName = item.nombre.split(' ').slice(1).join(' '); if (!displayName) displayName = item.nombre;
              return (
                <div key={item.id} className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col group">
                  <button onClick={() => setSelectedItem(item)} className="relative aspect-square w-full overflow-hidden">
                    {mainImage ? (<img src={mainImage} alt={displayName} className="w-full h-full object-cover border-b-2 border-gray-200" />) : (<div className="w-full h-full bg-gray-100"></div>)}
                    {isOutOfStock && (<div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center"><span className="text-white font-bold tracking-widest bg-black bg-opacity-50 px-4 py-2 rounded">AGOTADO</span></div>)}
                  </button>
                  <div className="p-3 flex-grow flex flex-col justify-between text-center">
                    <h3 className="font-bold text-gray-800 text-sm truncate uppercase">{displayName}</h3>
                    <p className="text-xs text-gray-500 mt-1">Desde <span className="font-semibold text-gray-800">${formatMoneyAr(item.precioEfectivo)}</span></p>
                  </div>
                  <button onClick={() => setSelectedItem(item)} className="block w-full bg-gray-800 text-white text-center py-2 text-xs font-semibold hover:bg-black transition-colors">Ver Detalles</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      <ImageGalleryModal images={galleryImages} onClose={() => setGalleryImages(null)} />
      
      <ProductDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onBuyClick={(item) => {
          setSelectedItem(null);
          setItemForPaymentChoice(item);
        }}
        onImageClick={setGalleryImages}
      />

      <PaymentChoiceModal
        isOpen={!!itemForPaymentChoice}
        onClose={() => setItemForPaymentChoice(null)}
        item={itemForPaymentChoice}
      />
    </>
  );
}
