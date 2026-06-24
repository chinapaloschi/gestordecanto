import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { ref as stRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig.js';
import { collection as fsCollection, doc, updateDoc, serverTimestamp, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { auth } from '../firebaseConfig.js';

export const waitForAuthReady = async () => {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          resolve(cred.user);
        } catch (e) { reject(e); }
      }
    });
  });
};

export async function updateReceiptStatus(db, appId, studentId, receiptId, newStatus) {
  try {
    const receiptRef = doc(db, `artifacts/${appId}/students/${studentId}/receipts`, receiptId);
    await updateDoc(receiptRef, { status: newStatus, processedAt: serverTimestamp() });
  } catch (e) {
    console.error("updateReceiptStatus failed:", e);
    throw e;
  }
}

export async function __uploadReceiptInline__PATCH__({ appId, studentId, file }) {
  if (!file) throw new Error("Falta el archivo.");
  await waitForAuthReady();

  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
  const extension = (file.name.split('.').pop() || 'bin').toLowerCase();
  const newFilename = `Comprobante_${timestamp}.${extension}`;
  const path = `artifacts/${appId}/students/${studentId}/receipts/${newFilename}`;
  const metadata = { contentType: file.type || "application/pdf" };
  const task = uploadBytesResumable(stRef(storage, path), file, metadata);
  await new Promise((res, rej) => task.on("state_changed", null, rej, res));
  const url = await getDownloadURL(task.snapshot.ref);
  return { path, url, filename: newFilename };
}

export async function markStudentReceiptsAsSeen(db, appId, studentId) {
  try {
    const col = fsCollection(db, `artifacts/${appId}/students/${studentId}/receipts`);
    const snap = await getDocs(query(col, where("seenByAdmin", "==", false)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.forEach(docSnap => {
      batch.update(docSnap.ref, { seenByAdmin: true, seenAt: serverTimestamp() });
    });
    await batch.commit();
  } catch (e) { console.error("markStudentReceiptsAsSeen", e); }
}
