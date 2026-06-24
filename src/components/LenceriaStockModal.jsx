import { useState, useEffect, useRef, useMemo } from 'react';
import { collection as fsCollection, query, orderBy, limit, onSnapshot, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc, serverTimestamp, addDoc as fsAddDoc } from 'firebase/firestore';
import { ref as stRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../firebaseConfig.js';
import { Modal } from './Modal.jsx';
import { ModalHeader } from './Modal.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { formatMoneyAr, parseMoneyAr } from '../utils/money.js';
import { IconPackage, IconPlusCircle, IconEdit, IconTrash, IconDownload, IconBanknote, IconBan, IconCopy, IconHistory, IconAward } from './Icons.jsx';

const toCsvLine = (arr) => arr.map(v => {
  const s = String(v ?? "").replace(/"/g, '""');
  return `"${s}"`;
}).join(";");

const downloadBlobAs = (filename, blob) => {
  try {
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const finalBlob = new Blob([bom, blob], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(finalBlob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { console.error("Error descargando:", e); }
};

const LOW_STOCK_THRESHOLD = 3;
export function VentaModal({ isOpen, onClose, item, onConfirmVenta }) {
  const [cantidad, setCantidad] = useState(1);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [talleSeleccionado, setTalleSeleccionado] = useState('');
  // ▼▼▼ NUEVO ESTADO PARA EL NOMBRE DEL COMPRADOR ▼▼▼
  const [buyerName, setBuyerName] = useState('');

  useEffect(() => {
    if (isOpen && item?.stockPorTalle) {
      const primerTalleConStock = Object.keys(item.stockPorTalle).find(t => item.stockPorTalle[t] > 0);
      setTalleSeleccionado(primerTalleConStock || '');
      setCantidad(1);
      setMetodoPago('efectivo');
      // Limpiamos el nombre del comprador cada vez que se abre el modal
      setBuyerName('');
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const tallesDisponibles = Object.entries(item.stockPorTalle || {}).filter(([_, stock]) => stock > 0);
  const stockDelTalle = item.stockPorTalle[talleSeleccionado] || 0;
  const precioFinal = metodoPago === 'efectivo' ? item.precioEfectivo : item.precioTransferencia;
  const total = precioFinal * cantidad;

  const handleConfirm = () => {
    if (!talleSeleccionado) {
      alert("Por favor, selecciona un talle.");
      return;
    }
    if (cantidad > stockDelTalle) {
      alert(`No puedes vender más de ${stockDelTalle} unidades para el talle ${talleSeleccionado}.`);
      return;
    }
    
    onConfirmVenta({
      item,
      cantidad,
      talle: talleSeleccionado,
      metodoPago,
      precioUnitario: precioFinal,
      totalVenta: total,
      // ▼▼▼ AÑADIMOS EL NOMBRE DEL COMPRADOR A LOS DATOS DE LA VENTA ▼▼▼
      buyerName: buyerName.trim(),
    });
    
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-100" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-black text-gray-800">Registrar Venta</h3>
        <p className="text-sm text-gray-500 truncate">{item.nombre}</p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Talle</label>
            <select value={talleSeleccionado} onChange={(e) => setTalleSeleccionado(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none">
              {tallesDisponibles.length === 0 ? (<option disabled>Sin stock</option>) : (tallesDisponibles.map(([talle, stock]) => (<option key={talle} value={talle}>{talle} (Stock: {stock})</option>)))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Cantidad (Disponibles: {stockDelTalle})</label>
            <input type="number" value={cantidad} onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value, 10) || 1))} min="1" max={stockDelTalle} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none disabled:opacity-50" disabled={stockDelTalle === 0}/>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Nombre del comprador (opcional)</label>
            <input
              type="text"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Ej: Ana Pérez"
              className="w-full p-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Medio de pago</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button onClick={() => setMetodoPago('efectivo')} className={`p-3 rounded-xl border-2 transition ${metodoPago === 'efectivo' ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <p className="font-bold text-emerald-700 text-sm">Efectivo</p>
                <p className="text-sm text-gray-700">$ {formatMoneyAr(item.precioEfectivo)}</p>
              </button>
              <button onClick={() => setMetodoPago('transferencia')} className={`p-3 rounded-xl border-2 transition ${metodoPago === 'transferencia' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <p className="font-bold text-blue-700 text-sm">Transferencia</p>
                <p className="text-sm text-gray-700">$ {formatMoneyAr(item.precioTransferencia)}</p>
              </button>
            </div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="flex justify-between items-center text-xl font-black text-gray-800">
            <span>Total:</span>
            <span>$ {formatMoneyAr(total)}</span>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition">Cancelar</button>
            <button onClick={handleConfirm} disabled={stockDelTalle === 0} className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold shadow-sm transition disabled:opacity-50">Confirmar Venta</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ImageGalleryModal({ images, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!images || images.length === 0) return null;

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => (prevIndex === 0 ? images.length - 1 : prevIndex - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex === images.length - 1 ? 0 : prevIndex + 1));
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black bg-opacity-80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <img
          src={images[currentIndex]}
          alt={`Vista ampliada ${currentIndex + 1}`}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />
        <button
          onClick={goToPrevious}
          className="absolute top-1/2 left-2 -translate-y-1/2 bg-white/30 text-black rounded-full p-2 hover:bg-white/50 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button
          onClick={goToNext}
          className="absolute top-1/2 right-2 -translate-y-1/2 bg-white/30 text-black rounded-full p-2 hover:bg-white/50 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
          {currentIndex + 1} / {images.length}
        </div>
      </div>
    </div>
  );
}

export function LenceriaStockModal({ isOpen, onClose, db, appId, showMessage, isStandalone = false, size = 'xl' }) {
  const nameSuggestions = {
    europe: ["PARIS", "ROMA", "VIENA", "PRAGA", "LISBOA", "ATENAS", "BERLIN", "DUBLIN"],
    americas: ["HAVANA", "VEGAS", "MIAMI", "CARACAS", "LIMA", "BELIZE", "ARUBA", "KENIA"],
    iconic: ["MILAN", "IBIZA", "MONACO", "DENVER", "DUBAI", "NARA", "OSLO", "JADE"]
  };

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [viewMode, setViewMode] = useState('stock');
  const [salesHistory, setSalesHistory] = useState([]);
  const [salesLoading, setSalesLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [talleFilter, setTalleFilter] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState('');
  const [exportingSales, setExportingSales] = useState(false);
  const [salesDateFrom, setSalesDateFrom] = useState('');
  const [salesDateTo, setSalesDateTo] = useState('');
  const [lowStockBannerDismissed, setLowStockBannerDismissed] = useState(false);
  const [itemMovements, setItemMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('');
  const [precioCosto, setPrecioCosto] = useState('');
  const [porcentajeEfectivo, setPorcentajeEfectivo] = useState('');
  const [porcentajeTransferencia, setPorcentajeTransferencia] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [availableColors, setAvailableColors] = useState([]);
  const [showNewColorInput, setShowNewColorInput] = useState(false);
  const [newColor, setNewColor] = useState('');
  const [stockPorTalle, setStockPorTalle] = useState({});
  const [nuevoTalle, setNuevoTalle] = useState('');
  const [nuevoStock, setNuevoStock] = useState(1);
  const [availableTalles, setAvailableTalles] = useState([]);
  const [showNewTalleInput, setShowNewTalleInput] = useState(false);
  const [newTalleName, setNewTalleName] = useState('');
  const [showVentaModal, setShowVentaModal] = useState(false);
  const [itemParaVender, setItemParaVender] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [galleryImages, setGalleryImages] = useState(null);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [filesToUpload, setFilesToUpload] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  useEffect(() => {
    if (!db || !appId || !isOpen) return;
    setLoading(true);
    const unsub = onSnapshot(query(fsCollection(db, `artifacts/${appId}/lenceriaStock`), orderBy("nombre", "asc")), (snapshot) => {
      const allItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(allItems);
      const uniqueColorsSet = new Set(allItems.map(item => item.color?.toUpperCase()).filter(Boolean));
      setAvailableColors(Array.from(uniqueColorsSet).sort());
      const uniqueTallesSet = new Set();
      allItems.forEach(item => {
        if (item.stockPorTalle) Object.keys(item.stockPorTalle).forEach(talle => uniqueTallesSet.add(talle));
      });
      setAvailableTalles(Array.from(uniqueTallesSet).sort());
      setLoading(false);
    }, (error) => { showMessage("No se pudo cargar el stock.", "error"); setLoading(false); });
    return () => unsub();
  }, [db, appId, isOpen]);

  useEffect(() => { if (isOpen) setLowStockBannerDismissed(false); }, [isOpen]);

  useEffect(() => {
    if (!expandedItemId || !db || !appId) { setItemMovements([]); return; }
    setLoadingMovements(true);
    const movQuery = query(fsCollection(db, `artifacts/${appId}/lenceriaStock/${expandedItemId}/movimientos`), orderBy('fecha', 'desc'), limit(6));
    getDocs(movQuery)
      .then(snap => setItemMovements(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => setItemMovements([]))
      .finally(() => setLoadingMovements(false));
  }, [expandedItemId, db, appId]);

  useEffect(() => {
    if (viewMode !== 'sales' || !db || !appId || !isOpen) return;
    setSalesLoading(true);
    const ventasQuery = query(fsCollection(db, `artifacts/${appId}/lenceriaVentas`), orderBy("fechaVenta", "desc"));
    const unsubscribe = onSnapshot(ventasQuery, (snapshot) => {
      const salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSalesHistory(salesData);
      setSalesLoading(false);
    }, (error) => {
      console.error("Error al cargar historial de ventas: ", error);
      showMessage("No se pudo cargar el historial de ventas.", "error");
      setSalesLoading(false);
    });
    return () => unsubscribe();
  }, [viewMode, db, appId, isOpen]);

  const costoNum = parseMoneyAr(precioCosto);
  const porcEfectivoNum = parseFloat(String(porcentajeEfectivo).replace(',', '.')) || 0;
  const porcTransfNum = parseFloat(String(porcentajeTransferencia).replace(',', '.')) || 0;
  const precioEfectivoCalculado = !isNaN(costoNum) && costoNum > 0 ? costoNum * (1 + porcEfectivoNum / 100) : 0;
  const precioTransferenciaCalculado = !isNaN(costoNum) && costoNum > 0 ? costoNum * (1 + porcTransfNum / 100) : 0;

  const uniqueColorsForFilter = useMemo(() => {
    const colors = new Set(items.map(item => item.color?.toUpperCase()).filter(Boolean));
    return Array.from(colors).sort();
  }, [items]);

  const uniqueTallesForFilter = useMemo(() => {
    const talles = new Set();
    items.forEach(item => {
        if(item.stockPorTalle) {
            Object.keys(item.stockPorTalle).forEach(talle => talles.add(talle));
        }
    });
    return Array.from(talles).sort();
  }, [items]);

  const getTotalStock = (item) => Object.values(item.stockPorTalle || {}).reduce((sum, current) => sum + (Number(current) || 0), 0);
  const getStockStatus = (totalStock) => {
    if (totalStock <= 0) return { key: 'out', label: 'Sin stock', className: 'bg-red-50 text-red-600' };
    if (totalStock <= LOW_STOCK_THRESHOLD) return { key: 'low', label: `Stock bajo · ${totalStock}`, className: 'bg-amber-50 text-amber-600' };
    return { key: 'ok', label: `${totalStock} en stock`, className: 'bg-emerald-50 text-emerald-600' };
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const nameMatch = searchTerm ? (item.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) : true;
      const colorMatch = colorFilter ? (item.color || '').toUpperCase() === colorFilter.toUpperCase() : true;
      const talleMatch = talleFilter ? item.stockPorTalle && Object.keys(item.stockPorTalle).includes(talleFilter) : true;
      const statusMatch = stockStatusFilter ? getStockStatus(getTotalStock(item)).key === stockStatusFilter : true;
      return nameMatch && colorMatch && talleMatch && statusMatch;
    });
  }, [items, searchTerm, colorFilter, talleFilter, stockStatusFilter]);

  const lowStockItems = useMemo(() => {
    return items.filter(item => getStockStatus(getTotalStock(item)).key !== 'ok');
  }, [items]);

  const filteredSalesHistory = useMemo(() => {
    if (!salesDateFrom && !salesDateTo) return salesHistory;
    const from = salesDateFrom ? new Date(`${salesDateFrom}T00:00:00`) : null;
    const to = salesDateTo ? new Date(`${salesDateTo}T23:59:59`) : null;
    return salesHistory.filter(v => {
      const fecha = v.fechaVenta?.toDate ? v.fechaVenta.toDate() : new Date(v.fechaVenta);
      if (from && fecha < from) return false;
      if (to && fecha > to) return false;
      return true;
    });
  }, [salesHistory, salesDateFrom, salesDateTo]);

  const salesSummary = useMemo(() => {
    const totalRevenue = filteredSalesHistory.reduce((acc, v) => acc + (Number(v.totalVenta) || 0), 0);
    const totalUnits = filteredSalesHistory.reduce((acc, v) => acc + (Number(v.cantidad) || 0), 0);
    const cashRevenue = filteredSalesHistory.filter(v => v.metodoPago === 'efectivo').reduce((acc, v) => acc + (Number(v.totalVenta) || 0), 0);
    const transferRevenue = filteredSalesHistory.filter(v => v.metodoPago === 'transferencia').reduce((acc, v) => acc + (Number(v.totalVenta) || 0), 0);
    return { totalRevenue, totalUnits, cashRevenue, transferRevenue, count: filteredSalesHistory.length };
  }, [filteredSalesHistory]);

  const topSellers = useMemo(() => {
    const map = new Map();
    filteredSalesHistory.forEach(v => {
      const key = `${v.nombre}__${v.color}`;
      const entry = map.get(key) || { nombre: v.nombre, color: v.color, unidades: 0, total: 0 };
      entry.unidades += Number(v.cantidad) || 0;
      entry.total += Number(v.totalVenta) || 0;
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.unidades - a.unidades).slice(0, 5);
  }, [filteredSalesHistory]);

  const handleExportSalesCSV = () => {
    if (!filteredSalesHistory.length) { showMessage('No hay ventas para exportar.', 'info'); return; }
    setExportingSales(true);
    try {
      const lines = [toCsvLine(["Fecha", "Producto", "Color", "Talle", "Cantidad", "Comprador", "Medio de pago", "Total"])];
      filteredSalesHistory.forEach(v => {
        const fecha = v.fechaVenta?.toDate ? v.fechaVenta.toDate().toLocaleString('es-AR') : new Date(v.fechaVenta).toLocaleString('es-AR');
        lines.push(toCsvLine([fecha, v.nombre, v.color, v.talle, v.cantidad, v.buyerName, v.metodoPago, v.totalVenta]));
      });
      downloadBlobAs(`ventas_lenceria_${new Date().toISOString().slice(0, 10)}.csv`, new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    } finally {
      setExportingSales(false);
    }
  };

  const resetForm = () => {
    setNombre(''); setColor(''); setPrecioCosto(''); setPorcentajeEfectivo('');
    setPorcentajeTransferencia(''); setEditingItem(null);
    setStockPorTalle({}); setNuevoTalle(''); setNuevoStock(1);
    setShowNewColorInput(false); setNewColor('');
    setShowNewTalleInput(false); setNewTalleName('');
    setShowAddForm(false);
    setPhotoPreviews([]); setFilesToUpload([]);
    if(fileInputRef.current) fileInputRef.current.value = null;
  };

  const handleEditClick = (item) => {
    setEditingItem(item); setNombre(item.nombre || ''); setColor(item.color || '');
    setPrecioCosto(item.precioCosto || ''); setPorcentajeEfectivo(item.porcentajeEfectivo || '');
    setPorcentajeTransferencia(item.porcentajeTransferencia || ''); setStockPorTalle(item.stockPorTalle || {});
    setPhotoPreviews(item.photoURLs || (item.photoURL ? [item.photoURL] : []));
    setShowAddForm(true);
  };

  const handleDuplicateItem = (item) => {
    setEditingItem(null);
    setNombre(item.nombre ? `${item.nombre} (copia)` : '');
    setColor(item.color || '');
    setPrecioCosto(item.precioCosto || '');
    setPorcentajeEfectivo(item.porcentajeEfectivo || '');
    setPorcentajeTransferencia(item.porcentajeTransferencia || '');
    setStockPorTalle({});
    setPhotoPreviews([]); setFilesToUpload([]);
    setShowNewColorInput(false); setNewColor('');
    setShowNewTalleInput(false); setNewTalleName('');
    if (fileInputRef.current) fileInputRef.current.value = null;
    setShowAddForm(true);
    showMessage('Producto duplicado como borrador: revisá los datos (y el stock) y guardalo.', 'info');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      let finalPhotoURLs = editingItem ? (editingItem.photoURLs || (editingItem.photoURL ? [editingItem.photoURL] : [])).filter(url => photoPreviews.includes(url)) : [];
      const uploadPromises = filesToUpload.map(async (file) => {
        const docId = editingItem ? editingItem.id : doc(fsCollection(db, `artifacts/${appId}/lenceriaStock`)).id;
        const fileName = `${Date.now()}-${file.name}`;
        const storagePath = `artifacts/${appId}/lenceriaStock/${docId}/${fileName}`;
        const storageRef = stRef(storage, storagePath);
        await uploadBytesResumable(storageRef, file);
        return await getDownloadURL(storageRef);
      });
      const newUrls = await Promise.all(uploadPromises);
      finalPhotoURLs = [...finalPhotoURLs, ...newUrls];
      const data = {
        nombre: nombre.trim(), color: color.trim(), precioCosto: costoNum,
        porcentajeEfectivo: porcEfectivoNum, porcentajeTransferencia: porcTransfNum,
        precioEfectivo: precioEfectivoCalculado, precioTransferencia: precioTransferenciaCalculado,
        stockPorTalle, updatedAt: serverTimestamp(),
        photoURLs: finalPhotoURLs,
        photoURL: finalPhotoURLs[0] || null
      };
      if (editingItem) {
        await updateDoc(doc(db, `artifacts/${appId}/lenceriaStock`, editingItem.id), data);
        showMessage('Producto actualizado.', 'success');
      } else {
        const newDocRef = doc(fsCollection(db, `artifacts/${appId}/lenceriaStock`));
        await setDoc(newDocRef, { ...data, id: newDocRef.id, createdAt: serverTimestamp() });
        showMessage('Producto agregado.', 'success');
      }
      resetForm();
    } catch (err) {
      showMessage('No se pudo guardar el producto.', 'error');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const logStockMovement = async (itemId, talle, delta, previousValue, newValue) => {
    try {
      await fsAddDoc(fsCollection(db, `artifacts/${appId}/lenceriaStock/${itemId}/movimientos`), {
        talle, delta, previousValue, newValue,
        by: auth.currentUser?.email || auth.currentUser?.uid || 'admin',
        fecha: serverTimestamp(),
      });
    } catch (err) { console.error('No se pudo registrar el movimiento de stock:', err); }
  };

  const adjustStock = async (itemId, talle, amount, { silent = false } = {}) => {
    try {
      const itemRef = doc(db, `artifacts/${appId}/lenceriaStock`, itemId);
      const itemDoc = await getDoc(itemRef);
      if (!itemDoc.exists()) throw new Error("El producto ya no existe en el stock.");
      const currentStock = itemDoc.data().stockPorTalle || {};
      const previousValue = currentStock[talle] || 0;
      const newStockValue = previousValue + amount;
      if (newStockValue < 0) {
        showMessage("Error: No se puede dejar el stock en negativo.", "error");
        return;
      }
      await updateDoc(itemRef, { [`stockPorTalle.${talle}`]: newStockValue });
      if (!silent) await logStockMovement(itemId, talle, amount, previousValue, newStockValue);
    } catch (err) {
      showMessage(`No se pudo actualizar el stock: ${err.message}`, 'error');
      throw err;
    }
  };

  const handleConfirmVenta = async (ventaData) => {
    const { item, cantidad, talle, metodoPago, precioUnitario, totalVenta, buyerName } = ventaData;
    try {
      await adjustStock(item.id, talle, -cantidad, { silent: true });
      const ventasCollectionRef = fsCollection(db, `artifacts/${appId}/lenceriaVentas`);
      const newSaleDoc = {
        itemId: item.id,
        nombre: item.nombre,
        color: item.color,
        talle: talle,
        cantidad: cantidad,
        metodoPago: metodoPago,
        precioUnitario: precioUnitario,
        totalVenta: totalVenta,
        buyerName: buyerName || 'Consumidor Final',
        fechaVenta: serverTimestamp(),
      };
      await fsAddDoc(ventasCollectionRef, newSaleDoc);
      showMessage(`Venta registrada a nombre de ${newSaleDoc.buyerName}.`, 'success');
    } catch (error) {
      console.error("Error al registrar la venta:", error);
      showMessage(`No se pudo registrar la venta: ${error.message}`, 'error');
    }
  };

  const handleDeleteSale = async (saleToDelete) => {
    if (!window.confirm(`¿Seguro que deseas eliminar la venta de "${saleToDelete.nombre}" a ${saleToDelete.buyerName}? Esto devolverá ${saleToDelete.cantidad}u del talle ${saleToDelete.talle} al stock.`)) return;
    try {
      await adjustStock(saleToDelete.itemId, saleToDelete.talle, saleToDelete.cantidad, { silent: true });
      const saleRef = doc(db, `artifacts/${appId}/lenceriaVentas`, saleToDelete.id);
      await deleteDoc(saleRef);
      showMessage("Venta eliminada y stock devuelto.", "success");
    } catch (error) {
      console.error("Error al eliminar la venta:", error);
      showMessage(`No se pudo eliminar la venta: ${error.message}`, 'error');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (window.confirm("¿Eliminar este producto completo?")) {
      try {
        await deleteDoc(doc(db, `artifacts/${appId}/lenceriaStock`, itemId));
        showMessage('Producto eliminado.', 'success');
      } catch (err) { showMessage('No se pudo eliminar.', 'error'); }
    }
  };

  const handleVenderClick = (item) => { setItemParaVender(item); setShowVentaModal(true); };
  const toggleItemExpansion = (itemId) => { setExpandedItemId(prevId => (prevId === itemId ? null : itemId)); };
  
  // Otras funciones auxiliares...
  const generateRandomName = () => {
    const usedNames = new Set(items.map(item => (item.nombre || '').split(' ').pop().toUpperCase()).filter(Boolean));
    const allSuggestions = [...nameSuggestions.europe, ...nameSuggestions.americas, ...nameSuggestions.iconic];
    const availableNames = allSuggestions.filter(name => !usedNames.has(name.toUpperCase()));
    if (availableNames.length === 0) { showMessage("¡Todos los nombres sugeridos ya están en uso!", "info"); return; }
    const randomName = availableNames[Math.floor(Math.random() * availableNames.length)];
    const currentName = nombre.trim();
    const articleCode = currentName.split(' ')[0] || `A${Math.floor(100 + Math.random() * 900)}`;
    setNombre(`${articleCode} ${randomName}`);
  };
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) { showMessage(`La imagen ${file.name} es muy grande (máx 5MB).`, 'error'); return; }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreviews(prev => [...prev, reader.result]);
        setFilesToUpload(prev => [...prev, file]);
      };
      reader.readAsDataURL(file);
    });
  };
  const handleRemovePreview = (indexToRemove) => {
    const previewToRemove = photoPreviews[indexToRemove];
    const isExistingImage = previewToRemove.startsWith('https://firebasestorage.googleapis.com');
    if (isExistingImage && editingItem) {
      const updatedPhotoURLs = (editingItem.photoURLs || []).filter(url => url !== previewToRemove);
      setEditingItem(prev => ({ ...prev, photoURLs: updatedPhotoURLs }));
    } else {
      const localUrlIndex = photoPreviews.findIndex(p => p === previewToRemove && !p.startsWith('http'));
      if (localUrlIndex !== -1) {
          const fileIndex = localUrlIndex - (photoPreviews.length - filesToUpload.length);
          if (fileIndex >= 0) { setFilesToUpload(prev => prev.filter((_, i) => i !== fileIndex)); }
      }
    }
    setPhotoPreviews(prev => prev.filter((_, index) => index !== indexToRemove));
  };
  const handleColorSelect = (e) => {
    const selectedValue = e.target.value;
    if (selectedValue === '__add_new__') { setShowNewColorInput(true); } else { setColor(selectedValue); setShowNewColorInput(false); }
  };
  const handleAddNewColor = () => {
    const trimmedColor = newColor.trim().toUpperCase();
    if (trimmedColor) {
        if (!availableColors.includes(trimmedColor)) { setAvailableColors([...availableColors, trimmedColor].sort()); }
        setColor(trimmedColor); setShowNewColorInput(false); setNewColor('');
    }
  };
  const handleTalleSelect = (e) => {
    const selectedValue = e.target.value;
    if (selectedValue === '__add_new__') { setShowNewTalleInput(true); setNuevoTalle(''); } else { setNuevoTalle(selectedValue); setShowNewTalleInput(false); }
  };
  const handleAddNewTalle = () => {
    const trimmedTalle = newTalleName.trim();
    if (trimmedTalle) {
      if (!availableTalles.includes(trimmedTalle)) { setAvailableTalles([...availableTalles, trimmedTalle].sort()); }
      setNuevoTalle(trimmedTalle); setShowNewTalleInput(false); setNewTalleName('');
    }
  };
  const handleAddTalle = () => {
    const talle = nuevoTalle.trim();
    const stock = Number(nuevoStock);
    if (!talle || stock < 0) { showMessage("Seleccioná un talle y un stock válido.", "error"); return; }
    setStockPorTalle(prev => ({ ...prev, [talle]: (prev[talle] || 0) + stock }));
    setNuevoStock(1);
  };
  const handleRemoveTalle = (talle) => { setStockPorTalle(prev => { const newState = { ...prev }; delete newState[talle]; return newState; }); };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size={size}>
        <div className="flex flex-col h-[calc(100svh-4rem)] sm:max-h-[80vh]">
          <ModalHeader iconNode={<IconPackage />} title="Control de Stock - Lencería" />

          {viewMode === 'stock' && !lowStockBannerDismissed && lowStockItems.length > 0 && (
            <div className="mx-4 mt-3 px-4 py-3 rounded-2xl border border-amber-200 bg-amber-50 flex items-start gap-3">
              <span className="text-lg leading-none">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800">
                  {lowStockItems.length} producto{lowStockItems.length !== 1 ? 's' : ''} con stock bajo o agotado
                </p>
                <p className="text-xs text-amber-700 mt-0.5 truncate">
                  {lowStockItems.slice(0, 5).map(i => `${i.nombre} (${getTotalStock(i)})`).join(' · ')}
                  {lowStockItems.length > 5 ? ` y ${lowStockItems.length - 5} más…` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setLowStockBannerDismissed(true)} className="text-amber-400 hover:text-amber-600 font-bold text-lg leading-none flex-shrink-0" title="Descartar aviso">&times;</button>
            </div>
          )}

          <div className="p-4 border-b border-gray-100 bg-gray-50/50">
             {viewMode === 'stock' ? (
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                <input type="text" placeholder="Buscar por nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white sm:col-span-2 text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none"/>
                <select value={colorFilter} onChange={(e) => setColorFilter(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none">
                  <option value="">Todos los colores</option>
                  {uniqueColorsForFilter.map(color => (<option key={color} value={color}>{color}</option>))}
                </select>
                <select value={talleFilter} onChange={(e) => setTalleFilter(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none">
                  <option value="">Todos los talles</option>
                  {uniqueTallesForFilter.map(talle => (<option key={talle} value={talle}>{talle}</option>))}
                </select>
                <select value={stockStatusFilter} onChange={(e) => setStockStatusFilter(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none">
                  <option value="">Cualquier stock</option>
                  <option value="low">Stock bajo</option>
                  <option value="out">Sin stock</option>
                </select>
                <button onClick={() => { resetForm(); setShowAddForm(true); }} className="w-full px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-bold shadow-sm transition flex items-center justify-center gap-2">
                  <IconPlusCircle /> Añadir
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Historial de Ventas</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="date" value={salesDateFrom} onChange={(e) => setSalesDateFrom(e.target.value)} className="px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none" />
                  <span className="text-xs text-gray-400">a</span>
                  <input type="date" value={salesDateTo} onChange={(e) => setSalesDateTo(e.target.value)} className="px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none" />
                  {(salesDateFrom || salesDateTo) && (
                    <button onClick={() => { setSalesDateFrom(''); setSalesDateTo(''); }} className="text-xs font-bold text-gray-400 hover:text-gray-600 transition">Limpiar</button>
                  )}
                  <button onClick={handleExportSalesCSV} disabled={exportingSales || !filteredSalesHistory.length} className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 transition flex items-center gap-1.5 disabled:opacity-50">
                    <IconDownload /> {exportingSales ? 'Exportando...' : 'Exportar CSV'}
                  </button>
                </div>
              </div>
            )}
            <div className="text-right mt-2">
              <button onClick={() => setViewMode(prev => prev === 'stock' ? 'sales' : 'stock')} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide bg-white border border-gray-200 text-gray-600 rounded-full hover:bg-gray-100 transition">
                {viewMode === 'stock' ? 'Ver Historial de Ventas' : '← Volver al Stock'}
              </button>
            </div>
          </div>
          
          <div className="flex-grow overflow-y-auto">
            {viewMode === 'stock' ? (
              <>
                {showAddForm ? (
                  <div className="p-4 bg-gray-50/60">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Nombre / Descripción</label>
                          <div className="flex items-center gap-2">
                            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: A001 PARIS" className="w-full p-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none" required />
                            <button type="button" onClick={generateRandomName} title="Generar nombre aleatorio" className="p-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 transition flex-shrink-0">🪄</button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Color</label>
                          <select value={color} onChange={handleColorSelect} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none">
                            <option value="">Seleccionar color...</option>
                            {availableColors.map(c => <option key={c} value={c}>{c}</option>)}
                            <option value="__add_new__" className="font-bold text-blue-600">Añadir nuevo color...</option>
                          </select>
                          {showNewColorInput && (
                            <div className="flex items-center gap-2 mt-2">
                              <input type="text" value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="Nuevo color" className="w-full p-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none" />
                              <button type="button" onClick={handleAddNewColor} className="px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm rounded-xl font-bold shadow-sm transition flex-shrink-0">Añadir</button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="p-3 rounded-2xl bg-white shadow-sm border border-gray-100">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Galería de Imágenes</h4>
                          <div className="grid grid-cols-4 gap-2">
                            {photoPreviews.map((preview, index) => (
                              <div key={index} className="relative aspect-square">
                                <img src={preview} alt={`Previsualización ${index + 1}`} className="w-full h-full object-cover rounded-xl" />
                                <button type="button" onClick={() => handleRemovePreview(index)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs font-bold">&times;</button>
                              </div>
                            ))}
                            <label htmlFor="item-photo-upload" className="cursor-pointer aspect-square flex flex-col items-center justify-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-100 transition">
                              <IconPlusCircle />
                              <span className="text-xs mt-1 text-gray-500">Añadir</span>
                            </label>
                            <input id="item-photo-upload" type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={handleFileChange} ref={fileInputRef} multiple />
                          </div>
                        </div>
                        <div className="p-3 rounded-2xl bg-white shadow-sm border border-gray-100">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Talles y Stock</h4>
                          <div className="flex items-end gap-2 mb-2">
                            <div className="flex-1">
                              <label className="text-xs text-gray-500">Talle</label>
                              <select value={nuevoTalle} onChange={handleTalleSelect} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none">
                                <option value="">Seleccionar talle...</option>
                                {availableTalles.map(t => <option key={t} value={t}>{t}</option>)}
                                <option value="__add_new__" className="font-bold text-blue-600">Añadir nuevo talle...</option>
                              </select>
                              {showNewTalleInput && (
                                <div className="flex items-center gap-2 mt-2">
                                  <input type="text" value={newTalleName} onChange={(e) => setNewTalleName(e.target.value)} placeholder="Nuevo talle" className="w-full p-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none"/>
                                  <button type="button" onClick={handleAddNewTalle} className="px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm rounded-xl font-bold shadow-sm transition">Añadir</button>
                                </div>
                              )}
                            </div>
                            <div className="w-20"><label className="text-xs text-gray-500">Stock</label><input type="number" value={nuevoStock} onChange={e=>setNuevoStock(e.target.value)} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none" /></div>
                            <button type="button" onClick={handleAddTalle} className="px-3 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm rounded-xl font-bold shadow-sm transition flex-shrink-0">Agregar</button>
                          </div>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {Object.entries(stockPorTalle).map(([talle, stock]) => (
                              <div key={talle} className="flex justify-between items-center p-2 bg-gray-50 rounded-xl text-sm">
                                <span className="text-gray-700">Talle: <b>{talle}</b> · Stock: <b>{stock}</b></span>
                                <button type="button" onClick={() => handleRemoveTalle(talle)} className="text-red-500 font-bold text-lg leading-none">&times;</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Precio Costo</label>
                          <MoneyInput value={precioCosto} onValueChange={setPrecioCosto} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Efectivo (%) y Final</label>
                          <div className="flex items-center gap-2">
                            <input type="number" step="0.1" value={porcentajeEfectivo} onChange={e => setPorcentajeEfectivo(e.target.value)} placeholder="%" className="w-1/3 p-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none" />
                            <div className="w-2/3 p-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-center font-bold text-sm">$ {formatMoneyAr(precioEfectivoCalculado)}</div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Transferencia (%) y Final</label>
                          <div className="flex items-center gap-2">
                            <input type="number" step="0.1" value={porcentajeTransferencia} onChange={e => setPorcentajeTransferencia(e.target.value)} placeholder="%" className="w-1/3 p-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none" />
                            <div className="w-2/3 p-2.5 rounded-xl bg-blue-50 text-blue-700 text-center font-bold text-sm">$ {formatMoneyAr(precioTransferenciaCalculado)}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={resetForm} className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition">Cancelar</button>
                        <button type="submit" className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold shadow-sm transition disabled:opacity-50" disabled={loading || uploading}>
                          {uploading ? 'Subiendo...' : (loading ? 'Guardando...' : (editingItem ? 'Guardar Cambios' : 'Agregar'))}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div className="p-4">
                    {/* --- LISTA DE PRODUCTOS RESTAURADA --- */}
                    {loading && !items.length ? ( <div className="flex justify-center py-8 gap-1 items-end" style={{height:44}}>{[3,5,4,6,3,5,4].map((h,i)=><div key={i} style={{width:3,height:`${Math.round(h/6*28)}px`,backgroundColor:'#fda4af',borderRadius:2,animation:`soundwave 0.8s ${i*0.15}s ease-in-out infinite alternate`}}/>)}</div> ) : 
                     filteredItems.length === 0 ? ( <p className="text-center text-gray-500 py-8">No hay productos. Hacé clic en "Añadir" para empezar.</p> ) : 
                     (
                      <div className="space-y-3">
                        {filteredItems.map(item => {
                          const totalStock = getTotalStock(item);
                          const status = getStockStatus(totalStock);
                          const isExpanded = expandedItemId === item.id;
                          const mainImage = item.photoURLs?.[0] || item.photoURL;
                          const gallery = item.photoURLs || (item.photoURL ? [item.photoURL] : []);
                          return (
                            <div key={item.id} className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3 flex-grow min-w-0">
                                  <button type="button" onClick={(e) => { e.stopPropagation(); if (gallery.length > 0) setGalleryImages(gallery); }} disabled={gallery.length === 0} className="relative w-24 h-24 rounded-xl bg-gray-100 border border-gray-100 overflow-hidden flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-default disabled:focus:ring-0">
                                    {mainImage ? ( <img src={mainImage} alt={item.nombre} className="w-full h-full object-cover" /> ) : ( <div className="w-full h-full flex items-center justify-center text-gray-400"><IconPackage /></div> )}
                                    {gallery.length > 1 && ( <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[10px] px-1 rounded-sm flex items-center gap-0.5"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>{gallery.length}</div> )}
                                  </button>
                                  <div onClick={() => toggleItemExpansion(item.id)} className="cursor-pointer min-w-0">
                                    <p className="font-bold text-gray-800 truncate">{item.nombre} <span className="text-sm font-normal text-gray-500">({item.color})</span></p>
                                    <span className={`inline-block mt-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button onClick={() => toggleItemExpansion(item.id)} className="p-1.5 rounded-full hover:bg-gray-100">
                                    <span className={`transform transition-transform text-gray-400 ${isExpanded ? 'rotate-180' : ''}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg></span>
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); handleEditClick(item); }} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500" title="Editar"><IconEdit /></button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDuplicateItem(item); }} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500" title="Duplicar producto"><IconCopy /></button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-full" title="Eliminar"><IconTrash /></button>
                                </div>
                              </div>
                              {isExpanded && (
                                <>
                                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Talles y stock</p>
                                    {Object.keys(item.stockPorTalle || {}).length > 0 ? Object.entries(item.stockPorTalle || {}).map(([talle, stock]) => (
                                      <div key={talle} className="flex items-center justify-between p-2 bg-gray-50 rounded-xl">
                                         <span className="font-semibold text-sm text-gray-700">Talle: {talle}</span>
                                         <div className="flex items-center gap-2">
                                            <button onClick={() => adjustStock(item.id, talle, -1)} className="w-7 h-7 rounded-full bg-white border border-gray-200 font-bold text-gray-600 hover:bg-gray-100 transition">-</button>
                                            <span className="text-base font-bold w-8 text-center">{stock}</span>
                                            <button onClick={() => adjustStock(item.id, talle, 1)} className="w-7 h-7 rounded-full bg-white border border-gray-200 font-bold text-gray-600 hover:bg-gray-100 transition">+</button>
                                         </div>
                                      </div>
                                    )) : <p className="text-xs text-center text-gray-500">No hay talles cargados.</p>}
                                  </div>
                                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5"><IconHistory /> Movimientos recientes</p>
                                    {loadingMovements ? (
                                      <p className="text-xs text-center text-gray-400 py-1">Cargando...</p>
                                    ) : itemMovements.length === 0 ? (
                                      <p className="text-xs text-center text-gray-400 py-1">Sin ajustes manuales registrados todavía.</p>
                                    ) : (
                                      itemMovements.map(mov => (
                                        <div key={mov.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-xl">
                                          <span className="text-gray-600">
                                            Talle <strong>{mov.talle}</strong>:{' '}
                                            <strong className={mov.delta > 0 ? 'text-emerald-600' : 'text-red-600'}>{mov.delta > 0 ? `+${mov.delta}` : mov.delta}</strong>
                                            {' '}({mov.previousValue} → {mov.newValue})
                                          </span>
                                          <span className="text-gray-400 flex-shrink-0 ml-2">{mov.fecha?.toDate ? mov.fecha.toDate().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                  <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-4 gap-3 text-center items-center">
                                    <button onClick={() => handleVenderClick(item)} disabled={totalStock <= 0} className="px-3 py-2 text-sm font-bold rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm transition disabled:opacity-40 disabled:from-gray-300 disabled:to-gray-300">Vender</button>
                                    <div><p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Costo</p><p className="font-semibold text-gray-700">${formatMoneyAr(item.precioCosto)}</p></div>
                                    <div><p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Efectivo</p><p className="font-semibold text-emerald-600">${formatMoneyAr(item.precioEfectivo)}</p></div>
                                    <div><p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Transf.</p><p className="font-semibold text-blue-600">${formatMoneyAr(item.precioTransferencia)}</p></div>
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 space-y-4">
                {salesLoading ? (
                  <p className="text-center text-gray-500 py-8">Cargando historial...</p>
                ) : salesHistory.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No se ha registrado ninguna venta.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Ventas</p>
                        <p className="text-lg font-black text-gray-800">{salesSummary.count}</p>
                      </div>
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Unidades</p>
                        <p className="text-lg font-black text-gray-800">{salesSummary.totalUnits}</p>
                      </div>
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Efectivo</p>
                        <p className="text-lg font-black text-emerald-600">${formatMoneyAr(salesSummary.cashRevenue)}</p>
                      </div>
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Transferencia</p>
                        <p className="text-lg font-black text-blue-600">${formatMoneyAr(salesSummary.transferRevenue)}</p>
                      </div>
                    </div>
                    {topSellers.length > 0 && (
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5"><IconAward /> Top 5 más vendidos</p>
                        <div className="space-y-1.5">
                          {topSellers.map((s, i) => (
                            <div key={`${s.nombre}-${s.color}-${i}`} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-xl">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-rose-400 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                <span className="truncate text-gray-700 font-semibold">{s.nombre} <span className="font-normal text-gray-500">({s.color})</span></span>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span className="font-bold text-gray-800">{s.unidades}u</span>
                                <span className="text-xs text-gray-400 ml-2">${formatMoneyAr(s.total)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {filteredSalesHistory.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">No hay ventas en el rango de fechas seleccionado.</p>
                    ) : (
                    <div className="space-y-3">
                      {filteredSalesHistory.map(venta => (
                        <div key={venta.id} className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-rose-400 text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                                {(venta.buyerName || '?').trim().charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-gray-800 truncate">{venta.nombre} <span className="font-normal text-gray-500">({venta.color})</span></p>
                                <p className="text-sm text-gray-600">Vendido a <strong>{venta.buyerName}</strong></p>
                                <p className="text-sm text-gray-500">Talle: <strong>{venta.talle}</strong> · Cantidad: <strong>{venta.cantidad}</strong></p>
                                <p className="text-xs text-gray-400 mt-1">{venta.fechaVenta?.toDate ? venta.fechaVenta.toDate().toLocaleString('es-AR') : new Date(venta.fechaVenta).toLocaleString('es-AR')}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end flex-shrink-0">
                              <p className="text-lg font-black text-gray-900">${formatMoneyAr(venta.totalVenta)}</p>
                              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mb-2 ${venta.metodoPago === 'efectivo' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>{venta.metodoPago}</span>
                              <button onClick={() => handleDeleteSale(venta)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors" title="Eliminar venta y devolver stock"><IconTrash /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <VentaModal 
        isOpen={showVentaModal}
        onClose={() => setShowVentaModal(false)}
        item={itemParaVender}
        onConfirmVenta={handleConfirmVenta}
      />
      
      <ImageGalleryModal images={galleryImages} onClose={() => setGalleryImages(null)} />
    </>
  );
}
