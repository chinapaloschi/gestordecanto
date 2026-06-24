export const ASSET_VER = "9";

// Versión visible de la app (para confirmar que el alumno tiene la última).
// Subir este número en cada deploy del portal.
export const APP_BUILD = "v30";

// ─── QR de presente en sala ────────────────────────────────────────────────
// Código fijo impreso en el cartel de la sala. Leerlo desde el portal público
// marca la asistencia del alumno a la clase de hoy (dentro de la ventana horaria).
export const ATTENDANCE_QR_CODE = "SANDRA-PALOSCHI-SALA-PRESENTE";

// ─── FCM Push Notifications ───────────────────────────────────────────────────
// Para obtener la VAPID key:
// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair
export const FCM_VAPID_KEY = "BOwrhXD8BXTUuSA5vkEWh2F3kSCOOdWNAmtlbh-PYdlrdrO9O8be81KoO9QfrcI49IHbrkKOnB1051eFK2Fvh-E";

// ─── Rutas hash ───────────────────────────────────────────────────────────────
export const ROUTES = {
  CATALOGO:    '#/catalogo',
  MUESTRAS:    '#/muestras',
  PORTAL:      '#/portal',
  CHECKIN:     '#/checkin',
  TICKET:      '#/ticket',
  LENCERIA:    '#/lenceria',
  INSCRIPCION: '#/inscripcion',
  FINANZAS:    '#/finanzas',
};

// ─── Colecciones Firestore (relativas a artifacts/${appId}/) ──────────────────
export const COLLECTIONS = {
  STUDENTS:          'students',
  PAYMENTS:          'payments',
  SCHEDULED_CLASSES: 'scheduledClasses',
  EVENTS:            'events',
  BLOCKED_SLOTS:     'blockedSlots',
  MASS_EVENTS:       'massEvents',
  LENCERIA_STOCK:    'lenceriaStock',
  LENCERIA_VENTAS:   'lenceriaVentas',
  PIN_INDEX:         'pinIndex',
  STUDENT_TICKETS:   'studentTickets',
  USERS:             'users',
  AVAILABLE_SLOTS:   'availableSlots',
  TRIAL_REQUESTS:    'trialRequests',

  // Sub-colecciones
  SUB: {
    RECEIPTS:      'receipts',
    PAYMENTS:      'payments',
    REPERTOIRE:    'repertoire',
    TICKETS:       'tickets',
    DEVICE_TOKENS: 'deviceTokens',
    ENTRIES:       'entries',
    OPTIONS:       'options',
    ATTENDEES:     'attendees',
  },
};

// ─── Helpers de paths ─────────────────────────────────────────────────────────
export const paths = {
  root:             (appId)                        => `artifacts/${appId}`,
  students:         (appId)                        => `artifacts/${appId}/${COLLECTIONS.STUDENTS}`,
  student:          (appId, studentId)             => `artifacts/${appId}/${COLLECTIONS.STUDENTS}/${studentId}`,
  studentPayments:  (appId, studentId)             => `artifacts/${appId}/${COLLECTIONS.STUDENTS}/${studentId}/${COLLECTIONS.SUB.PAYMENTS}`,
  studentReceipts:  (appId, studentId)             => `artifacts/${appId}/${COLLECTIONS.STUDENTS}/${studentId}/${COLLECTIONS.SUB.RECEIPTS}`,
  studentRepertoire:(appId, studentId)             => `artifacts/${appId}/${COLLECTIONS.STUDENTS}/${studentId}/${COLLECTIONS.SUB.REPERTOIRE}`,
  payments:         (appId)                        => `artifacts/${appId}/${COLLECTIONS.PAYMENTS}`,
  scheduledClasses: (appId)                        => `artifacts/${appId}/${COLLECTIONS.SCHEDULED_CLASSES}`,
  events:           (appId)                        => `artifacts/${appId}/${COLLECTIONS.EVENTS}`,
  eventTickets:     (appId, eventId)               => `artifacts/${appId}/${COLLECTIONS.EVENTS}/${eventId}/${COLLECTIONS.SUB.TICKETS}`,
  studentTickets:   (appId, studentId)             => `artifacts/${appId}/${COLLECTIONS.STUDENT_TICKETS}/${studentId}/${COLLECTIONS.SUB.TICKETS}`,
  lenceriaStock:    (appId)                        => `artifacts/${appId}/${COLLECTIONS.LENCERIA_STOCK}`,
  lenceriaVentas:   (appId)                        => `artifacts/${appId}/${COLLECTIONS.LENCERIA_VENTAS}`,
  pinIndex:         (appId, pin, studentId)        => `artifacts/${appId}/${COLLECTIONS.PIN_INDEX}/${pin}/entries/${studentId}`,
  massEvents:       (appId)                        => `artifacts/${appId}/${COLLECTIONS.MASS_EVENTS}`,
  massEventOptions: (appId, eventId)               => `artifacts/${appId}/${COLLECTIONS.MASS_EVENTS}/${eventId}/${COLLECTIONS.SUB.OPTIONS}`,
  massEventAttendees:(appId, eventId)              => `artifacts/${appId}/${COLLECTIONS.MASS_EVENTS}/${eventId}/${COLLECTIONS.SUB.ATTENDEES}`,
  blockedSlots:     (appId)                        => `artifacts/${appId}/${COLLECTIONS.BLOCKED_SLOTS}`,
  availableSlots:   (appId)                        => `artifacts/${appId}/${COLLECTIONS.AVAILABLE_SLOTS}`,
  trialRequests:    (appId)                        => `artifacts/${appId}/${COLLECTIONS.TRIAL_REQUESTS}`,
  ticket:           (appId, eventId, ticketId)     => `artifacts/${appId}/${COLLECTIONS.EVENTS}/${eventId}/${COLLECTIONS.SUB.TICKETS}/${ticketId}`,
  deviceToken:      (appId, studentId, token)      => `artifacts/${appId}/${COLLECTIONS.STUDENTS}/${studentId}/${COLLECTIONS.SUB.DEVICE_TOKENS}/${token}`,
  userDeviceToken:  (appId, uid, token)            => `artifacts/${appId}/${COLLECTIONS.USERS}/${uid}/${COLLECTIONS.SUB.DEVICE_TOKENS}/${token}`,
};

// ─── URL de ticket para QR ────────────────────────────────────────────────────
export const ticketUrl = (appId, eventId, ticketId) =>
  `${location.origin}/${ROUTES.TICKET}?e=${encodeURIComponent(eventId)}&t=${encodeURIComponent(ticketId)}&a=${encodeURIComponent(appId)}`;

export const checkinBaseUrl = () =>
  `${window.location.origin}/${ROUTES.CHECKIN}`;
