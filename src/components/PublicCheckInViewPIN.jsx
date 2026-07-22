import React, { useState, useEffect, useRef } from 'react';

import { collection as fsCollection, doc, getDoc, getDocs, updateDoc, addDoc as fsAddDoc, query, where, orderBy, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';

import { auth } from '../firebaseConfig.js';

import { Modal, ModalHeader } from './Modal.jsx';

import { MoneyInput } from './MoneyInput.jsx';

import { Toast } from './Toast.jsx';

import { formatMoneyAr, parseMoneyAr } from '../utils/money.js';

import { formatDateToDDMMYYYY, mapClassTypeToSpanish, daysOfWeekFull } from '../utils/classHelpers.js';

import { useMergedValidatedPayments } from '../hooks/useMergedValidatedPayments.js';

import { useHasPaidThisMonth } from '../hooks/useHasPaidThisMonth.js';

import { useLatestPackagePaid } from '../hooks/useLatestPackagePaid.js';

import { TransferBox, UnpaidPackageBanner, PublicBillingInfo, PublicPaymentsList, PublicTicketsSection } from './PublicPortalComponents.jsx';

import { GracePeriodNotice, NextMonthInfoBox } from './PublicPortalWidgets.jsx';

import { SocialMediaLinks } from './SocialMediaLinks.jsx';

import { BrandLogo } from './AuthComponents.jsx';

import { ROUTES } from '../constants.js';

import { waitForAuthReady, updateReceiptStatus, markStudentReceiptsAsSeen } from '../utils/authHelpers.js';

import { ASSET_VER, APP_BUILD, ATTENDANCE_QR_CODE } from '../constants.js';

import { Button, UpdateButton } from './AuthComponents.jsx';

import { EventConfirmationPopup, ConfirmedEventsSection } from './MiscComponents.jsx';

import { MinimalReceiptUpload, ProfilePictureUploader } from './UploadComponents.jsx';

import { PublicMessages } from './PortalAlumnoComponents.jsx';
import { ChromaticTuner } from './PitchPanel.jsx';
import { StudentTools } from './StudentTools.jsx';

import { useMemo } from 'react';

import { toLocalYYYYMMDD } from '../utils/dateHelpers.js';
import { app as firebaseApp } from '../firebaseConfig.js';
import { registerNotifications } from '../notifications.js';
import { FCM_VAPID_KEY } from '../constants.js';

import { isPresent, isAbsent } from '../utils/studentHelpers.js';
import { useNewReceiptsFlag } from '../hooks/useNewReceiptsFlag.js';
import { UpdateBanner } from './UpdateBanner.jsx';

// Abre una URL forzando que escape al Safari "real" (con cámara funcionando)
// cuando la app corre instalada en la pantalla de inicio de iOS (modo standalone).
// En ese modo, window.open() NO escapa — sigue atrapado en el mismo contenedor
// restringido donde la cámara no funciona. El esquema "x-safari-https://" es la
// forma conocida de forzar la apertura en Safari desde una app instalada.
const STUDENT_SESSION_KEY = 'sp_checkin_student_id';

function openInRealBrowser(path) {
  const url = `${window.location.origin}${path}`;
  const isIOSStandalone = typeof window.navigator.standalone !== 'undefined' && window.navigator.standalone === true;
  if (isIOSStandalone) {
    window.location.href = url.replace(/^https?:\/\//, 'x-safari-https://');
  } else {
    window.open(url, '_blank');
  }
}

export const PublicCheckInViewPIN = ({ db, onClose }) => {

  

  const [calculandoMonto, setCalculandoMonto] = React.useState(true);
  const [showTuner, setShowTuner] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('inicio');

  const LOGO_URL = `/nuevologo.gif?v=${ASSET_VER}`;

  

  // Estados existentes

  const [currentMonthUnpaidPackages, setCurrentMonthUnpaidPackages] = React.useState([]);

  const [nextMonthPackage, setNextMonthPackage] = React.useState(null);

  const [unpaidClasses, setUnpaidClasses] = React.useState([]);

  const [unpaidFlexCredits, setUnpaidFlexCredits] = React.useState([]);

  const [dniInput, setDniInput] = React.useState('');

  const [student, setStudent] = React.useState(null);
  const [autoLoginChecked, setAutoLoginChecked] = React.useState(false);

  const [status, setStatus] = React.useState({ step: 'ok', msg: 'Completá tu DNI para ingresar.' });

  const [saving, setSaving] = React.useState(false);

  const [toast, setToast] = React.useState({ open: false, kind: "success", text: "" });
  const [openHist, setOpenHist] = React.useState(false);
  const [pullDist, setPullDist] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const pullStartY = React.useRef(0);
  const isPulling  = React.useRef(false);

  // ── Pull-to-refresh ───────────────────────────────────────────────────────
  React.useEffect(() => {
    const THRESHOLD = 70;
    const onStart = (e) => {
      if (window.scrollY > 0) return;
      pullStartY.current = e.touches[0].clientY;
      isPulling.current  = false;
    };
    const onMove = (e) => {
      const dy = e.touches[0].clientY - pullStartY.current;
      if (dy > 0 && window.scrollY === 0) {
        isPulling.current = true;
        setPullDist(Math.min(dy * 0.5, THRESHOLD));
        if (dy > 10) e.preventDefault();
      }
    };
    const onEnd = () => {
      if (isPulling.current && pullDist >= THRESHOLD * 0.85) {
        setRefreshing(true);
        setPullDist(0);
        // Guardamos el student actual para no perderlo
        setStudent(prev => {
          if (!prev) { setRefreshing(false); return prev; }
          const saved = { ...prev };
          // Cicla student por null brevemente para re-trigger useEffects
          // El overlay cubre el login screen durante esos 400ms
          requestAnimationFrame(() => {
            setStudent(null);
            setTimeout(() => {
              setStudent(saved);
              setTimeout(() => setRefreshing(false), 300);
            }, 350);
          });
          return prev; // No cambia inmediatamente — el overlay ya está arriba
        });
      } else {
        setPullDist(0);
      }
      isPulling.current = false;
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove',  onMove,  { passive: false });
    document.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove',  onMove);
      document.removeEventListener('touchend',   onEnd);
    };
  }, [pullDist]);



  const [showWelcomeModal, setShowWelcomeModal] = React.useState(false);

  const [selectedClassForAttendance, setSelectedClassForAttendance] = useState(null);

const [showAttendanceOptions, setShowAttendanceOptions] = useState(false);

const [pendingPresent, setPendingPresent] = useState(null); // código del QR de sala leído por URL
const [presentDone, setPresentDone] = useState(false);
const [presentSuccess, setPresentSuccess] = useState(false);

  

  const [appId, setLocalAppId] = React.useState(null);

  const [token, setToken] = React.useState(null);

React.useEffect(() => {

  const initAuth = async () => {

    console.log("[Portal] Inicializando sesión anónima...");

    await waitForAuthReady();

    console.log("[Portal] Sesión lista, UID:", auth.currentUser?.uid);

  };

  initAuth();

}, []);

  const [frozenIds, setFrozenIds] = React.useState([]);

  const [monthlyByType, setMonthlyByType] = React.useState({ grupal: [], individual: [], otras: [] });

  const [publicTotalToday, setPublicTotalToday] = React.useState(null);

  const [showEventPopup, setShowEventPopup] = React.useState(false);

  // ✅ NUEVO: Estado para días bloqueados y clases planas para el calendario

  const [blockedSlots, setBlockedSlots] = React.useState([]);

  const [allMonthClasses, setAllMonthClasses] = React.useState([]); 



  const hasNewReceipt = useNewReceiptsFlag(db, appId, student?.id);

const getCurrentWeekRange = () => {

  const today = new Date();

  const day = today.getDay(); // 0 domingo, 1 lunes ... 6 sábado

  // Calcular el lunes de esta semana

  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(today);

  monday.setDate(today.getDate() + diffToMonday);

  const saturday = new Date(monday);

  saturday.setDate(monday.getDate() + 5);

  return {

    start: toLocalYYYYMMDD(monday),

    end: toLocalYYYYMMDD(saturday),

  };

};

  // Helpers de fechas

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

  const getFirstDayOfMonth = (year, month) => {

    const day = new Date(year, month, 1).getDay();

    return day === 0 ? 6 : day - 1; // Ajuste para que Lunes sea 0

  };



  // Fetch inicial de pagos y paquetes

  React.useEffect(() => {

    if (!db || !appId || !student?.id) {

      setCurrentMonthUnpaidPackages([]);

      setNextMonthPackage(null);

      setUnpaidClasses([]);

      setBlockedSlots([]); // Resetear bloqueos

      return;

    }

    // ... (Tu lógica existente de paquetes impagos se mantiene igual)

    const pCol = fsCollection(db, `artifacts/${appId}/payments`);

    const qPay = query(pCol, where("studentId", "==", student.id), where("paymentMethod", "==", "monthly_package_payment"), where("isPaidForPackage", "==", false));

    

    const unsubPay = onSnapshot(qPay, (snap) => {

      const allUnpaidPackages = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));

      // ... (Lógica de filtrado de paquetes existente se mantiene igual) ...

      const now = new Date();

      const currentYear = now.getFullYear();

      const currentMonth = now.getMonth();

      const currentPackages = [];

      let futurePackage = null;

      allUnpaidPackages.forEach(pkg => {

          if (!pkg.periodStartDate) return;

          const pkgDate = new Date(pkg.periodStartDate + 'T12:00:00');

          const pkgYear = pkgDate.getFullYear();

          const pkgMonth = pkgDate.getMonth();

          if (pkgYear < currentYear || (pkgYear === currentYear && pkgMonth < currentMonth)) {

              currentPackages.push(pkg);

          } else if (pkgYear === currentYear && pkgMonth === currentMonth) {

              currentPackages.push(pkg);

          } else if ((pkgYear === currentYear && pkgMonth === currentMonth + 1) || (pkgYear === currentYear + 1 && currentMonth === 11 && pkgMonth === 0)) {

              if (!futurePackage || pkgDate < new Date(futurePackage.periodStartDate + 'T12:00:00')) {

                  futurePackage = pkg;

              }

          }

      });

      setCurrentMonthUnpaidPackages(currentPackages);

      setNextMonthPackage(futurePackage);

    });



    const cCol = fsCollection(db, `artifacts/${appId}/scheduledClasses`);

    const qCls = query(cCol, where("studentId", "==", student.id), where("scheduleType", "==", "single"), where("isPaid", "==", false));

    const unsubCls = onSnapshot(qCls, (snap) => {

      const classes = snap.docs.map(d => d.data() || {});

      setUnpaidClasses(classes);

    });



    // Abonos flexibles pendientes de cobro
    const qFlex = query(pCol, where("studentId", "==", student.id), where("paymentMethod", "==", "abono_flexible"), where("isPaidForPackage", "==", false));
    const unsubFlex = onSnapshot(qFlex, (snap) => {
      setUnpaidFlexCredits(snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })));
    });

    // ✅ NUEVO: Escuchar días bloqueados (Globales)

    const bCol = fsCollection(db, `artifacts/${appId}/blockedSlots`);

    const unsubBlocked = onSnapshot(bCol, (snap) => {

        const blocks = snap.docs.map(d => d.data());

        setBlockedSlots(blocks);

    });



    return () => {

      try { unsubPay(); } catch {}

      try { unsubCls(); } catch {}

      try { unsubFlex(); } catch {}

      try { unsubBlocked(); } catch {} // Limpieza del listener de bloqueos

    };

  }, [db, appId, student?.id]);



  // Calculo de totales (existente)

  React.useEffect(() => {

    const packageSum = currentMonthUnpaidPackages.reduce((sum, pkg) => sum + Number(pkg.amount ?? pkg.monto ?? pkg.total ?? 0), 0);

    const classSum = unpaidClasses.reduce((sum, cls) => sum + Number(cls.price ?? cls.amount ?? 0), 0);

    const flexSum = unpaidFlexCredits.reduce((sum, fc) => {
      const total = fc.amount || 0;
      const montoPorClase = fc.montoPorClase || (fc.clasesTotal ? Math.round(total / fc.clasesTotal) : total);
      const pending = Math.max(total - (fc.clasesPagadas || 0) * montoPorClase, 0);
      return sum + pending;
    }, 0);

    const totalBase = packageSum + classSum + flexSum;

    const aplicaRecargo = new Date().getDate() >= 9;

    const totalHoy = (totalBase > 0) ? (aplicaRecargo ? Math.round(totalBase * 1.10) : totalBase) : null;

    setPublicTotalToday(totalHoy);

  }, [currentMonthUnpaidPackages, unpaidClasses, unpaidFlexCredits]);



  const showToast = (text, kind = "success", ms = 2000) => {

    setToast({ open: true, kind, text });

    setTimeout(() => setToast({ open: false, kind, text: "" }), ms);

  };

  

  const { hasPaidThisMonth, checking: checkingPayment } = useHasPaidThisMonth(db, appId, student?.id);

  const [abonadas, setAbonadas] = React.useState(0);

  const [restantes, setRestantes] = React.useState(0);

  const onlyDigits = (s) => (s || '').replace(/\D+/g, '');

  

  const todayKey = useMemo(() => {

    const now = new Date();

    const year = now.getFullYear();

    const month = String(now.getMonth() + 1).padStart(2, '0');

    const day = String(now.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;

  }, []);

  

  const hoyStr = useMemo(() => {

      const [y, m, d] = todayKey.split("-");

      return `${d}/${m}/${y}`;

  }, [todayKey]);



  const dayLabel = (dateStr) => {

    try {

      const [y,m,d] = (dateStr||'').split('-').map(Number);

      const dt = new Date(y,(m||1)-1,(d||1));

      const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

      return `${days[dt.getDay()]} ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`;

    } catch { return dateStr; }

  };



  // Login logic (existente)

  React.useEffect(() => {

    try {

      const getParam = (name) => new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '').get(name);

      setLocalAppId(getParam('a'));

      setToken(getParam('t'));

      const present = getParam('present');
      if (present) setPendingPresent(present);

    } catch (e) { console.error(e); }
  }, []);

  // Sesión guardada: si el alumno ya inició sesión antes en este teléfono,
  // entrar directo sin pedir DNI de nuevo.
  React.useEffect(() => {
    if (!db || !appId || student || autoLoginChecked) return;
    setAutoLoginChecked(true);
    const savedId = localStorage.getItem(STUDENT_SESSION_KEY);
    if (!savedId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, `artifacts/${appId}/students`, savedId));
        if (snap.exists()) {
          const studentData = { id: snap.id, ...snap.data() };
          setStudent(studentData);
          setStatus({ step: 'confirm', msg: '' });
          registerNotifications({
            app: firebaseApp, db, auth, appId,
            studentId: studentData.id,
            vapidKey: FCM_VAPID_KEY,
            onToast: (msg, kind) => { if (kind === 'error') console.warn('[Push]', msg); },
          }).catch(() => {});
        } else {
          localStorage.removeItem(STUDENT_SESSION_KEY);
        }
      } catch (e) { console.error('Auto-login portal:', e); }
    })();

  }, [db, appId, student, autoLoginChecked]);



  const cambiarUsuario = () => {
    try { localStorage.removeItem(STUDENT_SESSION_KEY); } catch {}
    setStudent(null);
    setDniInput('');
    setAutoLoginChecked(true); // evita que el auto-login lo vuelva a meter de inmediato
  };

  const findByDni = async (dni) => {

    const qDni = query(fsCollection(db, `artifacts/${appId}/students`), where('dni', '==', dni));

    const s = await getDocs(qDni);

    if (s.empty) return null;

    const data = s.docs[0].data();

    return { id: s.docs[0].id, fullName: data.fullName || data.name || '' };

  };



  const continuar = async () => {

    if (!db || !appId) { setStatus({ step:'ok', msg:'No se pudo cargar el estudio.' }); return; }

    const dni = onlyDigits(dniInput);

    if (!dni) { setStatus({ step:'ok', msg:'Ingresá tu DNI.' }); return; return; }

    setSaving(true);

    setStatus({ step: 'ok', msg: '' });

    try {

      let st = await findByDni(dni);

      if (!st) { setStatus({ step:'ok', msg:'DNI no encontrado.' }); return; }

      const studentSnap = await getDoc(doc(db, `artifacts/${appId}/students`, st.id));

      if (studentSnap.exists()) {

        const studentData = { id: studentSnap.id, ...studentSnap.data() };
        setStudent(studentData);
        setStatus({ step: 'confirm', msg: 'Hacé clic en la clase de hoy para marcar tu presente.' });
        try { localStorage.setItem(STUDENT_SESSION_KEY, studentData.id); } catch {}

        const welcomeKey = `welcome_seen_${studentData.id}`;
        if (!localStorage.getItem(welcomeKey)) {
          setShowWelcomeModal(true);
          localStorage.setItem(welcomeKey, '1');
        }

        // Registrar para notificaciones push (silencioso, no bloquea el login)
        registerNotifications({
          app: firebaseApp, db, auth, appId,
          studentId: studentData.id,
          vapidKey: FCM_VAPID_KEY,
          onToast: (msg, kind) => { if (kind === 'error') console.warn('[Push]', msg); },
        }).catch(() => {});

      } else {

        setStatus({ step: 'ok', msg: 'Error: No se encontró el perfil del alumno.' });

      }

    } catch (err) {

      console.error("Login portal público:", err);

      setStatus({ step: 'ok', msg: 'Ocurrió un error al iniciar sesión.' });

    } finally {

      setSaving(false);

    }

  };



const saveAttendance = async (classId, status) => {

  if (!db || !appId || !student || !classId) return;

  setSaving(true);

  try {

    const clsRef = doc(db, `artifacts/${appId}/scheduledClasses/${classId}`);

    await updateDoc(clsRef, { 

      attendanceStatus: status, 

      attendanceCheckedAt: new Date(), 

      attendanceSource: 'public' 

    });

    setFrozenIds(prev => Array.from(new Set([...(prev||[]), classId])));

    showToast(`¡Asistencia marcada como ${status === 'presente' ? 'Presente' : 'Ausente'}!`, 'success', 2000);

  } catch (e) {

    console.error(e);

    showToast('No se pudo registrar. Probá de nuevo.', 'error');

  } finally {

    setSaving(false);

    setShowAttendanceOptions(false);

    setSelectedClassForAttendance(null);

  }

};



const handleClassClick = (classItem) => {

  if (saving) return;

  const isClickable = classItem.isInCurrentWeek && !isPresent(classItem.status) && !isAbsent(classItem.status);

  if (isClickable) {

    setSelectedClassForAttendance(classItem);

    setShowAttendanceOptions(true);

  } else if (classItem.isInCurrentWeek) {

    showToast('Ya registraste tu estado para esta clase.', 'info');

  }

};

  // Fetch clases del mes (existente + guardado en allMonthClasses)

  React.useEffect(() => {

    if (!db || !appId || !student?.id) return;

    const now = new Date();

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const mk = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    

    const qMonth = query(

      fsCollection(db, `artifacts/${appId}/scheduledClasses`),

      where('studentId', '==', student.id),

      where('status', '==', 'scheduled'),

      where('classDate', '>=', mk(monthStart)),

      where('classDate', '<=', mk(monthEnd))

    );



   const unsub = onSnapshot(qMonth, async (snap) => {

      try {

        const rawClasses = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));

        const weekRange = getCurrentWeekRange();

        setAllMonthClasses(rawClasses); // Guardamos todas para el calendario



        // Lógica de filtrado para las TARJETAS (existente)

     let rows = rawClasses.filter(cls => {

    // Clases pagadas → siempre se muestran

    if (cls.isPaid === true) return true;

    

    // Clases de los primeros 8 días del mes → se muestran (regla anterior)

    try {

        const classDayOfMonth = new Date(cls.classDate + 'T12:00:00Z').getUTCDate();

        if (classDayOfMonth <= 8) return true;

    } catch (e) { /* ignorar */ }

    

    // Clases dentro de la semana actual (lunes a sábado) → se muestran

    if (cls.classDate >= weekRange.start && cls.classDate <= weekRange.end) return true;

    

    return false;

});



        const normType = (t) => String(t||'').toLowerCase().includes('grup') ? 'grupal' : 'individual';

const groups = { grupal: [], individual: [], otras: [] };

for (const r of rows) {

  const g = normType(r.studentType || r.classType);

  const isInCurrentWeek = r.classDate >= weekRange.start && r.classDate <= weekRange.end;

  groups[g].push({

    id: r.id,

    date: r.classDate,

    time: r.startTime || '--:--',

    label: dayLabel(r.classDate),

    status: r.attendanceStatus || 'pending',

    isInCurrentWeek,   // ← nueva propiedad

    topicLink: r.topicLink || null,

    realType: r.classType || r.studentType || 'individual'

});

        }

        for (const k of Object.keys(groups)) {

          groups[k].sort((a,b) => (a.date||'').localeCompare(b.date||''));

        }

        setMonthlyByType(groups);

        const abon = rows.length;

        const usadas = rows.filter(r => isPresent(r.attendanceStatus) || isAbsent(r.attendanceStatus)).length;

        setAbonadas(abon);

        setRestantes(Math.max(abon - usadas, 0));

        const presentToday = rows.filter(r => r.classDate === todayKey && isPresent(r.attendanceStatus)).map(r => r.id);

        setFrozenIds(presentToday || []);

      } catch (e) { console.error('onSnapshot monthly classes', e); }

    });

    return () => unsub();

  }, [db, appId, student?.id, todayKey]);

  // Clase de hoy habilitada para marcar presente escaneando el QR de la sala.
  // (Sin restricción horaria: cualquier clase de hoy que no esté marcada.)
  const todayScannableClass = useMemo(() => {
    for (const cls of allMonthClasses) {
      if (cls.classDate !== todayKey) continue;
      if (isPresent(cls.attendanceStatus) || isAbsent(cls.attendanceStatus)) continue;
      return { id: cls.id, time: cls.startTime || '' };
    }
    return null;
  }, [allMonthClasses, todayKey]);

  // Marcar presente automáticamente cuando el alumno abre el portal desde el
  // QR de la sala (cámara nativa del teléfono → URL con ?present=CODE).
  React.useEffect(() => {
    if (!pendingPresent || presentDone) return;
    if (!student?.id) return; // todavía no logueó → esperamos a que ponga el DNI
    if (pendingPresent !== ATTENDANCE_QR_CODE) {
      setPendingPresent(null);
      showToast('El código del cartel no es válido.', 'error');
      return;
    }
    if (!todayScannableClass) {
      // Logueado pero no hay clase en la ventana horaria
      // (esperamos a que carguen las clases; si igual no hay, avisamos una vez)
      if (allMonthClasses.length > 0) {
        setPendingPresent(null);
        showToast('No tenés una clase ahora para marcar presente.', 'info');
      }
      return;
    }
    setPresentDone(true);
    setPendingPresent(null);
    saveAttendance(todayScannableClass.id, 'presente');
    setPresentSuccess(true);
  }, [pendingPresent, presentDone, student?.id, todayScannableClass, allMonthClasses.length]);

// Abrir popup de eventos al iniciar sesión si hay eventos no confirmados

React.useEffect(() => {

  if (!student?.id) return;

  const checkPendingEvents = async () => {

    try {

      const today = new Date().toISOString().split('T')[0];

      const q = query(

        fsCollection(db, `artifacts/${appId}/massEvents`),

        orderBy('createdAt', 'asc')

      );

      const snap = await getDocs(q);

      let hasPending = false;

      for (const docSnap of snap.docs) {

        const eventId = docSnap.id;

        // Cargar opciones del evento

        const optionsSnap = await getDocs(fsCollection(db, `artifacts/${appId}/massEvents/${eventId}/options`));

        // Verificar si hay alguna opción con fecha >= hoy

        const hasFutureOption = optionsSnap.docs.some(optDoc => {

          const opt = optDoc.data();

          return opt.date >= today;

        });

        if (!hasFutureOption) continue;

        

        const attendeeRef = doc(db, `artifacts/${appId}/massEvents/${eventId}/attendees/${student.id}`);

        const attendeeSnap = await getDoc(attendeeRef);

        // ✅ SOLO considerar pendiente si el alumno FUE ASIGNADO al evento (existe attendee) Y no confirmó

        if (attendeeSnap.exists() && attendeeSnap.data().confirmed !== true) {

          hasPending = true;

          break;

        }

      }

      if (hasPending) setShowEventPopup(true);

    } catch (e) {

      console.warn("Error checking pending events", e);

    }

  };

  checkPendingEvents();

}, [student, db, appId]);

const renderCalendarGrid = () => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();

  // Construir semanas del mes
  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday=0

  const allDays = [];
  for (let i = 0; i < startOffset; i++) allDays.push(null); // blanks
  for (let d = 1; d <= lastDay.getDate(); d++) allDays.push(d);
  while (allDays.length % 7 !== 0) allDays.push(null);

  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));

  const monthLabel = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const DAY_NAMES  = ['L','M','M','J','V','S','D'];

  return (
    <div className="mb-4">
      {/* Header */}
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 capitalize">{monthLabel}</p>

      {/* Encabezados de columna */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-gray-300">{d}</div>
        ))}
      </div>

      {/* Semanas */}
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => {
              if (!day) return <div key={di}/>;

              const dateStr  = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const cls      = allMonthClasses.find(c => c.classDate === dateStr);
              const blocked  = blockedSlots.find(b => b.date === dateStr);
              const isToday  = dateStr === todayKey;
              const present  = cls && isPresent(cls.attendanceStatus);
              const absent   = cls && isAbsent(cls.attendanceStatus);
              const hasClass = !!cls && !blocked;

              // Días sin clase y sin hoy → número muy tenue
              if (!hasClass && !isToday && !blocked) {
                return (
                  <div key={di} className="flex items-center justify-center" style={{ height: 32 }}>
                    <span className="text-[11px] text-gray-200 select-none">{day}</span>
                  </div>
                );
              }

              return (
                <div key={di} className="flex items-center justify-center" style={{ height: 32 }}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold select-none
                    ${blocked  ? 'bg-rose-100 text-rose-400 ring-1 ring-rose-200' :
                      present  ? 'bg-green-500 text-white shadow-sm' :
                      absent   ? 'bg-red-400   text-white shadow-sm' :
                      isToday  ? 'bg-rose-600  text-white shadow-sm ring-2 ring-rose-300' :
                      hasClass ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' :
                      'bg-gray-100 text-gray-500'}`}>
                    {day}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Leyenda compacta */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {[
          { color: 'bg-green-500', label: 'Presente' },
          { color: 'bg-amber-200 ring-1 ring-amber-300', label: 'Clase' },
          { color: 'bg-red-400', label: 'Ausente' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={`w-2.5 h-2.5 rounded-full ${l.color}`}/>
            <span className="text-[10px] text-gray-400">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

};

  const mainCardClasses = hasNewReceipt ? "border-amber-300 ring-2 ring-amber-300 bg-amber-50" : "border-rose-50";

  const showGracePeriodNotice = !hasPaidThisMonth && (new Date().getDate() <= 8) && (monthlyByType.individual?.length > 0 || monthlyByType.grupal?.length > 0);



  return (
    <>
      {/* Banner de actualización (fijo arriba de todo) */}
      <div className="fixed top-0 left-0 right-0 z-[1000]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <UpdateBanner />
      </div>

      {/* Pull-to-refresh overlay */}
      {refreshing && (
        <div className="fixed inset-0 z-[999] bg-white/95 flex flex-col items-center justify-center gap-3">
          <svg className="w-10 h-10 text-rose-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          <p className="text-sm text-gray-500 font-medium">Actualizando...</p>
        </div>
      )}
      {(pullDist > 10 || refreshing) && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center"
          style={{ transform: `translateY(${refreshing ? 48 : pullDist - 12}px)`, transition: refreshing ? 'transform 0.2s' : 'none' }}>
          <div className="w-9 h-9 rounded-full bg-white shadow-lg border border-rose-100 flex items-center justify-center">
            <svg className={`w-5 h-5 text-rose-500 ${refreshing ? 'animate-spin' : ''}`}
              style={{ transform: refreshing ? '' : `rotate(${pullDist * 3.5}deg)` }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </div>
        </div>
      )}

      {/* ══ LOGIN ══ */}
      {!student && !refreshing && (
        <div className="min-h-screen bg-gradient-to-br from-rose-950 via-rose-800 to-pink-700 flex flex-col items-center justify-center p-6"
          style={{ paddingTop: 'max(1.5rem, calc(env(safe-area-inset-top) + 1rem))' }}>
          <div className="w-full max-w-sm">
            <div className="text-center mb-8">
              <img src={LOGO_URL} alt="Logo" className="h-20 w-auto mx-auto mb-4" style={{ filter: 'brightness(0) invert(1)', opacity: 0.9 }} onError={e => { e.currentTarget.style.display = 'none'; }} />
              <h1 className="text-white font-black text-2xl tracking-tight">Estudio de Canto</h1>
              <p className="text-rose-300 text-sm mt-1">Sandra Paloschi</p>
            </div>
            <div className="bg-white rounded-3xl p-7 shadow-2xl shadow-rose-900/30">
              <h2 className="text-gray-900 font-black text-lg mb-0.5">Bienvenida/o</h2>
              <p className="text-gray-400 text-sm mb-6">Ingresá tu DNI para acceder</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Número de DNI</label>
                  <input
                    id="dni-input"
                    value={dniInput}
                    onChange={(e) => setDniInput(onlyDigits(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && continuar()}
                    placeholder="Ej: 38123456"
                    inputMode="numeric"
                    autoComplete="off"
                    className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none text-gray-900 font-medium transition text-xl text-center tracking-widest"
                  />
                </div>
                {status?.msg && status.msg !== 'Completá tu DNI para ingresar.' && (
                  <p className="text-red-500 text-sm font-medium">{status.msg}</p>
                )}
                <button type="button" onClick={continuar} disabled={saving}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-500 text-white font-bold text-base shadow-lg hover:shadow-rose-300/40 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving
                    ? <><svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Buscando...</>
                    : <>Entrar <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg></>
                  }
                </button>
                <div className="flex flex-col items-center gap-1 pt-1">
                  <UpdateButton className="!opacity-20 hover:!opacity-60 transition-opacity" />
                  <p className="text-[10px] text-gray-300">Versión {APP_BUILD}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ APP ══ */}
      {student && !student.photoURL && (
        <div className="min-h-screen bg-gradient-to-br from-rose-950 via-rose-800 to-pink-700 flex items-center justify-center px-4"
          style={{ paddingTop: 'max(1.5rem, calc(env(safe-area-inset-top) + 1rem))' }}>
          <div className="bg-white rounded-3xl shadow-xl p-6 max-w-sm w-full text-center space-y-3">
            <p className="text-3xl">📸</p>
            <h2 className="font-black text-lg text-gray-900">¡Sumá tu foto de perfil!</h2>
            <p className="text-sm text-gray-500">Para continuar necesitamos una foto tuya — así Sandra puede reconocerte. Es obligatoria para usar la app.</p>
            <ProfilePictureUploader db={db} appId={appId} student={student} setStudent={setStudent} />
            <button onClick={cambiarUsuario}
              className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition">Cambiar usuario</button>
          </div>
        </div>
      )}

      {student && student.photoURL && (
        <div className="min-h-screen bg-gray-50 font-body text-gray-900 flex flex-col">

          {/* Header */}
          <div className="bg-gradient-to-r from-rose-700 to-pink-600 px-4 pb-3 flex-shrink-0"
            style={{ paddingTop: 'max(3rem, calc(env(safe-area-inset-top) + 0.75rem))' }}>
            <div className="flex items-center gap-3">
              <UpdateButton className="!bg-white/10 !border-white/20 !text-rose-100 hover:!bg-white/20 flex-shrink-0" />
              <div className="relative flex-shrink-0 rounded-full ring-2 ring-white/70">
                <ProfilePictureUploader db={db} appId={appId} student={student} setStudent={setStudent} size="sm" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display italic text-white text-lg truncate leading-tight">{student.name}</p>
                <p className="font-ticket text-[10px] text-rose-200 tracking-[0.15em] uppercase mt-0.5">Hoy · {hoyStr}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/15">
              {hasPaidThisMonth
                ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-white/95 px-2.5 py-1 rounded-full whitespace-nowrap">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                    Al día
                  </span>
                : publicTotalToday > 0
                  ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-white/20 border border-white/30 px-2.5 py-1 rounded-full whitespace-nowrap animate-pulse">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                      Debe
                    </span>
                  : <span />}
              <button onClick={cambiarUsuario}
                className="text-[11px] font-medium text-rose-200 hover:text-white transition whitespace-nowrap flex-shrink-0">
                Cambiar usuario
              </button>
            </div>
          </div>

          {/* Tab bar debajo del header */}
          <div className="bg-white border-b border-gray-100 flex flex-shrink-0">
            {[
              { id: 'inicio',       label: 'Inicio',       d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { id: 'clases',       label: 'Clases',       d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
              { id: 'pagos',        label: 'Pagos',        d: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
              { id: 'herramientas', label: 'Herramientas', d: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z' },
              { id: 'mensajes',     label: 'Mensajes',     d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors border-b-2 ${activeTab === tab.id ? 'border-rose-500 text-rose-600' : 'border-transparent text-gray-400'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={activeTab === tab.id ? 2.5 : 1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.d}/>
                </svg>
                <span className="text-[9px] font-bold leading-none">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Contenido scrollable */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-md mx-auto px-4 py-3 space-y-3">

          {/* ════════ TAB: INICIO ════════ */}
          {activeTab === 'inicio' && (() => {
            const aplicaRecargo = new Date().getDate() >= 9;
            const allClasses = [...(monthlyByType.individual || []), ...(monthlyByType.grupal || []), ...(monthlyByType.otras || [])];
            const now = new Date();
            const next = allClasses
              .map(c => { try { return { ...c, __dt: new Date(`${c.date}T${c.time || '00:00'}:00`) }; } catch { return null; } })
              .filter(Boolean).filter(c => c.__dt > now && !isPresent(c.status) && !isAbsent(c.status))
              .sort((a, b) => a.__dt - b.__dt)[0];
            const totalMes = allClasses.length;
            const asistidas = allClasses.filter(c => isPresent(c.status)).length;
            const ausentes  = allClasses.filter(c => isAbsent(c.status)).length;
            const pct = totalMes > 0 ? Math.round((asistidas / totalMes) * 100) : 0;
            const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
            const sinMarcar = allClasses.filter(c => { try { return new Date(`${c.date}T00:00:00`) < hoy && !isPresent(c.status) && !isAbsent(c.status); } catch { return false; } });

            const showPaid = hasPaidThisMonth;
            const showDue = !hasPaidThisMonth && publicTotalToday > 0;
            const showCta = publicTotalToday > 0 || student.manualReceiptEnabled;
            const showNext = !!next;
            const showStats = totalMes > 0;
            const showSinMarcar = sinMarcar.length > 0;
            const showScanCta = !!todayScannableClass;
            const hayAlgo = showPaid || showDue || showCta || showNext || showStats || showSinMarcar || showScanCta;

            let isToday = false, isTomorrow = false, ds = '', label = null;
            if (next) {
              isToday = next.date === todayKey;
              isTomorrow = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return toLocalYYYYMMDD(t) === next.date; })();
              ds = next.__dt.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
              label = isToday ? '¡Hoy!' : isTomorrow ? 'Mañana' : null;
            }

            const eqBars = allClasses
              .slice()
              .sort((a, b) => a.__dt - b.__dt)
              .map(c => isPresent(c.status) ? 1 : isAbsent(c.status) ? 0.32 : 0.14);

            return <div className="space-y-3">

              {/* CTA: marcar presente escaneando el QR de la sala (se abre en una pestaña aparte: en iOS, la cámara dentro de la app instalada en pantalla de inicio no funciona) */}
              {showScanCta && (
                <div className="space-y-1.5">
                  <a href={`${window.location.origin}/escanear-presente.html`}
                    onClick={(e) => { e.preventDefault(); openInRealBrowser('/escanear-presente.html'); }}
                    className="w-full block rounded-xl p-4 shadow-sm bg-gradient-to-br from-green-600 to-emerald-500 text-left active:scale-[0.98] transition">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <rect x="3" y="7" width="18" height="13" rx="2.5"/><circle cx="12" cy="13.5" r="3.3"/><path strokeLinecap="round" d="M8 7l1.3-2h5.4L16 7"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">Escanear QR para dar presente</p>
                        <p className="text-green-100 text-xs mt-0.5">Tu clase de hoy es a las {todayScannableClass.time} hs</p>
                      </div>
                      <svg className="w-4 h-4 text-white/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                      </svg>
                    </div>
                  </a>
                  <p className="text-[10px] text-gray-400 text-center px-2">Si no se abre la cámara, mantené presionado este botón y elegí "Abrir en Safari".</p>
                </div>
              )}

              {/* Banner pago */}
              {showPaid && (
                <div className="bg-white rounded-xl border border-green-100 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-[18px] h-[18px] text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <div><p className="font-display font-semibold text-green-800 text-sm">Cuota al día</p><p className="text-xs text-green-600 mt-0.5">Tu pago de este mes fue recibido. Gracias.</p></div>
                </div>
              )}
              {showDue && (
                <div className={`rounded-xl p-4 flex items-center gap-3 ${aplicaRecargo ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${aplicaRecargo ? 'bg-red-100' : 'bg-amber-100'}`}>
                    <svg className={`w-[18px] h-[18px] ${aplicaRecargo ? 'text-red-600' : 'text-amber-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                  </div>
                  <div>
                    <p className={`font-display font-semibold text-sm ${aplicaRecargo ? 'text-red-800' : 'text-amber-800'}`}>{aplicaRecargo ? 'Cuota vencida — 10% de recargo' : 'Cuota pendiente'}</p>
                    <p className={`text-xs mt-0.5 ${aplicaRecargo ? 'text-red-700' : 'text-amber-700'}`}>Total hoy: <strong className="font-ticket">${new Intl.NumberFormat('es-AR').format(publicTotalToday)}</strong></p>
                  </div>
                </div>
              )}

              {/* CTA pago */}
              {showCta && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="bg-rose-600 text-white px-4 py-2.5 flex items-center gap-2">
                    <svg className="w-4 h-4 text-rose-100" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path strokeLinecap="round" d="M2 10h20"/></svg>
                    <p className="font-display font-semibold text-sm">Pagar mi cuota</p>
                  </div>
                  <MinimalReceiptUpload appId={appId} student={student} totalHoy={publicTotalToday} />
                </div>
              )}

              {/* Próxima clase — boleta de función */}
              {showNext && (
                <div className="relative rounded-2xl border border-gray-100 shadow-md bg-white">
                  <div className={`rounded-t-2xl px-5 pt-4 pb-5 ${isToday ? 'bg-gradient-to-r from-rose-700 to-pink-600' : 'bg-white'}`}>
                    <div className="flex items-center justify-between">
                      <p className={`font-ticket text-[10px] tracking-[0.2em] uppercase ${isToday ? 'text-rose-200' : 'text-gray-400'}`}>
                        Próxima clase{label ? ` · ${label}` : ''}
                      </p>
                      <svg className={`w-4 h-4 flex-shrink-0 ${isToday ? 'text-rose-200' : 'text-gray-300'}`} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                        <circle cx="9" cy="18" r="3"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 18V4l7 2v12"/>
                      </svg>
                    </div>
                    <p className={`font-display italic text-2xl mt-1.5 capitalize leading-snug ${isToday ? 'text-white' : 'text-gray-900'}`}>{ds}</p>
                  </div>

                  {/* Perforación */}
                  <div className="relative">
                    <div className="absolute -left-[9px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-gray-50 border border-gray-100"/>
                    <div className="absolute -right-[9px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full bg-gray-50 border border-gray-100"/>
                    <div className="mx-5 border-t border-dashed border-gray-200"/>
                  </div>

                  <div className="rounded-b-2xl px-5 py-3 flex items-center justify-between bg-white">
                    <p className="font-ticket text-lg font-semibold text-gray-900 tracking-wide">{next.time}<span className="text-gray-400 text-xs font-body ml-1">hs</span></p>
                    <div className="text-right">
                      <p className="font-ticket text-[9px] text-gray-400 uppercase tracking-[0.15em]">Estudio de Canto</p>
                      <p className="text-xs text-rose-600">Sandra Paloschi</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Stats del mes */}
              {showStats && (
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-blue-50 rounded-lg p-3 border-b-2 border-blue-300">
                      <p className="font-ticket text-2xl font-semibold text-blue-800">{abonadas}</p>
                      <p className="text-[10px] font-semibold text-blue-600 mt-0.5 uppercase tracking-wide">Abonadas</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 border-b-2 border-green-400">
                      <p className="font-ticket text-2xl font-semibold text-green-800">{asistidas}</p>
                      <p className="text-[10px] font-semibold text-green-600 mt-0.5 uppercase tracking-wide">Asistidas</p>
                    </div>
                    <div className="bg-rose-50 rounded-lg p-3 border-b-2 border-rose-300">
                      <p className="font-ticket text-2xl font-semibold text-rose-800">{restantes}</p>
                      <p className="text-[10px] font-semibold text-rose-600 mt-0.5 uppercase tracking-wide">Restantes</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                      <span>Asistencia del mes</span>
                      <span className={`font-ticket font-semibold ${pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{pct}%</span>
                    </div>
                    {eqBars.length > 0 && (
                      <div className="flex items-end gap-[3px] h-8">
                        {eqBars.map((h, i) => (
                          <div key={i} className={`flex-1 rounded-sm ${h === 1 ? 'bg-green-500' : h < 1 && h > 0.2 ? 'bg-red-400' : 'bg-rose-100'}`} style={{ height: `${Math.max(h * 100, 10)}%` }}/>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3 text-[10px] pt-0.5">
                      {asistidas > 0 && <span className="text-green-600 font-semibold">✓ {asistidas} presente{asistidas!==1?'s':''}</span>}
                      {ausentes  > 0 && <span className="text-red-500 font-semibold">✕ {ausentes} ausente{ausentes!==1?'s':''}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Clases sin marcar */}
              {showSinMarcar && (
                <div className="bg-white rounded-xl border border-amber-200 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-[18px] h-[18px] text-amber-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path strokeLinecap="round" d="M8 9h8M8 13h5"/></svg>
                  </div>
                  <div>
                    <p className="font-display font-semibold text-amber-800 text-sm">{sinMarcar.length} clase{sinMarcar.length>1?'s':''} sin marcar</p>
                    <p className="text-xs text-amber-600">Marcalas en la pestaña Clases.</p>
                  </div>
                </div>
              )}

              {/* Estado vacío — evita que la pestaña quede en blanco */}
              {!hayAlgo && (
                checkingPayment ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
                    <div className="w-8 h-8 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin"/>
                    <p className="text-xs font-medium">Cargando tu información...</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
                    <svg className="w-7 h-7 mx-auto mb-2 text-rose-400" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24"><circle cx="9" cy="18" r="3"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 18V4l7 2v12"/></svg>
                    <p className="font-display font-semibold text-gray-700 text-sm">Todo en orden</p>
                    <p className="text-xs text-gray-400 mt-1">No tenés pagos pendientes ni clases para mostrar este mes.</p>
                  </div>
                )
              )}

            </div>;
          })()}{/* FIN INICIO */}

          {/* ════════ TAB: PAGOS ════════ */}
          {activeTab === 'pagos' && <div className="space-y-3">
            {hasPaidThisMonth ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0 text-xl">✅</div>
                <div><p className="font-bold text-green-800 text-sm">¡Cuota al día!</p><p className="text-xs text-green-600">Tu pago fue recibido.</p></div>
              </div>
            ) : publicTotalToday > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-rose-600 text-white px-4 py-2.5 flex items-center gap-2">
                  <span>💳</span><p className="font-bold text-sm">Pagar mi cuota</p>
                </div>
                <MinimalReceiptUpload appId={appId} student={student} totalHoy={publicTotalToday} />
              </div>
            ) : null}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Historial de pagos</p>
              <PublicPaymentsList db={db} appId={appId} student={student} />
            </div>
          </div>}{/* FIN PAGOS */}

          {/* ════════ TAB: MENSAJES ════════ */}
          {activeTab === 'mensajes' && <div className="space-y-3">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <PublicMessages db={db} appId={appId} student={student} />
            </div>
            <SocialMediaLinks />
          </div>}{/* FIN MENSAJES */}

          {/* ════════ TAB: HERRAMIENTAS ════════ */}
          {activeTab === 'herramientas' && <div className="space-y-2">
            <StudentTools db={db} appId={appId} student={student} />
          </div>}{/* FIN HERRAMIENTAS */}

          {/* ════════ TAB: CLASES ════════ */}
          {activeTab === 'clases' && <div className="space-y-3">

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => setOpenHist(p => !p)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition text-left">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-base">📄</div>
                  <span className="font-semibold text-sm text-gray-800">Historial de pagos</span>
                </div>
                <svg className={`w-4 h-4 text-gray-300 transition-transform ${openHist ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
              </button>
              {openHist && <div className="p-3 border-t border-gray-100"><PublicPaymentsList db={db} appId={appId} student={student} /></div>}
            </div>

            <GracePeriodNotice shouldShow={showGracePeriodNotice} />
            <NextMonthInfoBox pkg={nextMonthPackage} />

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                {renderCalendarGrid()}



                {monthlyByType.individual?.length > 0 && (() => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const classes = monthlyByType.individual;

                  // Agrupar por semana
                  const weeks = [];
                  let currentWeek = null;
                  classes.forEach(c => {
                    const dt = new Date(c.date + 'T00:00:00');
                    const weekStart = new Date(dt);
                    weekStart.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
                    const wk = weekStart.toISOString().slice(0, 10);
                    if (!currentWeek || currentWeek.key !== wk) {
                      currentWeek = { key: wk, label: weekStart.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }), classes: [] };
                      weeks.push(currentWeek);
                    }
                    currentWeek.classes.push(c);
                  });

                  return (
                    <div className="mt-4">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                        Tus clases · {classes.length} este mes
                      </p>
                      <div className="space-y-4">
                        {weeks.map(wk => (
                          <div key={wk.key}>
                            <p className="text-[10px] font-bold text-gray-300 uppercase tracking-wider mb-1.5 pl-1">
                              Semana del {wk.label}
                            </p>
                            <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                              {wk.classes.map(c => {
                                const present  = isPresent(c.status);
                                const absent   = isAbsent(c.status);
                                const isWeek   = c.isInCurrentWeek;
                                const isPast   = new Date(c.date + 'T00:00:00') < today;
                                const canMark  = isWeek && !present && !absent;
                                const tipo     = (c.realType || '').toLowerCase();
                                const typeLabel = tipo.includes('coral') ? 'Coral' : tipo.includes('grup') ? 'Grupal' : 'Individual';

                                return (
                                  <button key={c.id} onClick={() => handleClassClick(c)} disabled={!canMark && !isWeek}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                                      ${present ? 'bg-green-50' : absent ? 'bg-red-50' : canMark ? 'bg-amber-50 hover:bg-amber-100' : 'bg-white hover:bg-gray-50'}`}>
                                    {/* Dot status */}
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0
                                      ${present ? 'bg-green-500' : absent ? 'bg-red-400' : canMark ? 'bg-amber-400 animate-pulse' : 'bg-gray-200'}`}/>
                                    {/* Date + type */}
                                    <div className="flex-1 min-w-0">
                                      <span className={`font-bold text-sm ${present ? 'text-green-800' : absent ? 'text-red-700' : canMark ? 'text-amber-900' : 'text-gray-700'}`}>
                                        {c.label}
                                      </span>
                                      <span className={`ml-2 text-xs ${present ? 'text-green-600' : absent ? 'text-red-500' : 'text-gray-400'}`}>
                                        {c.time} hs · {typeLabel}
                                      </span>
                                    </div>
                                    {/* Status tag */}
                                    {present && <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">✓ Presente</span>}
                                    {absent  && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full flex-shrink-0">✗ Ausente</span>}
                                    {canMark && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex-shrink-0">Marcar →</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

            </div>



            <PublicTicketsSection db={db} appId={appId} student={student} />

      <EventConfirmationPopup

  isOpen={showEventPopup}

  onClose={() => setShowEventPopup(false)}

  db={db}

  appId={appId}

  student={student}

  showMessage={showToast}

/>

            

      {/* Matrícula anual - solo en diciembre */}
{new Date().getMonth() === 11 && (
  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
    <p className="font-semibold text-amber-900 text-sm">📌 Matrícula Anual</p>
    <p className="text-xs text-amber-800 mt-1">Para reservar tu vacante del año entrante se abona una matrícula única del 50% de tu cuota mensual.</p>
  </div>
)}

<ConfirmedEventsSection db={db} appId={appId} student={student} />

          </div>}{/* FIN CLASES */}

            </div>{/* closes max-w-md */}
          </div>{/* closes overflow-y-auto */}
        </div>
      )}

      <Toast open={toast.open} kind={toast.kind}>{toast.text}</Toast>

          <Modal isOpen={showWelcomeModal} onClose={() => setShowWelcomeModal(false)} size="sm">
            <div className="bg-white rounded-xl overflow-hidden">

              {/* Header con gradiente y logo blanco */}
              <div className="bg-gradient-to-br from-rose-700 to-pink-500 px-6 py-7 text-center">
                <img
                  src={LOGO_URL}
                  alt="Logo"
                  className="h-16 w-auto mx-auto mb-3"
                  style={{ filter: 'brightness(0) invert(1)' }}
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
                <h3 className="text-white font-black text-2xl">¡Bienvenida/o!</h3>
                <p className="text-rose-100 text-sm mt-1">Estudio de Canto Sandra Paloschi</p>
              </div>

              {/* Contenido */}
              <div className="p-5 space-y-3">
                <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-100 rounded-xl">
                  <span className="text-xl flex-shrink-0 mt-0.5">✅</span>
                  <p className="text-sm text-rose-900 font-medium">
                    Registrá tu asistencia en las clases de esta semana tocando cada clase
                  </p>
                </div>
                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <span className="text-xl flex-shrink-0 mt-0.5">💰</span>
                  <p className="text-sm text-amber-800">
                    La cuota se ajusta <strong>trimestralmente</strong>. Consultá el monto vigente antes de pagar.
                  </p>
                </div>
                <button
                  onClick={() => setShowWelcomeModal(false)}
                  className="w-full py-3 bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-700 hover:to-pink-600 text-white font-bold rounded-xl shadow-md transition active:scale-95"
                >
                  Entendido ✓
                </button>
              </div>

            </div>
          </Modal>

      <Modal isOpen={presentSuccess} onClose={() => setPresentSuccess(false)} size="sm">
        <div className="p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4 text-4xl">✅</div>
          <h3 className="text-xl font-black text-green-800 mb-2">¡Presente registrado!</h3>
          <p className="text-sm text-gray-600 mb-6">Tu asistencia a la clase de hoy quedó marcada. ¡Que tengas una linda clase! 🎵</p>
          <button onClick={() => setPresentSuccess(false)}
            className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition">
            Listo
          </button>
        </div>
      </Modal>

      <Modal isOpen={showAttendanceOptions} onClose={() => setShowAttendanceOptions(false)} size="sm">

  <div className="p-6 text-center">

    <h3 className="text-lg font-bold text-gray-900 mb-4">

      Marcar asistencia

    </h3>

    <p className="text-sm text-gray-600 mb-6">

      Clase del {selectedClassForAttendance?.label} a las {selectedClassForAttendance?.time} hs

    </p>

    <div className="flex flex-col gap-3">

      <button

        onClick={() => saveAttendance(selectedClassForAttendance?.id, 'presente')}

        className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl shadow-sm flex items-center justify-center gap-2"

      >

        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">

          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />

        </svg>

        ✅ Presente

      </button>

      <button

        onClick={() => saveAttendance(selectedClassForAttendance?.id, 'ausente')}

        className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl shadow-sm flex items-center justify-center gap-2"

      >

        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">

          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />

        </svg>

        ❌ Ausente

      </button>

      <button

        onClick={() => setShowAttendanceOptions(false)}

        className="mt-2 text-sm text-gray-500 hover:text-gray-700"

      >

        Cancelar

      </button>

    </div>

  </div>

</Modal>

    </>
  );

};









// ▼▼▼ REEMPLAZÁ TU COMPONENTE StudentDetailsModal CON ESTA VERSIÓN CORREGIDA ▼▼▼


