
/**
 * QR estático + PIN (últimos 4 DNI) — desde cero
 * Cloud Functions (Node 18+) — firebase-functions v5, firebase-admin v12
 *
 * Expuestos (callable):
 *  - listTodayClassesByPin({ appId, pin4 })
 *  - confirmAttendance({ appId, studentId, classId })
 *  - reindexPins({ appId })  // admin: reconstruye pinIndex a partir de students
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const TZ = "America/Argentina/Buenos_Aires";
const ALLOWED_EMAILS = new Set([
  // Correos con permiso para "reindexPins"
  "sandrupaloschi@gmail.com",
  "gracielamargheritis8@gmail.com",
  "javicampa010@gmail.com",
]);

function todayKey() {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit" });
  return fmt.format(new Date()); // YYYY-MM-DD
}
function assertC(cond, msg) {
  if (!cond) throw new functions.https.HttpsError("failed-precondition", msg);
}

// ---------------- 1) Listar clases de HOY por PIN (público) ----------------
exports.listTodayClassesByPin = functions.https.onCall(async (data, context) => {
  const appId = String(data?.appId || "");
  const pin4 = String(data?.pin4 || "").replace(/\D/g, "");
  assertC(appId.length > 0, "Falta appId.");
  assertC(pin4.length === 4, "PIN inválido.");

  const db = admin.firestore();
  const entriesRef = db.collection(`artifacts/${appId}/pinIndex/${pin4}/entries`);
  const entriesSnap = await entriesRef.get();
  if (entriesSnap.empty) return { dateKey: todayKey(), students: [] };

  const dateKey = todayKey();
  const students = [];
  for (const e of entriesSnap.docs) {
    const d = e.data() || {};
    const studentId = d.studentId || e.id;
    const studentName = d.studentName || d.name || d.fullName || "";
    const q = await db.collection(`artifacts/${appId}/scheduledClasses`)
      .where("studentId", "==", studentId)
      .where("classDate", "==", dateKey)
      .get();
    const classes = q.docs.map(s => ({ id: s.id, ...(s.data()||{}) }));
    students.push({ studentId, studentName, classes });
  }
  return { dateKey, students };
});

// ---------------- 2) Confirmar asistencia (público) ----------------
exports.confirmAttendance = functions.https.onCall(async (data, context) => {
  const appId = String(data?.appId || "");
  const studentId = String(data?.studentId || "");
  const classId = String(data?.classId || "");
  assertC(appId.length > 0, "Falta appId.");
  assertC(studentId.length > 0, "Falta studentId.");
  assertC(classId.length > 0, "Falta classId.");

  const db = admin.firestore();
  const dateKey = todayKey();
  const clsRef = db.doc(`artifacts/${appId}/scheduledClasses/${classId}`);
  const attId = `public_${studentId}_${dateKey}`;
  const attRef = db.doc(`artifacts/${appId}/attendance/${attId}`);

  await db.runTransaction(async (tx) => {
    const clsSnap = await tx.get(clsRef);
    assertC(clsSnap.exists, "Clase no encontrada.");
    const cls = clsSnap.data();
    assertC(cls.studentId === studentId, "Clase no corresponde al alumno.");
    assertC(cls.classDate === dateKey, "La clase no es hoy.");

    if (cls.attendanceStatus === "present") return;

    const stRef = db.doc(`artifacts/${appId}/students/${studentId}`);
    const stSnap = await tx.get(stRef);
    const st = stSnap.exists ? stSnap.data() : {};
    const studentName = st.name || st.fullName || "";

    tx.set(attRef, {
      studentId, studentName, classId,
      dateKey, checkedAt: admin.firestore.FieldValue.serverTimestamp(),
      via: "public_pin"
    }, { merge: true });

    tx.set(clsRef, {
      attendanceStatus: "present",
      attendanceRefId: attRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (typeof st.remainingCredits === "number") {
      tx.update(stRef, { remainingCredits: admin.firestore.FieldValue.increment(-1) });
    }
  });

  return { status: "ok", message: "Presente registrado." };
});

// ---------------- 2b) Login de alumno por DNI (+ PIN opcional) ----------------
// Reemplaza las lecturas directas del cliente a `students`/`pinIndex` (que
// permitían enumerar DNIs sin límite) por una única función server-side con
// rate-limit por DNI y por IP. Si el alumno tiene un campo `pin` propio
// configurado, se exige; si no, se acepta solo el DNI (comportamiento actual,
// sin romper el acceso de alumnos existentes).
const LOGIN_MAX_ATTEMPTS_DNI = 8;
const LOGIN_MAX_ATTEMPTS_IP = 30;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

function withinWindow(entry, now) {
  return entry && entry.windowStart && (now - entry.windowStart) < LOGIN_WINDOW_MS;
}

exports.loginStudent = functions.https.onCall(async (data, context) => {
  const appId = String(data?.appId || "");
  const dni = String(data?.dni || "").replace(/\D/g, "");
  const pin = String(data?.pin || "").replace(/\D/g, "");
  assertC(appId.length > 0, "Falta appId.");
  assertC(dni.length >= 7 && dni.length <= 8, "DNI inválido.");

  const db = admin.firestore();
  const now = Date.now();
  const ip = String(context.rawRequest?.ip || "unknown").slice(0, 64);
  const dniAttemptRef = db.doc(`artifacts/${appId}/loginAttempts/dni_${dni}`);
  const ipAttemptRef = db.doc(`artifacts/${appId}/loginAttempts/ip_${ip}`);

  await db.runTransaction(async (tx) => {
    const [dniSnap, ipSnap] = await Promise.all([tx.get(dniAttemptRef), tx.get(ipAttemptRef)]);
    const dniData = dniSnap.exists ? dniSnap.data() : null;
    const ipData = ipSnap.exists ? ipSnap.data() : null;

    if (withinWindow(dniData, now) && dniData.count >= LOGIN_MAX_ATTEMPTS_DNI) {
      throw new functions.https.HttpsError("resource-exhausted", "Demasiados intentos. Probá de nuevo en unos minutos.");
    }
    if (withinWindow(ipData, now) && ipData.count >= LOGIN_MAX_ATTEMPTS_IP) {
      throw new functions.https.HttpsError("resource-exhausted", "Demasiados intentos. Probá de nuevo en unos minutos.");
    }

    const dniWindowStart = withinWindow(dniData, now) ? dniData.windowStart : now;
    const ipWindowStart = withinWindow(ipData, now) ? ipData.windowStart : now;
    tx.set(dniAttemptRef, { windowStart: dniWindowStart, count: (withinWindow(dniData, now) ? (dniData.count || 0) : 0) + 1, lastAttemptAt: now }, { merge: true });
    tx.set(ipAttemptRef, { windowStart: ipWindowStart, count: (withinWindow(ipData, now) ? (ipData.count || 0) : 0) + 1, lastAttemptAt: now }, { merge: true });
  });

  const q = await db.collection(`artifacts/${appId}/students`).where("dni", "==", dni).limit(1).get();
  assertC(!q.empty, "DNI no encontrado.");

  const studentDoc = q.docs[0];
  const studentData = studentDoc.data() || {};
  assertC(studentData.isArchived !== true, "DNI no encontrado.");

  if (studentData.pin) {
    assertC(pin.length === 4, "PIN_REQUIRED");
    assertC(pin === String(studentData.pin), "PIN incorrecto.");
  }

  // Login correcto: resetear el contador de intentos por DNI.
  await dniAttemptRef.set({ windowStart: now, count: 0, lastAttemptAt: now }, { merge: true });

  return { id: studentDoc.id, ...studentData };
});

// ---------------- 3) Descarga de YouTube via yt-dlp (cliente tv_embedded) ----------------
const https_mod = require("https");
const { spawn }  = require("child_process");
const fs_mod     = require("fs");
const path_mod   = require("path");
const os_mod     = require("os");

const YT_DLP_BIN = "/tmp/yt-dlp";
let ytDlpReady = false;

// Descarga el binario de yt-dlp siguiendo redirects con el módulo https nativo
function downloadBin(url, dest) {
  return new Promise((resolve, reject) => {
    function get(u) {
      https_mod.get(u, { timeout: 30000 }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const file = fs_mod.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", (e) => { try { fs_mod.unlinkSync(dest); } catch {} reject(e); });
      }).on("error", reject).on("timeout", () => reject(new Error("Timeout descargando yt-dlp")));
    }
    get(url);
  });
}

async function ensureYtDlp() {
  if (ytDlpReady && fs_mod.existsSync(YT_DLP_BIN)) return;
  console.log("[yt-dlp] Descargando binario...");
  await downloadBin("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp", YT_DLP_BIN);
  fs_mod.chmodSync(YT_DLP_BIN, 0o755);
  ytDlpReady = true;
  console.log("[yt-dlp] Binario listo");
}

async function runYtDlp(url, cookieStr) {
  await ensureYtDlp();

  const tmpId  = Date.now().toString();
  const tmpTpl = path_mod.join(os_mod.tmpdir(), `${tmpId}.%(ext)s`);

  // Escribir cookies en formato Netscape si las tenemos
  let cookiePath = null;
  if (cookieStr && cookieStr.trim()) {
    cookiePath = path_mod.join(os_mod.tmpdir(), `cookies_${tmpId}.txt`);
    const trimmed = cookieStr.trim();
    let cookieFileContent;

    if (trimmed.startsWith("# Netscape") || trimmed.includes("\t")) {
      // Ya viene en formato Netscape (exportado por extensión del browser) — usarlo directo
      cookieFileContent = trimmed;
      console.log("[yt-dlp] Cookies en formato Netscape (extensión de browser)");
    } else {
      // Formato raw (name=value; name2=value2) — convertir a Netscape
      const lines = ["# Netscape HTTP Cookie File"];
      trimmed.split(";").forEach(pair => {
        const eq = pair.indexOf("=");
        if (eq < 0) return;
        const name  = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        lines.push(`.youtube.com\tTRUE\t/\tFALSE\t9999999999\t${name}\t${value}`);
      });
      cookieFileContent = lines.join("\n");
      console.log(`[yt-dlp] Cookies convertidas a Netscape (${lines.length - 1} cookies)`);
    }

    fs_mod.writeFileSync(cookiePath, cookieFileContent);
  }

  // Con cookies: un intento directo. Sin cookies: probar clientes alternativos
  const attempts = cookieStr
    ? [{ client: "web", extra: [] }]  // con cookies el cliente web funciona
    : [
        { client: "tv_embedded", extra: [] },
        { client: "ios",         extra: [] },
        { client: "android",     extra: [] },
      ];

  for (const { client, extra } of attempts) {
    console.log(`[yt-dlp] client=${client}, cookies=${!!cookieStr}...`);
    try {
      await new Promise((resolve, reject) => {
        const args = [
          url,
          "-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
          "--extractor-args", `youtube:player_client=${client}`,
          "-o", tmpTpl,
          "--no-playlist",
          "--no-warnings",
          "--socket-timeout", "30",
          "--retries", "2",
          ...extra,
        ];
        if (cookiePath) args.push("--cookies", cookiePath);

        const proc = spawn(YT_DLP_BIN, args);
        let stderr = "";
        proc.stderr.on("data", d => { stderr += d.toString(); });
        proc.on("error", reject);
        proc.on("close", code => {
          if (code === 0) return resolve();
          reject(new Error(stderr.split("\n").filter(Boolean).pop() || `exit ${code}`));
        });
      });

      const outFiles = fs_mod.readdirSync(os_mod.tmpdir()).filter(f => f.startsWith(tmpId) && !f.includes("cookies"));
      if (!outFiles.length) throw new Error("Sin archivo de salida");

      const outPath = path_mod.join(os_mod.tmpdir(), outFiles[0]);
      const ext     = path_mod.extname(outPath).replace(".", "");
      const buffer  = fs_mod.readFileSync(outPath);
      try { fs_mod.unlinkSync(outPath); } catch {}
      if (cookiePath) try { fs_mod.unlinkSync(cookiePath); } catch {}

      const mimes = { m4a:"audio/mp4", mp4:"audio/mp4", webm:"audio/webm", ogg:"audio/ogg", opus:"audio/ogg" };
      console.log(`[yt-dlp] OK — client=${client}, ${Math.round(buffer.length/1024)}KB`);
      return { buffer, mimeType: mimes[ext] || "audio/webm", filename: `audio.${ext}` };

    } catch (e) {
      console.log(`[yt-dlp] client=${client} falló: ${e.message}`);
    }
  }

  if (cookiePath) try { fs_mod.unlinkSync(cookiePath); } catch {}
  throw new Error(cookieStr
    ? "yt-dlp falló incluso con cookies. Verificá que las cookies sean válidas."
    : "yt-dlp no pudo descargar. Configurá las cookies de YouTube para mejor resultado.");
}

// ---------------- 3b) Búsqueda de YouTube via Piped ----------------
exports.ytSearch = functions
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const q = req.query.q;
    if (!q) { res.status(400).json({ error: "Missing q" }); return; }

    const PIPED = ["https://pipedapi.kavin.rocks", "https://pipedapi.adminforge.de", "https://piped-api.garudalinux.org"];
    let lastErr = "no instances";

    for (const base of PIPED) {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 10000);
        const r = await fetch(`${base}/search?q=${encodeURIComponent(q)}&filter=all`, { signal: ctrl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const results = (data.items || [])
          .filter(i => i.url?.startsWith("/watch?v="))
          .slice(0, 8)
          .map(i => ({
            videoId:      i.url.replace("/watch?v=", ""),
            title:        i.title,
            thumbnail:    i.thumbnail,
            duration:     i.duration,
            uploaderName: i.uploaderName,
          }));
        res.json({ results });
        return;
      } catch (e) { lastErr = e.message; }
    }
    res.status(500).json({ error: `Search failed: ${lastErr}` });
  });

exports.ytDownload = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const { url, cookieStr } = req.body || {};
    if (!url || !/youtube\.com|youtu\.be/.test(url)) {
      res.status(400).json({ error: "URL de YouTube inválida" }); return;
    }

    try {
      const { buffer, mimeType, filename } = await runYtDlp(url, cookieStr || "");
      res.set("Content-Type", mimeType);
      res.set("Content-Disposition", `attachment; filename="${filename}"`);
      res.status(200).send(buffer);
    } catch (e) {
      console.error("[ytDownload]", e.message);
      res.status(500).json({ error: e.message });
    }
  });

// ──────────────────────────────────────────────────────────────────────────────
// 4b) TRIGGER: Notificar al admin cuando un alumno sube un comprobante
// ──────────────────────────────────────────────────────────────────────────────
exports.onNewReceipt = functions.firestore
  .document('artifacts/{appId}/students/{studentId}/receipts/{receiptId}')
  .onCreate(async (snap, context) => {
    const { appId, studentId } = context.params;
    const receipt = snap.data() || {};

    try {
      // Obtener nombre del alumno
      const studentDoc = await admin.firestore()
        .doc(`artifacts/${appId}/students/${studentId}`).get();
      const studentName = studentDoc.data()?.name || 'Un alumno';

      // Obtener tokens de administrador
      const tokensSnap = await admin.firestore()
        .collection(`artifacts/${appId}/adminTokens`)
        .get();

      const tokens = tokensSnap.docs
        .map(d => d.data()?.token || d.id)
        .filter(t => t && t.length > 20);

      if (!tokens.length) {
        console.log('[Receipt] Sin tokens de admin registrados');
        return;
      }

      const amountStr = receipt.amount
        ? `$${Number(receipt.amount).toLocaleString('es-AR')}`
        : 'un comprobante';

      const nTitle = '💳 Nuevo comprobante de pago';
      const nBody  = `${studentName} subió ${amountStr}. Revisá los recibos.`;
      const adminUrl = 'https://estudiosandrapaloschi.web.app/';
      const result = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: nTitle, body: nBody },
        data: { url: adminUrl },   // ← leído por el service worker en notificationclick
        webpush: {
          headers: { Urgency: "high" },
          notification: {
            title: nTitle,
            body:  nBody,
            icon:  '/icon-192-inverted.png',
            badge: '/icon-32-inverted.png',
            tag:   'nuevo-comprobante',
          },
          fcmOptions: { link: adminUrl },
        },
      });

      // Limpiar tokens inválidos que FCM rechazó
      const invalidTokens = [];
      result.responses.forEach((resp, idx) => {
        if (!resp.success && (resp.error?.code === 'messaging/registration-token-not-registered' || resp.error?.code === 'messaging/invalid-registration-token')) {
          invalidTokens.push(tokensSnap.docs[idx].ref);
        }
      });
      if (invalidTokens.length) {
        const batchDel = admin.firestore().batch();
        invalidTokens.forEach(ref => batchDel.delete(ref));
        await batchDel.commit();
        console.log(`[Receipt] Tokens inválidos eliminados: ${invalidTokens.length}`);
      }

      console.log(`[Receipt] Notificaciones enviadas: ${result.successCount}/${tokens.length}`);
    } catch (e) {
      console.error('[Receipt] Error en trigger:', e.message);
    }
  });

// ---------------- 3b) Nueva solicitud de pre-inscripción (push a admin) ----------------
exports.onNewTrialRequest = functions.firestore
  .document('artifacts/{appId}/trialRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const { appId } = context.params;
    const req = snap.data() || {};

    try {
      const tokensSnap = await admin.firestore()
        .collection(`artifacts/${appId}/adminTokens`)
        .get();

      const tokens = tokensSnap.docs
        .map(d => d.data()?.token || d.id)
        .filter(t => t && t.length > 20);

      if (!tokens.length) {
        console.log('[TrialRequest] Sin tokens de admin registrados');
        return;
      }

      const name = req.name || 'Alguien';
      const when = req.date && req.startTime ? ` para el ${req.date} a las ${req.startTime} hs` : '';

      const nTitle = '🎤 Nueva solicitud de inscripción';
      const nBody  = `${name} pidió un turno${when}. Revisá Pre-inscriptos.`;
      const adminUrl = 'https://estudiosandrapaloschi.web.app/';
      const result = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: nTitle, body: nBody },
        data: { url: adminUrl },
        webpush: {
          headers: { Urgency: "high" },
          notification: {
            title: nTitle,
            body:  nBody,
            icon:  '/icon-192-inverted.png',
            badge: '/icon-32-inverted.png',
            tag:   'nueva-inscripcion',
          },
          fcmOptions: { link: adminUrl },
        },
      });

      const invalidTokens = [];
      result.responses.forEach((resp, idx) => {
        if (!resp.success && (resp.error?.code === 'messaging/registration-token-not-registered' || resp.error?.code === 'messaging/invalid-registration-token')) {
          invalidTokens.push(tokensSnap.docs[idx].ref);
        }
      });
      if (invalidTokens.length) {
        const batchDel = admin.firestore().batch();
        invalidTokens.forEach(ref => batchDel.delete(ref));
        await batchDel.commit();
      }

      console.log(`[TrialRequest] Notificaciones enviadas: ${result.successCount}/${tokens.length}`);
    } catch (e) {
      console.error('[TrialRequest] Error en trigger:', e.message);
    }
  });

// ---------------- 4) Reconstruir pinIndex desde students (ADMIN) ----------------
exports.reindexPins = functions.https.onCall(async (data, context) => {
  assertC(context.auth && context.auth.token && context.auth.token.email, "No autenticado.");
  const email = context.auth.token.email;
  assertC(ALLOWED_EMAILS.has(email), "No autorizado.");

  const appId = String(data?.appId || "");
  assertC(appId.length > 0, "Falta appId.");

  const db = admin.firestore();
  const studentsRef = db.collection(`artifacts/${appId}/students`);
  const snap = await studentsRef.get();

  const batch = db.bulkWriter();
  let count = 0;
  for (const doc of snap.docs) {
    const s = doc.data() || {};
    const dni = String(s.dni || s.DNI || "").replace(/\D/g, "");
    if (dni.length >= 4) {
      const pin4 = dni.slice(-4);
      const entryRef = db.doc(`artifacts/${appId}/pinIndex/${pin4}/entries/${doc.id}`);
      batch.set(entryRef, {
        studentId: doc.id,
        studentName: s.name || s.fullName || "",
        dni: dni,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      count++;
    }
  }
  await batch.close();
  return { updated: count };
});

// ──────────────────────────────────────────────────────────────────────────────
// 5) NOTIFICACIONES PUSH (Firebase Cloud Messaging)
// ──────────────────────────────────────────────────────────────────────────────
exports.sendPushNotification = functions.https.onCall(async (data, context) => {
  assertC(context.auth && context.auth.token && context.auth.token.email, "No autenticado.");
  assertC(ALLOWED_EMAILS.has(context.auth.token.email), "No autorizado.");

  const { studentIds, title, body, appId: dataAppId, url } = data;

  if (!title || !body) throw new functions.https.HttpsError("invalid-argument", "title y body son requeridos.");

  const targetAppId = dataAppId || "1:786390581865:web:ed47531cf7415ae5ca18f8";

  // Recopilar todos los FCM tokens de los alumnos seleccionados
  const tokens = [];
  const ids = Array.isArray(studentIds) ? studentIds : [];

  for (const sid of ids) {
    try {
      const tokensSnap = await admin.firestore()
        .collection(`artifacts/${targetAppId}/students/${sid}/deviceTokens`)
        .where("enabled", "==", true)
        .get();
      tokensSnap.forEach(d => { if (d.data()?.token) tokens.push(d.data().token); });
    } catch (e) { console.error(`[Push] token fetch error for ${sid}:`, e.message); }
  }

  if (!tokens.length) return { sent: 0, message: "Sin dispositivos registrados para notificaciones." };

  // Enviar usando multicast (lotes de 500)
  let successCount = 0, failureCount = 0;
  const BATCH = 500;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    try {
      const fullTitle = title.includes('Sandra') ? title : `Estudio de Canto Sandra Paloschi`;
      const targetUrl = url || "https://estudiosandrapaloschi.web.app/#/checkin?a=1:786390581865:web:ed47531cf7415ae5ca18f8";
      const result = await admin.messaging().sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        // data.url es leído por el service worker en notificationclick
        data: { url: targetUrl },
        webpush: {
          headers: { Urgency: "high" },
          notification: {
            title,
            body,
            icon:  "/icon-192.png",
            badge: "/icon-32.png",
            vibrate: [200, 100, 200],
            tag: "estudio-sp",
          },
          fcmOptions: { link: targetUrl },
        },
      });
      successCount += result.successCount;
      failureCount += result.failureCount;
    } catch (e) { console.error("[Push] multicast error:", e.message); failureCount += batch.length; }
  }

  console.log(`[Push] Enviadas: ${successCount}, Fallidas: ${failureCount}`);
  return { sent: successCount, failed: failureCount };
});

// ──────────────────────────────────────────────────────────────────────────────
// 5c) RECORDATORIOS DE CLASE (manual + automático a las 22hs Argentina)
// ──────────────────────────────────────────────────────────────────────────────
const DEFAULT_APP_ID = "1:786390581865:web:ed47531cf7415ae5ca18f8";

function tomorrowKey() {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return fmt.format(d);
}

function getSpanishDay(dateKey) {
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('es-AR', { weekday: 'long' });
  } catch { return ''; }
}

async function _sendRemindersForDate(appId, dateKey, source, skipIfAlreadySent = false) {
  const db = admin.firestore();

  const logRef = db.doc(`artifacts/${appId}/reminderLog/${dateKey}`);

  // Solo bloquear si viene del automático (no del botón manual)
  if (skipIfAlreadySent) {
    const logSnap = await logRef.get();
    if (logSnap.exists && logSnap.data().sent) {
      console.log(`[Reminders] Ya enviado para ${dateKey}, saltando (auto).`);
      return { skipped: true, reason: 'already_sent' };
    }
  }

  // Clases del día
  const classesSnap = await db.collection(`artifacts/${appId}/scheduledClasses`)
    .where('classDate', '==', dateKey)
    .get();

  if (classesSnap.empty) {
    await logRef.set({ sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp(), source, count: 0 });
    return { sent: 0 };
  }

  // Agrupar por alumno (el horario más temprano del día)
  const studentMap = {};
  classesSnap.forEach(d => {
    const cls = d.data();
    if (!cls.studentId || cls.status === 'cancelled') return;
    const existing = studentMap[cls.studentId];
    if (!existing || (cls.classTime || '') < existing.time) {
      studentMap[cls.studentId] = { time: cls.classTime || '' };
    }
  });

  const dayName = getSpanishDay(dateKey);
  let totalSent = 0;

  for (const [studentId, info] of Object.entries(studentMap)) {
    try {
      // Nombre del alumno
      const stuDoc = await db.doc(`artifacts/${appId}/students/${studentId}`).get();
      const firstName = ((stuDoc.data()?.name || stuDoc.data()?.fullName || 'alumno').split(' ')[0]);

      // Tokens FCM
      const tokensSnap = await db
        .collection(`artifacts/${appId}/students/${studentId}/deviceTokens`)
        .where('enabled', '==', true)
        .get();
      const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
      if (!tokens.length) continue;

      const title = 'Estudio de Canto Sandra Paloschi 🎵';
      const timeStr = info.time ? ` a las ${info.time} hs` : '';
      const dayStr  = dayName ? ` el ${dayName}` : ' mañana';
      const body = `Hola ${firstName}! 🎵 Te recuerdo que tenés clase${dayStr}${timeStr}. ¡Nos vemos!`;
      const portalUrl = `https://estudiosandrapaloschi.web.app/#/checkin?a=${appId}`;

      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: { url: portalUrl },
        webpush: {
          notification: { title, body, icon: '/icon-192.png', badge: '/icon-32.png', vibrate: [200, 100, 200] },
          fcmOptions: { link: portalUrl },
        },
      });
      totalSent++;
    } catch (e) {
      console.error(`[Reminders] Error para ${studentId}:`, e.message);
    }
  }

  await logRef.set({ sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp(), source, count: totalSent });
  console.log(`[Reminders] Enviados: ${totalSent} de ${Object.keys(studentMap).length} alumnos (${source})`);
  return { sent: totalSent, total: Object.keys(studentMap).length };
}

// Manual: siempre envía (sin bloqueo por log)
exports.sendManualReminders = functions.https.onCall(async (data, context) => {
  assertC(context.auth && context.auth.token && context.auth.token.email, "No autenticado.");
  assertC(ALLOWED_EMAILS.has(context.auth.token.email), "No autorizado.");
  const appId   = data?.appId   || DEFAULT_APP_ID;
  const dateKey = data?.dateKey || tomorrowKey();
  return await _sendRemindersForDate(appId, dateKey, 'manual', false);
});

// Automático a las 22:00 Argentina — solo envía si no se hizo manual ese día
exports.scheduledClassReminders = functions.pubsub
  .schedule('0 22 * * *')
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async () => {
    return await _sendRemindersForDate(DEFAULT_APP_ID, tomorrowKey(), 'auto', true);
  });

// ──────────────────────────────────────────────────────────────────────────────
// 5d) AVISO A SANDRA: clases sin marcar presente/ausente — diario a las 22hs
// ──────────────────────────────────────────────────────────────────────────────
function daysAgoKey(n) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmt.format(d);
}

function isMarked(status) {
  const s = String(status || '').toLowerCase();
  return s === 'presente' || s === 'present' || s === 'ausente' || s === 'absent';
}

async function _countUnmarkedAttendance(appId) {
  const db = admin.firestore();
  const snap = await db.collection(`artifacts/${appId}/scheduledClasses`)
    .where('classDate', '>=', daysAgoKey(60))
    .where('classDate', '<=', todayKey())
    .get();

  return snap.docs.filter(d => {
    const c = d.data();
    return c.status !== 'cancelled' && !isMarked(c.attendanceStatus);
  }).length;
}

exports.unmarkedAttendanceReminder = functions.pubsub
  .schedule('0 22 * * *')
  .timeZone(TZ)
  .onRun(async () => {
    const appId = DEFAULT_APP_ID;
    try {
      const count = await _countUnmarkedAttendance(appId);
      if (count === 0) {
        console.log('[UnmarkedAttendance] Sin pendientes.');
        return { sent: 0, count: 0 };
      }

      const tokensSnap = await admin.firestore()
        .collection(`artifacts/${appId}/adminTokens`)
        .get();
      const tokens = tokensSnap.docs
        .map(d => d.data()?.token || d.id)
        .filter(t => t && t.length > 20);

      if (!tokens.length) {
        console.log('[UnmarkedAttendance] Sin tokens de admin registrados.');
        return { sent: 0, count, reason: 'no_tokens' };
      }

      const title = '⏰ Asistencia sin marcar';
      const body = `Tenés ${count} clase${count !== 1 ? 's' : ''} sin marcar presente/ausente.`;
      const adminUrl = 'https://estudiosandrapaloschi.web.app/';

      const result = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: { url: adminUrl },
        webpush: {
          headers: { Urgency: "high" },
          notification: {
            title, body,
            icon: '/icon-192-inverted.png',
            badge: '/icon-32-inverted.png',
            tag: 'asistencia-pendiente',
          },
          fcmOptions: { link: adminUrl },
        },
      });

      console.log(`[UnmarkedAttendance] count=${count} sent=${result.successCount}/${tokens.length}`);
      return { sent: result.successCount, count };
    } catch (e) {
      console.error('[UnmarkedAttendance] Error:', e.message);
      return { error: e.message };
    }
  });

// ──────────────────────────────────────────────────────────────────────────────
// 5b) FACTURACIÓN ELECTRÓNICA AFIP (Monotributista — Factura C)
// ──────────────────────────────────────────────────────────────────────────────
// Configurar antes del primer uso:
//   firebase functions:config:set afip.cuit="20123456789" afip.cert="$(cat cert.pem)" afip.key="$(cat private.key)" afip.pto_vta="1" afip.produccion="false"
// ──────────────────────────────────────────────────────────────────────────────
exports.emitirFactura = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .https.onCall(async (data, context) => {
    // Solo usuarios autenticados y autorizados
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "No autenticado.");
    }

    const cfg = functions.config().afip || {};
    const CUIT      = cfg.cuit;
    const cert      = cfg.cert;
    const key       = cfg.key;
    const ptoVta    = parseInt(cfg.pto_vta || "1");
    const esProduccion = cfg.produccion === "true";

    if (!CUIT || !cert || !key) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "AFIP no configurado. Configurá las variables: afip.cuit, afip.cert, afip.key"
      );
    }

    const Afip = require("@afipsdk/afip.js");
    const afip = new Afip({
      CUIT,
      cert,
      key,
      production: esProduccion,
      res_dir: "/tmp/afip_res",
    });

    const {
      tipoComprobante = 11, // 11 = Factura C (monotributista)
      concepto       = 2,   // 2 = Servicios
      docTipo,              // 96=DNI, 80=CUIT, 99=Consumidor Final
      docNro,               // número del receptor (0 si consumidor final)
      nombreReceptor,
      importeTotal,
    } = data;

    try {
      // Obtener último número de comprobante
      const lastVoucher = await afip.ElectronicBilling.getLastVoucher(ptoVta, tipoComprobante);
      const cbteNro     = lastVoucher + 1;

      const now   = new Date();
      const fecha = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;

      const voucher = {
        CantReg:    1,
        PtoVta:     ptoVta,
        CbteTipo:   tipoComprobante,
        Concepto:   concepto,
        DocTipo:    docTipo || 99,   // 99 = Consumidor Final
        DocNro:     docNro  || 0,
        CbteDesde:  cbteNro,
        CbteHasta:  cbteNro,
        CbteFch:    parseInt(fecha),
        ImpTotal:   importeTotal,
        ImpTotConc: 0,
        ImpNeto:    importeTotal,
        ImpOpEx:    0,
        ImpIVA:     0,
        ImpTrib:    0,
        FchServDesde: fecha,
        FchServHasta: fecha,
        FchVtoPago:   fecha,
        MonId:      "PES",
        MonCotiz:   1,
      };

      const result = await afip.ElectronicBilling.createVoucher(voucher);

      return {
        ok:          true,
        cae:         result.CAE,
        caeFchVto:   result.CAEFchVto,
        nroFactura:  cbteNro,
        ptoVta,
        tipoComprobante,
        fecha:       `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`,
        nombreReceptor,
        importeTotal,
        produccion:  esProduccion,
      };
    } catch (e) {
      console.error("[AFIP] Error:", e.message);
      throw new functions.https.HttpsError("internal", "Error AFIP: " + e.message);
    }
  });
