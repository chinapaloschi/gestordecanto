import React, { useState, useRef } from 'react';
import { serverTimestamp, collection as fsCollection, addDoc as fsAddDoc } from 'firebase/firestore';
import { ref as stRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db } from '../firebaseConfig.js';
import { formatMoneyAr } from '../utils/money.js';
import { waitForAuthReady, updateReceiptStatus, markStudentReceiptsAsSeen } from '../utils/authHelpers.js';
import { BANK_INFO, copyToClipboard } from './PublicPortalComponents.jsx';
import { __uploadReceiptInline__PATCH__ } from '../utils/authHelpers.js';
export function MinimalReceiptUpload({ appId, student, totalHoy, onRecalculate, receipts = [] }) {
  const [file, setFile] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const fileInputRef = React.useRef(null);

  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  const thisMonthReceipt = receipts.find(r => {
    const d = r.createdAt?.toDate ? r.createdAt.toDate() : r.createdAt ? new Date(r.createdAt) : null;
    if (!d) return false;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === thisMonth;
  });
  const receiptStatus = thisMonthReceipt?.status || null;
  const isAlreadyPending = receiptStatus === 'pending';
  const isApproved = receiptStatus === 'approved';
  const isRejected = receiptStatus === 'rejected';
  const aplicaRecargo = new Date().getDate() >= 9 && (totalHoy || 0) > 0;

  const fmtAr = (n) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n || 0);

  const handleCopy = () => {
    copyToClipboard(BANK_INFO.alias, "Alias copiado");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const okTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
    if (!okTypes.includes(f.type)) { alert("Formato no soportado. Subí PDF o imagen (PNG/JPG/WebP)."); e.target.value = ""; return; }
    if (f.size > 15 * 1024 * 1024) { alert("El archivo supera 15MB."); e.target.value = ""; return; }
    setFile(f);
  };

  const doUpload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await waitForAuthReady();
      const { url, path, filename } = await __uploadReceiptInline__PATCH__({ appId, studentId: student.id, file });
      await fsAddDoc(fsCollection(db, `artifacts/${appId}/students/${student.id}/receipts`), {
        studentId: student.id, storagePath: path, url,
        createdAt: serverTimestamp(), size: file.size, mime: file.type,
        status: "pending", filename, contentType: file.type,
      });
      alert("¡Comprobante enviado! Sandra lo revisará pronto.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      alert(`Error al guardar: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-4">

      {/* Banner estado */}
      {isApproved && (
        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
          <span className="text-xl flex-shrink-0">✅</span>
          <div><p className="font-bold text-green-800 text-sm">Pago confirmado</p><p className="text-xs text-green-600">Tu comprobante fue aprobado para este mes.</p></div>
        </div>
      )}
      {isAlreadyPending && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-xl flex-shrink-0">🕐</span>
          <div><p className="font-bold text-amber-800 text-sm">En revisión</p><p className="text-xs text-amber-600">Sandra revisará tu comprobante pronto.</p></div>
        </div>
      )}
      {isRejected && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-xl flex-shrink-0">❌</span>
          <div>
            <p className="font-bold text-red-800 text-sm">Comprobante rechazado</p>
            {thisMonthReceipt?.rejectionNote && <p className="text-xs text-red-700 mt-0.5">{thisMonthReceipt.rejectionNote}</p>}
            <p className="text-xs text-red-500 mt-1">Podés enviar uno nuevo abajo.</p>
          </div>
        </div>
      )}

      {!isApproved && <>
        {/* Paso 1 — monto */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">① Cuánto transferir</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-4xl font-black text-gray-900">
              {totalHoy == null ? "—" : `$ ${fmtAr(totalHoy)}`}
            </span>
            {aplicaRecargo && (
              <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">+10% recargo</span>
            )}
          </div>
        </div>

        {/* Alias */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Alias CBU / CVU</p>
          <button type="button" onClick={handleCopy}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-rose-50 active:bg-rose-100 border border-gray-200 hover:border-rose-300 rounded-xl transition-all group">
            <span className="font-mono font-bold text-gray-800 text-sm">{BANK_INFO.alias}</span>
            <div className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${copied ? 'text-green-600' : 'text-rose-500 group-hover:text-rose-700'}`}>
              {copied ? (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>¡Copiado!</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>Copiar</>
              )}
            </div>
          </button>
        </div>

        {/* Paso 2 — comprobante */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">② Adjuntá el comprobante</p>
          <input ref={fileInputRef} type="file" accept=".pdf,image/*" onChange={onPick} className="hidden" id="receipt-upload" />

          {!file ? (
            <label htmlFor="receipt-upload"
              className="flex items-center justify-center gap-3 w-full py-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-rose-300 hover:bg-rose-50 bg-gray-50 cursor-pointer transition-all">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-700">Seleccionar archivo</p>
                <p className="text-xs text-gray-400">PDF, imagen — máx 15 MB</p>
              </div>
            </label>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl">
              <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-rose-200 text-rose-400 hover:text-rose-600 flex-shrink-0 text-sm font-bold">
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Botón enviar */}
        <button type="button" disabled={!file || busy || isAlreadyPending} onClick={doUpload}
          className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-40 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm">
          {busy ? (
            <><svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Enviando...</>
          ) : isAlreadyPending ? 'Comprobante ya enviado este mes' : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>Enviar comprobante</>
          )}
        </button>
      </>}
    </div>
  );
}

export function ProfilePictureUploader({ db, appId, student, setStudent, size = 'lg', ringClassName = '' }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor, seleccioná un archivo de imagen.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) { // Límite de 5MB
      setError('La imagen es muy grande (máx 5MB).');
      return;
    }
    setError('');
    handleUpload(file);
  };

  const handleUpload = async (file) => {
    setUploading(true);
    try {
      const storagePath = `students/${student.id}/profilePicture.jpg`;
      const storageRef = stRef(storage, storagePath);
      await uploadBytesResumable(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const studentDocRef = doc(db, `artifacts/${appId}/students`, student.id);
      await updateDoc(studentDocRef, { photoURL: downloadURL });

      setStudent(prevStudent => ({ ...prevStudent, photoURL: downloadURL }));

    } catch (err) {
      console.error("Error al subir la foto:", err);
      setError('No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Preparamos la URL del avatar de fallback
  const fallbackAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.fullName || student.name || 'SP')}&background=fecdd3&color=9f1239&bold=true`;

  const isSm = size === 'sm';
  const avatarClass = isSm ? 'h-16 w-16' : 'h-32 w-32';

  return (
    <div className={isSm ? 'flex-shrink-0' : 'flex flex-col items-center gap-2 mt-4'}>
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={triggerFileSelect}
        className={`relative ${avatarClass} rounded-full group bg-gray-200 flex-shrink-0 ${ringClassName}`}
        title="Cambiar foto de perfil"
        disabled={uploading}
      >
        <img
            src={student.photoURL || fallbackAvatarUrl}
            alt="Perfil"
            className="h-full w-full rounded-full object-cover object-top"
            // Si la URL de la foto falla, carga el avatar de fallback
            onError={(e) => { if (e.target.src !== fallbackAvatarUrl) e.target.src = fallbackAvatarUrl; }}
        />
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 rounded-full flex items-center justify-center transition-opacity">
          {!uploading && !isSm && <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100">Cambiar</span>}
          {uploading && <div className={`${isSm ? 'w-4 h-4 border-2' : 'w-6 h-6 border-2'} border-white border-t-transparent rounded-full animate-spin`}></div>}
        </div>
      </button>
      {error && <p className={`text-red-600 ${isSm ? 'text-[10px] mt-1' : 'text-xs'}`}>{error}</p>}
    </div>
  );
}

// ▼▼▼ PEGA ESTE NUEVO COMPONENTE EN TU App.jsx ▼▼▼
