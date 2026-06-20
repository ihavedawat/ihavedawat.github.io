// Admin helpers: utility functions for admin operations
// Used by settings-admin.html and admin-view.js

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const FIRESTORE_BATCH_LIMIT = 450;

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const escape = escapeHtml;

export async function deleteOrdersForEmail(email) {
  const e = String(email || "").toLowerCase();
  if (!e) return;
  const snap = await getDocs(query(collection(db, "orders"), where("userEmail", "==", e)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function deleteAllUserDataForEmail(email) {
  const e = String(email || "").toLowerCase();
  if (!e) return;
  let foundUid = null;

  try {
    const wsnap = await getDocs(query(collection(db, "wallets"), where("email", "==", e)));
    for (const d of wsnap.docs) {
      if (!foundUid) foundUid = d.id;
      await deleteDoc(d.ref);
    }
  } catch (err) {
    console.error("Wallet delete failed for " + e, err);
  }

  const cols = ["orders", "walletHistory", "topups"];
  const collectionSnaps = await Promise.all(
    cols.map(col => getDocs(query(collection(db, col), where("userEmail", "==", e))))
  );

  for (const snap of collectionSnaps) {
    if (snap.empty) continue;
    if (!foundUid) {
      const withUid = snap.docs.find((d) => d.data().userId);
      if (withUid) foundUid = withUid.data().userId;
    }
    let batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      n++;
      if (n >= FIRESTORE_BATCH_LIMIT) { await batch.commit(); batch = writeBatch(db); n = 0; }
    }
    if (n) await batch.commit();
  }

  const seen = new Set();
  const deleteSnap = async (snap) => {
    if (snap.empty) return;
    let batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      if (!foundUid && d.data().userId) foundUid = d.data().userId;
      batch.delete(d.ref);
      n++;
      if (n >= FIRESTORE_BATCH_LIMIT) { await batch.commit(); batch = writeBatch(db); n = 0; }
    }
    if (n) await batch.commit();
  };

  const notifSnaps = await Promise.all([
    getDocs(query(collection(db, "notifications"), where("userEmail", "==", e))),
    foundUid ? getDocs(query(collection(db, "notifications"), where("userId", "==", foundUid))) : Promise.resolve(null)
  ]);

  await deleteSnap(notifSnaps[0]);
  if (notifSnaps[1]) {
    await deleteSnap(notifSnaps[1]);
  }
}

export async function deleteAllUsersData(token) {
  // Use backend API for bulk delete (client-side delete violates Firestore rules)
  if (!token) throw new Error('Token required for bulk delete');

  const response = await fetch(window.location.origin + "/api/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ action: 'delete-all', deleteAll: true })
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to delete data');
  }

  return (await response.json()).totalDeleted;
}
