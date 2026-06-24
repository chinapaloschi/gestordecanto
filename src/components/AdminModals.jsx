import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection as fsCollection, doc, getDocs, setDoc, addDoc as fsAddDoc, deleteDoc, query, where, orderBy, writeBatch } from 'firebase/firestore';
import { ModalHeader } from './Modal.jsx';
import { IconBan, IconTrash, IconHardDrive } from './Icons.jsx';
import { toLocalYYYYMMDD } from '../utils/dateHelpers.js';
import { formatDateToDDMMYYYY } from '../utils/classHelpers.js';
import { getFunctions, httpsCallable } from 'firebase/functions';

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
        if (!startDate || !endDate || !reason.trim()) {
            showMessage('Completá las fechas y el motivo.', 'error'); return;
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
            const cur = new Date(startDate + 'T00:00:00Z');
            const last = new Date(endDate  + 'T00:00:00Z');
            let count = 0;
            while (cur <= last) {
                const d = toLocalYYYYMMDD(cur);
                const exists = blockedSlots.some(s => s.date === d && (isAllDay ? s.isAllDay !== false : false));
                if (!exists) {
                    batch.set(doc(fsCollection(db, `artifacts/${appId}/blockedSlots`)), {
                        date: d, reason: reason.trim(),
                        isAllDay, startTime: isAllDay ? null : startTime,
                        endTime: isAllDay ? null : endTime,
                        createdAt: new Date(),
                    });
                    count++;
                }
                cur.setDate(cur.getDate() + 1);
            }
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

            showMessage(`✅ ${count} día${count!==1?'s':''} bloqueado${count!==1?'s':''} correctamente.`, 'success');
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
                            <input type="date" value={endDate} onChange={e => { if(e.target.value >= startDate) setEndDate(e.target.value); }} className={fldInput} required/>
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
export const BackupRestoreModal = ({ isOpen, onClose, db, userId, appId, showMessage }) => {
    const [loading, setLoading] = useState(false);
    const [confirmImport, setConfirmImport] = useState(false);
    const [fileToImport, setFileToImport] = useState(null);

    const handleExport = async () => {
        if (!userId) {
            showMessage('Error: Usuario no autenticado.', 'error');
            return;
        }
        setLoading(true);
        try {
            const data = {};
            const collectionsToExport = ['students', 'scheduledClasses', 'payments', 'extraIncomes', 'expenses', 'expenseCategories', 'blockedSlots', 'events'];

            for (const collectionName of collectionsToExport) {
                const querySnapshot = await getDocs(fsCollection(db, `artifacts/${appId}/${collectionName}`));
                data[collectionName] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
                const collectionsToImport = ['students', 'scheduledClasses', 'payments', 'extraIncomes', 'expenses', 'expenseCategories', 'blockedSlots', 'events'];
                
                // Firestore allows up to 500 operations in a single batch. We'll be conservative.
                const batchOperations = [];
                
                // 1. Prepare deletions
                for (const collectionName of collectionsToImport) {
                    const querySnapshot = await getDocs(fsCollection(db, `artifacts/${appId}/${collectionName}`));
                    querySnapshot.forEach((docRef) => {
                        batchOperations.push({ type: 'delete', ref: docRef.ref });
                    });
                }

                // 2. Prepare additions
                for (const collectionName of collectionsToImport) {
                    if (importedData[collectionName] && Array.isArray(importedData[collectionName])) {
                        for (const item of importedData[collectionName]) {
                            const { id, ...dataWithoutId } = item;
                            Object.keys(dataWithoutId).forEach(key => {
                                const value = dataWithoutId[key];
                                if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)) {
                                    dataWithoutId[key] = new Date(value);
                                } else if (value && typeof value === 'object' && value.hasOwnProperty('seconds') && value.hasOwnProperty('nanoseconds')) {
                                    dataWithoutId[key] = new Date(value.seconds * 1000 + value.nanoseconds / 1000000);
                                }
                            });
                            const newDocRef = doc(db, `artifacts/${appId}/${collectionName}`, id);
                            batchOperations.push({ type: 'set', ref: newDocRef, data: dataWithoutId });
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

// App.jsx

// ▼ REEMPLAZA dataUrlToFile Y AÑADE ESTAS DOS NUEVAS FUNCIONES ANTES DE "ManageTicketsModal" ▼

// Helper para convertir Data URL a un archivo (para compartir)
async function dataUrlToFile(dataUrl, fileName) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type });
  } catch (e) {
    console.error("Error al convertir data URL a archivo:", e);
    return null;
  }
}

// ▼ PEGÁ AQUÍ EL BLOQUE DE LAS DOS FUNCIONES FALTANTES ▼
async function generateQrWithLogo(qrData, logoSrc, qrSize = 128) {
  let qrCanvas; 

  try {
    qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, qrData, {
      width: qrSize,
      margin: 1,
      errorCorrectionLevel: 'H'
    });

    const ctx = qrCanvas.getContext('2d');
    const logoImage = new Image();
    logoImage.src = logoSrc;
    logoImage.crossOrigin = "anonymous";
    
    await new Promise((resolve, reject) => {
        logoImage.onload = resolve;
        logoImage.onerror = (err) => reject(new Error("No se pudo cargar la imagen del logo. Verifica que la ruta '/logo.png' sea correcta en tu carpeta 'public'."));
    });

    const logoSize = qrSize * 0.3;
    const logoX = (qrSize - logoSize) / 2;
    const logoY = (qrSize - logoSize) / 2;

    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 4, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);

    return qrCanvas.toDataURL('image/png');
  } catch (error) {
    console.error("Error al generar QR con logo:", error);
    
    if (qrCanvas) {
      console.warn("Fallback: Devolviendo QR sin logo.");
      return qrCanvas.toDataURL('image/png');
    }
    
    return null;
  }
}


// ▼ REEMPLAZA ESTA FUNCIÓN COMPLETA ▼
async function generateComposedTicketImage(qrData, eventInfo, logoSrc) {
  try {
    const finalCanvas = document.createElement('canvas');
    const ctx = finalCanvas.getContext('2d');
    
    const cardWidth = 350;
    const cardHeight = 450;
    const padding = 25;

    finalCanvas.width = cardWidth;
    finalCanvas.height = cardHeight;

    // Fondo blanco
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, cardWidth, cardHeight);

    // --- LÓGICA MODIFICADA PARA EL TÍTULO ---
    let currentY = padding + 25; // Posición Y inicial para el texto
    const titleFont = 'bold 20px Arial';
    const titleLineHeight = 24; // Espacio entre renglones
    
    ctx.fillStyle = '#1f2937';
    ctx.font = titleFont;
    ctx.textAlign = 'center';

    const fullTitle = eventInfo.title.toUpperCase();
    const splitIndex = fullTitle.indexOf('('); // Busca el paréntesis
    
    let line1 = fullTitle;
    let line2 = null;

    // Si encuentra un paréntesis, divide el texto
    if (splitIndex > 0) {
        line1 = fullTitle.substring(0, splitIndex).trim();
        line2 = fullTitle.substring(splitIndex).trim();
    }

    // Dibuja la primera línea
    ctx.fillText(line1, cardWidth / 2, currentY);

    // Si hay una segunda línea, la dibuja y actualiza la posición
    if (line2) {
        currentY += titleLineHeight;
        ctx.fillText(line2, cardWidth / 2, currentY);
    }
    // --- FIN DE LA LÓGICA MODIFICADA ---

    // Dibuja el subtítulo (fecha y hora) ajustando su posición
    currentY += 30;
    ctx.font = '16px Arial';
    ctx.fillStyle = '#4b5563';
    ctx.fillText(eventInfo.subtitle, cardWidth / 2, currentY);

    // Dibuja el código QR, ajustando su posición
    currentY += 20;
    const qrCodeWithLogoUrl = await generateQrWithLogo(qrData, logoSrc, 200); // Un poco más chico para dar espacio
    if (!qrCodeWithLogoUrl) throw new Error("Falló la generación del QR con logo.");
    
    const qrImage = new Image();
    qrImage.src = qrCodeWithLogoUrl;
    await new Promise(resolve => { qrImage.onload = resolve; });
    
    ctx.drawImage(qrImage, (cardWidth - 200) / 2, currentY, 200, 200);
    currentY += 200; // Avanza la posición vertical

    // Dibuja el resto de los elementos ajustando su posición
    currentY += 30;
    ctx.font = '16px Arial';
    ctx.fillStyle = '#4b5563';
    ctx.fillText('Entrada para:', cardWidth / 2, currentY);
    
    currentY += 25;
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = '#D81B60';
    ctx.fillText(eventInfo.attendee.toUpperCase(), cardWidth / 2, currentY);

    currentY += 25;
    if (eventInfo.ticketNumber) {
        ctx.font = '16px Arial';
        ctx.fillStyle = '#4b5563';
        ctx.fillText(`Entrada N° ${eventInfo.ticketNumber}`, cardWidth / 2, currentY);
        currentY += 15;
    }

    if (eventInfo.ticketId) {
        ctx.font = '10px "Courier New", monospace';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText(`ID: ${eventInfo.ticketId}`, cardWidth / 2, currentY);
    }

    return finalCanvas.toDataURL('image/png');
  } catch (error) {
    console.error("Error al generar imagen de ticket compuesta:", error);
    return null;
  }
}

// ▼ REEMPLAZÁ TU COMPONENTE ManageTicketsModal CON ESTA VERSIÓN FINAL Y COMPLETA ▼
