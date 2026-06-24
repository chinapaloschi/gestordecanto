import { useState } from 'react';
import { addDoc as fsAddDoc, collection as fsCollection, doc, setDoc } from 'firebase/firestore';

const VOCAL_TYPES = ['Soprano','Mezzo-soprano','Contralto','Tenor','Barítono','Bajo','Sin definir'];
const LEVELS      = ['Principiante','Intermedio','Avanzado'];
const CLASS_TYPES = [
  { value: 'individual', label: 'Individual', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'group',      label: 'Grupal',     color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'choir',      label: 'Coral',      color: 'bg-pink-100 text-pink-700 border-pink-300' },
];

const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent transition bg-white placeholder:text-gray-300';
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';

export const AddStudentForm = ({ db, userId, appId, showMessage, onClose, initialData = null, onCreated }) => {
  const [name,        setName]        = useState(initialData?.name || '');
  const [whatsapp,    setWhatsapp]    = useState(initialData?.whatsapp || '');
  const [email,       setEmail]       = useState(initialData?.email || '');
  const [dni,         setDni]         = useState('');
  const [birthDate,   setBirthDate]   = useState('');
  const [vocal,       setVocal]       = useState('Sin definir');
  const [level,       setLevel]       = useState('Principiante');
  const [classType,   setClassType]   = useState('individual');
  const [notes,       setNotes]       = useState('');
  const [loading,     setLoading]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !dni.trim()) {
      showMessage('El nombre y el DNI son obligatorios.', 'error');
      return;
    }
    if (!userId || !db) {
      showMessage('Error de autenticación.', 'error');
      return;
    }
    setLoading(true);
    try {
      const digits = dni.replace(/\D+/g, '');
      if (digits.length < 4) {
        showMessage('Ingresá un DNI válido (al menos 4 dígitos).', 'error');
        setLoading(false);
        return;
      }
      const pin4 = digits.slice(-4);
      const contactInfo = [whatsapp, email].filter(Boolean).join(' / ') || '-';

      const docRef = await fsAddDoc(fsCollection(db, `artifacts/${appId}/students`), {
        name: name.trim(),
        contactInfo,
        whatsapp:   whatsapp.trim(),
        email:      email.trim(),
        dni:        digits,
        pin4,
        birthDate:  birthDate || null,
        vocal,
        level,
        defaultClassType: classType,
        notes:      notes.trim(),
        createdAt:  new Date(),
        userId,
      });

      await setDoc(doc(db, `artifacts/${appId}/pinIndex/${pin4}/entries/${docRef.id}`), {
        studentId: docRef.id, studentName: name.trim(), dniLast4: pin4, createdAt: new Date(),
      });

      showMessage('¡Alumno añadido exitosamente!', 'success');
      onCreated?.(docRef.id);
      onClose?.();
    } catch (err) {
      console.error(err);
      showMessage(`Error al añadir alumno: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-600 to-rose-500 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white/20 rounded-xl">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">Añadir Nuevo Alumno</h2>
            <p className="text-rose-200 text-xs">Completá el perfil para empezar</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-5">

        {initialData && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5 text-xs text-rose-700 font-medium">
            📋 Datos precargados desde la solicitud de inscripción. Faltaría el DNI para completar la ficha.
          </div>
        )}

        {/* ── DATOS PERSONALES ── */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Datos personales</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Nombre completo *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className={inputCls} placeholder="Ej: Delfina Goñi" required autoFocus />
            </div>
            <div>
              <label className={labelCls}>DNI *</label>
              <input type="text" value={dni} onChange={e => setDni(e.target.value)}
                className={inputCls} placeholder="30123456" required inputMode="numeric" />
              <p className="mt-1 text-[10px] text-gray-400">PIN = últimos 4 dígitos</p>
            </div>
            <div>
              <label className={labelCls}>Fecha de nacimiento</label>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
                className={inputCls} />
            </div>
          </div>
        </div>

        {/* ── CONTACTO ── */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Contacto</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                <span className="mr-1">📱</span>WhatsApp
              </label>
              <input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                className={inputCls} placeholder="11 2345-6789" inputMode="tel" />
            </div>
            <div>
              <label className={labelCls}>
                <span className="mr-1">📧</span>Email
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={inputCls} placeholder="alumno@email.com" />
            </div>
          </div>
        </div>

        {/* ── CLASES ── */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Clases</p>
          <div className="space-y-3">
            {/* Tipo de clase */}
            <div>
              <label className={labelCls}>Tipo de clase</label>
              <div className="flex gap-2">
                {CLASS_TYPES.map(ct => (
                  <button type="button" key={ct.value}
                    onClick={() => setClassType(ct.value)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-xl border-2 transition
                      ${classType === ct.value ? ct.color + ' border-current' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Clasificación vocal</label>
                <select value={vocal} onChange={e => setVocal(e.target.value)} className={inputCls}>
                  {VOCAL_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Nivel</label>
                <select value={level} onChange={e => setLevel(e.target.value)} className={inputCls}>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── NOTAS ── */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Notas</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className={inputCls + ' resize-none'}
            placeholder="Ej: no puede los miércoles, viene derivada por fonoaudióloga..." />
        </div>

        {/* ── BOTONES ── */}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="submit" disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-md shadow-rose-200 transition disabled:opacity-50 flex items-center gap-2">
            {loading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Guardando...</>
              : <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                  </svg>
                  Añadir Alumno
                </>
            }
          </button>
        </div>

      </form>
    </div>
  );
};
