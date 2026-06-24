// Registro de notificaciones para Web/PWA (admin y alumnos)
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

// Guarda el token en una subcolección por alumno o por usuario admin.
export async function registerNotifications({
  app, db, auth, appId, studentId, vapidKey,
  onToast,
  _adminOverridePath, // si se pasa, guarda el token en esta colección (para admin)
}) {
  try {
    const supported = await isSupported();
    if (!supported) { onToast?.("Este navegador no soporta notificaciones push.", "warn"); return { ok:false, reason:"unsupported" }; }

    if (!("Notification" in window)) { onToast?.("El navegador no tiene API de notificaciones.", "warn"); return { ok:false, reason:"no-notification-api" }; }

    // 1) Pedir permiso
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { onToast?.("Permiso de notificaciones denegado.", "warn"); return { ok:false, reason:"denied" }; }

    // 2) Obtener token WebPush (usa SW por defecto: /firebase-messaging-sw.js)
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey });
    if (!token) { onToast?.("No se pudo obtener el token de notificaciones.", "error"); return { ok:false, reason:"no-token" }; }

    // 3) Elegir dónde guardar
    let refPath;
    if (_adminOverridePath) {
      // Admin: guarda en colección especial para que el trigger la encuentre
      refPath = `${_adminOverridePath}/${token}`;
    } else if (studentId) {
      refPath = `artifacts/${appId}/students/${studentId}/deviceTokens/${token}`;
    } else if (auth?.currentUser?.uid) {
      refPath = `artifacts/${appId}/users/${auth.currentUser.uid}/deviceTokens/${token}`;
    } else {
      return { ok:true, token, persisted:false };
    }

    // 4) Persistir
    await setDoc(doc(db, refPath), {
      token,
      platform: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "iOS" : (/Android/i.test(navigator.userAgent) ? "Android" : "Web"),
      ua: navigator.userAgent || "",
      updatedAt: serverTimestamp(),
      enabled: true
    }, { merge: true });

    // 5) Mensajes con la app abierta (foreground) — mostrar como toast
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.title || "Nuevo mensaje";
      const body  = payload.notification?.body  || payload.data?.body  || "";
      // En foreground el service worker no muestra notificación del sistema, usamos toast
      onToast?.(`${title} — ${body}`, "info");
    });

    onToast?.("Notificaciones activadas", "success");
    return { ok:true, token, persisted:true };
  } catch (e) {
    console.error("[registerNotifications] error", e);
    onToast?.("Error al activar notificaciones: " + (e?.message || e), "error");
    return { ok:false, reason:String(e?.message||e) };
  }
}
