import React, { useState, useEffect } from 'react';
import { doc, getDoc, getDocs, updateDoc, deleteDoc, query, where, writeBatch, serverTimestamp, collection as fsCollection } from 'firebase/firestore';
import { Modal, ModalHeader } from './Modal.jsx';
import { IconCalendar, IconCreditCard, IconTrash } from './Icons.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { formatMoneyAr } from '../utils/money.js';
import { formatDateToDDMMYYYY, mapClassTypeToSpanish } from '../utils/classHelpers.js';
import { ActionButton } from './ActionButton.jsx';
import { ClassScreen } from './ClassScreen.jsx';

export const AttendanceModal = ({ classData, db, userId, appId, showMessage, onEditClass, onClose, onStudentRemovedFromClass, students, onGoToMarkPayment, onCloseAttendanceModalFromApp }) => {
    const [showClassScreen, setShowClassScreen] = useState(false);
    const [showConfirmDeleteSingleClassModal, setShowConfirmDeleteSingleClassModal] = useState(false);
    const [showMonthlyClassDeletionOptionsModal, setShowMonthlyClassDeletionOptionsModal] = useState(false);
    const [showConfirmDeleteGroupClassModal, setShowConfirmDeleteGroupClassModal] = useState(false);
    const [showConfirmRemoveStudentFromClassInstanceModal, setShowConfirmRemoveStudentFromClassInstanceModal] = useState(false);
    const [studentToRemoveFromClass, setStudentToRemoveFromClass] = useState(null);
    const [currentClassGroup, setCurrentClassGroup] = useState(Array.isArray(classData) ? classData : (classData ? [classData] : []));
    const [applyToMonth, setApplyToMonth] = React.useState(false);
    const [elapsed, setElapsed] = useState('');
    const [classNotes, setClassNotes] = useState('');
    const [notesSaved, setNotesSaved] = useState(false);

    useEffect(() => {
        setCurrentClassGroup(Array.isArray(classData) ? classData : (classData ? [classData] : []));
        const g = Array.isArray(classData) ? classData : (classData ? [classData] : []);
        setClassNotes(g[0]?.classNotes || '');
    }, [classData]);

    // ── Timer: cuánto lleva la clase ─────────────────────────────────────────
    useEffect(() => {
        const cls = Array.isArray(classData) ? classData[0] : classData;
        if (!cls?.startTime || !cls?.classDate) return;
        const update = () => {
            const start = new Date(`${cls.classDate}T${cls.startTime}:00`);
            const diff = Date.now() - start.getTime();
            if (diff <= 0) { setElapsed(''); return; }
            const mins = Math.floor(diff / 60000);
            const h = Math.floor(mins / 60), m = mins % 60;
            setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
        };
        update();
        const id = setInterval(update, 15000);
        return () => clearInterval(id);
    }, [classData]);

    // ── Guardar notas ────────────────────────────────────────────────────────
    const saveNotes = async () => {
        const note = classNotes.trim();
        const g = Array.isArray(classData) ? classData : (classData ? [classData] : []);
        if (!g.length) return;
        try {
            await Promise.all(g.map(cls =>
                updateDoc(doc(db, `artifacts/${appId}/scheduledClasses`, cls.id), { classNotes: note })
            ));
            setNotesSaved(true);
            setTimeout(() => setNotesSaved(false), 2000);
        } catch (e) { console.error(e); }
    };

    if (!currentClassGroup || currentClassGroup.length === 0) return null;

    const isGroupedClass = currentClassGroup.length > 1 || currentClassGroup[0].studentType !== 'individual';
    const classesToDisplay = currentClassGroup;
    const commonClassInfo = classesToDisplay[0] || {};
    const studentNamesInGroup = classesToDisplay.map(cls => cls.studentName).join(', ');
    
    // --- Lógica de Handlers (sin cambios) ---
    const handleMarkAttendance = async (classDocId, status) => {
        if (!userId) { showMessage('Error: Usuario no autenticado.', 'error'); return; }
        try {
            const classDocRef = doc(db, `artifacts/${appId}/scheduledClasses`, classDocId);
            await updateDoc(classDocRef, { attendanceStatus: status });
            showMessage(`Asistencia marcada como ${status}.`, 'success');
            setCurrentClassGroup(prevGroup => prevGroup.map(cls => cls.id === classDocId ? { ...cls, attendanceStatus: status } : cls));
        } catch (e) { console.error(e); showMessage(`Error: ${e.message}`, 'error'); }
    };
    const handleDeleteClick = () => {
        if (isGroupedClass && commonClassInfo.scheduleType === 'single') setShowConfirmDeleteGroupClassModal(true);
        else if (commonClassInfo.scheduleType === 'monthly') setShowMonthlyClassDeletionOptionsModal(true);
        else setShowConfirmDeleteSingleClassModal(true);
    };
    const confirmDeleteSingleClass = async () => {
      if (!userId) { showMessage('Error: Usuario no autenticado.', 'error'); return; }
      try {
          const source = Array.isArray(classData) ? (classData[0] || {}) : (classData || {});
          const classId = source.id || (commonClassInfo && commonClassInfo.id) || null;
          if (!classId) throw new Error('Clase sin ID (classId)');
          const classDocRef = doc(db, `artifacts/${appId}/scheduledClasses`, classId);
          await deleteDoc(classDocRef);
          showMessage('Clase eliminada exitosamente!', 'success');
          setShowConfirmDeleteSingleClassModal(false);
          onClose && onClose();
      } catch (e) { console.error("Error deleting single class: ", e); showMessage(`Error al eliminar la clase: ${e.message}`, 'error'); }
    };
    const confirmDeleteGroupClass = async () => { 
      if (!userId || !isGroupedClass) { showMessage('Error: Usuario no autenticado o clase de grupo no seleccionada.', 'error'); return; }
      try {
          const batch = writeBatch(db);
          for (const cls of classesToDisplay) { batch.delete(doc(db, `artifacts/${appId}/scheduledClasses`, cls.id)); }
          await batch.commit();
          showMessage('Clase grupal/coral eliminada exitosamente!', 'success');
          setShowConfirmDeleteGroupClassModal(false);
          onClose && onClose();
      } catch (e) { console.error("Error deleting group class: ", e); showMessage(`Error: ${e.message}`, 'error'); }
    };

    // --- PEGA ESTO AQUÍ ---
    const handleRemoveOneFromGroup = async (docId, studentName) => {
        const confirm = window.confirm(`¿Sacar a ${studentName} de la clase?`);
        if (!confirm) return;

        try {
            await deleteDoc(doc(db, `artifacts/${appId}/scheduledClasses`, docId));
            
            // Actualizamos la lista para que desaparezca visualmente
            setCurrentClassGroup((prev) => prev.filter((c) => c.id !== docId));

            // Si era el último, cerramos el modal
            if (currentClassGroup.length <= 1) {
                setShowConfirmDeleteGroupClassModal(false);
                if (onClose) onClose();
            }
        } catch (e) {
            console.error(e);
            alert("Error al eliminar: " + e.message);
        }
    };
    // ----------------------
    const handleCancelSingleMonthlyClass = async () => { 
        if (!userId || !classData) { showMessage('Error: Usuario no autenticado o clase no seleccionada.', 'error'); return; }
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/scheduledClasses`, commonClassInfo.id));
            showMessage('Clase individual del paquete eliminada!', 'success');
            setShowMonthlyClassDeletionOptionsModal(false);
            onClose && onClose();
        } catch (e) { console.error("Error deleting single monthly class: ", e); showMessage(`Error: ${e.message}`, 'error'); }
    };
// ▼▼▼ DENTRO de AttendanceModal, REEMPLAZA esta función ▼▼▼

const handleDeleteEntireMonthlyPackage = async () => {
    if (!userId || !classData || !commonClassInfo.monthlyPaymentRefId) {
        showMessage('Error: Usuario no autenticado o datos de paquete mensual incompletos.', 'error');
        return;
    }

    try {
        const batch = writeBatch(db);
        const monthlyPaymentDocRef = doc(db, `artifacts/${appId}/payments`, commonClassInfo.monthlyPaymentRefId);
        const monthlyPaymentSnapshot = await getDoc(monthlyPaymentDocRef);

        if (monthlyPaymentSnapshot.exists()) {
            const monthlyPaymentData = monthlyPaymentSnapshot.data();
            const associatedClassIds = monthlyPaymentData.associatedClassIds || [];

            // Borra cada clase asociada al paquete
            for (const classId of associatedClassIds) {
                const classDocRefToDelete = doc(db, `artifacts/${appId}/scheduledClasses`, classId);
                batch.delete(classDocRefToDelete);
            }
            
            // Opcional: Si quieres borrar también el registro del pago (el "abono")
            // descomenta la siguiente línea. Si no, solo se borrarán las clases del calendario.
            batch.delete(monthlyPaymentDocRef);

        } else {
             throw new Error("No se encontró el registro del paquete mensual para eliminar sus clases.");
        }

        await batch.commit();
        showMessage('Paquete mensual y todas sus clases eliminadas del calendario!', 'success');
        setShowMonthlyClassDeletionOptionsModal(false);
        onClose && onClose();
    } catch (e) {
        console.error("Error deleting entire monthly package: ", e);
        showMessage(`Error al eliminar el paquete mensual: ${e.message}`, 'error');
    }
};
    const cancelDeletion = () => {
        setShowConfirmDeleteSingleClassModal(false);
        setShowMonthlyClassDeletionOptionsModal(false);
        setShowConfirmDeleteGroupClassModal(false);
        cancelRemoveStudentFromClassInstance();
    };
    const handleRemoveStudentFromClassInstanceClick = (clsId, studentName) => {
        setStudentToRemoveFromClass({ id: clsId, name: studentName });
        setShowConfirmRemoveStudentFromClassInstanceModal(true);
    };
    const confirmRemoveStudentFromClassInstance = async () => { /* ...código sin cambios... */ };
    const cancelRemoveStudentFromClassInstance = () => {
        setShowConfirmRemoveStudentFromClassInstanceModal(false);
        setStudentToRemoveFromClass(null);
    };
    const handleGoToMarkPaymentFromAddStudent = (student) => {
        if (onCloseAttendanceModalFromApp) onCloseAttendanceModalFromApp(false);
        onGoToMarkPayment(student);
    };
    
    return (
        <>
            {showClassScreen && (
                <ClassScreen
                    classGroup={currentClassGroup}
                    students={students}
                    db={db}
                    appId={appId}
                    onClose={() => setShowClassScreen(false)}
                    onAttendanceChanged={(status) => {
                        setCurrentClassGroup(prev => prev.map(c => ({ ...c, attendanceStatus: status })));
                    }}
                />
            )}

            <div className="bg-white rounded-xl overflow-hidden">

                {/* ── HEADER: Iniciar Clase + info ── */}
                <div className="bg-gray-950 px-4 pt-4 pb-3 space-y-3">
                    <button
                        onClick={() => setShowClassScreen(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl font-bold text-sm transition"
                    >
                        <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                        Iniciar Clase con YouTube
                    </button>

                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-white font-black text-base">{mapClassTypeToSpanish(commonClassInfo.studentType)}</h2>
                            <p className="text-gray-400 text-xs">{formatDateToDDMMYYYY(commonClassInfo.classDate)} · {commonClassInfo.startTime} – {commonClassInfo.endTime}</p>
                        </div>
                        {elapsed && (
                            <div className="text-right bg-white/10 rounded-xl px-3 py-1.5">
                                <div className="text-white font-black text-lg tabular-nums leading-none">{elapsed}</div>
                                <div className="text-gray-400 text-[9px] uppercase tracking-wider">transcurrido</div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 space-y-4">
                {/* ── ALUMNOS + ASISTENCIA ── */}
                {classesToDisplay.map(cls => {
                    const studentInfo = students?.find(s => s.id === cls.studentId);
                    const hasDebt = studentInfo?.hasAnyUnpaidItems;
                    return (
                        <div key={cls.id} className="border border-gray-100 rounded-xl overflow-hidden">
                            {/* Info alumno */}
                            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900 truncate">{cls.studentName}</p>
                                    {hasDebt ? (
                                        <span className="text-[11px] font-bold text-rose-600">🔴 Tiene saldo pendiente</span>
                                    ) : (
                                        <span className="text-[11px] font-semibold text-green-600">✅ Al día</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {!cls.isPaid && studentInfo && (
                                        <button
                                            onClick={() => handleGoToMarkPaymentFromAddStudent(studentInfo)}
                                            className="p-1.5 rounded-lg bg-teal-100 text-teal-700 hover:bg-teal-200 transition"
                                            title="Marcar pago"
                                        >
                                            <IconCreditCard />
                                        </button>
                                    )}
                                    <button onClick={() => handleMarkAttendance(cls.id, null)}
                                        className="p-1.5 rounded-lg bg-gray-200 text-gray-500 hover:bg-gray-300 transition text-xs"
                                        title="Reiniciar">↻</button>
                                    {isGroupedClass && (
                                        <button onClick={() => handleRemoveStudentFromClassInstanceClick(cls.id, cls.studentName)}
                                            className="p-1.5 rounded-lg bg-red-100 text-red-500 hover:bg-red-200 transition"
                                            title="Quitar alumno">
                                            <IconTrash />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {/* Botones asistencia grandes */}
                            <div className="grid grid-cols-2">
                                <button onClick={() => handleMarkAttendance(cls.id, 'presente')}
                                    className={`py-4 font-black text-sm flex items-center justify-center gap-2 transition border-r border-gray-100
                                        ${cls.attendanceStatus === 'presente' ? 'bg-green-500 text-white' : 'bg-white text-green-600 hover:bg-green-50'}`}>
                                    ✓ Presente
                                </button>
                                <button onClick={() => handleMarkAttendance(cls.id, 'ausente')}
                                    className={`py-4 font-black text-sm flex items-center justify-center gap-2 transition
                                        ${cls.attendanceStatus === 'ausente' ? 'bg-rose-500 text-white' : 'bg-white text-rose-500 hover:bg-rose-50'}`}>
                                    ✗ Ausente
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* ── NOTAS DE LA CLASE ── */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">📝 Notas de hoy</label>
                        {notesSaved && <span className="text-[10px] text-green-500 font-semibold">✓ Guardado</span>}
                    </div>
                    <textarea
                        value={classNotes}
                        onChange={e => { setClassNotes(e.target.value); setNotesSaved(false); }}
                        onBlur={saveNotes}
                        placeholder="Qué se trabajó, observaciones del alumno..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
                    />
                </div>

                {/* ── MATERIAL / LINK (colapsable) ── */}
                <details className="border border-gray-200 rounded-xl">
                    <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-gray-600 flex items-center gap-2 select-none hover:bg-gray-50 transition rounded-xl">
                        <span>🎵 Material del tema</span>
                        {commonClassInfo?.topicLink && <span className="text-[10px] text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded-full">Link guardado</span>}
                    </summary>
                    <div className="px-4 pb-4 pt-1 space-y-2 border-t border-gray-100 mt-0">
                <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
    <label className="block text-xs font-bold text-indigo-800 uppercase mb-1">
        Link del Tema (Se enviará a todos)
    </label>
<label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
    <input 
        type="checkbox" 
        checked={applyToMonth} 
        onChange={(e) => setApplyToMonth(e.target.checked)}
        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-indigo-300"
    />
    <span className="text-[11px] font-bold text-indigo-700 uppercase">
        Asignar a todas las clases de este mes
    </span>
</label>
    <div className="flex gap-2">
        <input
            id="quick-link-input-group"
            type="url"
            placeholder="Pegar link aquí..."
            // Usamos el link del primer alumno como referencia para mostrarlo si ya existe
            defaultValue={commonClassInfo?.topicLink || ''}
            className="flex-1 p-2 text-sm border border-indigo-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        
<button
    type="button"
    onClick={async () => {
        // 1. Obtenemos el valor del input
        const val = document.getElementById('quick-link-input-group').value;
        if (!classesToDisplay || classesToDisplay.length === 0) return alert("No hay alumnos cargados.");

        // 2. Determinamos la fecha Y LA HORA para diferenciar clases (Coral vs Individual)
        const firstClass = classesToDisplay[0];
        const fechaReferencia = commonClassInfo?.classDate || firstClass?.classDate;
        const horaInicio = commonClassInfo?.startTime || firstClass?.startTime; // <--- CLAVE PARA NO MEZCLAR

        if (!fechaReferencia) return alert("Error: No se pudo determinar la fecha.");

        const mensaje = applyToMonth 
            ? "¿Confirmas guardar este tema para TODAS las clases de este grupo/horario en el mes?" 
            : `¿Guardar este link para los ${classesToDisplay.length} alumnos de esta clase?`;

        if(confirm(mensaje)) {
            try {
                const batch = writeBatch(db);
                
                if (applyToMonth) {
                    // --- LÓGICA MENSUAL CORREGIDA (FILTRO POR HORA) ---
                    const monthPrefix = fechaReferencia.substring(0, 7); // Extrae "2026-02"
                    
                    let constraints = [
                        where("classDate", ">=", `${monthPrefix}-01`),
                        where("classDate", "<=", `${monthPrefix}-31`),
                        where("studentType", "==", commonClassInfo.studentType)
                    ];

                    // Si tenemos la hora, filtramos por hora también.
                    if (horaInicio) {
                        constraints.push(where("startTime", "==", horaInicio));
                    }

                    // SEGURIDAD: Si es clase individual (1 alumno), filtramos por ID del alumno
                    if (classesToDisplay.length === 1 && commonClassInfo.studentType !== 'coral' && commonClassInfo.studentType !== 'grupal') {
                        constraints.push(where("studentId", "==", firstClass.studentId));
                    }

                    const q = query(
                        fsCollection(db, `artifacts/${appId}/scheduledClasses`),
                        ...constraints
                    );
                    
                    const snap = await getDocs(q);
                    
                    if (snap.empty) {
                        console.log("No se encontraron otras clases similares.");
                    }

                    snap.forEach(d => {
                        batch.update(d.ref, { topicLink: val });
                    });
                } else {
                    // --- LÓGICA NORMAL (Solo esta clase) ---
                    classesToDisplay.forEach(cls => {
                        batch.update(doc(db, `artifacts/${appId}/scheduledClasses`, cls.id), { 
                            topicLink: val 
                        });
                    });
                }

                // 3. Ejecutamos los cambios
                await batch.commit();
                
                // 4. Actualizamos la pantalla localmente
                classesToDisplay.forEach(c => c.topicLink = val);
                setApplyToMonth(false); 
                alert("✅ ¡Guardado correctamente!");

            } catch(e) {
                console.error("Error al guardar:", e);
                // Si el error pide un índice, avisamos claro
                if (e.message.includes("index")) {
                    alert("⚠️ FALTA UN ÍNDICE NUEVO: Abre la consola (F12) y haz clic en el link azul.");
                } else {
                    alert("Error al intentar guardar: " + e.message);
                }
            }
        }
    }}
    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-2 rounded shadow-sm transition-colors uppercase"
>
    Guardar
</button>
        <button 
            type="button" 
            onClick={async () => {
                // 1. Validamos que haya clases cargadas
                if (!classesToDisplay || classesToDisplay.length === 0) return;
                
                // 2. Confirmación de seguridad
                if (!confirm("⚠️ ¿Estás seguro de ELIMINAR el material para TODOS los alumnos de esta clase?")) return;

                try {
                    // 3. Recorremos todos los alumnos para borrar el link (seteamos topicLink a null)
                    const promises = classesToDisplay.map(cls => 
                        updateDoc(doc(db, `artifacts/${appId}/scheduledClasses`, cls.id), { 
                            topicLink: null 
                        })
                    );
                    
                    await Promise.all(promises);

                    // 4. Actualizamos la variable local para que el cambio se refleje sin recargar
                    classesToDisplay.forEach(c => c.topicLink = null);
                    
                    // 5. Limpiamos el input visualmente
                    const inputEl = document.getElementById('quick-link-input-group');
                    if (inputEl) inputEl.value = "";

                    alert("🗑️ Material eliminado correctamente.");
                } catch(e) { 
                    console.error(e); 
                    alert("Hubo un error al eliminar."); 
                }
            }}
            className="bg-red-100 hover:bg-red-200 text-red-700 border border-red-200 text-xs font-bold px-3 py-2 rounded shadow-sm transition-colors uppercase flex items-center justify-center"
            title="Borrar link de todos los alumnos"
        >
            {/* Icono de Basura SVG */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
        </button>
    </div>
</div>
                    </div>{/* cierra details content */}
                </details>

                {/* ── ELIMINAR (discreto al fondo) ── */}
                <button onClick={handleDeleteClick}
                    className="w-full py-2 text-xs text-gray-300 hover:text-rose-500 transition text-center rounded-lg hover:bg-rose-50">
                    Eliminar esta clase
                </button>

                </div>{/* cierra p-4 space-y-4 */}
            </div>{/* cierra bg-white rounded-xl */}

            {/* --- MODALES DE CONFIRMACIÓN CORREGIDOS --- */}
            <Modal
                isOpen={showConfirmDeleteSingleClassModal}
                onClose={cancelDeletion}
                title="Confirmar Eliminación"
                footer={
                    <div className="flex justify-end gap-2">
                        <button onClick={cancelDeletion} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300">Cancelar</button>
                        <button onClick={confirmDeleteSingleClass} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700">Sí, Eliminar</button>
                    </div>
                }
            >
                <p className="text-sm text-gray-700">
                    ¿Estás seguro de que deseas eliminar la clase de <b className="text-gray-900">{commonClassInfo?.studentName}</b> del día <b className="text-gray-900">{formatDateToDDMMYYYY(commonClassInfo?.classDate)}</b>?
                    <br/><br/>
                    <span className="font-semibold text-amber-700">Nota: El registro de pago (si existe) no se eliminará y deberás gestionarlo desde la sección de finanzas.</span>
                </p>
            </Modal>

       {/* --- REEMPLAZA TU MODAL ACTUAL POR ESTE --- */}
            <Modal isOpen={showConfirmDeleteGroupClassModal} onClose={() => setShowConfirmDeleteGroupClassModal(false)}>
                <div className="p-6">
                    {/* ENCABEZADO */}
                    <div className="flex items-center gap-3 mb-4 text-gray-800">
                        <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Gestionar Clase Grupal</h3>
                            <p className="text-sm text-gray-500">Saca alumnos individuales o elimina la clase entera.</p>
                        </div>
                    </div>

                    {/* LISTA DE ALUMNOS (ESTO ES LO QUE TE FALTABA) */}
                    <div className="mb-6 bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-2 bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase flex justify-between">
                            <span>Alumno</span>
                            <span>Acción</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto divide-y divide-gray-200 bg-white">
                            {currentClassGroup.map((cls) => (
                                <div key={cls.id} className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                            {cls.studentName ? cls.studentName.charAt(0) : "?"}
                                        </div>
                                        <span className="font-medium text-gray-700 text-sm">
                                            {cls.studentName || "Sin nombre"}
                                        </span>
                                    </div>
                                    
                                    {/* BOTÓN QUITAR INDIVIDUAL */}
                                    <button
                                        onClick={() => handleRemoveOneFromGroup(cls.id, cls.studentName)}
                                        className="text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 px-3 py-1 rounded-md transition-all text-xs font-bold flex items-center gap-1"
                                        title="Sacar solo a este alumno"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        QUITAR
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* BOTONES FINALES (Borrar todo o Cancelar) */}
                    <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                        <button
                            onClick={() => setShowConfirmDeleteGroupClassModal(false)}
                            className="px-4 py-2 text-gray-500 hover:text-gray-700 font-medium text-sm"
                        >
                            Cerrar
                        </button>
                        
                        <button
                            onClick={() => {
                                if(window.confirm("¿Seguro que quieres eliminar la clase COMPLETA para TODOS?")) {
                                    confirmDeleteGroupClass();
                                }
                            }}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-sm"
                        >
                            Eliminar Grupo Completo
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={showMonthlyClassDeletionOptionsModal} onClose={cancelDeletion} title="Eliminar Clase de Paquete Mensual">
                <div className="space-y-4">
                    <p className="text-sm text-gray-700">Esta clase es parte de un paquete mensual. ¿Qué acción deseas realizar?</p>
                    <button onClick={handleCancelSingleMonthlyClass} className="w-full text-left p-3 bg-white hover:bg-amber-50 border border-gray-300 rounded-lg">
                        <span className="font-semibold text-amber-800">Eliminar solo esta clase</span>
                        <span className="block text-xs text-gray-600">Las demás clases del paquete y el registro de pago permanecerán.</span>
                    </button>
                    <button onClick={handleDeleteEntireMonthlyPackage} className="w-full text-left p-3 bg-white hover:bg-rose-50 border border-gray-300 rounded-lg">
                        <span className="font-semibold text-rose-800">Eliminar el paquete mensual completo</span>
                        <span className="block text-xs text-gray-600">Se eliminarán TODAS las clases de este abono del calendario. El registro de pago no se tocará.</span>
                    </button>
                </div>
            </Modal>

            <Modal isOpen={showConfirmRemoveStudentFromClassInstanceModal} onClose={cancelRemoveStudentFromClassInstance} title="Quitar Alumno de la Clase" footer={
                 <div className="flex justify-end gap-2">
                    <button onClick={cancelRemoveStudentFromClassInstance} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300">Cancelar</button>
                    <button onClick={confirmRemoveStudentFromClassInstance} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700">Sí, Quitar</button>
                </div>
            }>
                <p className="text-sm text-gray-700">
                    ¿Quitar a <b className="text-gray-900">{studentToRemoveFromClass?.name}</b> de esta clase? Su registro de pago no se verá afectado.
                </p>
            </Modal>
        </>
    );
};

// ▼▼▼ REEMPLAZÁ TU COMPONENTE 'DebtDetailsModal' CON ESTA VERSIÓN MEJORADA ▼▼▼
