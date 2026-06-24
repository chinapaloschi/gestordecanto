import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection as fsCollection, doc, getDocs, updateDoc, addDoc as fsAddDoc, deleteDoc, query, where, orderBy, onSnapshot, writeBatch, getDoc, serverTimestamp } from 'firebase/firestore';
import { Modal, ModalHeader } from './Modal.jsx';
import { MoneyInput } from './MoneyInput.jsx';
import { formatMoneyAr, parseMoneyAr } from '../utils/money.js';
import { formatDateToDDMMYYYY, mapClassTypeToSpanish, daysOfWeekFull } from '../utils/classHelpers.js';
import { getLocalToday, toLocalYYYYMMDD, generateTimeOptions } from '../utils/dateHelpers.js';
import { cancelScheduledClass, hardDeleteScheduledClass, hardDeleteUnpaidMonthlyPackage } from '../utils/classActions.js';
import { ScheduleClassForm } from './ScheduleClassForm.jsx';
import { MarkPaymentForm } from './MarkPaymentForm.jsx';
import { AttendanceModal } from './AttendanceModal.jsx';
import { AddStudentForm } from './AddStudentForm.jsx';
import { StudentDetailsModal } from './StudentDetailsModal.jsx';
import { StudentCard } from './StudentCard.jsx';
import { CalendarView } from './CalendarView.jsx';
import { DatePicker } from './DatePicker.jsx';
import { BlockDaysModal, BackupRestoreModal } from './AdminModals.jsx';
import { EventModal } from './EventModal.jsx';
import { EventDetailModal, EventsListModal } from './EventModals.jsx';
import { FinancialManagementModal } from './FinancialManagementModal.jsx';
import { LenceriaStockModal } from './LenceriaStockModal.jsx';
import { MassEventsAdminModal } from './MassEvents.jsx';
import { GlobalRepertoireModal } from './RepertoireModals.jsx';
import { FloatingAdminMessagesButton } from './PortalAlumnoComponents.jsx';
import { ReceiptsCenter } from './ReceiptsComponents.jsx';
import { useStudents } from '../hooks/useStudents.js';
import { IconUsers, IconCalendar, IconCreditCard, IconBanknote, IconHardDrive, IconMusic, IconQrCode, IconTag, IconRefresh } from './Icons.jsx';
export const Dashboard = ({
    studentsWithStats,
    onOpenStudentDetailsModal,
    onRestoreStudent,
    scheduledClasses,
    db,
    appId,
    showMessage,
}) => {

    const [expandedStudentId, setExpandedStudentId] = React.useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDate, setFilterDate] = useState("");
    const [showDebtorsOnly, setShowDebtorsOnly] = useState(false);
    const [showPaidOnly, setShowPaidOnly] = useState(false);
    const [studentFilter, setStudentFilter] = useState('active'); // 'active' o 'archived'
    const [sortBy, setSortBy] = useState('name'); // 'name' | 'debt' | 'restantes'
    
    // --- ESTADO PARA EL SELECTOR DE FECHA ---
    const [selectedDate, setSelectedDate] = useState(getLocalToday()); // Hoy en YYYY-MM-DD
const classesOnSelectedDate = React.useMemo(() => {
  if (!scheduledClasses || !selectedDate) return [];

  // Normaliza cualquier entrada a YYYY-MM-DD
  const normalizeDate = (dateInput) => {
    if (!dateInput) return null;

    // Si es Timestamp de Firestore
    if (dateInput && typeof dateInput.toDate === 'function') {
      return dateInput.toDate().toISOString().split('T')[0];
    }
    // Si es un objeto Date
    if (dateInput instanceof Date && !isNaN(dateInput)) {
      return dateInput.toISOString().split('T')[0];
    }
    // Si es string
    if (typeof dateInput === 'string') {
      // Si ya tiene formato YYYY-MM-DD (con o sin hora)
      if (/^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
        return dateInput.split('T')[0];
      }
      // Si tiene formato DD/MM/YYYY
      const parts = dateInput.split('/');
      if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    console.warn('[Dashboard] ⚠️ No se pudo normalizar fecha:', dateInput);
    return null;
  };

  const targetDate = normalizeDate(selectedDate);
  console.log('[Dashboard] 🎯 Fecha objetivo normalizada:', targetDate);

  // Log de TODAS las clases que llegan
  console.log('[Dashboard] 📋 Total de clases en scheduledClasses:', scheduledClasses.length);
  
  // Muestra las primeras 5 clases como ejemplo
  if (scheduledClasses.length > 0) {
    console.log('[Dashboard] 📅 Ejemplo de las primeras 5 clases:');
    scheduledClasses.slice(0, 5).forEach((cls, idx) => {
      const rawDate = cls.classDate;
      const normalized = normalizeDate(rawDate);
      console.log(`  Clase ${idx + 1}:`, {
        student: cls.studentName,
        rawDate,
        tipoRaw: typeof rawDate,
        // Si es objeto Firestore, muestra más info
        esTimestamp: rawDate && typeof rawDate.toDate === 'function',
        normalized,
        status: cls.status,
        isPaid: cls.isPaid
      });
    });
  }

  // Filtramos clases por fecha y estado
  const dayClasses = scheduledClasses.filter(cls => {
    const clsDateStr = normalizeDate(cls.classDate);
    if (!clsDateStr) {
      console.log('[Dashboard] ❌ Fecha inválida ignorada:', cls.studentName, cls.classDate);
      return false;
    }

    const match = clsDateStr === targetDate;
    
    if (match) {
      console.log('[Dashboard] ✅ COINCIDE:', cls.studentName, clsDateStr, cls.startTime);
    } else {
      console.log('[Dashboard] ❌ No coincide:', cls.studentName, clsDateStr, 'vs', targetDate, '(raw:', cls.classDate, ')');
    }

    return match && (!cls.status || cls.status === 'scheduled');
  });

  console.log('[Dashboard] 📊 Clases encontradas para el día:', dayClasses.length, dayClasses);

  // Agrupamos por horario
  const groups = {};
  dayClasses.forEach(cls => {
    const start = cls.startTime || '--:--';
    const key = `${start} - ${cls.studentType || 'individual'}`;
    if (!groups[key]) {
      groups[key] = {
        startTime: start,
        type: cls.studentType,
        students: []
      };
    }
    groups[key].students.push({
      id: cls.id,
      studentId: cls.studentId,
      name: cls.studentName,
      attendance: cls.attendanceStatus
    });
  });

  return Object.values(groups).sort((a, b) =>
    (a.startTime || '').localeCompare(b.startTime || '')
  );
}, [scheduledClasses, selectedDate]);
    const goToToday = () => {
        setSelectedDate(getLocalToday());
    };

    // --- Lógica de filtros de alumnos (existente) ---
    const today = new Date();
    const todayFormatted = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
    const upcomingClassesToday = studentsWithStats.flatMap(student => 
        student.scheduledClassesDetailed.filter(cls => 
            cls.isPaid && (cls.status === 'scheduled' || cls.status === undefined) && cls.classDate === todayFormatted
        )
    );

    const filteredStudents = useMemo(() => {
        return studentsWithStats
            .filter(student => {
                const isArchived = student.isArchived === true;
                if (studentFilter === 'active') return !isArchived;
                if (studentFilter === 'archived') return isArchived;
                return true;
            })
            .filter(student => {
                const balance = student.pendingBalance || 0;
                if (showDebtorsOnly) return balance > 0;
                if (showPaidOnly) return balance <= 0;
                return true;
            })
            .filter(student => student.name && student.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => {
                if (sortBy === 'debt') return (b.pendingBalance || 0) - (a.pendingBalance || 0);
                if (sortBy === 'restantes') return (b.totalPaidUnconsumedClasses || 0) - (a.totalPaidUnconsumedClasses || 0);
                return (a.name || "").localeCompare(b.name || "", 'es', { sensitivity: 'base' });
            });
    }, [studentsWithStats, searchTerm, studentFilter, showDebtorsOnly, showPaidOnly, sortBy]);

    const activeCount = studentsWithStats.filter(s => !s.isArchived).length;
    const archivedCount = studentsWithStats.length - activeCount;
    const paidCount = studentsWithStats.filter(s => !s.isArchived && !s.hasAnyUnpaidItems).length;
    const scheduledUnpaidCount = studentsWithStats.filter(s => !s.isArchived && s.hasAnyUnpaidItems).length;

    const handleToggleExpand = useCallback((studentId) => {
        setExpandedStudentId(prevId => (prevId === studentId ? null : studentId));
    }, []);

        // ── Funciones de navegación de día y asistencia inline ───────────────
        const prevDay = () => {
            const d = new Date(selectedDate + 'T12:00:00');
            d.setDate(d.getDate() - 1);
            setSelectedDate(toLocalYYYYMMDD(d));
        };
        const nextDay = () => {
            const d = new Date(selectedDate + 'T12:00:00');
            d.setDate(d.getDate() + 1);
            setSelectedDate(toLocalYYYYMMDD(d));
        };
        const markAttendanceInline = async (classId, newStatus) => {
            try {
                await updateDoc(doc(db, `artifacts/${appId}/scheduledClasses`, classId), {
                    attendanceStatus: newStatus
                });
            } catch (e) { console.error('Attendance error:', e); }
        };

        // Estadísticas del día
        const allStudentsToday = classesOnSelectedDate.flatMap(g => g.students);
        const todayPresent  = allStudentsToday.filter(s => s.attendance === 'presente').length;
        const todayAbsent   = allStudentsToday.filter(s => s.attendance === 'ausente').length;
        const todayPending  = allStudentsToday.filter(s => !s.attendance).length;
        const isToday = selectedDate === getLocalToday();

        const typeLabel = (type) => type === 'individual' ? 'Individual' : type === 'group' ? 'Grupal' : type === 'choir' ? 'Coral' : 'Clase';
        const typeColor = (type) => type === 'individual' ? 'bg-blue-100 text-blue-700' : type === 'group' ? 'bg-amber-100 text-amber-700' : 'bg-pink-100 text-pink-700';

    return (
        <div className="space-y-6">

            {/* ── CLASES DEL DÍA — solo desktop (en mobile lo cubre TodayDashboard) ── */}
            <div className="hidden sm:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-900 text-base">Clases del día</h3>
                            {isToday && <span className="text-[9px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">Hoy</span>}
                        </div>
                        {allStudentsToday.length > 0 && (
                            <div className="flex gap-3 text-xs mt-0.5 flex-wrap">
                                <span className="text-gray-400 font-medium">{allStudentsToday.length} clase{allStudentsToday.length !== 1 ? 's' : ''}</span>
                                {todayPresent > 0 && <span className="text-green-600 font-bold">✓ {todayPresent} presente{todayPresent !== 1 ? 's' : ''}</span>}
                                {todayAbsent  > 0 && <span className="text-red-500 font-bold">✗ {todayAbsent} ausente{todayAbsent !== 1 ? 's' : ''}</span>}
                                {todayPending > 0 && <span className="text-gray-400">— {todayPending} pendiente{todayPending !== 1 ? 's' : ''}</span>}
                            </div>
                        )}
                    </div>

                    {/* Navegación de fecha */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={prevDay} className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                        </button>
                        <div className="w-36">
                            <DatePicker value={selectedDate} onChange={setSelectedDate} />
                        </div>
                        <button onClick={nextDay} className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                        </button>
                        {!isToday && (
                            <button onClick={() => setSelectedDate(getLocalToday())}
                                className="px-2 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-bold hover:bg-rose-100 transition whitespace-nowrap">
                                Hoy
                            </button>
                        )}
                    </div>
                </div>

                {/* Lista de clases */}
                {classesOnSelectedDate.length === 0 ? (
                    <div className="py-10 text-center">
                        <div className="text-3xl mb-2">📅</div>
                        <p className="text-gray-400 font-medium text-sm">Sin clases programadas para este día</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {classesOnSelectedDate.flatMap(group =>
                            group.students.map(student => {
                                const fullStudent = studentsWithStats.find(s => s.id === student.studentId);
                                const photoURL    = fullStudent?.photoURL;
                                const initials    = (fullStudent?.name || student.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                                const isPresent   = student.attendance === 'presente';
                                const isAbsent    = student.attendance === 'ausente';

                                return (
                                    <div key={student.id}
                                        className={`flex items-center gap-3 px-4 py-3 transition-colors
                                            ${isPresent ? 'bg-green-50' : isAbsent ? 'bg-red-50/60' : 'hover:bg-gray-50'}`}>

                                        {/* Hora */}
                                        <div className="w-10 text-xs font-black text-gray-500 tabular-nums flex-shrink-0 leading-tight text-center">
                                            {group.startTime}
                                        </div>

                                        {/* Foto */}
                                        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-white shadow-sm bg-rose-100">
                                            {photoURL ? (
                                                <img src={photoURL} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <span className="text-xs font-bold text-rose-600">{initials}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Nombre + tipo */}
                                        <div className="flex-1 min-w-0">
                                            <button onClick={() => fullStudent && onOpenStudentDetailsModal(fullStudent)}
                                                className="font-semibold text-gray-900 text-sm truncate hover:text-rose-600 transition text-left block w-full">
                                                {student.name}
                                            </button>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${typeColor(group.type)}`}>
                                                {typeLabel(group.type)}
                                            </span>
                                        </div>

                                        {/* Botones de asistencia rápida */}
                                        <div className="flex gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => markAttendanceInline(student.id, isPresent ? null : 'presente')}
                                                title="Marcar presente"
                                                className={`w-8 h-8 rounded-full text-sm font-black transition flex items-center justify-center
                                                    ${isPresent ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-green-600 hover:bg-green-100'}`}>
                                                ✓
                                            </button>
                                            <button
                                                onClick={() => markAttendanceInline(student.id, isAbsent ? null : 'ausente')}
                                                title="Marcar ausente"
                                                className={`w-8 h-8 rounded-full text-sm font-black transition flex items-center justify-center
                                                    ${isAbsent ? 'bg-red-500 text-white shadow-md' : 'bg-gray-100 text-red-500 hover:bg-red-100'}`}>
                                                ✗
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* --- RESTO DEL DASHBOARD (FILTROS Y TARJETAS DE ALUMNOS) --- */}
            <div className="bg-gray-50 p-6 rounded-xl shadow-inner border border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800">Alumnos Registrados</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <button 
                                onClick={() => setStudentFilter('active')} 
                                className={`px-3 py-1 text-xs rounded-full font-semibold ${studentFilter === 'active' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                            >
                                Activos ({activeCount})
                            </button>
                            <button 
                                onClick={() => setStudentFilter('archived')} 
                                className={`px-3 py-1 text-xs rounded-full font-semibold ${studentFilter === 'archived' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-700'}`}
                            >
                                Archivados ({archivedCount})
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <input
                            type="text"
                            placeholder="Buscar alumno..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1 sm:w-56 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm"
                        />
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            className="px-2 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                        >
                            <option value="name">A–Z</option>
                            <option value="debt">Mayor deuda</option>
                            <option value="restantes">Más restantes</option>
                        </select>
                    </div>
                </div>

                {studentFilter === 'active' && (
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <button
                            onClick={() => {
                                setShowPaidOnly(!showPaidOnly);
                                setShowDebtorsOnly(false);
                            }}
                            className={`inline-flex items-center px-2 py-0.5 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold border whitespace-nowrap transition-all cursor-pointer ${
                                showPaidOnly
                                    ? 'bg-green-600 text-white border-green-700 shadow-md transform scale-105'
                                    : 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200'
                            }`}
                        >
                            {showPaidOnly ? 'Viendo Al Día: ' : 'Abono pago: '} {paidCount}
                            {showPaidOnly && (
                                <span className="ml-2 bg-white text-green-600 rounded-full px-1.5 text-[10px]">✕</span>
                            )}
                        </button>

                        <button
                            onClick={() => {
                                setShowDebtorsOnly(!showDebtorsOnly);
                                setShowPaidOnly(false);
                            }}
                            className={`inline-flex items-center px-2 py-0.5 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold border whitespace-nowrap transition-all cursor-pointer ${
                                showDebtorsOnly
                                    ? 'bg-rose-600 text-white border-rose-700 shadow-md transform scale-105'
                                    : 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200'
                            }`}
                        >
                            {showDebtorsOnly ? 'Viendo Deudores: ' : 'Con saldo pendiente: '} {scheduledUnpaidCount}
                            {showDebtorsOnly && (
                                <span className="ml-2 bg-white text-rose-600 rounded-full px-1.5 text-[10px]">✕</span>
                            )}
                        </button>

                        <button
                            onClick={() => {
                                const total = studentsWithStats
                                    .filter(s => !s.isArchived && s.hasAnyUnpaidItems)
                                    .reduce((sum, s) => sum + (s.pendingBalance || 0), 0);
                                alert(`💰 Total deuda de alumnos activos: $${total.toLocaleString('es-AR')}`);
                            }}
                            className="inline-flex items-center px-2 py-0.5 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 whitespace-nowrap"
                        >
                            Total en pesos
                        </button>
                    </div>
                )}

                {filteredStudents.length === 0 ? (
                    <p className="text-gray-600 text-center py-4">
                        No se encontraron alumnos en esta vista.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {filteredStudents.map((student) => (
                            <StudentCard
                                key={student.id}
                                student={student}
                                onOpenStudentDetailsModal={onOpenStudentDetailsModal}
                                db={db}
                                appId={appId}
                                showMessage={showMessage}
                                isExpanded={expandedStudentId === student.id}
                                onToggleExpand={handleToggleExpand}
                                onRestoreStudent={onRestoreStudent}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};