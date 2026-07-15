import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref as stRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig.js';
import { formatMoneyAr, parseMoneyAr } from '../utils/money.js';

const DEFAULT_FORM = { title: '', description: '', price: '' };

export function ExercisePacksManager({ db, appId, onClose }) {
  const [packs, setPacks] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!db || !appId) return;
    const unsub = onSnapshot(collection(db, `artifacts/${appId}/exercisePacks`), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPacks(list);
    });
    return unsub;
  }, [db, appId]);

  const uploadFilesToPack = async (packId, files) => {
    setUploadingId(packId);
    try {
      const uploaded = [];
      for (const file of files) {
        const path = `exercisePacks/${appId}/${packId}/${Date.now()}_${file.name}`;
        const sRef = stRef(storage, path);
        await uploadBytesResumable(sRef, file);
        const url = await getDownloadURL(sRef);
        uploaded.push({ name: file.name, url, path, type: file.type.startsWith('video') ? 'video' : 'audio' });
      }
      await updateDoc(doc(db, `artifacts/${appId}/exercisePacks`, packId), { files: arrayUnion(...uploaded) });
    } catch (err) {
      console.error(err);
      alert('Error al subir archivos: ' + err.message);
    }
    setUploadingId(null);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const docRef = await addDoc(collection(db, `artifacts/${appId}/exercisePacks`), {
        title: form.title.trim(),
        description: form.description.trim(),
        price: Number(parseMoneyAr(form.price)) || 0,
        files: [],
        isActive: true,
        createdAt: new Date(),
      });
      if (pendingFiles.length) await uploadFilesToPack(docRef.id, pendingFiles);
      setForm(DEFAULT_FORM);
      setPendingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error(err);
      alert('Error al crear el pack: ' + err.message);
    }
    setSaving(false);
  };

  const toggleActive = (pack) =>
    updateDoc(doc(db, `artifacts/${appId}/exercisePacks`, pack.id), { isActive: !pack.isActive });

  const removeFile = (pack, file) => {
    if (!window.confirm(`¿Quitar "${file.name}" del pack?`)) return;
    updateDoc(doc(db, `artifacts/${appId}/exercisePacks`, pack.id), { files: arrayRemove(file) });
  };

  const handleDelete = (pack) => {
    if (!window.confirm(`¿Eliminar el pack "${pack.title}"? Los archivos ya subidos no se borran del almacenamiento, pero el pack deja de mostrarse.`)) return;
    deleteDoc(doc(db, `artifacts/${appId}/exercisePacks`, pack.id));
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-black text-gray-900">Packs de ejercicios</h2>
            <p className="text-xs text-gray-400 mt-0.5">Rutinas / vocalizaciones para vender</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <form onSubmit={handleAdd} className="bg-rose-50 border border-rose-100 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-black text-rose-700 uppercase tracking-widest">Nuevo pack</p>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Título</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Ej: Calentamiento vocal diario"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-400" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Descripción</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Qué incluye, para quién es..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Precio ($)</label>
              <input value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="5000" inputMode="numeric"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-400" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Archivos (audio o video)</label>
              <input ref={fileInputRef} type="file" multiple accept="audio/*,video/*"
                onChange={e => setPendingFiles(Array.from(e.target.files || []))}
                className="w-full text-xs" />
              {pendingFiles.length > 0 && <p className="text-xs text-gray-400 mt-1">{pendingFiles.length} archivo(s) listo(s) para subir</p>}
            </div>
            <button type="submit" disabled={saving || !form.title.trim()}
              className="w-full py-2.5 bg-rose-600 text-white font-bold text-sm rounded-xl hover:bg-rose-700 transition disabled:opacity-50">
              {saving ? 'Guardando...' : '+ Crear pack'}
            </button>
          </form>

          {packs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-3xl mb-2">🎵</p>
              <p className="text-sm">No hay packs creados todavía.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {packs.map(pack => (
                <div key={pack.id} className={`p-3 rounded-xl border ${pack.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{pack.title}</p>
                      {pack.description && <p className="text-xs text-gray-400 mt-0.5">{pack.description}</p>}
                      <p className="text-xs font-bold text-rose-600 mt-1">${formatMoneyAr(pack.price)}</p>
                    </div>
                    <button onClick={() => toggleActive(pack)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg transition flex-shrink-0 ${pack.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
                      {pack.isActive ? 'Activo' : 'Inactivo'}
                    </button>
                    <button onClick={() => handleDelete(pack)} className="text-gray-300 hover:text-red-500 transition p-1 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {pack.files?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {pack.files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-2 py-1">
                          <span className="flex-1 truncate text-gray-600">{f.type === 'video' ? '🎬' : '🎵'} {f.name}</span>
                          <button onClick={() => removeFile(pack, f)} className="text-gray-300 hover:text-red-500">×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 cursor-pointer">
                    {uploadingId === pack.id ? 'Subiendo...' : '+ Agregar archivo'}
                    <input type="file" multiple accept="audio/*,video/*" className="hidden" disabled={uploadingId === pack.id}
                      onChange={e => { const files = Array.from(e.target.files || []); if (files.length) uploadFilesToPack(pack.id, files); e.target.value = ''; }} />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
