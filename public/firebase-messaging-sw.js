// Service Worker para notificaciones push en background (FCM)
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyA9WC2jx3iCDkN24gwrN4ylCn5bvgeI1nA",
  authDomain:        "nuevaclase-135ec.firebaseapp.com",
  projectId:         "nuevaclase-135ec",
  storageBucket:     "nuevaclase-135ec.appspot.com",
  messagingSenderId: "786390581865",
  appId:             "1:786390581865:web:ed47531cf7415ae5ca18f8",
});

const messaging = firebase.messaging();

// Notificación cuando la app está en BACKGROUND o CERRADA
messaging.onBackgroundMessage((payload) => {
  const title  = payload.notification?.title || payload.data?.title || 'Estudio de Canto Sandra Paloschi';
  const body   = payload.notification?.body  || payload.data?.body || '';
  // Prioridad: data.url > fcmOptions.link (viene en payload.fcmOptions) > public portal
  const url = payload.data?.url
    || payload.fcmOptions?.link
    || 'https://estudiosandrapaloschi.web.app/#/checkin?a=1:786390581865:web:ed47531cf7415ae5ca18f8';

  // El recordatorio de clase ("tenés clase mañana") trae botones para
  // responder ahí mismo, sin abrir la app y buscar la clase a mano.
  const isClassReminder = payload.data?.type === 'classReminder' && !!payload.data?.classId;

  self.registration.showNotification(title, {
    body,
    icon:    '/icon-192.png',
    badge:   '/icon-32.png',
    data:    { url, classId: payload.data?.classId || '', studentId: payload.data?.studentId || '' },
    vibrate: [200, 100, 200],
    tag:     'estudio-sp',
    actions: isClassReminder ? [
      { action: 'presente', title: '✅ Voy' },
      { action: 'ausente',  title: '❌ No puedo' },
    ] : undefined,
  });
});

// Al hacer click en la notificación (o en uno de sus botones) → navegar a
// la URL correcta, agregando quickAttendance/classId si tocó un botón para
// que la app registre la asistencia automáticamente al abrir.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const baseUrl = data.url
    || 'https://estudiosandrapaloschi.web.app/#/checkin?a=1:786390581865:web:ed47531cf7415ae5ca18f8';

  let targetUrl = baseUrl;
  if ((event.action === 'presente' || event.action === 'ausente') && data.classId) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    targetUrl = `${baseUrl}${sep}quickAttendance=${event.action}&classId=${encodeURIComponent(data.classId)}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // 1. Buscar ventana exacta ya en esa URL
      const exact = wins.find(c => c.url === targetUrl);
      if (exact) return exact.focus();

      // 2. Buscar ventana del mismo origen con navigate
      const sameOrigin = wins.find(c => c.url.startsWith(self.location.origin) && 'navigate' in c);
      if (sameOrigin) return sameOrigin.navigate(targetUrl).then(w => w && w.focus());

      // 3. Abrir nueva ventana
      return clients.openWindow(targetUrl);
    })
  );
});
