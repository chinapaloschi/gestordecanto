import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection as fsCollection, collectionGroup, doc, getDocs, setDoc, addDoc as fsAddDoc, deleteDoc, query, where, orderBy, writeBatch } from 'firebase/firestore';
import { ModalHeader } from './Modal.jsx';
import { IconBan, IconTrash, IconHardDrive } from './Icons.jsx';
import { toLocalYYYYMMDD } from '../utils/dateHelpers.js';
import { formatDateToDDMMYYYY } from '../utils/classHelpers.js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { updateDoc } from 'firebase/firestore';
import { ref as stRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig.js';
import { resizeImageFile } from '../utils/imageResize.js';

const MOTIVOS_RAPIDOS = ['Feriado', 'Viaje', 'Médico', 'Vacaciones', 'Personal', 'Otro'];
const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_ES  = ['L','M','M','J','V','S','D'];

export const BlockDaysModal = ({ db, userId, appId, showMessage, onClose, blockedSlots, scheduledClasses = [] }) => {
    const today = new Date().toISOString().split('T')[0];
    const [startDate,  setStartDate]  = useState(today);
    const [endDate,    setEndDate]    = useState(today);
    const [reason,     setReason]     = useState('');
    const [isAllDay,   setIsAllDay]   = useState(true);
    const [startTime,  setStartTime]  = useState('08:00');
    const [endTime,    setEndTime]    = useState('20:00');
    const [loading,    setLoading]    = useState(false);
    const [notifyStudents, setNotifyStudents] = useState(false);
    const [activeTab,  setActiveTab]  = useState('new'); // 'new' | 'active'

    // ── Alumnos afectados en el rango ────────────────────────────────────────
    const affectedClasses = useMemo(() => {
        if (!startDate || !endDate) return [];
        return scheduledClasses.filter(cls =>
            cls.classDate >= startDate && cls.classDate <= endDate &&
            (cls.status === 'scheduled' || !cls.status)
        );
    }, [startDate, endDate, scheduledClasses]);

    const affectedStudents = useMemo(() => {
        const map = {};
        affectedClasses.forEach(cls => {
            if (!map[cls.studentId]) map[cls.studentId] = { name: cls.studentName, id: cls.studentId, count: 0 };
            map[cls.studentId].count++;
        });
        return Object.values(map);
    }, [affectedClasses]);

    // ── Preview del rango en calendario ──────────────────────────────────────
    const previewDates = useMemo(() => {
        if (!startDate || !endDate || startDate > endDate) return new Set();
        const set = new Set();
        const cur = new Date(startDate + 'T12:00:00');
        const end = new Date(endDate   + 'T12:00:00');
        while (cur <= end) {
            set.add(cur.toISOString().split('T')[0]);
            cur.setDate(cur.getDate() + 1);
        }
        return set;
    }, [startDate, endDate]);

    // Mini calendario del mes de startDate
    const [previewMonth, setPreviewMonth] = useState(() => {
        const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() };
    });
    React.useEffect(() => {
        if (startDate) {
            const [y, m] = startDate.split('-').map(Number);
            setPreviewMonth({ y, m: m - 1 });
        }
    }, [startDate]);

    const daysInMonth = new Date(previewMonth.y, previewMonth.m + 1, 0).getDate();
    const firstDow    = new Date(previewMonth.y, previewMonth.m, 1).getDay();
    const offset      = firstDow === 0 ? 6 : firstDow - 1;
    const fmtD = (d) => `${previewMonth.y}-${String(previewMonth.m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

    const handleBlockDate = async (e) => {
        e.preventDefault();
        if (!startDate || !endDate) {
            showMessage('Completá las fechas.', 'error'); return;
        }
        if (startDate > endDate) {
            showMessage('La fecha inicio no puede ser posterior al fin.', 'error'); return;
        }
        if (!isAllDay && startTime >= endTime) {
            showMessage('La hora inicio debe ser anterior al fin.', 'error'); return;
        }
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const cur = new Date(startDate + 'T12:00:00');
            const last = new Date(endDate  + 'T12:00:00');
            let count = 0;
            while (cur <= last) {
                const d = toLocalYYYYMMDD(cur);
                const exists = blockedSlots.some(s => s.date === d && (isAllDay ? s.isAllDay !== false : false));
                if (!exists) {
                    batch.set(doc(fsCollection(db, `artifacts/${appId}/blockedSlots`)), {
                        date: d, reason: reason.trim() || 'Sin motivo',
                        isAllDay, startTime: isAllDay ? null : startTime,
                        endTime: isAllDay ? null : endTime,
                        createdAt: new Date(),
                    });
                    count++;
                }
                cur.setDate(cur.getDate() + 1);
            }

            // Cancelar las clases ya agendadas que caen dentro del rango/horario bloqueado
            const classesToCancel = isAllDay
                ? affectedClasses
                : affectedClasses.filter(cls => cls.startTime < endTime && cls.endTime > startTime);
            classesToCancel.forEach(cls => {
                batch.update(doc(db, `artifacts/${appId}/scheduledClasses`, cls.id), { status: 'cancelled' });
            });

            await batch.commit();

            // Notificación push a alumnos afectados
            if (notifyStudents && affectedStudents.length > 0) {
                try {
                    const fn = httpsCallable(getFunctions(), 'sendPushNotification');
                    fn({
                        studentIds: affectedStudents.map(s => s.id),
                        title: '📅 Cambio en tu agenda',
                        body: `Las clases del ${formatDateToDDMMYYYY(startDate)}${startDate !== endDate ? ` al ${formatDateToDDMMYYYY(endDate)}` : ''} están suspendidas. Motivo: ${reason}`,
                        appId, url: `/#/checkin?a=${appId}`,
                    }).catch(() => {});
                } catch {}
            }

            const cancelMsg = classesToCancel.length > 0 ? ` ${classesToCancel.length} clase${classesToCancel.length!==1?'s':''} cancelada${classesToCancel.length!==1?'s':''}.` : '';
            showMessage(`✅ ${count} día${count!==1?'s':''} bloqueado${count!==1?'s':''} correctamente.${cancelMsg}`, 'success');
            setReason(''); setStartDate(today); setEndDate(today);
        } catch (err) {
            showMessage(`Error: ${err.message}`, 'error');
        } finally { setLoading(false); }
    };

    const handleDelete = async (slotId) => {
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/blockedSlots`, slotId));
            showMessage('Bloqueo eliminado.', 'success');
        } catch (err) { showMessage(`Error: ${err.message}`, 'error'); }
    };

    const sorted = [...blockedSlots].sort((a, b) => a.date.localeCompare(b.date));
    const fldInput = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 transition';
    const fldLabel = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5';

    return (
        <div className="bg-white rounded-xl overflow-hidden">

            {/* ── HEADER ── */}
            <div className="bg-gradient-to-r from-gray-900 to-gray-700 px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/15 rounded-xl">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-white font-bold text-base">Bloquear Días u Horarios</h2>
                        <p className="text-gray-400 text-xs">Definí rangos sin clases disponibles</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-3">
                    {[['new','+ Nuevo bloqueo'],['active',`Activos (${sorted.length})`]].map(([id, label]) => (
                        <button key={id} onClick={() => setActiveTab(id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab===id ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-5">

            {/* ── TAB: NUEVO BLOQUEO ── */}
            {activeTab === 'new' && (
                <form onSubmit={handleBlockDate} className="space-y-4">

                    {/* Fechas */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={fldLabel}>Desde</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={fldInput} required/>
                        </div>
                        <div>
                            <label className={fldLabel}>Hasta</label>
                            <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className={fldInput} required/>
                        </div>
                    </div>

                    {/* ── PREVIEW MINI CALENDARIO ── */}
                    {previewDates.size > 0 && (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                                <button type="button" onClick={() => setPreviewMonth(v => v.m===0?{y:v.y-1,m:11}:{y:v.y,m:v.m-1})}
                                    className="p-1 rounded-lg hover:bg-gray-200 text-gray-500">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                                </button>
                                <span className="text-xs font-bold text-gray-700 capitalize">{MESES_ES[previewMonth.m]} {previewMonth.y}</span>
                                <button type="button" onClick={() => setPreviewMonth(v => v.m===11?{y:v.y+1,m:0}:{y:v.y,m:v.m+1})}
                                    className="p-1 rounded-lg hover:bg-gray-200 text-gray-500">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                                </button>
                            </div>
                            <div className="grid grid-cols-7 gap-0.5 mb-1">
                                {DIAS_ES.map((d,i) => <div key={i} className="text-[9px] text-gray-400 text-center font-bold">{d}</div>)}
                            </div>
                            <div className="grid grid-cols-7 gap-0.5">
                                {Array(offset).fill(null).map((_,i) => <div key={i}/>)}
                                {Array.from({length: daysInMonth}, (_,i) => i+1).map(d => {
                                    const dateStr = fmtD(d);
                                    const isBlock = previewDates.has(dateStr);
                                    const isStart = dateStr === startDate;
                                    const isEnd   = dateStr === endDate;
                                    return (
                                        <div key={d}
                                            className={`h-6 rounded text-[10px] font-bold flex items-center justify-center
                                                ${isBlock ? (isStart||isEnd ? 'bg-rose-600 text-white' : 'bg-rose-200 text-rose-800') : 'text-gray-600'}`}>
                                            {d}
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-gray-500 mt-2 text-center">
                                🚫 {previewDates.size} día{previewDates.size!==1?'s':''} a bloquear
                            </p>
                        </div>
                    )}

                    {/* Tipo: día completo o parcial */}
                    <label className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-100 transition">
                        <input type="checkbox" checked={isAllDay} onChange={e => setIsAllDay(e.target.checked)} className="w-4 h-4 text-rose-600 rounded"/>
                        <div>
                            <p className="text-sm font-semibold text-gray-800">Bloquear el día completo</p>
                            <p className="text-xs text-gray-500">Desmarcá para elegir un horario específico</p>
                        </div>
                    </label>

                    {!isAllDay && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={fldLabel}>Hora inicio</label>
                                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={fldInput}/>
                            </div>
                            <div>
                                <label className={fldLabel}>Hora fin</label>
                                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={fldInput}/>
                            </div>
                        </div>
                    )}

                    {/* Motivo con chips rápidos */}
                    <div>
                        <label className={fldLabel}>Motivo</label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {MOTIVOS_RAPIDOS.map(m => (
                                <button key={m} type="button" onClick={() => setReason(m)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold transition border
                                        ${reason === m ? 'bg-gray-800 text-white border-gray-800' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                                    {m}
                                </button>
                            ))}
                        </div>
                        <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                            className={fldInput} placeholder="O escribí el motivo..."/>
                    </div>

                    {/* Alumnos afectados */}
                    {affectedStudents.length > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                            <p className="text-xs font-bold text-amber-800">
                                ⚠️ {affectedStudents.length} alumno{affectedStudents.length!==1?'s':''} tiene{affectedStudents.length!==1?'n':''} clases en este período
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {affectedStudents.map(s => (
                                    <span key={s.id} className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
                                        {s.name.split(' ')[0]} ({s.count})
                                    </span>
                                ))}
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <div className="relative flex-shrink-0">
                                    <input type="checkbox" checked={notifyStudents} onChange={e => setNotifyStudents(e.target.checked)} className="sr-only peer"/>
                                    <div className="w-8 h-4 bg-gray-300 rounded-full peer peer-checked:bg-amber-500
                                        after:content-[''] after:absolute after:top-0 after:left-0 after:bg-white
                                        after:border after:rounded-full after:h-4 after:w-4 after:transition-all
                                        peer-checked:after:translate-x-4"/>
                                </div>
                                <span className="text-xs text-amber-800 font-semibold">🔔 Notificar a los alumnos por la app</span>
                            </label>
                        </div>
                    )}

                    <button type="submit" disabled={loading}
                        className="w-full py-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-black text-sm shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2">
                        {loading
                            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Guardando...</>
                            : <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636"/></svg>
                                Confirmar Bloqueo{previewDates.size > 1 ? ` (${previewDates.size} días)` : ''}
                              </>}
                    </button>
                </form>
            )}

            {/* ── TAB: BLOQUEOS ACTIVOS ── */}
            {activeTab === 'active' && (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {sorted.length === 0 ? (
                        <div className="py-10 text-center">
                            <div className="text-3xl mb-2">✅</div>
                            <p className="text-gray-400 text-sm font-medium">Sin días bloqueados</p>
                        </div>
                    ) : sorted.map(slot => (
                        <div key={slot.id} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl hover:bg-red-50 hover:border-red-100 transition group">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-gray-900">{formatDateToDDMMYYYY(slot.date)}</span>
                                    {slot.isAllDay === false ? (
                                        <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold">
                                            {slot.startTime} – {slot.endTime}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-bold">Todo el día</span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 italic mt-0.5">{slot.reason}</p>
                            </div>
                            <button onClick={() => handleDelete(slot.id)}
                                className="p-2 rounded-xl text-gray-300 group-hover:text-red-500 group-hover:bg-red-100 transition flex-shrink-0"
                                title="Eliminar bloqueo">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            </div>
        </div>
    );
};

// --- BackupRestoreModal Component ---
// --- BackupRestoreModal Component ---
// Antes el backup sólo cubría estas 8 colecciones — faltaba casi todo lo
// demás que la app realmente usa hoy (más de 20 colecciones en total),
// incluida Lencería (plata real de otro negocio) y el tarifario de precios.
const BACKUP_TOP_LEVEL_COLLECTIONS = [
    'students', 'scheduledClasses', 'payments', 'extraIncomes', 'expenses',
    'expenseCategories', 'blockedSlots', 'events',
    'trialRequests', 'adminTokens', 'reminderLog', 'availableSlots',
    'exercisePacks', 'lenceriaStock', 'lenceriaVentas', 'massEvents',
    'publicMessages', 'settings',
];

// Subcolecciones reales que viven anidadas bajo un documento padre (no se
// pueden exportar con un simple getDocs de la raíz). El índice de PIN de
// login del portal (pinIndex/{pin}/entries) queda afuera a propósito: es
// puramente derivado de `students`, así que después de restaurar alcanza
// con el botón "Reconstruir índice de PINs" en vez de cargar con esto.
const BACKUP_SUBCOLLECTIONS = ['repertoire', 'receipts', 'voiceNotes', 'tickets'];

function backupReviveDates(obj) {
    Object.keys(obj).forEach(key => {
        const value = obj[key];
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)) {
            obj[key] = new Date(value);
        } else if (value && typeof value === 'object' && value.hasOwnProperty('seconds') && value.hasOwnProperty('nanoseconds')) {
            obj[key] = new Date(value.seconds * 1000 + value.nanoseconds / 1000000);
        }
    });
    return obj;
}

export const BackupRestoreModal = ({ isOpen, onClose, db, userId, appId, showMessage }) => {
    const [loading, setLoading] = useState(false);
    const [confirmImport, setConfirmImport] = useState(false);
    const [fileToImport, setFileToImport] = useState(null);
    const [reindexing, setReindexing] = useState(false);

    const handleReindexPins = async () => {
        setReindexing(true);
        try {
            const fn = httpsCallable(getFunctions(), 'reindexPins');
            await fn({ appId });
            showMessage('Índice de PINs reconstruido — el login del portal ya debería andar para todos.', 'success');
        } catch (e) {
            showMessage(`Error al reconstruir el índice de PINs: ${e.message}`, 'error');
        } finally {
            setReindexing(false);
        }
    };

    const handleExport = async () => {
        if (!userId) {
            showMessage('Error: Usuario no autenticado.', 'error');
            return;
        }
        setLoading(true);
        try {
            const data = {};

            for (const collectionName of BACKUP_TOP_LEVEL_COLLECTIONS) {
                const querySnapshot = await getDocs(fsCollection(db, `artifacts/${appId}/${collectionName}`));
                data[collectionName] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            for (const subName of BACKUP_SUBCOLLECTIONS) {
                const snap = await getDocs(collectionGroup(db, subName));
                // Un collectionGroup trae todo lo que se llame igual en toda
                // la base — filtramos por el prefijo del path para quedarnos
                // sólo con lo de esta app.
                data[`_sub_${subName}`] = snap.docs
                    .filter(d => d.ref.path.startsWith(`artifacts/${appId}/`))
                    .map(d => ({ path: d.ref.path, ...d.data() }));
            }

            const jsonString = JSON.stringify(data, (key, value) => {
                if (value && typeof value.toDate === 'function') {
                    return value.toDate().toISOString();
                }
                return value;
            }, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sandra-paloschi-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showMessage('Copia de seguridad exportada exitosamente!', 'success');
        } catch (e) {
            console.error("Error exporting data: ", e);
            showMessage(`Error al exportar datos: ${e.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/json') {
            setFileToImport(file);
            setConfirmImport(false);
        } else {
            setFileToImport(null);
            if (file) showMessage('Por favor, selecciona un archivo .json válido.', 'error');
        }
    };

    const handleImportConfirm = () => {
        if (!fileToImport) {
            showMessage('Por favor, selecciona un archivo para importar.', 'error');
            return;
        }
        setConfirmImport(true);
    };

    const handleImportExecute = async () => {
        if (!userId || !fileToImport) {
            showMessage('Error: No se ha seleccionado un archivo válido.', 'error');
            return;
        }
        setLoading(true);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedData = JSON.parse(event.target.result);

                // Firestore allows up to 500 operations in a single batch. We'll be conservative.
                const batchOperations = [];

                // 1. Prepare deletions — sólo para colecciones que el archivo
                // realmente trae. Antes esto borraba TODAS las colecciones de
                // la lista sin importar si el backup las incluía o no — un
                // backup viejo/parcial (por ejemplo de antes de que existiera
                // "eventos") borraba esa colección entera sin nada para
                // reemplazarla.
                for (const collectionName of BACKUP_TOP_LEVEL_COLLECTIONS) {
                    if (!Array.isArray(importedData[collectionName])) continue;
                    const querySnapshot = await getDocs(fsCollection(db, `artifacts/${appId}/${collectionName}`));
                    querySnapshot.forEach((docRef) => {
                        batchOperations.push({ type: 'delete', ref: docRef.ref });
                    });
                }
                for (const subName of BACKUP_SUBCOLLECTIONS) {
                    const key = `_sub_${subName}`;
                    if (!Array.isArray(importedData[key])) continue;
                    const snap = await getDocs(collectionGroup(db, subName));
                    snap.docs
                        .filter(d => d.ref.path.startsWith(`artifacts/${appId}/`))
                        .forEach(d => batchOperations.push({ type: 'delete', ref: d.ref }));
                }

                // 2. Prepare additions
                for (const collectionName of BACKUP_TOP_LEVEL_COLLECTIONS) {
                    if (importedData[collectionName] && Array.isArray(importedData[collectionName])) {
                        for (const item of importedData[collectionName]) {
                            const { id, ...dataWithoutId } = item;
                            backupReviveDates(dataWithoutId);
                            const newDocRef = doc(db, `artifacts/${appId}/${collectionName}`, id);
                            batchOperations.push({ type: 'set', ref: newDocRef, data: dataWithoutId });
                        }
                    }
                }
                for (const subName of BACKUP_SUBCOLLECTIONS) {
                    const key = `_sub_${subName}`;
                    if (importedData[key] && Array.isArray(importedData[key])) {
                        for (const item of importedData[key]) {
                            const { path, ...dataWithoutPath } = item;
                            if (!path) continue;
                            backupReviveDates(dataWithoutPath);
                            const newDocRef = doc(db, path);
                            batchOperations.push({ type: 'set', ref: newDocRef, data: dataWithoutPath });
                        }
                    }
                }

                // 3. Execute all operations in chunks of 450
                for (let i = 0; i < batchOperations.length; i += 450) {
                    const chunk = batchOperations.slice(i, i + 450);
                    const batch = writeBatch(db);
                    chunk.forEach(op => {
                        if (op.type === 'delete') batch.delete(op.ref);
                        else if (op.type === 'set') batch.set(op.ref, op.data);
                    });
                    await batch.commit();
                }

                showMessage('Datos importados y restaurados exitosamente!', 'success');
                onClose && onClose();
            } catch (e) {
                console.error("Error importing data: ", e);
                showMessage(`Error al importar datos: ${e.message}`, 'error');
            } finally {
                setLoading(false);
                setConfirmImport(false);
                setFileToImport(null);
            }
        };
        reader.readAsText(fileToImport);
    };

    return (
        <div className="bg-white p-4 sm:p-6 rounded-lg sm:rounded-xl">
            <ModalHeader
                iconNode={<IconHardDrive />}
                title="Copia de Seguridad y Restauración"
                subtitle="Exporta o importa todos los datos de la aplicación"
            />

            <div className="mt-6 space-y-6">
                {/* --- EXPORTAR --- */}
                <div className="space-y-3">
                    <h3 className="text-base font-semibold text-gray-800">Exportar Copia de Seguridad</h3>
                    <p className="text-sm text-gray-600">
                        Crea un archivo JSON con todos tus alumnos, clases, pagos y configuraciones. Guárdalo en un lugar seguro.
                    </p>
                    <button
                        onClick={handleExport}
                        className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 text-white font-semibold rounded-lg shadow-sm hover:bg-rose-700 transition disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? 'Exportando...' : 'Exportar Todos los Datos'}
                    </button>
                </div>

                {/* --- IMPORTAR --- */}
                <div className="border-t border-gray-200 pt-6 space-y-3">
                    <h3 className="text-base font-semibold text-gray-800">Importar Copia de Seguridad</h3>
                    <p className="text-sm text-gray-600">
                        Reemplaza <b className="text-red-600">todos</b> los datos actuales con los de un archivo. Esta acción no se puede deshacer.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <label className="cursor-pointer w-full sm:w-auto px-4 py-2 bg-white border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-100 transition text-center">
                            <span>Seleccionar archivo (.json)</span>
                            <input type="file" accept=".json" onChange={handleFileChange} className="hidden" />
                        </label>
                        {fileToImport && <span className="text-sm text-gray-700 font-mono">{fileToImport.name}</span>}
                    </div>

                    {!confirmImport ? (
                        <button
                            onClick={handleImportConfirm}
                            className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 text-white font-semibold rounded-lg shadow-sm hover:bg-amber-600 transition disabled:opacity-50"
                            disabled={loading || !fileToImport}
                        >
                            Preparar Importación
                        </button>
                    ) : (
                        <div className="mt-4 p-4 bg-red-50 border border-red-300 text-red-800 rounded-lg">
                            <p className="font-bold mb-2">¡Atención! Estás a punto de sobrescribir todos los datos de la aplicación.</p>
                            <p className="text-sm">Esta acción es irreversible. ¿Deseas continuar?</p>
                            <div className="flex justify-end gap-2 mt-4">
                                <button
                                    onClick={() => { setConfirmImport(false); setFileToImport(null); }}
                                    className="px-4 py-2 bg-white border border-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-100 transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleImportExecute}
                                    className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                                    disabled={loading}
                                >
                                    {loading ? 'Importando...' : 'Sí, Reemplazar Todo'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* --- REINDEXAR PINS --- */}
                <div className="border-t border-gray-200 pt-6 space-y-3">
                    <h3 className="text-base font-semibold text-gray-800">Índice de PINs del portal</h3>
                    <p className="text-sm text-gray-600">
                        Después de restaurar un backup, los alumnos pueden quedar sin poder entrar a su portal —
                        este botón reconstruye ese índice a partir de los alumnos ya restaurados.
                    </p>
                    <button
                        onClick={handleReindexPins}
                        className="w-full sm:w-auto px-5 py-2.5 bg-gray-800 text-white font-semibold rounded-lg shadow-sm hover:bg-gray-900 transition disabled:opacity-50"
                        disabled={reindexing}
                    >
                        {reindexing ? 'Reconstruyendo...' : 'Reconstruir índice de PINs'}
                    </button>
                </div>
            </div>
        </div>
    );
};
// === Helpers de tickets (QR) ===
const LOGO_URL_QR = "https://res.cloudinary.com/dgtwruyzj/image/upload/v1754065137/WhatsApp_Image_2025-07-21_at_11.43.30_AM-Photoroom_qi6wgn.png";
const makeTicketCode = () => uuidv4().replace(/-/g, '').slice(0, 24);

// URL que irá dentro del QR (ajusta tu dominio si hace falta)
const buildTicketURL = ({ appId, eventId, ticketId }) =>
  `${location.origin}/${ROUTES.TICKET}?e=${encodeURIComponent(eventId)}&t=${encodeURIComponent(ticketId)}&a=${encodeURIComponent(appId)}`;

async function createTicketsForEvent({ db, appId, eventId, quantity = 1, price = 0, buyerName = null, assignedTo = null, assignedToName = null }) {
  const col = fsCollection(db, `artifacts/${appId}/events/${eventId}/tickets`);
  const ids = [];
  for (let i = 0; i < quantity; i++) {
    const code = makeTicketCode();
    const ref = await fsAddDoc(col, {
      code,
      status: 'unused',
      usedAt: null,
      assignedTo: assignedTo,
      assignedToName: assignedToName,
      buyerName,
      price: Number(price) || 0,
      seat: null,
      createdAt: new Date(),
    });
    ids.push(ref.id);
  }
  return ids;
}


// ▼ REEMPLAZÁ TU COMPONENTE ManageTicketsModal CON ESTA VERSIÓN FINAL Y COMPLETA ▼

// Las fotos de perfil se subían sin comprimir — cada tarjeta de alumno de
// 64px terminaba decodificando la foto original entera (varios MB), lo que
// trababa el scroll con muchos alumnos en pantalla. Las subidas nuevas ya se
// comprimen solas (ver ProfilePictureUploader); esta herramienta achica de
// una sola vez las que ya estaban cargadas.
export const OptimizeStudentPhotosModal = ({ isOpen, onClose, db, appId, showMessage }) => {
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(null); // { done, total, optimized, skipped, errors }
    const [log, setLog] = useState([]);

    if (!isOpen) return null;

    const run = async () => {
        setRunning(true);
        setLog([]);
        try {
            const snap = await getDocs(fsCollection(db, `artifacts/${appId}/students`));
            const students = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(s => s.photoURL);

            let optimized = 0, skipped = 0, errors = 0;
            setProgress({ done: 0, total: students.length, optimized, skipped, errors });

            for (let i = 0; i < students.length; i++) {
                const student = students[i];
                try {
                    const res = await fetch(student.photoURL);
                    const blob = await res.blob();
                    // Ya es chica (subida nueva, o ya optimizada en una corrida
                    // anterior) — no hace falta tocarla de nuevo.
                    if (blob.size <= 200 * 1024) {
                        skipped++;
                    } else {
                        const resizedBlob = await resizeImageFile(blob, { maxDim: 480, quality: 0.85 });
                        const storageRef = stRef(storage, `students/${student.id}/profilePicture.jpg`);
                        await uploadBytesResumable(storageRef, resizedBlob);
                        const newUrl = await getDownloadURL(storageRef);
                        await updateDoc(doc(db, `artifacts/${appId}/students`, student.id), { photoURL: newUrl });
                        optimized++;
                        setLog(prev => [...prev, `✓ ${student.name || student.id}: ${(blob.size / 1024).toFixed(0)}KB → ${(resizedBlob.size / 1024).toFixed(0)}KB`]);
                    }
                } catch (e) {
                    errors++;
                    setLog(prev => [...prev, `✗ ${student.name || student.id}: ${e.message}`]);
                }
                setProgress({ done: i + 1, total: students.length, optimized, skipped, errors });
            }
            showMessage(`Listo: ${optimized} fotos optimizadas, ${skipped} ya estaban bien, ${errors} con error.`, errors > 0 ? 'info' : 'success');
        } catch (e) {
            showMessage('Error al optimizar fotos: ' + e.message, 'error');
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="p-4 sm:p-6">
            <ModalHeader iconNode={<IconHardDrive />} title="Optimizar fotos de alumnos"
                subtitle="Achica las fotos de perfil ya cargadas para que el scroll de la lista no se trabe." />
            <div className="mt-4 space-y-4">
                <p className="text-sm text-gray-600">
                    Recorre a todos los alumnos con foto, y si la foto pesa más de 200KB la achica y la vuelve a subir.
                    Las que ya están livianas se saltean — es seguro correr esto más de una vez.
                </p>
                {progress && (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
                        <p className="font-semibold text-gray-800">{progress.done} / {progress.total} alumnos revisados</p>
                        <p className="text-xs text-gray-500 mt-1">
                            {progress.optimized} optimizadas · {progress.skipped} ya estaban bien · {progress.errors} con error
                        </p>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-rose-600 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                        </div>
                    </div>
                )}
                {log.length > 0 && (
                    <div className="max-h-40 overflow-y-auto p-2 bg-gray-900 rounded-lg text-[11px] font-mono text-gray-200 space-y-0.5">
                        {log.map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                )}
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2.5 text-sm rounded-xl bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition">
                        Cerrar
                    </button>
                    <button onClick={run} disabled={running}
                        className="px-4 py-2.5 text-sm rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50 transition">
                        {running ? 'Optimizando…' : 'Optimizar fotos'}
                    </button>
                </div>
            </div>
        </div>
    );
};
