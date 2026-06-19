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

export function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function purgeOrdersForEmail(email) {
  const e = String(email || "").toLowerCase();
  if (!e) return;
  const snap = await getDocs(query(collection(db, "orders"), where("userEmail", "==", e)));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function purgeAllUserDataForEmail(email) {
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
    console.error("Wallet purge failed for " + e, err);
  }
  const cols = ["orders", "walletHistory", "topups"];
  for (const col of cols) {
    const snap = await getDocs(query(collection(db, col), where("userEmail", "==", e)));
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
  await deleteSnap(await getDocs(query(collection(db, "notifications"), where("userEmail", "==", e))));
  if (foundUid) {
    await deleteSnap(await getDocs(query(collection(db, "notifications"), where("userId", "==", foundUid))));
  }
}

export async function purgeAllUsersData(excludeEmails = []) {
  const excluded = new Set((excludeEmails || []).map((e) => String(e || "").toLowerCase()));
  const allEmails = new Set();

  try {
    const snap = await getDocs(collection(db, "applications"));
    snap.docs.forEach((d) => {
      const email = String(d.data().email || "").toLowerCase();
      if (email && !excluded.has(email)) {
        allEmails.add(email);
      }
    });
  } catch (err) {
    console.error("Failed to fetch all applications for bulk purge:", err);
    throw err;
  }

  // Purge each user's data
  let count = 0;
  for (const email of allEmails) {
    try {
      await purgeAllUserDataForEmail(email);
      count++;
    } catch (err) {
      console.error("Error purging user " + email + ":", err);
    }
  }

  return count;
}
