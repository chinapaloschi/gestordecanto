import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

import { collection as fsCollection, doc, getDoc, getDocs, addDoc as fsAddDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, writeBatch, serverTimestamp, getFirestore, limit } from 'firebase/firestore';

import { ref as stRef, getDownloadURL, listAll, getMetadata } from 'firebase/storage';

import { GoogleAuthProvider, onAuthStateChanged, signInWithCustomToken, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';

import { db, auth, storage, firebaseConfig } from '../firebaseConfig.js';

import { waitForAuthReady, updateReceiptStatus, markStudentReceiptsAsSeen } from '../utils/authHelpers.js';

import { formatMoneyAr, parseMoneyAr } from '../utils/money.js';

import { formatDateToDDMMYYYY, mapClassTypeToSpanish, daysOfWeekFull } from '../utils/classHelpers.js';

import { getLocalToday, toLocalYYYYMMDD, getDayNameFromDate, generateTimeOptions } from '../utils/dateHelpers.js';

import { cancelScheduledClass, hardDeleteScheduledClass, hardDeleteUnpaidMonthlyPackage } from '../utils/classActions.js';

import { exportPaymentPDF, sharePayment, exportPaymentReceiptPDFWithLogo } from '../utils/paymentPDF.js';

import { __getExpectedAmountFromStudent, __getPaidAmount, __hasModalMarkers, getPaymentStatusForHistory } from '../hooks/paymentHelpers.js';

import { useStudents } from '../hooks/useStudents.js';

import { Modal, ModalHeader } from './Modal.jsx';

import { MoneyInput } from './MoneyInput.jsx';

import { Toast } from './Toast.jsx';

import { Dashboard } from './Dashboard.jsx';
import { StudentListModal } from './StudentListModal.jsx';
import { TodayDashboard } from './TodayDashboard.jsx';

import { CertificateModal, CertificateGeneratorModal } from './CertificateModals.jsx';

import { RenewSubscriptionModal } from './RenewSubscriptionModal.jsx';

import { EventModal } from './EventModal.jsx';

import { FinancialManagementModal } from './FinancialManagementModal.jsx';

import { LenceriaStockModal } from './LenceriaStockModal.jsx';

import { MassEventsAdminModal } from './MassEvents.jsx';

import { BlockDaysModal, BackupRestoreModal } from './AdminModals.jsx';
import { AvailableSlotsManager } from './AvailableSlotsManager.jsx';
import { TrialRequestsPanel } from './TrialRequestsPanel.jsx';

import { EventsListModal, EventDetailModal } from './EventModals.jsx';

import { GlobalRepertoireModal } from './RepertoireModals.jsx';

import { FloatingAdminMessagesButton } from './PortalAlumnoComponents.jsx';

import { ReceiptsCenter } from './ReceiptsComponents.jsx';

import { ScheduleClassForm } from './ScheduleClassForm.jsx';

import { MarkPaymentForm } from './MarkPaymentForm.jsx';

import { AttendanceModal } from './AttendanceModal.jsx';

import { AddStudentForm } from './AddStudentForm.jsx';
import { useAmountsHidden } from '../context/PrivacyContext.jsx';

import { StudentDetailsModal } from './StudentDetailsModal.jsx';

import { CalendarView } from './CalendarView.jsx';
import { AudioTransposeModal } from './AudioTransposeModal.jsx';

import { DatePicker } from './DatePicker.jsx';

import { BackupRestoreModal as BackupModal } from './AdminModals.jsx';

import { IconUsers, IconCalendar, IconBanknote, IconHardDrive, IconQrCode, IconTag, IconRefresh, IconCreditCard, IconMusic } from './Icons.jsx';
import { registerNotifications } from '../notifications.js';
import { FCM_VAPID_KEY } from '../constants.js';
import { app as firebaseApp } from '../firebaseConfig.js';

import { ROUTES } from '../constants.js';

import QRCodeWithLogo from 'qrcode-with-logos';

import QRCode from 'qrcode';

import { CalendarShell, MoveConfirmationModal } from './CalendarComponents.jsx';


const appId = firebaseConfig.appId;

// ── Botón de notificaciones push para el admin ────────────────────────────────
function NotifButton({ appId, onDone, showMessage }) {
  const [status,    setStatus]    = React.useState(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const [loading,   setLoading]   = React.useState(false);
  const [persisted, setPersisted] = React.useState(false); // token guardado en esta sesión

  // Re-registrar siempre al montar si ya hay permiso (refresca token)
  React.useEffect(() => {
    if (status !== 'granted') return;
    registerNotifications({
      app: firebaseApp, db, auth, appId,
      studentId: null, vapidKey: FCM_VAPID_KEY,
      onToast: (msg, type) => showMessage?.(msg, type),
      _adminOverridePath: `artifacts/${appId}/adminTokens`,
    }).then(r => { if (r.ok && r.persisted) setPersisted(true); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activate = async () => {
    setLoading(true);
    try {
      const result = await registerNotifications({
        app: firebaseApp, db, auth, appId,
        studentId: null, vapidKey: FCM_VAPID_KEY,
        // Foreground: mostrar como toast del admin
        onToast: (msg, type) => showMessage?.(msg, type),
        _adminOverridePath: `artifacts/${appId}/adminTokens`,
      });
      const perm = Notification.permission;
      setStatus(perm);
      if (result.ok && result.persisted) {
        setPersisted(true);
        showMessage?.('Notificaciones activadas. Vas a recibir alertas de comprobantes.', 'success');
        onDone?.();
      } else if (perm === 'denied') {
        showMessage?.('Permiso bloqueado. Andá a Configuración → este sitio → Notificaciones → Permitir.', 'error');
      } else {
        showMessage?.('No se pudo activar. Recargá la app e intentá de nuevo.', 'error');
      }
    } catch (e) {
      showMessage?.('Error: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'unsupported') return null;

  const isGranted = status === 'granted';
  const isDenied  = status === 'denied';

  return (
    <div className="mb-3">
      <button onClick={activate} disabled={loading || isDenied}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition font-bold text-sm
          ${isGranted && persisted
            ? 'bg-green-100 text-green-800 border border-green-200'
            : isGranted
              ? 'bg-blue-50 text-blue-800 border border-blue-200'
              : isDenied
                ? 'bg-red-50 text-red-700 border border-red-200 cursor-not-allowed'
                : 'bg-amber-100 text-amber-800 border border-amber-300 active:bg-amber-200'}`}>
        {loading
          ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>
          : <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
        }
        {isGranted && persisted
          ? '🟢 Notificaciones activas'
          : isGranted
            ? '🔄 Re-activar notificaciones'
            : isDenied
              ? '🔴 Notificaciones bloqueadas'
              : '🔔 Activar notificaciones push'}
      </button>
      {isDenied && (
        <p className="text-[11px] text-red-500 text-center mt-1">
          Habilitá en Configuración del celular → este sitio → Notificaciones
        </p>
      )}
      {isGranted && !persisted && (
        <p className="text-[11px] text-blue-600 text-center mt-1">
          Tocá para refrescar el token de notificaciones
        </p>
      )}
    </div>
  );
}

export const MainApp = () => {

const { amountsHidden, toggleAmountsHidden } = useAmountsHidden();

// App.jsx -> dentro de MainApp



  // ...otros estados como [user, setUser], [students, setStudents], etc.



  // ▼ PEGÁ ESTE BLOQUE COMPLETO ▼

  const [eventToEdit, setEventToEdit] = React.useState(null);



  const handleCreateEvent = () => {

    setEventToEdit(null); // Nos aseguramos de que el modal abra en modo "Crear"

    setShowEventModal(true);

  };



  const handleEditEvent = (event) => {

    setEventToEdit(event); // Guardamos el evento a editar

    setShowEventModal(true); // Abrimos el modal en modo "Editar"

  };



  const handleDeleteEvent = async (event) => {

    if (!event?.id) return;

    

    // Pedimos confirmación

    if (window.confirm(`¿Estás seguro de que querés eliminar el evento "${event.title}"? Esta acción no se puede deshacer.`)) {

      try {

        // Borramos todas las entradas asociadas al evento

        const ticketsQuery = query(fsCollection(db, `artifacts/${appId}/events/${event.id}/tickets`));

        const ticketsSnap = await getDocs(ticketsQuery);

        

        const batch = writeBatch(db);

        ticketsSnap.forEach(doc => batch.delete(doc.ref));

        

        // Borramos el documento principal del evento

        const eventRef = doc(db, `artifacts/${appId}/events/${event.id}`);

        batch.delete(eventRef);



        await batch.commit();

        showMessage('Evento y sus entradas eliminados.', 'success');

      } catch (e) {

        console.error("Error eliminando evento:", e);

        showMessage(`No se pudo eliminar: ${e.message}`, 'error');

      }

    }

  };

    const [user, setUser] = useState(null);

    const [userId, setUserId] = useState(null);

    const [students, setStudents] = useState([]);

    const [scheduledClasses, setScheduledClasses] = useState([]);

    const [allPayments, setAllPayments] = useState([]);

    const [extraIncomes, setExtraIncomes] = useState([]);

    const [expenses, setExpenses] = useState([]);

    const [expenseCategories, setExpenseCategories] = useState([]);

    const [blockedSlots, setBlockedSlots] = useState([]);

    const [loading, setLoading] = useState(true);

    const [message, setMessage] = useState({ text: '', type: 'info' });

    const [showAddStudentForm, setShowAddStudentForm] = useState(false);
    const [addStudentInitialData, setAddStudentInitialData] = useState(null);
    const [convertingTrialRequestId, setConvertingTrialRequestId] = useState(null);
    const [showStudentListModal, setShowStudentListModal] = useState(false);

    const [showEventModal, setShowEventModal] = useState(false);

    const [showEventsList, setShowEventsList] = useState(false);

    const [events, setEvents] = useState([]);

    const [selectedEvent, setSelectedEvent] = useState(null);

    const [showScheduleClassModal, setShowScheduleClassModal] = useState(false);

    const [showMarkPaymentModal, setShowMarkPaymentModal] = useState(false);

    const [editingClassData, setEditingClassData] = useState(null);

    const [showStudentDetailsModal, setShowStudentDetailsModal] = useState(false);

    const [selectedStudentForDetails, setSelectedStudentForDetails] = useState(null);

    const [showBackupRestoreModal, setShowBackupRestoreModal] = useState(false);
    const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false);
    const [showTransposeModal, setShowTransposeModal] = useState(false);
    const [showLegend, setShowLegend] = useState(false);

    const [showRescheduleClassModal, setShowRescheduleClassModal] = useState(false);

    const [selectedStudentForReschedule, setSelectedStudentForReschedule] = useState(null);

    const [showFinancialManagementModal, setShowFinancialManagementModal] = useState(false);

    const [showAttendanceModal, setShowAttendanceModal] = useState(false);

    const [showBlockDaysModal, setShowBlockDaysModal] = useState(false);

    const [studentToDelete, setStudentToDelete] = useState(null);

    const [showConfirmDeleteStudentModal, setShowConfirmDeleteStudentModal] = useState(false);

    const [showCertificateModal, setShowCertificateModal] = useState(false);

    const [showCertificateGeneratorModal, setShowCertificateGeneratorModal] = useState(false);

    const [certificateData, setCertificateData] = useState(null);

    const [paymentToMark, setPaymentToMark] = useState(null);



    const [showRenewSubscriptionModal, setShowRenewSubscriptionModal] = useState(false);

    const [renewalData, setRenewalData] = useState(null);

const [showMessagesCenter, setShowMessagesCenter] = useState(false);

const [showGlobalRepertoire, setShowGlobalRepertoire] = useState(false);

// ▼▼▼ PEGA ESTAS DOS FUNCIONES DENTRO DE TU COMPONENTE MainApp ▼▼▼

const [showLenceriaModal, setShowLenceriaModal] = useState(false);

const [showMassEventsModal, setShowMassEventsModal] = useState(false);
const [showAvailableSlotsModal, setShowAvailableSlotsModal] = useState(false);
const [showTrialRequestsModal, setShowTrialRequestsModal] = useState(false);

useEffect(() => {

        // Revisa la URL cuando la aplicación carga

        const currentHash = window.location.hash;

        

        // Si la URL termina en #/lenceria, abre el modal correspondiente

        if (currentHash === ROUTES.LENCERIA) {

        setShowLenceriaModal(true);

        }

    }, []); // El array vacío asegura que esto se ejecute solo una vez al cargar el componente

const handleArchiveStudent = async (student) => {

    if (!student) return;

    const confirmation = window.confirm(`¿Estás seguro de que deseas archivar a ${student.name}? El alumno se ocultará de la lista principal pero no se eliminará.`);

    if (confirmation) {

        try {

            const studentRef = doc(db, `artifacts/${appId}/students`, student.id);

            await updateDoc(studentRef, { isArchived: true });

            showMessage(`${student.name} ha sido archivado.`, 'success');

            setShowStudentDetailsModal(false); // Cierra el modal de detalles

        } catch (error) {

            showMessage(`Error al archivar: ${error.message}`, 'error');

        }

    }

};



const handleRestoreStudent = useCallback(async (studentId) => {

    if (!studentId) return;

    try {

        const studentRef = doc(db, `artifacts/${appId}/students`, studentId);

        await updateDoc(studentRef, { isArchived: false });

        showMessage('Alumno restaurado a la lista de activos.', 'success');

    } catch (error) {

        showMessage(`Error al restaurar: ${error.message}`, 'error');

    }

// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// Abre "Agregar alumno" precargado con los datos de una solicitud de Pre-inscriptos
const handleConvertTrialToStudent = useCallback((trialRequest) => {
    setAddStudentInitialData({
        name: trialRequest.name || '',
        whatsapp: trialRequest.whatsapp || '',
        email: trialRequest.email || '',
    });
    setConvertingTrialRequestId(trialRequest.id || null);
    setShowAddStudentForm(true);
}, []);

// Al crearse el alumno desde una conversión, marcamos la solicitud original
const handleStudentCreatedFromTrial = useCallback(async (newStudentId) => {
    if (!convertingTrialRequestId) return;
    try {
        await updateDoc(doc(db, `artifacts/${appId}/trialRequests`, convertingTrialRequestId), {
            convertedToStudentId: newStudentId,
            convertedAt: new Date(),
        });
    } catch (e) { console.error('Error marcando trialRequest como convertido:', e); }
    setConvertingTrialRequestId(null);
}, [convertingTrialRequestId]);

// Cierre unificado del formulario de alumno: limpia también los datos precargados
const closeAddStudentForm = useCallback(() => {
    setShowAddStudentForm(false);
    setAddStudentInitialData(null);
    setConvertingTrialRequestId(null);
}, []);

    // Helper function to dynamically load scripts

    const loadScript = (src, id) => {

        return new Promise((resolve, reject) => {

            if (document.getElementById(id)) {

                resolve(); // Script already loaded

                return;

            }

            const script = document.createElement('script');

            script.src = src;

            script.id = id;

            script.onload = () => resolve();

            script.onerror = (error) => reject(new Error(`Failed to load script: ${src}, Error: ${error}`));

            document.head.appendChild(script);

        });

    };



    // Firebase Authentication && Data Loading

    useEffect(() => {

        if (!auth) {

            setMessage({ text: 'Error: Firebase no está inicializado. Verifica la configuración.', type: 'error' });

            setLoading(false);

            return;

        }



        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {

            if (currentUser) {

                setUser(currentUser);

                setUserId(currentUser.uid);

                setMessage({ text: '', type: 'info' });

            } else {

                try {

                    if (initialAuthToken) {

                        await signInWithCustomToken(auth, initialAuthToken);

                    } else {

                        await signInAnonymously(auth);

                    }

                } catch (error) {

                    console.error("Error al iniciar sesión:", error);

                    setMessage({ text: `Error al iniciar sesión: ${error.message}`, type: 'error' });

                

    if (typeof setLoading === 'function') setLoading(false);

}

            }

            setLoading(false);

        });



        const loadPdfLibraries = async () => {

            try {

                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas-script');

                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf-script');

                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js', 'jspdf-autotable-script');

                console.log("PDF libraries loaded successfully.");

            } catch (error) {

                console.error("Error loading PDF libraries:", error);

                showMessage('Error: Las librerías de PDF no se pudieron cargar.', 'error');

            

    if (typeof setLoading === 'function') setLoading(false);

}

        };



        loadPdfLibraries();



        return () => unsubscribeAuth();

    }, []);



    // Listen for real-time updates on all collections

    useEffect(() => {

        if (!db) return;



        const collectionListeners = [

            { name: 'students', setter: setStudents },

            { name: 'scheduledClasses', setter: setScheduledClasses },

            { name: 'payments', setter: setAllPayments },

            { name: 'extraIncomes', setter: setExtraIncomes },

            { name: 'expenses', setter: setExpenses },

            { name: 'expenseCategories', setter: setExpenseCategories },

            { name: 'blockedSlots', setter: setBlockedSlots },

            { name: 'events', setter: setEvents }

        ];



        const unsubscribers = collectionListeners.map(({ name, setter }) => {

            const collectionRef = fsCollection(db, `artifacts/${appId}/${name}`);

            return onSnapshot(collectionRef, (snapshot) => {

                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (name === 'expenseCategories') {

                    // Sort categories alphabetically

                    data.sort((a, b) => a.name.localeCompare(b.name));

                }

                setter(data);

            }, (error) => {

                console.error(`Error al obtener ${name}:`, error);

                setMessage({ text: `Error al cargar ${name}: ${error.message}`, type: 'error' });

            });

        });



        return () => unsubscribers.forEach(unsub => unsub());

    }, [db, userId, appId]);



    // Effect to synchronize student names

    useEffect(() => {

        if (!db || !students.length) return;



        const updateNames = async () => {

            const batch = writeBatch(db);

            let updatesNeeded = false;



            for (const student of students) {

                // Sync names in scheduledClasses

                const qClasses = query(fsCollection(db, `artifacts/${appId}/scheduledClasses`), where('studentId', '==', student.id));

                const classesSnapshot = await getDocs(qClasses);

                classesSnapshot.forEach(docSnapshot => {

                    if (docSnapshot.data().studentName !== student.name) {

                        batch.update(docSnapshot.ref, { studentName: student.name });

                        updatesNeeded = true;

                    }

                });



                // Sync names in payments

                const qPayments = query(fsCollection(db, `artifacts/${appId}/payments`), where('studentId', '==', student.id));

                const paymentsSnapshot = await getDocs(qPayments);

                paymentsSnapshot.forEach(docSnapshot => {

                    if (docSnapshot.data().studentName !== student.name) {

                        batch.update(docSnapshot.ref, { studentName: student.name });

                        updatesNeeded = true;

                    }

                });

            }



            if (updatesNeeded) {

                try {

                    await batch.commit();

                    console.log("Batch update: student names synchronized.");

                } catch (error) {

                    console.error("Error synchronizing student names:", error);

                

    if (typeof setLoading === 'function') setLoading(false);

}

            }

        };



        updateNames();

    }, [students, db, userId, appId]);



    const showMessage = useCallback((text, type = 'info') => {

        setMessage({ text, type });

        setTimeout(() => setMessage({ text: '', type: 'info' }), 5000);

    }, []);



    const handleOpenScheduleClassModal = (student) => {

        setEditingClassData({ studentDetails: student });

        setShowScheduleClassModal(true);

    };



    const handleOpenMarkPaymentModal = (student, paymentId = null) => {

        setSelectedStudentForDetails(student);

        setPaymentToMark(paymentId);

        setShowMarkPaymentModal(true);

    };



// En MainApp.js

const studentsWithStatsRef = useRef([]);

const handleOpenStudentDetailsModal = useCallback((student, initialEditMode = false) => {

  // ✅ IMPORTANTE: Buscar el alumno en studentsWithStats para obtener todos los datos calculados

  const studentWithStats = studentsWithStatsRef.current.find(s => s.id === student.id);

  if (studentWithStats) {

    setSelectedStudentForDetails(studentWithStats);

    setShowStudentDetailsModal(true);

  } else {

    // Fallback por si no se encuentra (no debería pasar)

    setSelectedStudentForDetails(student);

    setShowStudentDetailsModal(true);

  }

}, []);



    const handleEditClass = (classData) => {

        const student = students.find(s => s.id === classData.studentId);

        if (!student) {

            showMessage('Error: No se pudo encontrar el alumno asociado a esta clase.', 'error');

            return;

        }

        setEditingClassData({ ...classData, studentDetails: student });

        setShowScheduleClassModal(true);

    };



    const handleOpenRescheduleClassModal = (student) => {

        setSelectedStudentForReschedule(student);

        setShowRescheduleClassModal(true);

    };



    const handleGoToMarkPaymentFromClassAdd = (student) => {

        setShowAttendanceModal(false);

        handleOpenMarkPaymentModal(student);

    };



    const handleDeleteStudentRequest = (student) => {

        if (student.pendingBalance > 0 || student.totalPaidUnconsumedClasses > 0) {

            showMessage('No se puede eliminar: El alumno tiene un saldo pendiente o clases restantes.', 'error');

            return;

        }

        setStudentToDelete(student);

        setShowConfirmDeleteStudentModal(true);

    };



    const confirmDeleteStudent = async () => {

        if (!studentToDelete) return;

        

        try {

            const studentId = studentToDelete.id;

            const batch = writeBatch(db);



            // Delete student document

            const studentRef = doc(db, `artifacts/${appId}/students`, studentId);

            batch.delete(studentRef);



            // Delete associated scheduled classes

            const classesQuery = query(fsCollection(db, `artifacts/${appId}/scheduledClasses`), where("studentId", "==", studentId));

            const classesSnapshot = await getDocs(classesQuery);

            classesSnapshot.forEach(doc => batch.delete(doc.ref));



            // Delete associated payments

            const paymentsQuery = query(fsCollection(db, `artifacts/${appId}/payments`), where("studentId", "==", studentId));

            const paymentsSnapshot = await getDocs(paymentsQuery);

            paymentsSnapshot.forEach(doc => batch.delete(doc.ref));



            await batch.commit();

            showMessage('Alumno y todos sus datos han sido eliminados.', 'success');

        } catch (error) {

            console.error("Error deleting student:", error);

            showMessage(`Error al eliminar el alumno: ${error.message}`, 'error');

        

    if (typeof setLoading === 'function') setLoading(false);

} finally {

            setShowConfirmDeleteStudentModal(false);

            setShowStudentDetailsModal(false);

            setStudentToDelete(null);

        }

    };

    

    const handleOpenCertificateGenerator = (student) => {

        setSelectedStudentForDetails(student);

        setShowStudentDetailsModal(false);

        setShowCertificateGeneratorModal(true);

    };



    const handleGenerateCertificate = (student, modality, year) => {

        setCertificateData({ student, modality, year });

        setShowCertificateGeneratorModal(false);

        setShowCertificateModal(true);

    };





// App.jsx

  // Recarga manual de datos (sin recargar la PWA)

  const manualReload = React.useCallback(async () => {

    if (!db || !appId) return;

    try {

      const pairs = [

        ["students", setStudents],

        ["scheduledClasses", setScheduledClasses],

        ["payments", setAllPayments],

        ["extraIncomes", setExtraIncomes],

        ["expenses", setExpenses],

        ["expenseCategories", setExpenseCategories],

        ["blockedSlots", setBlockedSlots],

        ["events", setEvents],

      ];

      for (const [name, setter] of pairs) {

        const col = fsCollection(db, `artifacts/${appId}/${name}`);

        const snap = await getDocs(query(col));

        const data = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));

        if (name === "expenseCategories") {

          data.sort((a,b) => (a?.name||'').localeCompare(b?.name||''));

        }

        setter(data);

      }

      // Feedback opcional

      try { setMessage({ text: "Datos actualizados", type: "success" }); } catch {}

    } catch (e) {

      console.error("manualReload error", e);

      try { setMessage({ text: "No se pudo actualizar los datos", type: "error" }); } catch {}

    }

  }, [db, appId]);

  

  // Exponer soft refresh para pull-to-refresh

  React.useEffect(() => {

    const prev = window.__doSoftRefresh;

    window.__doSoftRefresh = manualReload;

    return () => { if (prev) window.__doSoftRefresh = prev; else delete window.__doSoftRefresh; };

  }, [manualReload]);

// ▼▼▼ REEMPLAZÁ EL BLOQUE DE CÁLCULO DE 'studentsWithStats' CON ESTO ▼▼▼



// ▼▼▼ PEGÁ ESTE NUEVO BLOQUE COMPLETO EN SU LUGAR ▼▼▼



const studentsWithStats = React.useMemo(() => {

    return students.map(student => {

        const studentUnpaidSingleClasses = scheduledClasses.filter(cls => cls.studentId === student.id && !cls.isPaid && cls.scheduleType === 'single');

        const studentUnpaidMonthlyPackages = allPayments.filter(mp => mp.studentId === student.id && !mp.isPaidForPackage && mp.paymentMethod === 'monthly_package_payment');

        // Abonos Flexibles "por clase": quedan como deuda (pendientes de cobro) hasta que se van pagando clase a clase
        const studentUnpaidFlexCredits = allPayments
            .filter(mp => mp.studentId === student.id && mp.paymentMethod === 'abono_flexible' && mp.isPaidForPackage === false)
            .map(p => {
                const total = p.amount || 0;
                const montoPorClase = p.montoPorClase || (p.clasesTotal ? Math.round(total / p.clasesTotal) : total);
                const pendingAmount = Math.max(total - (p.clasesPagadas || 0) * montoPorClase, 0);
                return { ...p, amount: pendingAmount };
            })
            .filter(p => p.amount > 0);



        const unpaidItems = [

            ...studentUnpaidMonthlyPackages.map(p => ({ type: 'package', ...p })),

            ...studentUnpaidSingleClasses.map(c => ({ type: 'class', ...c })),

            ...studentUnpaidFlexCredits.map(p => ({ type: 'flex_credit', ...p })),

        ].sort((a,b) => (a.classDate || a.periodStartDate).localeCompare(b.classDate || b.periodStartDate));



        const hoy = new Date();

        hoy.setHours(0, 0, 0, 0);



        let pendingBalance = 0;

        let pendingBalanceWithSurcharge = 0;

        let aplicaRecargoGeneral = false;



        unpaidItems.forEach(item => {

            const baseAmount = item.amount || item.price || 0;

            pendingBalance += baseAmount;



            const itemDate = new Date((item.periodStartDate || item.classDate) + 'T12:00:00');

            const dueDate = new Date(itemDate.getFullYear(), itemDate.getMonth(), 8, 23, 59, 59, 999);



            if (hoy > dueDate) {

                pendingBalanceWithSurcharge += Math.round(baseAmount * 1.10);

                aplicaRecargoGeneral = true;

            } else {

                pendingBalanceWithSurcharge += baseAmount;

            }

        });

        

        const totalPaidUnconsumedClasses = scheduledClasses.filter(cls => cls.studentId === student.id && cls.isPaid && !cls.attendanceStatus && (cls.status === 'scheduled' || cls.status === undefined)).length;

        const scheduledClassesDetailed = scheduledClasses.filter(cls => cls.studentId === student.id && (cls.status === 'scheduled' || cls.status === undefined));

        

        const now = new Date();

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];



        const paidClassesThisMonthDetails = scheduledClasses.filter(cls =>

            cls.studentId === student.id &&

            cls.isPaid === true &&

            cls.classDate >= startOfMonth &&

            cls.classDate <= endOfMonth

        );

        const totalPaidClassesThisMonth = paidClassesThisMonthDetails.length;



        // --- LÓGICA NUEVA PARA DETECTAR ENTRADAS VISIBLES ---

        const hasVisibleTickets = (events || []).some(event => {

            const participant = (event.participants || []).find(p => (p.id || p.studentId) === student.id);

            return participant && participant.ticketsVisible === true;

        });

        // --- FIN DE LA LÓGICA NUEVA ---



        return {

            ...student,

            pendingBalance,

            pendingBalanceWithSurcharge,

            aplicaRecargo: aplicaRecargoGeneral,

            totalPaidUnconsumedClasses,

            scheduledClassesDetailed,

            totalPaidClassesThisMonth,

            paidClassesThisMonthDetails,

            unpaidItems,

            hasAnyUnpaidItems: pendingBalance > 0,

            hasVisibleTickets, // <-- Nueva propiedad añadida

        };

    });

}, [students, scheduledClasses, allPayments, events]); // <-- Se añade "events" a la lista

// Ref con el valor más reciente de studentsWithStats, para que los handlers
// que lo necesitan puedan tener una referencia ESTABLE (useCallback con deps
// vacías) sin perder acceso a los datos actualizados — clave para que
// StudentCard.memo() no se invalide en cada snapshot de Firestore.
studentsWithStatsRef.current = studentsWithStats;

// ▲▲▲ FIN DEL BLOQUE PARA REEMPLAZAR ▲▲▲



// ▲▲▲ FIN DEL BLOQUE A REEMPLAZAR ▲▲▲



const calendarStripeStyles = `

    .unpaid-striped-bg {

      background-size: 10px 10px; /* PATRÓN MÁS DENSO (antes 12px) */

      background-color: #ffffff;

    }

    .unpaid-individual {

      /* MÁS OPACIDAD (de 0.2 a 0.35) */

      background-image: linear-gradient(45deg, rgba(59, 130, 246, 0.35) 25%, transparent 25%, transparent 50%, rgba(59, 130, 246, 0.35) 50%, rgba(59, 130, 246, 0.35) 75%, transparent 75%, transparent);

    }

    .unpaid-group {

      /* MÁS OPACIDAD (de 0.25 a 0.4) */

      background-image: linear-gradient(45deg, rgba(245, 158, 11, 0.4) 25%, transparent 25%, transparent 50%, rgba(245, 158, 11, 0.4) 50%, rgba(245, 158, 11, 0.4) 75%, transparent 75%, transparent);

    }

    .unpaid-choir {

      /* MÁS OPACIDAD (de 0.2 a 0.35) */

      background-image: linear-gradient(45deg, rgba(236, 72, 153, 0.35) 25%, transparent 25%, transparent 50%, rgba(236, 72, 153, 0.35) 50%, rgba(236, 72, 153, 0.35) 75%, transparent 75%, transparent);

    }

`;

    if (loading) {

        return <div className="flex items-center justify-center min-h-screen bg-gray-100 text-sm sm:text-base sm:text-sm text-gray-900"><div className="text-sm sm:text-base sm:text-sm font-semibold text-gray-700 text-gray-900">Cargando aplicación...</div></div>;

    }




// ▼▼▼ REEMPLAZÁ ESTA FUNCIÓN COMPLETA EN TU MainApp ▼▼▼
const handleOpenRenewSubscriptionModal = (student) => {
    try {
        const allStudentPackages = (Array.isArray(allPayments) ? allPayments : [])
            .filter(p => p.studentId === student.id && p.paymentMethod === 'monthly_package_payment');

        if (allStudentPackages.length === 0) {
            showMessage('Este alumno no tiene abonos mensuales previos para renovar.', 'info');
            return;
        }

        // --- LÓGICA CORREGIDA Y SIMPLIFICADA ---
        const latestPackagesMap = new Map();

        for (const payment of allStudentPackages) {
            const key = `${payment.classType}-${payment.dayOfWeek}-${payment.startTime}`;
            const existing = latestPackagesMap.get(key);
            
            if (!existing || new Date(payment.periodStartDate) > new Date(existing.periodStartDate)) {
                latestPackagesMap.set(key, payment);
            }
        }

        const packagesToRenew = Array.from(latestPackagesMap.values()).map(latestPayment => {
            const lastPeriodEndDate = new Date(latestPayment.periodEndDate + 'T23:59:59');
            const labelDate = new Date(lastPeriodEndDate);
            labelDate.setDate(labelDate.getDate() + 5);

            // Determinar el próximo período a generar
            const nextPeriodMonth = labelDate.toLocaleDateString('es-ES', { month: 'long' });
            const nextPeriodYear = labelDate.getFullYear();
            const nextPeriodLabel = `${nextPeriodMonth} de ${nextPeriodYear}`;
            const formattedNextPeriodLabel = nextPeriodLabel.charAt(0).toUpperCase() + nextPeriodLabel.slice(1);

            let amountForRenewal = Number(latestPayment.amount) || 0;
            const paymentDateValue = latestPayment.paymentDate || latestPayment.paidAt;
            
            // 1. Quitar el recargo si el último pago fue con recargo (para obtener la cuota base)
            if (paymentDateValue) {
                const paymentDate = paymentDateValue.toDate ? paymentDateValue.toDate() : new Date(paymentDateValue);
                if (!isNaN(paymentDate.getTime())) {
                    const dayOfMonthPaid = paymentDate.getDate();
                    if (dayOfMonthPaid > 8 && amountForRenewal > 0) {
                        amountForRenewal = Math.round(amountForRenewal / 1.1);
                    }
                }
            }

            // 2. *** LÓGICA CLAVE DE LA MATRÍCULA ***
            const isDecemberRenewal = nextPeriodMonth.toLowerCase() === 'diciembre';
            let matricula = 0;
            
            if (isDecemberRenewal && amountForRenewal > 0) {
                // Matrícula es el 50% de la cuota base
                matricula = Math.round(amountForRenewal * 0.50);
                amountForRenewal += matricula;
                
                showMessage(`¡Se incluyó la Matrícula Anual! (${formattedNextPeriodLabel})`, 'info');
            }
            // **********************************

            return {
                classType: latestPayment.classType,
                dayOfWeek: latestPayment.dayOfWeek,
                startTime: latestPayment.startTime,
                duration: latestPayment.duration,
                amount: amountForRenewal, // Monto ya con matrícula o sin ella
                baseAmount: amountForRenewal - matricula, // Solo la cuota (útil para mostrar)
                matricula: matricula, // Monto de la matrícula (si aplica)
                periodStartDate: latestPayment.periodStartDate,
                periodEndDate: latestPayment.periodEndDate,
                nextPeriodLabel: formattedNextPeriodLabel,
                isDecemberRenewal: isDecemberRenewal, // Para mensajes en el modal
            };
        });

        if (packagesToRenew.length === 0) {
             showMessage('No se encontraron paquetes de abono válidos para renovar.', 'info');
             return;
        }
        
        packagesToRenew.sort((a, b) => {
             const dayA = parseInt(a.dayOfWeek, 10);
             const dayB = parseInt(b.dayOfWeek, 10);
             if (dayA !== dayB) return dayA - dayB;
             return (a.startTime || '').localeCompare(b.startTime || '');
        });

        setRenewalData({ student, packages: packagesToRenew });
        setShowRenewSubscriptionModal(true);

    } catch (e) {
        console.error('handleOpenRenewSubscriptionModal error', e);
        showMessage('No se pudo abrir la ventana de renovación.', 'error');
    }
};
// ▲▲▲ FIN DE LA FUNCIÓN A REEMPLAZAR ▲▲▲
const handleRenewSelectedSubscription = async (student, packageToRenew, newAmount) => {
    setShowRenewSubscriptionModal(false);
    
    const lastPeriodEndDate = new Date(packageToRenew.periodEndDate + 'T23:59:59');
    const nextMonthDate = new Date(lastPeriodEndDate);
    nextMonthDate.setDate(nextMonthDate.getDate() + 1);

    const { classType, dayOfWeek, startTime, duration } = packageToRenew;
    
    // ✅ USA EL NUEVO MONTO DEL MODAL
    const amount = newAmount;

    try {
        const batch = writeBatch(db);
        const classesToAdd = [];
        const actualYear = nextMonthDate.getFullYear();
        const actualMonth = nextMonthDate.getMonth();
        const daysInMonth = new Date(actualYear, actualMonth + 1, 0).getDate();

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(actualYear, actualMonth, d);
            if (date.getDay() === parseInt(dayOfWeek)) {
               const formattedDate = toLocalYYYYMMDD(date);
                const tempStartDate = new Date(`${formattedDate}T${startTime}:00`);
                tempStartDate.setMinutes(tempStartDate.getMinutes() + duration);
                const endTime = `${tempStartDate.getHours().toString().padStart(2, '0')}:${tempStartDate.getMinutes().toString().padStart(2, '0')}`;
                
                classesToAdd.push({ studentId: student.id, studentName: student.name, studentType: classType, classDate: formattedDate, startTime, endTime, duration, isPaid: false, userId, scheduledAt: new Date(), scheduleType: 'monthly', attendanceStatus: null, status: 'scheduled' });
            }
        }

        if (classesToAdd.length === 0) {
            showMessage('No se pudieron generar clases para el próximo mes.', 'error');
            return;
        }

        const monthlyPaymentRef = doc(fsCollection(db, `artifacts/${appId}/payments`));
        const classIds = [];
        
        for (const cls of classesToAdd) {
            const classRef = doc(fsCollection(db, `artifacts/${appId}/scheduledClasses`));
            batch.set(classRef, { ...cls, monthlyPaymentRefId: monthlyPaymentRef.id });
            classIds.push(classRef.id);
        }

        const periodEndDate = new Date(actualYear, actualMonth + 1, 0);

        batch.set(monthlyPaymentRef, {
            studentId: student.id,
            studentName: student.name,
            // ✅ USA EL NUEVO MONTO
            amount: parseFloat(amount),
            paymentDate: '',
            status: 'pending',
            paidAt: null,
            periodStartDate: nextMonthDate.toISOString().split('T')[0],
            periodEndDate: toLocalYYYYMMDD(periodEndDate),
            classType,
            dayOfWeek,
            startTime,
            duration,
            numClassesGenerated: classesToAdd.length,
            recordedAt: new Date(),
            paymentMethod: 'monthly_package_payment',
            isPaidForPackage: false,
            associatedClassIds: classIds,
            userId
        });

        await batch.commit();
        const monthName = nextMonthDate.toLocaleDateString('es-ES', { month: 'long' });
        showMessage(`Abono para ${monthName} generado con el monto de $${amount}. Recordá marcar el pago manualmente.`, 'success');

    } catch (error) {
        console.error("Error renewing subscription:", error);
        showMessage(`Error al renovar el abono: ${error.message}`, 'error');
    }
};

    return (

        <>

        <style>

            {`

                @font-face {

                    font-family: 'ChristmasAngely';

                    src: url('https://res.cloudinary.com/dgtwruyzj/raw/upload/v1754086528/ChristmasAngelyPersonaluse-Regular_yztsvw.otf') format('opentype');

                }



                .font-christmas-angely {

                    font-family: 'ChristmasAngely', cursive;

                }

            `}

        </style>

        <style>{calendarStripeStyles}</style>

        <CertificateModal 

            isOpen={showCertificateModal} 

            onClose={() => setShowCertificateModal(false)} 

            studentData={certificateData?.student}

            modality={certificateData?.modality}

            year={certificateData?.year}

            showMessage={showMessage}

        />

        <CertificateGeneratorModal 

            isOpen={showCertificateGeneratorModal}

            onClose={() => setShowCertificateGeneratorModal(false)}

            student={selectedStudentForDetails}

            onGenerate={handleGenerateCertificate}

        />

        <div className="min-h-screen flex flex-col font-inter text-sm text-gray-900 pb-24 sm:pb-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

            {/* ══════ TOP BAR FULL-WIDTH ══════ */}
            <div
              className="w-full flex-shrink-0 bg-white relative z-30 shadow-sm"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
            >
              <div className="flex items-center justify-between px-4 sm:px-6 py-2.5">
                {/* Izquierda: logo en placa de color + nombre */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-rose-600 to-pink-500 flex items-center justify-center shadow-md flex-shrink-0 p-2">
                    <img src="/nuevologo.gif" alt="Logo"
                      className="w-full h-full object-contain"
                      style={{ filter: 'brightness(0) invert(1)' }}
                      onError={e => { e.currentTarget.style.display='none'; }}
                    />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-gray-900 font-black text-lg sm:text-xl leading-none tracking-tight truncate">Sandra Paloschi</h1>
                    <p className="text-rose-500 text-[10px] sm:text-[11px] font-bold tracking-[0.18em] uppercase mt-1">Estudio de Canto</p>
                  </div>
                </div>

                {/* Derecha: botones */}
                <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                  <button onClick={toggleAmountsHidden}
                    title={amountsHidden ? 'Mostrar montos' : 'Ocultar montos (para mostrarle la pantalla a un alumno)'}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition border
                      ${amountsHidden ? 'bg-gray-800 text-white border-gray-800' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-100'}`}>
                    {amountsHidden ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88"/></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    )}
                  </button>
                  <button onClick={() => setShowTransposeModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 rounded-xl text-rose-700 text-xs font-bold transition border border-rose-100">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/></svg>
                    Tono
                  </button>
                  <button onClick={async () => { try { await signOut(auth); } catch(e) { console.error(e); } }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-gray-500 text-xs font-semibold transition border border-gray-100">
                    Salir
                  </button>
                </div>

                {/* Mobile: ojito de privacidad + hamburguesa */}
                <div className="sm:hidden flex items-center gap-2 flex-shrink-0">
                  <button onClick={toggleAmountsHidden}
                    title={amountsHidden ? 'Mostrar montos' : 'Ocultar montos'}
                    className={`p-2.5 rounded-xl transition ${amountsHidden ? 'bg-gray-800 text-white' : 'bg-rose-50 hover:bg-rose-100 text-rose-600'}`}>
                    {amountsHidden ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88"/></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    )}
                  </button>
                  <button onClick={() => setShowMobileMoreMenu(true)}
                    className="p-2.5 bg-rose-50 hover:bg-rose-100 rounded-xl text-rose-600 transition">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
                    </svg>
                  </button>
                </div>
              </div>
              {/* Línea de acento de marca */}
              <div className="h-[3px] bg-gradient-to-r from-rose-600 via-pink-500 to-rose-600" />
            </div>

            <div className="flex flex-1 bg-white overflow-hidden">

              {/* ═══ SIDEBAR (solo desktop, sin header propio) ═══ */}
              <aside className="hidden sm:flex flex-col w-56 lg:w-64 bg-white border-r border-gray-100 flex-shrink-0">

                {/* Navegación */}
                <nav className="flex-1 py-4 px-2.5 overflow-y-auto space-y-4">

                  {/* ALUMNOS */}
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 tracking-[0.12em] uppercase px-2 mb-1">Alumnos</p>
                    <button onClick={() => setShowStudentListModal(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
                      Alumnos
                    </button>
                    <button onClick={() => setShowAddStudentForm(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                      Agregar alumno
                    </button>
                  </div>

                  {/* FINANZAS */}
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 tracking-[0.12em] uppercase px-2 mb-1">Finanzas</p>
                    <button onClick={() => setShowFinancialManagementModal(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
                      Finanzas
                    </button>
                    <button onClick={() => { const el = document.querySelector('button[title="Comprobantes"]'); if(el) el.click(); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M6 2a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2V4a2 2 0 00-2-2H6zm2 5h8v2H8V7zm0 4h8v2H8v-2z"/></svg>
                      Recibos
                    </button>
                    <button onClick={() => { const el = document.querySelector('button[title="Enviar mensaje"]'); if(el) el.click(); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12l-4-4H4a2 2 0 01-2-2V6z"/></svg>
                      Mensajes
                    </button>
                  </div>

                  {/* AGENDA */}
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 tracking-[0.12em] uppercase px-2 mb-1">Agenda</p>
                    <button onClick={() => setShowEventsList(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"/></svg>
                      Muestra
                    </button>
                    <button onClick={() => setShowMassEventsModal(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      Eventos
                    </button>
                    <button onClick={() => setShowBlockDaysModal(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd"/></svg>
                      Bloquear días
                    </button>
                    <button onClick={() => setShowAvailableSlotsModal(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      Disponibilidad
                    </button>
                    <button onClick={() => setShowTrialRequestsModal(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                      Pre-inscriptos
                    </button>
                  </div>

                  {/* CATÁLOGO */}
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 tracking-[0.12em] uppercase px-2 mb-1">Catálogo</p>
                    <button onClick={() => setShowLenceriaModal(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                      Lencería
                    </button>
                    <button onClick={() => setShowGlobalRepertoire(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/></svg>
                      Repertorio
                    </button>
                  </div>

                  {/* HERRAMIENTAS */}
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 tracking-[0.12em] uppercase px-2 mb-1">Herramientas</p>
                    <button onClick={() => setShowTransposeModal(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/></svg>
                      Transponer tono
                    </button>
                    <button onClick={() => setShowBackupRestoreModal(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition text-sm font-medium">
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                      Backup
                    </button>
                  </div>

                </nav>

                {/* Notificaciones push (botón de activación) */}
                <NotifButton appId={appId} showMessage={showMessage} />

                {/* Logout */}
                <div className="p-3 border-t border-gray-100">
                  <button
                    onClick={async () => { try { await signOut(auth); } catch(e) { console.error(e); } }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition text-xs font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                    Cerrar sesión
                  </button>
                </div>
              </aside>

              {/* ═══ CONTENIDO PRINCIPAL ═══ */}
              <div className="flex-1 min-w-0">

                {/* Header MOBILE — reemplazado por el TopBar, este bloque queda vacío */}
                <div className="hidden">
                  <div className="flex items-center gap-3">
                    {/* Logo — filtro CSS para hacerlo blanco sobre fondo oscuro */}
                    <img
                      src="/nuevologo.gif"
                      alt="SP"
                      className="h-9 w-9 object-contain flex-shrink-0"
                      style={{ filter: 'brightness(0) invert(1)', opacity: 0.9 }}
                    />
                    {/* Texto */}
                    <div className="flex-1 min-w-0">
                      <h1 className="text-white font-black text-base leading-tight tracking-wide truncate">
                        SANDRA PALOSCHI
                      </h1>
                      <p className="text-rose-200 text-[10px] font-semibold tracking-[0.25em] uppercase">
                        Estudio de Canto
                      </p>
                    </div>
                    {/* Botón TONO integrado */}
                    <button
                      onClick={() => setShowTransposeModal(true)}
                      className="flex flex-col items-center gap-0.5 px-3 py-2 bg-white/15 hover:bg-white/25 active:bg-white/30 border border-white/20 rounded-xl text-white transition flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                      </svg>
                      <span className="text-[8px] font-bold uppercase tracking-wider">Tono</span>
                    </button>
                  </div>
                </div>



                {/* Message Display */}

                {message.text && <div className={`p-4 rounded-lg m-4 ${message.type === 'error' ? 'bg-red-100 text-red-800 border-red-200' : message.type === 'success' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-blue-100 text-blue-800 border-blue-200'}`}>{message.text}</div>}



                

                



                {/* Logout (icono discreto arriba a la derecha) */}

                <button

                  onClick={async () => { try { await signOut(auth); } catch (e) { console.error('Error al cerrar sesión:', e); } }}

                  title="Cerrar sesión"

                  aria-label="Cerrar sesión"

                  className="sm:hidden fixed top-4 right-3 z-50 text-gray-600 hover:text-gray-900 p-1.5 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"

                >

                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-sm sm:text-base sm:text-sm text-gray-900" stroke="currentColor" strokeWidth="1.8">

                    <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15" strokeLinecap="round" strokeLinejoin="round"/>

                    <path d="M12 9l3 3m0 0-3 3m3-3H3" strokeLinecap="round" strokeLinejoin="round"/>

                  </svg>

                </button>



{/* ═══ BARRA DE NAVEGACIÓN INFERIOR MÓVIL (fixed) ═══ */}
<div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg safe-area-pb">
  <div className="flex items-center justify-around px-2 py-1">

    {/* Alumnos */}
    <button onClick={() => setShowStudentListModal(true)} className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition min-w-0">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5zM13 11a5 5 0 015 5v1h-6v-1a7 7 0 00-1-3.67A5 5 0 0113 11z"/></svg>
      <span className="text-[10px] font-semibold">Alumnos</span>
    </button>

    {/* + Alumno */}
    <button onClick={() => setShowAddStudentForm(true)} className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition min-w-0">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
      <span className="text-[10px] font-semibold">+ Alumno</span>
    </button>

    {/* Finanzas */}
    <button onClick={() => setShowFinancialManagementModal(true)} className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition min-w-0">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
      <span className="text-[10px] font-semibold">Finanzas</span>
    </button>

    {/* Más */}
    <button onClick={() => setShowMobileMoreMenu(true)} className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition min-w-0">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
      <span className="text-[10px] font-semibold">Más</span>
    </button>

  </div>
</div>

{/* ═══ SHEET "MÁS ACCIONES" (móvil) ═══ */}
{showMobileMoreMenu && (
  <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setShowMobileMoreMenu(false)}>
    <div className="absolute inset-0 bg-black/40" />
    <div className="relative bg-white rounded-t-2xl p-4 pb-8 safe-area-pb" onClick={e => e.stopPropagation()}>
      <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4"/>
      <h3 className="font-bold text-gray-900 text-center mb-4">Acciones rápidas</h3>
      {/* Botón de notificaciones push — visible y accionable en mobile */}
      <NotifButton appId={appId} onDone={() => setShowMobileMoreMenu(false)} />

      <div className="grid grid-cols-3 gap-3 mt-3">
        {[
          { label: 'Eventos', icon: '🎤', action: () => { setShowEventsList(true); setShowMobileMoreMenu(false); } },
          { label: 'Lencería', icon: '🏷️', action: () => { setShowLenceriaModal(true); setShowMobileMoreMenu(false); } },
          { label: 'Repertorio', icon: '🎵', action: () => { setShowGlobalRepertoire(true); setShowMobileMoreMenu(false); } },
          { label: 'Bloquear', icon: '🚫', action: () => { setShowBlockDaysModal(true); setShowMobileMoreMenu(false); } },
          { label: 'Backup', icon: '💾', action: () => { setShowBackupRestoreModal(true); setShowMobileMoreMenu(false); } },
          { label: 'Masivos', icon: '📢', action: () => { setShowMassEventsModal(true); setShowMobileMoreMenu(false); } },
        ].map(item => (
          <button key={item.label} onClick={item.action}
            className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-rose-50 active:bg-rose-100 border border-gray-200 transition">
            <span className="text-2xl">{item.icon}</span>
            <span className="text-xs font-semibold text-gray-700">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
)}

<div className="hidden">

<div className="hidden">

  <div className="flex flex-nowrap gap-1">

    {/* ALUMNOS */}

    <button

      onClick={() => setShowAddStudentForm(true)}

      className="flex-1 text-center px-1 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white text-[11px] font-bold uppercase tracking-wider"

    >

      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto mb-1" viewBox="0 0 20 20" fill="currentColor">

        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />

      </svg>

      <span>ALUMNOS</span>

    </button>



    {/* FINANZAS */}

    <button

      onClick={() => setShowFinancialManagementModal(true)}

      className="flex-1 text-center px-1 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white text-[11px] font-bold uppercase tracking-wider"

    >

      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto mb-1" viewBox="0 0 20 20" fill="currentColor">

        <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />

      </svg>

      <span>FINANZAS</span>

    </button>



    {/* MUESTRA */}

    <button

      onClick={() => setShowEventsList(true)}

      className="flex-1 text-center px-1 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white text-[11px] font-bold uppercase tracking-wider"

    >

      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto mb-1" viewBox="0 0 20 20" fill="currentColor">

        <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />

      </svg>

      <span>MUESTRA</span>

    </button>



    {/* LENCERÍA */}

    <button

      onClick={() => setShowLenceriaModal(true)}

      className="flex-1 text-center px-1 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white text-[11px] font-bold uppercase tracking-wider"

    >

      <IconTag className="h-4 w-4 mx-auto mb-1" />

      <span>LENCERÍA</span>

    </button>



    {/* EVENTOS */}

    <button

      onClick={() => setShowMassEventsModal(true)}

      className="flex-1 text-center px-1 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white text-[11px] font-bold uppercase tracking-wider"

    >

      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">

        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />

      </svg>

      <span>EVENTOS</span>

    </button>



    {/* REPERTORIO */}

{/* REPERTORIO - CORREGIDO */}

<button

  onClick={() => setShowGlobalRepertoire(true)}

  className="flex-1 text-center px-1 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white text-[11px] font-bold uppercase tracking-wider"

>

  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>

    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />

  </svg>

  <span>REPERTORIO</span>

</button>



    {/* BLOQUEAR */}

    <button

      onClick={() => setShowBlockDaysModal(true)}

      className="flex-1 text-center px-1 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white text-[11px] font-bold uppercase tracking-wider"

    >

      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto mb-1" viewBox="0 0 20 20" fill="currentColor">

        <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />

      </svg>

      <span>BLOQUEAR</span>

    </button>



    {/* BACKUP */}

    <button

      onClick={() => setShowBackupRestoreModal(true)}

      className="flex-1 text-center px-1 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white text-[11px] font-bold uppercase tracking-wider"

    >

      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto mb-1" viewBox="0 0 20 20" fill="currentColor">

        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />

      </svg>

      <span>BACKUP</span>

    </button>



    {/* RECIBOS */}

    <button

      onClick={() => {

        const el = document.querySelector('button[title="Comprobantes"]');

        if (el) el.click();

      }}

      className="flex-1 text-center px-1 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white text-[11px] font-bold uppercase tracking-wider"

    >

      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto mb-1" viewBox="0 0 24 24" fill="currentColor">

        <path d="M6 2a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2V4a2 2 0 00-2-2H6zm2 5h8v2H8V7zm0 4h8v2H8v-2z" />

      </svg>

      <span>RECIBOS</span>

    </button>



    {/* MENSAJES */}

    <button

      onClick={() => {

        const el = document.querySelector('button[title="Enviar mensaje"]');

        if (el) el.click();

      }}

      className="flex-1 text-center px-1 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 text-white text-[11px] font-bold uppercase tracking-wider"

    >

      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto mb-1" viewBox="0 0 24 24" fill="currentColor">

        <path d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12l-4-4H4a2 2 0 01-2-2V6z" />

      </svg>

      <span>MENSAJES</span>

    </button>

  </div>

</div>

</div>

                {/* Main Content */}

                <div className="p-6 space-y-8 text-sm sm:text-base sm:text-sm text-gray-900">

                    

{/* Leyenda: botón "?" que despliega tooltip — sin ruido visual */}
<div className="mb-3 flex justify-end relative">
  <button
    onClick={() => setShowLegend(p => !p)}
    className={`w-6 h-6 rounded-full text-xs font-bold border transition flex items-center justify-center
      ${showLegend
        ? 'bg-rose-600 text-white border-rose-600'
        : 'bg-white text-gray-400 border-gray-300 hover:border-rose-400 hover:text-rose-500'}`}
    title="Leyenda de colores"
  >
    ?
  </button>

  {/* Tooltip de leyenda */}
  {showLegend && (
    <div className="absolute top-8 right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-3 flex flex-wrap gap-2.5 min-w-max">
      {[
        { color: 'bg-blue-100 border-blue-400',  label: 'Individual' },
        { color: 'bg-amber-100 border-amber-500', label: 'Grupal' },
        { color: 'bg-pink-100 border-pink-400',  label: 'Coral' },
        { color: 'bg-green-500 border-green-600', label: 'Presente' },
        { color: 'bg-rose-500 border-rose-600',   label: 'Ausente' },
      ].map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded-sm border ${color}`}/>
          <span className="text-xs text-gray-600 font-medium">{label}</span>
        </div>
      ))}
    </div>
  )}
</div>



<TodayDashboard
  studentsWithStats={studentsWithStats}
  scheduledClasses={scheduledClasses}
  allPayments={allPayments}
  db={db}
  appId={appId}
  onOpenAttendance={(classGroup) => { setSelectedClassForAttendance(classGroup); setShowAttendanceModal(true); }}
  onOpenReceipts={() => { const btn = document.querySelector('button[title="Comprobantes"]'); if(btn) btn.click(); }}
/>

<CalendarShell>

<CalendarView db={db} userId={userId} appId={appId} scheduledClasses={scheduledClasses} students={students} showMessage={showMessage} onEditClass={handleEditClass} onGoToMarkPayment={handleGoToMarkPaymentFromClassAdd} onCloseAttendanceModalFromApp={() => setShowAttendanceModal(false)} blockedSlots={blockedSlots} />

</CalendarShell>

                <Dashboard

    studentsWithStats={studentsWithStats}

    onOpenStudentDetailsModal={handleOpenStudentDetailsModal}

    onRestoreStudent={handleRestoreStudent}

    scheduledClasses={scheduledClasses}

    db={db}

    appId={appId}

    showMessage={showMessage}

/>

                </div>

            </div>

 <FloatingAdminMessagesButton

                db={db}

                appId={appId}

                students={studentsWithStats}

                showMessage={showMessage}

            />

            {/* Modals */}

            <Modal isOpen={showScheduleClassModal} onClose={() => setShowScheduleClassModal(false)}><ScheduleClassForm db={db} userId={userId} appId={appId} showMessage={showMessage} onClose={() => {setShowScheduleClassModal(false); setEditingClassData(null);}} editingClassData={editingClassData} isRescheduling={false} scheduledClasses={scheduledClasses} initialSelectedStudent={editingClassData?.studentDetails} blockedSlots={blockedSlots} /></Modal>

            <Modal isOpen={showMarkPaymentModal} onClose={() => setShowMarkPaymentModal(false)}><MarkPaymentForm db={db} userId={userId} appId={appId} showMessage={showMessage} onClose={() => setShowMarkPaymentModal(false)} initialSelectedStudent={selectedStudentForDetails} scheduledClasses={scheduledClasses} allPayments={allPayments} initialPaymentId={paymentToMark} /></Modal>

            {showStudentDetailsModal && 

            <Modal size="sm" isOpen={showStudentDetailsModal} onClose={() => setShowStudentDetailsModal(false)}><StudentDetailsModal db={db} userId={userId} appId={appId} showMessage={showMessage} onClose={() => setShowStudentDetailsModal(false)} studentData={selectedStudentForDetails}onArchiveStudentRequest={handleArchiveStudent} onDeleteStudentRequest={handleDeleteStudentRequest} onGenerateCertificate={handleOpenCertificateGenerator} initialEditMode={false} onOpenScheduleClassModal={handleOpenScheduleClassModal} onOpenMarkPaymentModal={handleOpenMarkPaymentModal} onOpenRenewSubscriptionModal={handleOpenRenewSubscriptionModal} onOpenRescheduleClassModal={handleOpenRescheduleClassModal} /></Modal>}

            <Modal isOpen={showRescheduleClassModal} onClose={() => setShowRescheduleClassModal(false)}>{selectedStudentForReschedule && <ScheduleClassForm db={db} userId={userId} appId={appId} showMessage={showMessage} onClose={() => {setShowRescheduleClassModal(false); setSelectedStudentForReschedule(null);}} initialSelectedStudent={selectedStudentForReschedule} isRescheduling={true} scheduledClasses={scheduledClasses} blockedSlots={blockedSlots} />}</Modal>

            <Modal size="xl" isOpen={showBackupRestoreModal} onClose={() => setShowBackupRestoreModal(false)}><BackupRestoreModal db={db} userId={userId} appId={appId} showMessage={showMessage} onClose={() => setShowBackupRestoreModal(false)} /></Modal>

            <AudioTransposeModal isOpen={showTransposeModal} onClose={() => setShowTransposeModal(false)} />

            <FinancialManagementModal isOpen={showFinancialManagementModal} onClose={() => setShowFinancialManagementModal(false)} allPayments={allPayments} extraIncomes={extraIncomes} expenses={expenses} students={students} db={db} userId={userId} appId={appId} showMessage={showMessage} expenseCategories={expenseCategories} />

            <Modal size="xl" isOpen={showBlockDaysModal} onClose={() => setShowBlockDaysModal(false)}><BlockDaysModal db={db} userId={userId} appId={appId} showMessage={showMessage} onClose={() => setShowBlockDaysModal(false)} blockedSlots={blockedSlots} scheduledClasses={scheduledClasses} /></Modal>

            <Modal size="sm" isOpen={showConfirmDeleteStudentModal} onClose={() => setShowConfirmDeleteStudentModal(false)}>

                <div className="text-sm sm:text-base sm:text-sm text-gray-900">

                    <h3 className="text-sm sm:text-base sm:text-sm font-semibold text-gray-800 mb-4 text-gray-900">Confirmar Eliminación</h3>

                    <p className="text-gray-700 mb-6 text-sm sm:text-base sm:text-sm text-gray-900">¿Estás seguro de que deseas eliminar a <span className="font-bold text-sm sm:text-base sm:text-sm text-gray-900">{studentToDelete?.name}</span>? Se borrarán todos sus datos, incluyendo clases y pagos. Esta acción es irreversible.</p>

                    <div className="flex justify-center space-x-4 text-sm sm:text-base sm:text-sm text-gray-900">

                        <button onClick={() => setShowConfirmDeleteStudentModal(false)} className="px-3 sm:px-5 py-1 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 text-sm sm:text-base sm:text-sm text-gray-900">CANCELAR</button>

                        <button onClick={confirmDeleteStudent} className="px-3 py-1.5 rounded-md bg-rose-600 text-white text-sm sm:text-base sm:text-sm sm:text-xs hover:bg-rose-600">ELIMINAR</button>

                    </div>

                </div>

            </Modal>

           



<EventsListModal

  isOpen={showEventsList}

  onClose={() => setShowEventsList(false)}

  events={events}

db={db}

  appId={appId}

  onCreate={() => { setShowEventsList(false); handleCreateEvent(); }}

  onSelect={(ev) => { setSelectedEvent(ev); setShowEventsList(false); }}

  onEdit={(ev) => { setShowEventsList(false); handleEditEvent(ev); }}

  onDelete={handleDeleteEvent}

/>



<EventModal

  isOpen={showEventModal}

  onClose={() => setShowEventModal(false)}

  // ✅ AÑADÍ ESTA LÍNEA

  eventToEdit={eventToEdit}

  db={db}

  appId={appId}

  userId={userId}

  students={students}

  showMessage={showMessage}

/>



<EventDetailModal

  isOpen={!!selectedEvent}

  onClose={() => setSelectedEvent(null)}

  event={selectedEvent}

  db={db}

  appId={appId}

  showMessage={showMessage}

  students={students}

/>

<StudentListModal
  isOpen={showStudentListModal}
  onClose={() => setShowStudentListModal(false)}
  students={studentsWithStats}
  onOpenStudentDetails={handleOpenStudentDetailsModal}
  onAddStudent={() => { setShowStudentListModal(false); setShowAddStudentForm(true); }}
  onScheduleClass={(s) => { setShowStudentListModal(false); handleOpenScheduleClassModal(s); }}
  scheduledClasses={scheduledClasses}
/>

<Modal size="xl" isOpen={showAddStudentForm} onClose={closeAddStudentForm}>

  <AddStudentForm

    db={db}

    userId={userId}

    appId={appId}

    showMessage={showMessage}

    onClose={closeAddStudentForm}

    initialData={addStudentInitialData}

    onCreated={handleStudentCreatedFromTrial}

  />

</Modal>







<RenewSubscriptionModal

    isOpen={showRenewSubscriptionModal}

    onClose={() => setShowRenewSubscriptionModal(false)}

    renewalData={renewalData}

    onRenew={handleRenewSelectedSubscription}

/>

<GlobalRepertoireModal

    isOpen={showGlobalRepertoire}

    onClose={() => setShowGlobalRepertoire(false)}

    db={db}

    appId={appId}

    students={students}

    showMessage={showMessage}

/>

<LenceriaStockModal

isOpen={showLenceriaModal}

  onClose={() => setShowLenceriaModal(false)}

  db={db}

  appId={appId}

  showMessage={showMessage}

size="full"

/>

<MassEventsAdminModal

  isOpen={showMassEventsModal}

  onClose={() => setShowMassEventsModal(false)}

  db={db}

  appId={appId}

  students={students}

  showMessage={showMessage}

/>

{showAvailableSlotsModal && (
  <AvailableSlotsManager db={db} appId={appId} onClose={() => setShowAvailableSlotsModal(false)} />
)}
{showTrialRequestsModal && (
  <TrialRequestsPanel db={db} appId={appId} onClose={() => setShowTrialRequestsModal(false)}
    onConvertToStudent={(req) => { setShowTrialRequestsModal(false); handleConvertTrialToStudent(req); }} />
)}

              </div>{/* fin flex-1 min-w-0 */}

            </div>{/* fin flex row sidebar+content */}

        </>

    );

};
