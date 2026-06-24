import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

// 👇 Configuración de tu proyecto
export const firebaseConfig = {
  apiKey: "AIzaSyA9WC2jx3iCDkN24gwrN4ylCn5bvgeI1nA",
  authDomain: "nuevaclase-135ec.firebaseapp.com",
  projectId: "nuevaclase-135ec",
storageBucket: "nuevaclase-135ec.appspot.com", // <-- así
  messagingSenderId: "786390581865",
  appId: "1:786390581865:web:ed47531cf7415ae5ca18f8",
  measurementId: "G-8LC734STS9"
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app, "gs://nuevaclase-135ec.firebasestorage.app");
export const auth = getAuth(app);

// 👇 Asegurar sesión anónima antes de cualquier operación
export const authReady = new Promise((resolve) => {
  const off = onAuthStateChanged(auth, (u) => {
    if (u) { off(); resolve(u); }
    else { signInAnonymously(auth).catch(console.error); }
  });
});
