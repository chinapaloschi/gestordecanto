import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collection as fsCollection, doc, getDocs, updateDoc, query, where, orderBy, onSnapshot, writeBatch , getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Modal, ModalHeader } from './Modal.jsx';
import { AttendanceModal } from './AttendanceModal.jsx';
import { ScheduleClassForm } from './ScheduleClassForm.jsx';
import { MoveConfirmationModal } from './CalendarComponents.jsx';
import { MarkPaymentForm } from './MarkPaymentForm.jsx';
import { formatDateToDDMMYYYY, mapClassTypeToSpanish, daysOfWeekFull } from '../utils/classHelpers.js';
import { getLocalToday, toLocalYYYYMMDD, getDayNameFromDate, generateTimeOptions } from '../utils/dateHelpers.js';
import { IconCalendar, IconRefresh, IconCreditCard } from './Icons.jsx';
import { formatMoneyAr } from '../utils/money.js';
import { isPresent, isAbsent } from '../utils/studentHelpers.js';
export const CalendarView = ({ db, userId, appId, scheduledClasses, students, showMessage, onEditClass, onGoToMarkPayment, onCloseAttendanceModalFromApp, blockedSlots }) => {
    const [viewMode, setViewMode] = useState('weekly');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showReminderModal, setShowReminderModal] = useState(false);
    const [sendingReminder, setSendingReminder] = useState(false);
    const [reminderSent, setReminderSent] = useState(false);
    const [selectedDay, setSelectedDay] = useState(null); // YYYY-MM-DD
    const [showDayPanel, setShowDayPanel] = useState(false);
    const [quickSchedule, setQuickSchedule] = useState(null); // { date, time, student? }
    const [quickStudentSearch, setQuickStudentSearch] = useState('');
    const [draggingClassId, setDraggingClassId] = useState(null);
    const [showAttendanceModal, setShowAttendanceModal] = useState(false);
    const [selectedClassForAttendance, setSelectedClassForAttendance] = useState(null);
    const [showWeekend, setShowWeekend] = useState(true);
    
    // --- ESTADOS NUEVOS PARA EL MOVIMIENTO ---
    const [moveData, setMoveData] = useState(null); // Guarda los datos temporales del drop
    const [showMoveModal, setShowMoveModal] = useState(false);

    const [collapsedSections, setCollapsedSections] = React.useState({
      morning: false,
      afternoon: false,
    });

    const toggleSection = (section) => {
      setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // ... (handlePrev, handleNext, getFormattedDate, handleDragStart, handleDragOver, handleDragEnd se mantienen IGUAL) ...
    // COPIA AQUÍ TUS FUNCIONES handlePrev, handleNext, etc. EXISTENTES PARA NO PERDERLAS
    // ...
    const handlePrev = () => { if (viewMode === 'weekly') { setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); } else { setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; }); } };
    const handleNext = () => { if (viewMode === 'weekly') { setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); } else { setCurrentDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; }); } };
   const getFormattedDate = (date) => toLocalYYYYMMDD(date);
    const handleDragStart = (e, cls) => { if (cls.studentType !== 'individual') { e.preventDefault(); return; } setDraggingClassId(cls.id); e.dataTransfer.setData('text/plain', cls.id); e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver = (e) => { e.preventDefault(); };
    const handleDragEnd = () => { setDraggingClassId(null); };
    const getWeekRange = (startOfWeek, includeWeekend = true) => { const dates = []; let currentDay = new Date(startOfWeek); const dayOfWeek = currentDay.getDay(); const diff = currentDay.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); currentDay.setDate(diff); currentDay.setHours(0, 0, 0, 0); const daysToGenerate = includeWeekend ? 6 : 4; for (let i = 0; i < daysToGenerate; i++) { const date = new Date(currentDay); date.setDate(currentDay.getDate() + i); dates.push(date); } return dates; };
    const getClassDisplayInfo = (group) => {
        const classGroup = Array.isArray(group) ? group : [group];
        if (!classGroup.length) return { cardClasses: 'border-l-4 border-gray-300 bg-gray-50 text-gray-400 rounded-r-md' };
        const cls = classGroup[0];
        const type = cls.studentType;
        const allPresent = classGroup.every(c => isPresent(c.attendanceStatus));
        const allAbsent  = classGroup.every(c => isAbsent(c.attendanceStatus));
        const attended = type === 'individual' ? isPresent(cls.attendanceStatus) : allPresent;
        const absent   = type === 'individual' ? isAbsent(cls.attendanceStatus)  : allAbsent;
        let border, bg, text;
        if (attended) {
            border = 'border-green-500'; bg = 'bg-green-50'; text = 'text-green-900';
        } else if (absent) {
            border = 'border-red-400'; bg = 'bg-red-50'; text = 'text-red-800';
        } else if (!cls.isPaid) {
            if (type === 'individual') { border = 'border-blue-300';  bg = 'bg-blue-50/60';  text = 'text-blue-900'; }
            else if (type === 'group') { border = 'border-amber-300'; bg = 'bg-amber-50/60'; text = 'text-amber-900'; }
            else                       { border = 'border-pink-300';  bg = 'bg-pink-50/60';  text = 'text-pink-900'; }
        } else {
            if (type === 'individual') { border = 'border-blue-500';  bg = 'bg-blue-50';  text = 'text-blue-900'; }
            else if (type === 'group') { border = 'border-amber-500'; bg = 'bg-amber-50'; text = 'text-amber-900'; }
            else                       { border = 'border-pink-500';  bg = 'bg-pink-50';  text = 'text-pink-900'; }
        }
        return { cardClasses: `border-l-4 ${border} ${bg} ${text} rounded-r-md shadow-sm hover:shadow-md transition-shadow` };
    };

    // --- NUEVO HANDLE DROP QUE ABRE EL MODAL ---
    const handleDrop = React.useCallback(async (e, date, section) => {
        e.preventDefault();
        if (!draggingClassId) return;
        const classId = e.dataTransfer.getData('text/plain');
        const draggedClass = scheduledClasses.find(c => c.id === classId);
        if (!draggedClass) return;

        const newFormattedDate = getFormattedDate(date);
        
        // Check bloqueos
        if (blockedSlots.some(slot => slot.date === newFormattedDate)) {
            showMessage('No se puede mover a un día bloqueado.', 'error');
            setDraggingClassId(null);
            return;
        }

        // Calcular hora nueva
        const rect = e.currentTarget.getBoundingClientRect();
        const dropY = e.clientY - rect.top;
        const startHourOffset = section === 'morning' ? 8 : 13;
        const minutesFromStart = Math.max(0, dropY);
        const snappedMinutes = Math.round(minutesFromStart / 30) * 30;
        const hour = startHourOffset + Math.floor(snappedMinutes / 60);
        const minute = snappedMinutes % 60;
        const newStartTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        
        // Calcular fin
        const newStartDate = new Date(`${newFormattedDate}T${newStartTime}:00`);
        newStartDate.setMinutes(newStartDate.getMinutes() + draggedClass.duration);
        const newEndTime = `${newStartDate.getHours().toString().padStart(2, '0')}:${newStartDate.getMinutes().toString().padStart(2, '0')}`;

        // Guardar datos temporalmente y abrir modal
        setMoveData({
            classId,
            draggedClass,
            newDate: newFormattedDate,
            newStartTime,
            newEndTime
        });
        setShowMoveModal(true);
        setDraggingClassId(null);

    }, [draggingClassId, scheduledClasses, blockedSlots, showMessage]);

    // --- LÓGICA 1: MOVER SOLO UNA CLASE ---
    const executeMoveSingle = async () => {
        if (!moveData) return;
        const { classId, newDate, newStartTime, newEndTime } = moveData;
        
        // Validar superposición (Simplificado para brevedad, idealmente reutilizar lógica de overlap)
        try {
            const classDocRef = doc(db, `artifacts/${appId}/scheduledClasses`, classId);
            await updateDoc(classDocRef, { 
                classDate: newDate, 
                startTime: newStartTime, 
                endTime: newEndTime,
                // Si es paquete y se mueve solo una, podríamos marcarla como 'excepción' si quisieras, 
                // pero por ahora solo la movemos.
            });
            showMessage('Clase reprogramada exitosamente.', 'success');
        } catch (error) {
            showMessage('Error al mover la clase.', 'error');
        } finally {
            setShowMoveModal(false);
            setMoveData(null);
        }
    };
// --- LÓGICA 2: MOVER TODO EL PAQUETE (VERSIÓN DEFINITIVA) ---
    const executeMovePackage = async () => {
        if (!moveData) return;
        const { draggedClass, newDate, newStartTime, newEndTime } = moveData;
        
        // Verificación de seguridad
        if (!draggedClass.monthlyPaymentRefId) {
            console.log("No es un paquete, moviendo individual...");
            executeMoveSingle(); 
            return;
        }

        try {
            console.log("Iniciando movimiento de paquete...");
            
            // 1. Calcular la diferencia de días usando mediodía para evitar problemas de huso horario
            const oldDateObj = new Date(draggedClass.classDate + 'T12:00:00');
            const newDateObj = new Date(newDate + 'T12:00:00');
            const diffTime = newDateObj.getTime() - oldDateObj.getTime();
            const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

            console.log(`Diferencia de días: ${diffDays}`);

            // 2. Buscar todas las clases futuras de este abono
            const q = query(
                fsCollection(db, `artifacts/${appId}/scheduledClasses`),
                where("monthlyPaymentRefId", "==", draggedClass.monthlyPaymentRefId),
                where("classDate", ">=", draggedClass.classDate)
            );
            
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                alert('Error: No encontré las clases del paquete en la base de datos.');
                return;
            }

            const batch = writeBatch(db);
            let count = 0;

            snapshot.forEach((docSnap) => {
                const cls = docSnap.data();
                
                // Calcular nueva fecha
                const currentClsDate = new Date(cls.classDate + 'T12:00:00');
                currentClsDate.setDate(currentClsDate.getDate() + diffDays);
                const shiftedDateStr = currentClsDate.toISOString().split('T')[0];

                // Calcular nueva hora de fin basada en la duración original de ESA clase
                // (Importante por si alguna clase dura 90 min y otra 60)
                const duration = parseInt(cls.duration) || 60;
                const startParts = newStartTime.split(':').map(Number);
                const startMinutes = (startParts[0] * 60) + startParts[1];
                const endTotalMinutes = startMinutes + duration;
                const endH = Math.floor(endTotalMinutes / 60);
                const endM = endTotalMinutes % 60;
                const calculatedEndTime = `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`;

                batch.update(docSnap.ref, {
                    classDate: shiftedDateStr,
                    startTime: newStartTime, 
                    endTime: calculatedEndTime
                });
                count++;
            });

            console.log(`Clases a mover: ${count}`);

            // 3. Intentar actualizar el documento de PAGO (si existe)
            // Lo hacemos en un try/catch separado para que no rompa el movimiento de clases si el pago no existe
            const paymentRef = doc(db, `artifacts/${appId}/payments`, draggedClass.monthlyPaymentRefId);
            const paymentSnap = await getDoc(paymentRef);

            if (paymentSnap.exists()) {
                // Convertir día de semana (0=Domingo, 1=Lunes...)
                const newDayOfWeek = newDateObj.getDay(); 
                batch.update(paymentRef, {
                    dayOfWeek: String(newDayOfWeek),
                    startTime: newStartTime
                });
            } else {
                console.warn("Aviso: El registro del abono (pago) no se encontró, pero moveremos las clases igual.");
            }

            // Ejecutar todo
            await batch.commit();
            showMessage(`¡Listo! Se reprogramaron ${count} clases del paquete.`, 'success');

        } catch (error) {
            console.error("Error CRÍTICO al mover paquete:", error);
            showMessage(`Hubo un error técnico: ${error.message}`, 'error');
        } finally {
            setShowMoveModal(false);
            setMoveData(null);
        }
    };
    const groupClassesForWeeklyView = (classes) => { const groupsMap = new Map(); for (const cls of classes) { const key = (cls.studentType === 'individual' || !cls.studentType) ? cls.id : `${cls.startTime}|${cls.studentType}`; if (!groupsMap.has(key)) { groupsMap.set(key, []); } groupsMap.get(key).push(cls); } return Array.from(groupsMap.values()); };
 // Dentro de CalendarView...
// Dentro de CalendarView...

    // ── Color fijo por alumno ────────────────────────────────────────────────
    const STUDENT_PALETTES = [
        { bg: 'bg-violet-100',  text: 'text-violet-900',  border: 'border-l-4 border-violet-400',  dot: '#7c3aed' },
        { bg: 'bg-sky-100',     text: 'text-sky-900',     border: 'border-l-4 border-sky-400',     dot: '#0284c7' },
        { bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-l-4 border-emerald-400', dot: '#059669' },
        { bg: 'bg-orange-100',  text: 'text-orange-900',  border: 'border-l-4 border-orange-400',  dot: '#ea580c' },
        { bg: 'bg-pink-100',    text: 'text-pink-900',    border: 'border-l-4 border-pink-400',    dot: '#db2777' },
        { bg: 'bg-teal-100',    text: 'text-teal-900',    border: 'border-l-4 border-teal-400',    dot: '#0d9488' },
        { bg: 'bg-indigo-100',  text: 'text-indigo-900',  border: 'border-l-4 border-indigo-400',  dot: '#4338ca' },
        { bg: 'bg-amber-100',   text: 'text-amber-900',   border: 'border-l-4 border-amber-400',   dot: '#d97706' },
        { bg: 'bg-rose-100',    text: 'text-rose-900',    border: 'border-l-4 border-rose-400',    dot: '#e11d48' },
        { bg: 'bg-cyan-100',    text: 'text-cyan-900',    border: 'border-l-4 border-cyan-400',    dot: '#0891b2' },
    ];
    const getStudentPalette = (studentId) => {
        if (!studentId) return STUDENT_PALETTES[0];
        let h = 0;
        for (let i = 0; i < studentId.length; i++) h = studentId.charCodeAt(i) + ((h << 5) - h);
        return STUDENT_PALETTES[Math.abs(h) % STUDENT_PALETTES.length];
    };

    // ── Stats del mes visible ────────────────────────────────────────────────
    const monthlyStats = useMemo(() => {
        const y = currentDate.getFullYear();
        const m = String(currentDate.getMonth() + 1).padStart(2, '0');
        const prefix = `${y}-${m}`;
        const month = (scheduledClasses || []).filter(c =>
            (c.classDate || '').startsWith(prefix) && c.status !== 'cancelled'
        );
        const paid    = month.filter(c => c.isPaid).length;
        const present = month.filter(c => isPresent(c.attendanceStatus)).length;
        return { total: month.length, paid, pending: month.length - paid, present };
    }, [scheduledClasses, currentDate]);

    // ── Recordatorio del día siguiente ───────────────────────────────────────
    const tomorrowKey = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return toLocalYYYYMMDD(d);
    }, []);

    const tomorrowLabel = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    }, []);

    const tomorrowStudents = useMemo(() => {
        if (!Array.isArray(scheduledClasses)) return [];
        const map = {};
        scheduledClasses
            .filter(c => c.classDate === tomorrowKey && c.status !== 'cancelled')
            .forEach(c => {
                if (!c.studentId) return;
                if (!map[c.studentId] || (c.classTime || '') < (map[c.studentId].time || '')) {
                    const stu = (students || []).find(s => s.id === c.studentId);
                    map[c.studentId] = { id: c.studentId, name: stu?.name || c.studentName || 'Alumno', time: c.classTime || '' };
                }
            });
        return Object.values(map).sort((a, b) => a.time.localeCompare(b.time));
    }, [scheduledClasses, tomorrowKey, students]);

    const handleSendReminder = async () => {
        setSendingReminder(true);
        try {
            const fn = httpsCallable(getFunctions(), 'sendManualReminders');
            await fn({ appId, dateKey: tomorrowKey });
            setReminderSent(true);
        } catch (e) {
            showMessage('Error al enviar recordatorios: ' + e.message, 'error');
        } finally {
            setSendingReminder(false);
        }
    };
    // ─────────────────────────────────────────────────────────────────────────

    const renderWeeklyView = () => {
        const weekDates = getWeekRange(currentDate, showWeekend);
        const morningTimeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00'];
        const afternoonTimeSlots = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
        const weekDayHeaders = showWeekend ? ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] : ['Lunes', 'Martes', 'Miércoles', 'Jueves'];
        const gridCols = showWeekend ? 6 : 4;
        const headerColSpanClass = showWeekend ? 'col-span-7' : 'col-span-5';
        
        // --- NUEVA FUNCIÓN: RENDERIZAR BLOQUES PARCIALES ---
        const renderPartialBlocks = (date, section) => {
            const formattedDate = getFormattedDate(date);
            const slots = Array.isArray(blockedSlots) ? blockedSlots : [];
            
            // Filtramos bloqueos de este día que NO sean de día completo
            const dayBlocks = slots.filter(s => s.date === formattedDate && s.isAllDay === false);
            
            return dayBlocks.map((block, i) => {
                if (!block.startTime || !block.endTime) return null;

                const [startH, startM] = block.startTime.split(':').map(Number);
                const [endH, endM] = block.endTime.split(':').map(Number);
                
                // Determinar si el bloque pertenece a esta sección (Mañana o Tarde)
                // Mañana: hasta las 13:00. Tarde: desde las 13:00.
                if (section === 'morning') {
                    if (startH >= 13) return null; // Empieza en la tarde
                }
                if (section === 'afternoon') {
                    if (endH <= 13) return null; // Termina en la mañana
                }

                // Calcular posición (Base hora: 8 para mañana, 13 para tarde)
                const baseHour = section === 'morning' ? 8 : 13;
                
                // Ajuste de inicio (si el bloque empieza antes de la sección actual, lo cortamos visualmente)
                const effectiveStartH = Math.max(startH, baseHour); 
                const effectiveStartM = (effectiveStartH === startH) ? startM : 0;

                const top = ((effectiveStartH - baseHour) * 60) + effectiveStartM;
                
                // Cálculo de duración en minutos
                let durationMinutes = ((endH * 60) + endM) - ((effectiveStartH * 60) + effectiveStartM);
                
                // Si se pasa de la sección (ej: bloque de 12 a 15), cortamos la visualización en el límite
                // (La visualización de la mañana termina a las 13:00, o sea 5 horas * 60 = 300 mins desde las 8)
                const sectionLimitMinutes = (section === 'morning' ? 13 - 8 : 21 - 13) * 60;
                if (top + durationMinutes > sectionLimitMinutes) {
                    durationMinutes = sectionLimitMinutes - top;
                }

                // Renderizar el bloque rojo
                return (
                    <div 
                        key={`block-${block.id}-${i}`}
                        className="absolute w-[calc(100%-8px)] left-1 z-20 flex flex-col justify-center items-center 
                                   bg-rose-100/90 border-l-4 border-rose-500 shadow-sm overflow-hidden pointer-events-none"
                        style={{ 
                            top: `${top}px`, 
                            height: `${durationMinutes}px`,
                            backgroundImage: 'linear-gradient(45deg, #ffe4e6 25%, #fecdd3 25%, #fecdd3 50%, #ffe4e6 50%, #ffe4e6 75%, #fecdd3 75%, #fecdd3 100%)',
                            backgroundSize: '10px 10px'
                        }}
                    >
                        <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-widest bg-white/50 px-2 py-0.5 rounded">
                            NO DISPONIBLE
                        </span>
                        <span className="text-[9px] font-semibold text-rose-800 truncate px-1 mt-1">
                            {block.reason} ({block.startTime} - {block.endTime})
                        </span>
                    </div>
                );
            });
        };
        // --- FIN NUEVA FUNCIÓN ---

        return (
            <div className="w-full border border-gray-300 rounded-lg select-none">
                <div className="grid" style={{ gridTemplateColumns: `auto repeat(${gridCols}, minmax(70px, 1fr))` }}>
                    <div className="sticky top-0 left-0 bg-gray-50 z-10 p-2 border-b border-r border-gray-200"></div>
                    {weekDates.map((date, index) => {
                        const isTodayCol = date.toDateString() === new Date().toDateString();
                        const shortDate = formatDateToDDMMYYYY(date).slice(0, 5);
                        return (
                            <div key={date.toISOString()}
                                className={`sticky top-0 z-10 py-2 px-1 text-center border-b border-r border-gray-200 transition-colors
                                    ${isTodayCol ? 'bg-rose-600 text-white' : 'bg-gray-50 text-gray-600'}`}>
                                <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{weekDayHeaders[index]}</div>
                                <div className={`text-xs font-bold ${isTodayCol ? 'text-white' : 'text-gray-800'}`}>{shortDate}</div>
                                {isTodayCol && <div className="text-[8px] bg-white/25 rounded px-1 mt-0.5 inline-block font-bold tracking-wider">HOY</div>}
                            </div>
                        );
                    })}
                    
                    {/* SECCIÓN MAÑANA */}
                    <div onClick={() => toggleSection('morning')} className={`${headerColSpanClass} sticky top-[49px] z-10 flex items-center justify-center gap-2 py-1 bg-gray-50/90 backdrop-blur border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mañana</span>
                        <span className="text-gray-300 text-[10px]">{collapsedSections.morning ? '▾' : '▴'}</span>
                    </div>
                    {!collapsedSections.morning && (
                        <div style={{ display: 'contents' }}>
                            <div className="flex flex-col bg-gray-50/80">
                                {morningTimeSlots.map(slotTime => (
                                    <div key={slotTime} className="h-[60px] p-2 text-[11px] font-semibold text-gray-400 text-right border-r border-b border-gray-100 relative tabular-nums">
                                        {slotTime}
                                        <div className="absolute top-[30px] left-0 right-0 border-t border-dashed border-gray-100" />
                                    </div>
                                ))}
                            </div>
                            {weekDates.map(date => {
                                const formattedDate = getFormattedDate(date);
                                // Detectar bloqueo total
                                const dayBlocks = Array.isArray(blockedSlots) ? blockedSlots.filter(s => s.date === formattedDate) : [];
                                const isFullDayBlocked = dayBlocks.some(s => s.isAllDay !== false); 
                                const isToday = date.toDateString() === new Date().toDateString();
                                
                                const classes = scheduledClasses.filter(c => c.classDate === formattedDate && parseInt(c.startTime.split(':')[0]) < 13 && (c.status === 'scheduled' || !c.status));
                                const groupedClasses = groupClassesForWeeklyView(classes);
                                const cancelledClasses = isFullDayBlocked
                                    ? scheduledClasses.filter(c => c.classDate === formattedDate && parseInt(c.startTime.split(':')[0]) < 13 && c.status === 'cancelled')
                                    : [];
                                const groupedCancelled = groupClassesForWeeklyView(cancelledClasses);
                                const bgColorClass = isFullDayBlocked ? 'bg-gray-100' : (isToday ? 'bg-rose-50/30' : 'bg-white');

                                return (
                                    <div key={formattedDate} className={`relative border-r border-b border-gray-100 ${bgColorClass}`} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, date, 'morning')}>
                                        {morningTimeSlots.map(t => (
                                            <div key={t}
                                                className="h-[60px] border-b border-gray-100 last:border-b-0 relative group/slot cursor-pointer hover:bg-rose-50/40 transition-colors"
                                                onClick={() => !isFullDayBlocked && setQuickSchedule({ date: formattedDate, time: t })}
                                            >
                                                <div className="absolute top-[30px] inset-x-0 border-t border-dashed border-gray-100" />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none">
                                                    <span className="text-[10px] font-bold text-rose-400 bg-white/80 px-2 py-0.5 rounded-full shadow-sm">+ clase {t}</span>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        {/* Bloqueo Total */}
                                        {isFullDayBlocked && <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"><span className="text-sm font-semibold text-gray-500 transform rotate-45 opacity-60">Bloqueado</span></div>}

                                        {/* ✅ Bloqueo Parcial (Solo si no es bloqueo total) */}
                                        {!isFullDayBlocked && renderPartialBlocks(date, 'morning')}

                                        {/* Clases suspendidas por el bloqueo — se muestran de fondo, bien tenues */}
                                        {groupedCancelled.map(group => {
                                            const cls = group[0];
                                            const [h, m] = cls.startTime.split(':').map(Number);
                                            const top = ((h - 8) * 60) + m;
                                            const studentNames = group.map(g => g.studentName).join(', ');
                                            return (
                                                <div key={`cancelled-${group.map(c => c.id).join('-')}`}
                                                    className="absolute w-[calc(100%-6px)] overflow-hidden rounded bg-gray-400/20 border border-dashed border-gray-400/40 pointer-events-none opacity-60 grayscale"
                                                    style={{ top: `${top}px`, left: '3px', height: `${Math.max((cls.duration || 60) - 2, 18)}px`, zIndex: 10 }}
                                                    title={`Suspendida por bloqueo: ${cls.startTime} · ${studentNames}`}>
                                                    <div className="px-1.5 py-1 h-full flex items-center gap-1 min-w-0">
                                                        <span className="text-[10px] font-bold tabular-nums flex-shrink-0 text-gray-500 line-through">{cls.startTime}</span>
                                                        <span className="text-[11px] font-medium truncate flex-1 text-gray-500 line-through">{studentNames}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {groupedClasses.map(group => {
                                            const cls = group[0];
                                            const { cardClasses } = getClassDisplayInfo(group);
                                            const [h, m] = cls.startTime.split(':').map(Number);
                                            const top = ((h - 8) * 60) + m;
                                            const studentNames = group.map(g => g.studentName).join(', ');
                                            const isGroupClass = group.length > 1 || cls.studentType !== 'individual';
                                            return <div key={group.map(c => c.id).join('-')} draggable={!isGroupClass && !isFullDayBlocked} onDragStart={(e) => handleDragStart(e, cls)} onDragEnd={handleDragEnd}
                                                className={`absolute w-[calc(100%-6px)] overflow-hidden ${cardClasses} ${!isGroupClass && !isFullDayBlocked ? 'cursor-grab' : 'cursor-pointer'}`}
                                                style={{ top: `${top}px`, left: '3px', height: `${cls.duration - 2}px`, zIndex: 30 }}
                                                onClick={(e) => { e.stopPropagation(); setSelectedClassForAttendance(group); setShowAttendanceModal(true); }}>
                                                <div className="px-1.5 py-1 h-full flex flex-col justify-center">
                                                    <div className="flex items-center gap-1 min-w-0">
                                                        <span className="text-[10px] font-bold tabular-nums flex-shrink-0 opacity-70">{cls.startTime}</span>
                                                        <span className="text-[11px] font-semibold truncate flex-1">{studentNames}</span>
                                                        {!cls.isPaid && <span className="flex-shrink-0 text-[9px] bg-amber-400/25 text-amber-700 px-0.5 rounded font-bold">$</span>}
                                                    </div>
                                                    {cls.duration >= 50 && (
                                                        <div className="text-[9px] opacity-50 truncate leading-tight">{mapClassTypeToSpanish(cls.studentType)}</div>
                                                    )}
                                                </div>
                                            </div>
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* SECCIÓN TARDE */}
                    <div onClick={() => toggleSection('afternoon')} className={`${headerColSpanClass} sticky top-[49px] z-10 flex items-center justify-center gap-2 py-1 bg-gray-50/90 backdrop-blur border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tarde</span>
                        <span className="text-gray-300 text-[10px]">{collapsedSections.afternoon ? '▾' : '▴'}</span>
                    </div>
                    {!collapsedSections.afternoon && (
                        <div style={{ display: 'contents' }}>
                            <div className="flex flex-col bg-gray-50/80">
                                {afternoonTimeSlots.map(slotTime => (
                                    <div key={slotTime} className="h-[60px] border-r border-b border-gray-100 relative">
                                        <span className="absolute top-1 right-2 text-[10px] font-semibold text-gray-400 tabular-nums">{slotTime}</span>
                                        <div className="absolute top-[30px] left-0 right-0 border-t border-dashed border-gray-100" />
                                    </div>
                                ))}
                            </div>
                            {weekDates.map(date => {
                                const formattedDate = getFormattedDate(date);
                                const dayBlocks = Array.isArray(blockedSlots) ? blockedSlots.filter(s => s.date === formattedDate) : [];
                                const isFullDayBlocked = dayBlocks.some(s => s.isAllDay !== false);

                                const isToday = date.toDateString() === new Date().toDateString();
                                const bgColorClass = isFullDayBlocked ? 'bg-gray-100' : (isToday ? 'bg-rose-50/30' : 'bg-white');
                                const classes = scheduledClasses.filter(c => c.classDate === formattedDate && parseInt(c.startTime.split(':')[0]) >= 13 && (c.isPaid || c.monthlyPaymentRefId) && (c.status === 'scheduled' || !c.status));
                                const groupedClasses = groupClassesForWeeklyView(classes);
                                const cancelledClasses = isFullDayBlocked
                                    ? scheduledClasses.filter(c => c.classDate === formattedDate && parseInt(c.startTime.split(':')[0]) >= 13 && c.status === 'cancelled')
                                    : [];
                                const groupedCancelled = groupClassesForWeeklyView(cancelledClasses);
                                return (
                                    <div key={formattedDate} className={`relative border-r border-b border-gray-100 ${bgColorClass}`} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, date, 'afternoon')}>
                                        {afternoonTimeSlots.map(t => (
                                            <div key={t}
                                                className="h-[60px] border-b border-gray-100 last:border-b-0 relative group/slot cursor-pointer hover:bg-rose-50/40 transition-colors"
                                                onClick={() => !isFullDayBlocked && setQuickSchedule({ date: formattedDate, time: t })}
                                            >
                                                <div className="absolute top-[30px] inset-x-0 border-t border-dashed border-gray-100" />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none">
                                                    <span className="text-[10px] font-bold text-rose-400 bg-white/80 px-2 py-0.5 rounded-full shadow-sm">+ clase {t}</span>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        {isFullDayBlocked && <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"><span className="text-sm font-semibold text-gray-500 transform rotate-45 opacity-60">Bloqueado</span></div>}

                                        {/* ✅ Bloqueo Parcial (Tarde) */}
                                        {!isFullDayBlocked && renderPartialBlocks(date, 'afternoon')}

                                        {/* Clases suspendidas por el bloqueo — se muestran de fondo, bien tenues */}
                                        {groupedCancelled.map(group => {
                                            const cls = group[0];
                                            const [h, m] = cls.startTime.split(':').map(Number);
                                            const top = ((h - 13) * 60) + m;
                                            const studentNames = group.map(g => g.studentName).join(', ');
                                            return (
                                                <div key={`cancelled-${group.map(c => c.id).join('-')}`}
                                                    className="absolute w-[calc(100%-6px)] overflow-hidden rounded bg-gray-400/20 border border-dashed border-gray-400/40 pointer-events-none opacity-60 grayscale"
                                                    style={{ top: `${top}px`, left: '3px', height: `${Math.max((cls.duration || 60) - 2, 18)}px`, zIndex: 10 }}
                                                    title={`Suspendida por bloqueo: ${cls.startTime} · ${studentNames}`}>
                                                    <div className="px-1.5 py-1 h-full flex items-center gap-1 min-w-0">
                                                        <span className="text-[10px] font-bold tabular-nums flex-shrink-0 text-gray-500 line-through">{cls.startTime}</span>
                                                        <span className="text-[11px] font-medium truncate flex-1 text-gray-500 line-through">{studentNames}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {groupedClasses.map(group => {
                                            const cls = group[0];
                                            const { cardClasses } = getClassDisplayInfo(group);
                                            const [h, m] = cls.startTime.split(':').map(Number);
                                            const top = ((h - 13) * 60) + m;
                                            const studentNames = group.map(g => g.studentName).join(', ');
                                            const isGroupClass = group.length > 1 || cls.studentType !== 'individual';
                                            return <div key={group.map(c => c.id).join('-')} draggable={!isGroupClass && !isFullDayBlocked} onDragStart={(e) => handleDragStart(e, cls)} onDragEnd={handleDragEnd}
                                                className={`absolute w-[calc(100%-6px)] overflow-hidden ${cardClasses} ${!isGroupClass && !isFullDayBlocked ? 'cursor-grab' : 'cursor-pointer'}`}
                                                style={{ top: `${top}px`, left: '3px', height: `${cls.duration - 2}px`, zIndex: 30 }}
                                                onClick={(e) => { e.stopPropagation(); setSelectedClassForAttendance(group); setShowAttendanceModal(true); }}>
                                                <div className="px-1.5 py-1 h-full flex flex-col justify-center">
                                                    <div className="flex items-center gap-1 min-w-0">
                                                        <span className="text-[10px] font-bold tabular-nums flex-shrink-0 opacity-70">{cls.startTime}</span>
                                                        <span className="text-[11px] font-semibold truncate flex-1">{studentNames}</span>
                                                        {!cls.isPaid && <span className="flex-shrink-0 text-[9px] bg-amber-400/25 text-amber-700 px-0.5 rounded font-bold">$</span>}
                                                    </div>
                                                    {cls.duration >= 50 && (
                                                        <div className="text-[9px] opacity-50 truncate leading-tight">{mapClassTypeToSpanish(cls.studentType)}</div>
                                                    )}
                                                </div>
                                            </div>
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    };
    const renderMonthlyView = () => {
        const year  = currentDate.getFullYear();
        const month = currentDate.getMonth();

        // Build calendar grid (6 weeks × N days)
        const daysInMonth = [];
        const startDate = new Date(year, month, 1);
        let dow = startDate.getDay();
        if (dow === 0) dow = 7;
        startDate.setDate(startDate.getDate() - (dow - 1));
        for (let i = 0; i < 42; i++) { daysInMonth.push(new Date(startDate)); startDate.setDate(startDate.getDate() + 1); }

        const dayHeaders   = showWeekend ? ['Lun','Mar','Mié','Jue','Vie','Sáb'] : ['Lun','Mar','Mié','Jue'];
        const gridClass    = showWeekend ? 'grid-cols-6' : 'grid-cols-4';

        const visibleDays  = daysInMonth.filter(d => {
            const dw = d.getDay();
            if (dw === 0) return false;
            if (!showWeekend && (dw === 5 || dw === 6)) return false;
            return true;
        });

        return (
            <div>
                {/* ── RESUMEN DEL MES ── */}
                <div className="flex flex-wrap gap-2 mb-4">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-xl text-xs font-semibold text-gray-700">
                        📅 <span>{monthlyStats.total} clase{monthlyStats.total !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 rounded-xl text-xs font-semibold text-green-800">
                        ✓ {monthlyStats.present} con asistencia
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 rounded-xl text-xs font-semibold text-blue-800">
                        💳 {monthlyStats.paid} pagada{monthlyStats.paid !== 1 ? 's' : ''}
                    </div>
                    {monthlyStats.pending > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 rounded-xl text-xs font-semibold text-amber-800">
                            ⚠ {monthlyStats.pending} sin pago
                        </div>
                    )}
                </div>

                {/* ── GRILLA ── */}
                <div className={`w-full grid ${gridClass} border border-gray-200 rounded-xl overflow-hidden shadow-sm`}>
                    {/* Encabezados */}
                    {dayHeaders.map(d => (
                        <div key={d} className="py-2 text-center text-xs font-bold text-gray-500 bg-gray-50 border-b border-gray-200 uppercase tracking-wider">{d}</div>
                    ))}

                    {/* Celdas */}
                    {visibleDays.map((day, idx) => {
                        const fmt        = getFormattedDate(day);
                        const blocked    = (blockedSlots || []).find(s => s.date === fmt);
                        const isCurrentM = day.getMonth() === month;
                        const isToday    = day.toDateString() === new Date().toDateString();
                        const isSel      = selectedDay === fmt && showDayPanel;

                        const dayClasses = (scheduledClasses || [])
                            .filter(c => c.classDate === fmt && c.status !== 'cancelled')
                            .sort((a, b) => (a.startTime || a.classTime || '').localeCompare(b.startTime || b.classTime || ''));

                        // Group classes at same time + type (for group classes)
                        const groupsMap = new Map();
                        for (const cls of dayClasses) {
                            const key = `${cls.startTime || cls.classTime}|${cls.studentType}`;
                            if (!groupsMap.has(key)) groupsMap.set(key, []);
                            groupsMap.get(key).push(cls);
                        }
                        const groups = Array.from(groupsMap.values());

                        return (
                            <div
                                key={idx}
                                onClick={() => { setSelectedDay(fmt); setShowDayPanel(true); }}
                                className={`relative border-b border-r border-gray-100 min-h-[110px] cursor-pointer transition-colors
                                    ${isCurrentM ? 'bg-white' : 'bg-gray-50/60'}
                                    ${isToday ? '!bg-rose-50 border-rose-200' : ''}
                                    ${isSel ? 'ring-2 ring-inset ring-rose-400' : 'hover:bg-gray-50'}
                                    ${blocked ? 'bg-gray-100' : ''}
                                `}
                            >
                                {/* Número del día */}
                                <div className={`px-2 pt-1.5 pb-0.5 flex items-center justify-between`}>
                                    <span className={`text-xs font-bold inline-flex items-center justify-center w-6 h-6 rounded-full
                                        ${isToday ? 'bg-rose-600 text-white' : isCurrentM ? 'text-gray-700' : 'text-gray-300'}`}>
                                        {day.getDate()}
                                    </span>
                                    {dayClasses.length > 0 && (
                                        <span className="text-[10px] font-bold text-gray-400">{dayClasses.length}</span>
                                    )}
                                </div>

                                {/* Día bloqueado */}
                                {blocked && (
                                    <div className="mx-2 mb-1 px-2 py-0.5 bg-gray-200 rounded text-[10px] text-gray-500 font-semibold truncate">
                                        🚫 {blocked.reason || 'Bloqueado'}
                                    </div>
                                )}

                                {/* Pastillas de clases — coloreadas por alumno */}
                                <div className="px-1.5 pb-1.5 space-y-0.5 overflow-hidden" style={{ maxHeight: 82 }}>
                                    {groups.slice(0, 3).map(group => {
                                        const first   = group[0];
                                        const time    = first.startTime || first.classTime || '';
                                        // Color por alumno (primer alumno del grupo)
                                        const palette = getStudentPalette(first.studentId);
                                        const names   = group
                                            .map(g => (students || []).find(s => s.id === g.studentId)?.name || g.studentName || '')
                                            .filter(Boolean);
                                        const firstName = names[0]?.split(' ')[0] || 'Alumno';
                                        const attended = isPresent(first.attendanceStatus);
                                        const absent   = isAbsent(first.attendanceStatus);
                                        return (
                                            <div
                                                key={`${first.classDate}-${time}-${first.studentType}`}
                                                onClick={e => { e.stopPropagation(); setSelectedClassForAttendance(group); setShowAttendanceModal(true); }}
                                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity
                                                    ${attended ? 'bg-green-100 text-green-800' : absent ? 'bg-red-100 text-red-700' : `${palette.bg} ${palette.text}`}
                                                `}
                                                title={`${time} · ${names.join(', ')}`}
                                            >
                                                <span className="font-bold flex-shrink-0">{time}</span>
                                                <span className="truncate">{group.length > 1 ? `${names.length} alumnos` : firstName}</span>
                                                {!first.isPaid && <span className="ml-auto flex-shrink-0 text-[9px]">$</span>}
                                                {attended && <span className="ml-auto flex-shrink-0">✓</span>}
                                            </div>
                                        );
                                    })}
                                    {groups.length > 3 && (
                                        <div className="text-[10px] text-gray-400 font-semibold px-1">+{groups.length - 3} más</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ── PANEL DEL DÍA (slide-up) ── */}
                {showDayPanel && selectedDay && (() => {
                    const panelClasses = (scheduledClasses || [])
                        .filter(c => c.classDate === selectedDay && c.status !== 'cancelled')
                        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
                    const panelDate = (() => {
                        const [y, m, d] = selectedDay.split('-').map(Number);
                        return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
                    })();
                    return (
                        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setShowDayPanel(false)}>
                            <div
                                className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
                                style={{ maxHeight: '80vh' }}
                                onClick={e => e.stopPropagation()}
                            >
                                {/* Header */}
                                <div className="px-5 py-4 border-b flex items-center gap-3">
                                    <div className="flex-1">
                                        <h3 className="font-bold text-gray-900 capitalize">{panelDate}</h3>
                                        <p className="text-xs text-gray-500">{panelClasses.length} clase{panelClasses.length !== 1 ? 's' : ''}</p>
                                    </div>
                                    <button onClick={() => setShowDayPanel(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold">×</button>
                                </div>

                                {/* Lista */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                    {panelClasses.length === 0 ? (
                                        <p className="text-center text-gray-400 py-8 text-sm">Sin clases este día</p>
                                    ) : panelClasses.map(cls => {
                                        const palette  = getStudentPalette(cls.studentId);
                                        const stuName  = (students || []).find(s => s.id === cls.studentId)?.name || cls.studentName || 'Alumno';
                                        const attended = isPresent(cls.attendanceStatus);
                                        const absent   = isAbsent(cls.attendanceStatus);
                                        return (
                                            <div key={cls.id} className={`rounded-xl border-l-4 p-3 flex items-center gap-3 ${attended ? 'bg-green-50 border-green-400' : absent ? 'bg-red-50 border-red-400' : `${palette.bg} ${palette.border}`}`}>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-gray-900">{cls.startTime || cls.classTime || '—'} hs</span>
                                                        <span className="text-xs text-gray-500">{mapClassTypeToSpanish?.(cls.studentType) || cls.studentType || ''}</span>
                                                    </div>
                                                    <p className="text-sm font-semibold text-gray-800 truncate">{stuName}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        {attended && <span className="text-[11px] font-bold text-green-700">✓ Presente</span>}
                                                        {absent   && <span className="text-[11px] font-bold text-red-600">✗ Ausente</span>}
                                                        {!attended && !absent && <span className="text-[11px] text-gray-400">Sin marcar</span>}
                                                        {!cls.isPaid && <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-1.5 rounded-full">Sin pago</span>}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => { setSelectedClassForAttendance([cls]); setShowAttendanceModal(true); setShowDayPanel(false); }}
                                                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition"
                                                >
                                                    Gestionar
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        );
    };

    // ── Vista de día para móvil ───────────────────────────────────────────────
    const renderMobileDayView = () => {
        const formattedDate = getFormattedDate(currentDate);
        const isTodayDay = currentDate.toDateString() === new Date().toDateString();
        const isBlocked = Array.isArray(blockedSlots) && blockedSlots.some(s => s.date === formattedDate && s.isAllDay !== false);

        const dayClasses = scheduledClasses
            .filter(c => c.classDate === formattedDate && (c.status === 'scheduled' || !c.status))
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

        const goDay = (delta) => setCurrentDate(d => {
            const n = new Date(d); n.setDate(n.getDate() + delta); return n;
        });

        const dateLabel = currentDate.toLocaleDateString('es-AR', {
            weekday: 'long', day: 'numeric', month: 'long'
        });

        const nPresent = dayClasses.filter(c => isPresent(c.attendanceStatus)).length;
        const nAbsent  = dayClasses.filter(c => isAbsent(c.attendanceStatus)).length;

        return (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Navegación de día */}
                <div className={`flex items-center justify-between px-3 py-3 border-b border-gray-200
                    ${isTodayDay ? 'bg-rose-600' : 'bg-gray-50'}`}>
                    <button onClick={() => goDay(-1)}
                        className={`p-2 rounded-lg transition ${isTodayDay ? 'text-white hover:bg-white/20' : 'text-gray-500 hover:bg-gray-200'}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                        </svg>
                    </button>
                    <div className="text-center">
                        <p className={`font-semibold text-sm capitalize ${isTodayDay ? 'text-white' : 'text-gray-800'}`}>
                            {dateLabel}
                        </p>
                        {isTodayDay && (
                            <span className="text-[10px] bg-white/25 text-white rounded-full px-2 py-0.5 font-bold uppercase tracking-wider">
                                HOY
                            </span>
                        )}
                    </div>
                    <button onClick={() => goDay(1)}
                        className={`p-2 rounded-lg transition ${isTodayDay ? 'text-white hover:bg-white/20' : 'text-gray-500 hover:bg-gray-200'}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>

                {/* Bloqueado */}
                {isBlocked && (
                    <div className="py-10 text-center">
                        <div className="text-4xl mb-2">🚫</div>
                        <p className="font-medium text-gray-500">Día bloqueado</p>
                    </div>
                )}

                {/* Sin clases */}
                {!isBlocked && dayClasses.length === 0 && (
                    <div className="py-10 text-center">
                        <div className="text-4xl mb-2">📅</div>
                        <p className="font-medium text-gray-400">Sin clases este día</p>
                    </div>
                )}

                {/* Lista de clases */}
                {!isBlocked && dayClasses.length > 0 && (
                    <div className="divide-y divide-gray-100">
                        {dayClasses.map(cls => {
                            const present = isPresent(cls.attendanceStatus);
                            const absent  = isAbsent(cls.attendanceStatus);
                            const type    = cls.studentType;
                            let borderCls, bgCls;
                            if (present)       { borderCls = 'border-green-500'; bgCls = 'bg-green-50'; }
                            else if (absent)   { borderCls = 'border-red-400';   bgCls = 'bg-red-50'; }
                            else if (!cls.isPaid) {
                                borderCls = type === 'group' ? 'border-amber-300' : type === 'choir' ? 'border-pink-300' : 'border-blue-300';
                                bgCls = '';
                            } else {
                                borderCls = type === 'group' ? 'border-amber-500' : type === 'choir' ? 'border-pink-500' : 'border-blue-500';
                                bgCls = type === 'group' ? 'bg-amber-50/50' : type === 'choir' ? 'bg-pink-50/50' : 'bg-blue-50/50';
                            }
                            return (
                                <div key={cls.id}
                                    className={`flex items-center gap-3 px-3 py-3 border-l-4 ${borderCls} ${bgCls} cursor-pointer active:brightness-95 transition`}
                                    onClick={() => { setSelectedClassForAttendance([cls]); setShowAttendanceModal(true); }}
                                >
                                    <span className="text-sm font-bold text-gray-500 w-12 flex-shrink-0 tabular-nums">{cls.startTime}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm text-gray-900 truncate">{cls.studentName}</div>
                                        <div className="text-xs text-gray-400">{mapClassTypeToSpanish(cls.studentType)} · {cls.duration} min</div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {present && <span className="text-green-600 font-bold">✓</span>}
                                        {absent  && <span className="text-red-500 font-bold">✗</span>}
                                        {!present && !absent && <span className="text-gray-300 text-xs">—</span>}
                                        {!cls.isPaid && <span className="text-amber-700 text-xs font-bold bg-amber-100 px-1.5 py-0.5 rounded">$</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Resumen del día */}
                {dayClasses.length > 0 && (
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex gap-3 text-xs text-gray-500">
                        <span className="font-medium">{dayClasses.length} clase{dayClasses.length !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span className="text-green-600 font-medium">{nPresent} presente{nPresent !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span className="text-red-500 font-medium">{nAbsent} ausente{nAbsent !== 1 ? 's' : ''}</span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-white p-3 sm:p-6 rounded-lg sm:rounded-xl shadow-lg border border-gray-200 text-sm">

            {/* ── Header mobile: título + Hoy + Recordar ── */}
            <div className="sm:hidden flex items-center justify-between mb-3 gap-2">
                <h2 className="font-bold text-gray-800 text-base">Calendario</h2>
                <div className="flex items-center gap-2">
                    {tomorrowStudents.length > 0 && (
                        <button
                            onClick={() => { setReminderSent(false); setShowReminderModal(true); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300 active:scale-95 transition"
                        >
                            🔔 <span>{tomorrowStudents.length}</span>
                        </button>
                    )}
                    <button
                        onClick={() => setCurrentDate(new Date())}
                        className="px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs font-bold shadow-sm active:scale-95 transition"
                    >
                        Hoy
                    </button>
                </div>
            </div>

            {/* ── Header desktop: título + todos los botones ── */}
            <div className="hidden sm:flex sm:justify-between sm:items-center gap-2 mb-4">
                <h2 className="font-bold text-gray-800">CALENDARIO DE CLASES</h2>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => setCurrentDate(new Date())}
                        className="px-3 py-1.5 rounded-lg border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 text-sm font-semibold">
                        Hoy
                    </button>
                    {/* Botón recordatorio día siguiente */}
                    <button
                        onClick={() => { setReminderSent(false); setShowReminderModal(true); }}
                        title="Enviar recordatorio de clases de mañana"
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold transition ${
                            tomorrowStudents.length > 0
                                ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                : 'bg-gray-50 text-gray-400 border-gray-200 cursor-default'
                        }`}
                    >
                        🔔 Recordar mañana
                        {tomorrowStudents.length > 0 && (
                            <span className="bg-amber-500 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full">
                                {tomorrowStudents.length}
                            </span>
                        )}
                    </button>
                    <button onClick={() => setShowWeekend(prev => !prev)}
                        className="px-3 py-1.5 rounded-lg border bg-white text-gray-700 border-gray-300 hover:bg-gray-100 text-sm font-medium">
                        {showWeekend ? 'Ocultar Vie/Sáb' : 'Mostrar Vie/Sáb'}
                    </button>
                    <button onClick={() => setViewMode('weekly')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${viewMode === 'weekly' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}>
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="4" width="2" height="12" rx="1"/><rect x="6" y="4" width="2" height="12" rx="1"/><rect x="10" y="4" width="2" height="12" rx="1"/><rect x="14" y="4" width="2" height="12" rx="1"/></svg>
                        <span className="text-sm font-medium">Semana</span>
                    </button>
                    <button onClick={() => setViewMode('monthly')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${viewMode === 'monthly' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}>
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="4" width="14" height="13" rx="2"/><rect x="3" y="7" width="14" height="1.5"/><rect x="5" y="9" width="3" height="3" rx="0.6"/><rect x="9" y="9" width="3" height="3" rx="0.6"/><rect x="13" y="9" width="3" height="3" rx="0.6"/><rect x="5" y="13" width="3" height="3" rx="0.6"/><rect x="9" y="13" width="3" height="3" rx="0.6"/><rect x="13" y="13" width="3" height="3" rx="0.6"/></svg>
                        <span className="text-sm font-medium">Mes</span>
                    </button>
                </div>
            </div>
            {/* Vista móvil: un día a la vez */}
            <div className="sm:hidden mb-0">
                {renderMobileDayView()}
            </div>

            {/* Vista desktop: semana / mes */}
            <div className="hidden sm:block">
                <div className="flex justify-between items-center mb-6">
                    <button onClick={handlePrev} className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition">
                        <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <h3 className="text-sm font-semibold text-gray-800">
                        {viewMode === 'weekly'
                            ? `${formatDateToDDMMYYYY(getWeekRange(currentDate, showWeekend)[0])} - ${formatDateToDDMMYYYY(getWeekRange(currentDate, showWeekend)[getWeekRange(currentDate, showWeekend).length - 1])}`
                            : currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}
                    </h3>
                    <button onClick={handleNext} className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition">
                        <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
                {viewMode === 'weekly'
                    ? <div className="overflow-x-auto">{renderWeeklyView()}</div>
                    : <div className="overflow-x-auto">{renderMonthlyView()}</div>}
            </div>
            <Modal size="sm" isOpen={showAttendanceModal} onClose={() => setShowAttendanceModal(false)}>
                <AttendanceModal classData={selectedClassForAttendance} db={db} userId={userId} appId={appId} showMessage={showMessage} onEditClass={onEditClass} onClose={() => setShowAttendanceModal(false)} onStudentRemovedFromClass={() => {}} students={students} onGoToMarkPayment={onGoToMarkPayment} onCloseAttendanceModalFromApp={onCloseAttendanceModalFromApp} />
            </Modal>

            {/* ✅ MODAL DE CONFIRMACIÓN DE MOVIMIENTO AÑADIDO AQUÍ */}
            <MoveConfirmationModal
                isOpen={showMoveModal}
                onClose={() => { setShowMoveModal(false); setMoveData(null); }}
                onConfirmSingle={executeMoveSingle}
                onConfirmPackage={executeMovePackage}
                isPackage={!!moveData?.draggedClass?.monthlyPaymentRefId}
                classData={moveData?.draggedClass}
                targetDate={moveData ? formatDateToDDMMYYYY(moveData.newDate) : ''}
                targetTime={moveData?.newStartTime}
            />

            {/* ── Paso 1: elegir alumno ── */}
            {quickSchedule && !quickSchedule.student && (() => {
                const q = quickStudentSearch.toLowerCase();
                const filtered = (students || [])
                    .filter(s => !s.isArchived && (!q || (s.name || '').toLowerCase().includes(q)))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
                const [yy, mm, dd] = quickSchedule.date.split('-');
                const dateLabel = `${dd}/${mm}/${yy} · ${quickSchedule.time} hs`;
                return (
                    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
                        onClick={() => { setQuickSchedule(null); setQuickStudentSearch(''); }}>
                        <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
                            style={{ maxHeight: '80vh' }}
                            onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="px-5 py-4 border-b flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-xl flex-shrink-0">📅</div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-900 text-base">Nueva clase</h3>
                                    <p className="text-xs text-gray-500">{dateLabel}</p>
                                </div>
                                <button onClick={() => { setQuickSchedule(null); setQuickStudentSearch(''); }}
                                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold">×</button>
                            </div>
                            {/* Buscador */}
                            <div className="px-4 pt-3 pb-2">
                                <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">¿A qué alumno?</p>
                                <div className="relative">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                                    </svg>
                                    <input
                                        autoFocus
                                        type="text"
                                        value={quickStudentSearch}
                                        onChange={e => setQuickStudentSearch(e.target.value)}
                                        placeholder="Buscar alumno..."
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-400 bg-gray-50"
                                    />
                                </div>
                            </div>
                            {/* Lista */}
                            <div className="flex-1 overflow-y-auto pb-2">
                                {filtered.length === 0 ? (
                                    <p className="text-center text-gray-400 py-8 text-sm">Sin resultados</p>
                                ) : filtered.map(s => (
                                    <button key={s.id}
                                        onClick={() => { setQuickSchedule(prev => ({ ...prev, student: s })); setQuickStudentSearch(''); }}
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-rose-50 transition-colors text-left">
                                        <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white shadow-sm
                                            ${(s.pendingBalance || 0) > 0 ? 'bg-rose-500' : 'bg-green-500'}`}>
                                            {(s.name || '?')[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                                            {s.level && <p className="text-[11px] text-gray-400">{s.level}</p>}
                                        </div>
                                        {(s.pendingBalance || 0) > 0 && (
                                            <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full flex-shrink-0">Debe</span>
                                        )}
                                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                                        </svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Paso 2: form completo con alumno seleccionado ── */}
            {quickSchedule?.student && (
                <Modal isOpen={true} onClose={() => setQuickSchedule(null)} size="xl">
                    <ScheduleClassForm
                        db={db}
                        userId={userId}
                        appId={appId}
                        showMessage={showMessage}
                        onClose={() => setQuickSchedule(null)}
                        editingClassData={null}
                        isRescheduling={false}
                        scheduledClasses={scheduledClasses}
                        initialSelectedStudent={quickSchedule.student}
                        blockedSlots={blockedSlots}
                        initialDate={quickSchedule.date}
                        initialTime={quickSchedule.time}
                    />
                </Modal>
            )}

            {/* ── Modal recordatorio día siguiente ── */}
            {showReminderModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowReminderModal(false)}>
                    <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="px-5 py-4 border-b flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-2xl flex-shrink-0">🔔</div>
                            <div className="flex-1">
                                <h3 className="font-bold text-gray-900">Recordatorio de clases</h3>
                                <p className="text-xs text-gray-500 capitalize">{tomorrowLabel}</p>
                            </div>
                            <button onClick={() => setShowReminderModal(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold">×</button>
                        </div>

                        {/* Lista de alumnos */}
                        <div className="px-5 py-3 max-h-64 overflow-y-auto">
                            {tomorrowStudents.length === 0 ? (
                                <p className="text-center text-gray-400 py-6 text-sm">No hay clases programadas para mañana</p>
                            ) : (
                                <ul className="space-y-2">
                                    {tomorrowStudents.map(s => (
                                        <li key={s.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                            <span className="text-sm font-medium text-gray-800">{s.name}</span>
                                            <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                                              {s.time ? `${s.time} hs` : 'Sin hora'}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Mensaje preview */}
                        {tomorrowStudents.length > 0 && !reminderSent && (
                            <div className="mx-5 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-500 italic">
                                "Hola [nombre] 🎵 Te recuerdo que tenés clase mañana a las [hora] hs. ¡Nos vemos!"
                            </div>
                        )}

                        {/* Footer */}
                        <div className="px-5 pb-5 pt-2">
                            {reminderSent ? (
                                <div className="w-full py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-bold text-center">
                                    ✓ Recordatorios enviados correctamente
                                </div>
                            ) : (
                                <button
                                    onClick={handleSendReminder}
                                    disabled={sendingReminder || tomorrowStudents.length === 0}
                                    className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {sendingReminder
                                        ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Enviando...</>
                                        : `🔔 Enviar a ${tomorrowStudents.length} alumno${tomorrowStudents.length !== 1 ? 's' : ''}`
                                    }
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
// ============================================
// COMPONENTE DatePicker (selector de fecha personalizado)
// ============================================
