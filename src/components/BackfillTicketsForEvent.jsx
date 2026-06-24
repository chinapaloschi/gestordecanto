
import { collection, getDocs, updateDoc, doc, writeBatch } from "firebase/firestore";

/**
 * Backfills tickets under one event, adding missing fields and ensuring the student index exists.
 *  - Adds: studentId (from assignedTo), appId
 *  - Adds: eventTitle, date, startTime, location, price (from event)
 *  - Ensures index doc at artifacts/{appId}/studentTickets/{studentId}/tickets/{ticketId}
 *    with {eventId, status: 'active', createdAt}
 */
export async function backfillTicketsForEvent({ db, appId, event }) {
  const evtCol = collection(db, `artifacts/${appId}/events/${event.id}/tickets`);
  const snap = await getDocs(evtCol);

  let updated = 0;
  const batch = writeBatch(db);

  for (const d of snap.docs) {
    const data = d.data();
    const upd = {};
    const studentId = data.studentId || data.assignedTo || null;

    if (!studentId) continue; // cannot index without owner

    if (!('studentId' in data) && data.assignedTo) upd.studentId = data.assignedTo;
    if (!('appId' in data)) upd.appId = appId;
    if (!('eventTitle' in data)) upd.eventTitle = event.title || null;
    if (!('date' in data)) upd.date = event.date || null;
    if (!('startTime' in data)) upd.startTime = event.startTime || null;
    if (!('location' in data)) upd.location = event.location || null;
    if (!('price' in data)) upd.price = Number(event.price || 0);

    if (Object.keys(upd).length > 0) {
      batch.update(doc(evtCol, d.id), upd);
      updated++;
    }

    // Ensure studentTickets index exists (only for non-revoked tickets)
    if (data.status !== 'revoked') {
      const idxRef = doc(db, `artifacts/${appId}/studentTickets/${studentId}/tickets/${d.id}`);
      // write or overwrite with active status
      batch.set(idxRef, { eventId: event.id, status: 'active', createdAt: data.createdAt || new Date() });
    }
  }

  if (updated > 0 || snap.size > 0) {
    await batch.commit();
  }

  return { scanned: snap.size, updated };
}
