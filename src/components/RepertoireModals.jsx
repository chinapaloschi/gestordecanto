import React, { useState, useCallback, useEffect } from 'react';
import { collection as fsCollection, addDoc as fsAddDoc, doc, deleteDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { Modal, ModalHeader } from './Modal.jsx';
import { IconMusic, IconTrash } from './Icons.jsx';

export const RepertoireModal = ({ isOpen, onClose, db, appId, studentId, showMessage }) => {
  const [links, setLinks] = React.useState([]);
  const [title, setTitle] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [loading, setLoading] = useState(false);

  const loadLinks = useCallback(async () => {
    if (!db || !appId || !studentId) return;
    try {
      setLoading(true);
      const col = fsCollection(db, `artifacts/${appId}/students/${studentId}/repertoire`);
      const snap = await getDocs(query(col, orderBy("createdAt", "desc")));
      setLinks(snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })));
    } catch (e) {
      console.error('Error cargando repertorio:', e);
      showMessage && showMessage('No se pudo cargar el repertorio.', 'error');
    } finally { setLoading(false); }
  }, [db, appId, studentId, showMessage]);

  useEffect(() => { if (isOpen) loadLinks(); }, [isOpen, loadLinks]);

  const isYoutube = (u) => /(?:youtube\.com|youtu\.be)/i.test(u);

  const addLink = async (e) => {
    e && e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    if (!isYoutube(url)) { showMessage && showMessage('Ingresá un enlace de YouTube válido.', 'error'); return; }
    try {
      setLoading(true);
      await fsAddDoc(fsCollection(db, `artifacts/${appId}/students/${studentId}/repertoire`), { title: title.trim(), url: url.trim(), createdAt: new Date() });
      setTitle(''); setUrl('');
      await loadLinks();
      showMessage && showMessage('Enlace agregado.', 'success');
    } catch (e) {
      console.error('Error agregando enlace:', e);
      showMessage && showMessage('No se pudo agregar el enlace.', 'error');
    } finally { setLoading(false); }
  };

  const removeLink = async (id) => {
    if (!window.confirm("¿Seguro que querés eliminar este enlace?")) return;
    try {
      setLoading(true);
      await deleteDoc(doc(db, `artifacts/${appId}/students/${studentId}/repertoire/${id}`));
      await loadLinks();
      showMessage && showMessage('Enlace eliminado.', 'success');
    } catch (e) {
      showMessage && showMessage('No se pudo eliminar el enlace.', 'error');
    } finally { setLoading(false); }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" footer={null}>
      <div className="bg-white p-4 sm:p-6 rounded-lg sm:rounded-xl">
        <ModalHeader iconNode={<IconMusic />} title="Repertorio" subtitle="Gestioná los enlaces de YouTube para el alumno" />
        <form onSubmit={addLink} className="space-y-4 mt-6">
          <div>
            <label htmlFor="linkTitle" className="block text-sm font-medium text-gray-700 mb-1">Título</label>
            <input type="text" id="linkTitle" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-rose-500 focus:border-rose-500 transition"
              placeholder="Ej: Vocalizo 1, Obra para audición" required />
          </div>
          <div>
            <label htmlFor="linkUrl" className="block text-sm font-medium text-gray-700 mb-1">URL de YouTube</label>
            <input type="url" id="linkUrl" value={url} onChange={(e) => setUrl(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-rose-500 focus:border-rose-500 transition"
              placeholder="https://www.youtube.com/watch?v=..." required />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-800 font-semibold hover:bg-gray-100 transition">Cancelar</button>
            <button type="submit" className="px-6 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-sm transition disabled:opacity-50" disabled={loading}>
              {loading ? '...' : 'Agregar'}
            </button>
          </div>
        </form>
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-800 mb-2">Enlaces Guardados</h4>
          <div className="max-h-60 overflow-y-auto space-y-2 rounded-lg border border-gray-200 p-2 bg-gray-50/50">
            {loading && links.length === 0 ? (
              <div className="flex justify-center py-4 gap-1 items-end" style={{height:36}}>{[3,5,4,6,3,5,4].map((h,i)=><div key={i} style={{width:2,height:`${Math.round(h/6*20)}px`,backgroundColor:'#fda4af',borderRadius:2,animation:`soundwave 0.8s ${i*0.15}s ease-in-out infinite alternate`}}/>)}</div>
            ) : links.length === 0 ? (
              <p className="p-4 text-center text-sm text-gray-500">No hay enlaces guardados.</p>
            ) : (
              <ul className="space-y-1">
                {links.map(link => (
                  <li key={link.id} className="flex items-center justify-between gap-4 p-3 bg-white rounded-md shadow-sm border border-gray-100">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800 truncate">{link.title || '(sin título)'}</p>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all truncate block">{link.url}</a>
                    </div>
                    <button onClick={() => removeLink(link.id)} className="p-1.5 text-red-500 hover:bg-red-100 rounded-full transition-colors flex-shrink-0" disabled={loading}>
                      <IconTrash />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export const GlobalRepertoireModal = ({ isOpen, onClose, db, appId, students, showMessage }) => {
  const [repertoireData, setRepertoireData] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [openStudentId, setOpenStudentId] = React.useState(null);

  useEffect(() => {
    if (!isOpen) { setRepertoireData({}); setOpenStudentId(null); return; }
    const fetchAllRepertoires = async () => {
      setLoading(true);
      if (!db || !appId || !students?.length) { setLoading(false); return; }
      try {
        const results = await Promise.all(students.map(async (student) => {
          const snapshot = await getDocs(query(fsCollection(db, `artifacts/${appId}/students/${student.id}/repertoire`), orderBy("createdAt", "desc")));
          return snapshot.empty ? null : { studentId: student.id, links: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
        }));
        setRepertoireData(results.filter(Boolean).reduce((acc, { studentId, links }) => ({ ...acc, [studentId]: links }), {}));
      } catch (e) {
        console.error("Error al cargar el repertorio global:", e);
        showMessage && showMessage("No se pudo cargar el repertorio.", "error");
      } finally { setLoading(false); }
    };
    fetchAllRepertoires();
  }, [isOpen, db, appId, students, showMessage]);

  const studentsWithRepertoire = React.useMemo(() =>
    (students || []).filter(s => repertoireData[s.id]?.length > 0).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [students, repertoireData]
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="flex flex-col h-[calc(100svh-4rem)] sm:max-h-[80vh]">
        <ModalHeader iconNode={<IconMusic />} title="Repertorio Global" subtitle="Todos los enlaces de repertorio por alumno" />
        <div className="flex-grow overflow-y-auto p-4 sm:p-6 bg-gray-50/50">
          {loading ? (
            <p className="text-center text-gray-500 py-8">Cargando repertorios...</p>
          ) : studentsWithRepertoire.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Ningún alumno tiene repertorio guardado.</p>
          ) : (
            <div className="space-y-2">
              {studentsWithRepertoire.map(student => {
                const links = repertoireData[student.id];
                const isExpanded = openStudentId === student.id;
                return (
                  <div key={student.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <button type="button" className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors" onClick={() => setOpenStudentId(p => p === student.id ? null : student.id)}>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-800">{student.name}</span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{links.length} {links.length === 1 ? 'enlace' : 'enlaces'}</span>
                      </div>
                      <span className={`transform transition-transform text-gray-500 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-gray-200">
                        <ul className="space-y-2">
                          {links.map(link => (
                            <li key={link.id}>
                              <p className="font-medium text-sm text-gray-900">{link.title}</p>
                              <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">{link.url}</a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
