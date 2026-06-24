
// DoorScanner.jsx
// Página de control de acceso (escaneo QR de una sola vez)
//
// - Usa BarcodeDetector si está disponible.
// - Fallback opcional a 'jsqr' (npm i jsqr) si el navegador no soporta BarcodeDetector.
// - Marca el ticket como 'used: true' de forma atómica con Firestore transactions.
// - Protege la página con login de Google y whitelist (igual que tu app).
//
// Ruta sugerida: /#/scan
// Si usás React Router: <Route path="/scan" element={<DoorScanner/>} />

import React, { useEffect, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";

// --- Inicialización Firebase ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Whitelist (igual que en tu App.jsx) ---
const ALLOWED_EMAILS = new Set([
  "sandrupaloschi@gmail.com",
  "gracielamargheritis8@gmail.com",
  "javicampa010@gmail.com",
]);

const provider = new GoogleAuthProvider();
async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch {
    await signInWithRedirect(auth, provider);
  }
}

// --- Helpers UI ---
function Pill({ children, ok }) {
  return (
    <span
      className={
        "inline-block px-2 py-1 rounded-lg text-xs font-semibold " +
        (ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")
      }
    >
      {children}
    </span>
  );
}

// --- Lógica de escaneo ---
async function decodeQrWithBarcodeDetector(video) {
  if (!("BarcodeDetector" in window)) return null;
  try {
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const bitmap = await createImageBitmap(canvas);
    const codes = await detector.detect(bitmap);
    if (codes && codes.length) {
      return codes[0].rawValue || null;
    }
  } catch {}
  return null;
}

async function decodeQrWithJsQR(video) {
  // Requiere: npm i jsqr
  try {
    const jsQR = (await import("jsqr")).default;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imgData.data, imgData.width, imgData.height);
    if (code && code.data) return code.data;
  } catch (e) {
    // Si no está instalado jsqr, simplemente no decodifica
  }
  return null;
}

// --- Marca uso del ticket de forma atómica ---
async function redeemOnce({ appId, ticketId, email }) {
  const ref = doc(db, `artifacts/${appId}/tickets/${ticketId}`);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error("TICKET_NOT_FOUND");
    }
    const d = snap.data();
    if (d.used) {
      // Ya utilizado
      throw new Error("ALREADY_USED");
    }
    tx.update(ref, {
      used: true,
      usedAt: serverTimestamp(),
      usedBy: email || "scanner",
    });
    return { ok: true, data: d };
  });
}

// --- Componente principal ---
export default function DoorScanner() {
  const [phase, setPhase] = useState("loading"); // loading | login | denied | ready
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("Apuntá la cámara al QR.");
  const [result, setResult] = useState(null); // { ok, text } o error
  const [lastScan, setLastScan] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setPhase("login");
        return;
      }
      const em = user.email || "";
      setEmail(em);
      if (!ALLOWED_EMAILS.has(em)) {
        await signOut(auth);
        setPhase("denied");
        return;
      }
      setPhase("ready");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    let active = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        loop();
      } catch (e) {
        setMsg("No se pudo acceder a la cámara.");
      }
    }

    async function loop() {
      if (!videoRef.current) return;
      const video = videoRef.current;
      if (video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      let text = null;
      // 1) Intento nativo
      text = await decodeQrWithBarcodeDetector(video);
      // 2) Fallback con jsqr (opcional si instalás jsqr)
      if (!text) text = await decodeQrWithJsQR(video);

      if (text && text !== lastScan) {
        setLastScan(text);
        try {
          let payload = null;
          try {
            payload = JSON.parse(text);
          } catch {
            // Si el QR no es JSON, se asume que es solo el ticketId y tomamos appId de la URL (?a=)
            const urlParams = new URLSearchParams(window.location.search || "");
            const appId = urlParams.get("a") || (window.__PUBLIC_APP_ID__ || "");
            payload = { a: appId, t: text };
          }
          const appId = payload?.a || "";
          const ticketId = payload?.t || "";
          if (!appId || !ticketId) {
            throw new Error("FORMATO_INVALIDO");
          }

          await redeemOnce({ appId, ticketId, email });
          setResult({ ok: true, text: `Ingreso OK — Ticket ${ticketId}` });
          setMsg("✔ Ingreso registrado");
        } catch (e) {
          const code = e?.message || "";
          if (code === "ALREADY_USED") {
            setResult({ ok: false, text: "⛔ Ticket ya utilizado" });
            setMsg("El QR ya fue utilizado.");
          } else if (code === "TICKET_NOT_FOUND") {
            setResult({ ok: false, text: "❓ Ticket no encontrado" });
            setMsg("No existe este ticket en la base.");
          } else {
            setResult({ ok: false, text: "❌ Error al validar" });
            setMsg("No se pudo validar el QR.");
          }
          // pequeños cooldowns para evitar spam
          setTimeout(() => setLastScan(""), 1200);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    startCamera();

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [phase, lastScan]);

  if (phase === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-rose-50">
        <div className="text-gray-700">Cargando…</div>
      </div>
    );
  }
  if (phase === "login") {
    return (
      <div className="min-h-screen grid place-items-center bg-rose-50 p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center border">
          <h1 className="text-lg font-bold mb-2">Control de acceso</h1>
          <p className="text-gray-600 mb-4">Ingresá con una cuenta autorizada.</p>
          <button
            onClick={loginWithGoogle}
            className="px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700"
          >
            Continuar con Google
          </button>
        </div>
      </div>
    );
  }
  if (phase === "denied") {
    return (
      <div className="min-h-screen grid place-items-center bg-rose-50 p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center border">
          <h1 className="text-lg font-bold mb-2">Acceso no autorizado</h1>
          <button
            onClick={() => signOut(auth)}
            className="mt-2 px-4 py-2 rounded-lg border"
          >
            Cambiar de cuenta
          </button>
        </div>
      </div>
    );
  }

  // phase === "ready"
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#ffe4e6_12%,_#ffffff_65%)] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 border border-rose-50">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-700">
            Sesión: <b>{email || "—"}</b>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50"
          >
            Cerrar sesión
          </button>
        </div>

        <div className="rounded-xl overflow-hidden border bg-black relative">
          <video
            ref={videoRef}
            className="w-full h-[320px] object-cover"
            playsInline
            muted
          />
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1 rounded-lg">
            {msg}
          </div>
        </div>

        <div className="mt-4">
          {result ? (
            <div
              className={
                "p-3 rounded-lg border " +
                (result.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50")
              }
            >
              <div className="flex items-center justify-between">
                <div className="text-sm">{result.text}</div>
                <Pill ok={!!result.ok}>{result.ok ? "OK" : "ERROR"}</Pill>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-600">Esperando QR…</div>
          )}
        </div>
      </div>
    </div>
  );
}
