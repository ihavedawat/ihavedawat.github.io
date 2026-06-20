
import { db, auth } from "./firebase.js";
import {
  doc, getDoc, setDoc, onSnapshot,
  collection, addDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function subscribeWallet(userId, cb) {
  return onSnapshot(doc(db, "wallets", userId), (snap) => {
    cb(snap.exists() ? Number(snap.data().balance || 0) : 0);
  });
}

export async function getBalance(userId) {
  const snap = await getDoc(doc(db, "wallets", userId));
  return snap.exists() ? Number(snap.data().balance || 0) : 0;
}

export async function debitForOrder({ userId, userEmail, amount, orderId, note }) {
  return runTransaction(db, async (tx) => {
    const walletRef = doc(db, "wallets", userId);
    const wSnap = await tx.get(walletRef);
    const current = wSnap.exists() ? Number(wSnap.data().balance || 0) : 0;
    if (current < amount) throw new Error("INSUFFICIENT_FUNDS");
    const next = current - amount;
    tx.set(walletRef, {
      balance: next,
      email: userEmail,
      updatedAt: serverTimestamp()
    }, { merge: true });
    const txnRef = doc(collection(db, "walletHistory"));
    tx.set(txnRef, {
      userId, userEmail,
      type: "order_debit",
      amount: -amount,
      balanceAfter: next,
      ref: orderId || null,
      note: note || "",
      createdAt: serverTimestamp()
    });
    return next;
  });
}

export async function creditWallet({ userId, userEmail, amount, type, ref, note, byAdmin }) {
  return runTransaction(db, async (tx) => {
    const walletRef = doc(db, "wallets", userId);
    const wSnap = await tx.get(walletRef);
    const current = wSnap.exists() ? Number(wSnap.data().balance || 0) : 0;
    const next = current + amount;
    tx.set(walletRef, {
      balance: next,
      email: userEmail,
      updatedAt: serverTimestamp()
    }, { merge: true });
    const txnRef = doc(collection(db, "walletHistory"));
    tx.set(txnRef, {
      userId, userEmail,
      type,
      amount,
      balanceAfter: next,
      ref: ref || null,
      note: note || "",
      byAdmin: byAdmin || null,
      createdAt: serverTimestamp()
    });
    return next;
  });
}

export async function requestTopup({ userId, userEmail, amount, bankRef, note }) {
  const amt = Math.round(Number(amount));
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(window.location.origin + "/api/topups", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ action: 'create', amount: amt, bankRef: String(bankRef || "").trim() })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create top-up request');
  }

  return response.json();
}

export async function confirmTopup({ topupId, adminEmail }) {
  return runTransaction(db, async (tx) => {
    const topupRef = doc(db, "topups", topupId);
    const tSnap = await tx.get(topupRef);
    if (!tSnap.exists()) throw new Error("TOPUP_NOT_FOUND");
    const t = tSnap.data();
    if (t.status !== "pending") {
      return { alreadyHandled: true, status: t.status };
    }
    const amount = Number(t.amount || 0);
    const walletRef = doc(db, "wallets", t.userId);
    const wSnap = await tx.get(walletRef);
    const current = wSnap.exists() ? Number(wSnap.data().balance || 0) : 0;
    const next = current + amount;
    tx.set(walletRef, {
      balance: next,
      email: t.userEmail,
      updatedAt: serverTimestamp()
    }, { merge: true });
    const txnRef = doc(collection(db, "walletHistory"));
    tx.set(txnRef, {
      userId: t.userId,
      userEmail: t.userEmail,
      type: "topup",
      amount,
      balanceAfter: next,
      ref: topupId,
      note: "BRAC ref " + (t.bankRef || ""),
      byAdmin: adminEmail || null,
      createdAt: serverTimestamp()
    });
    tx.update(topupRef, {
      status: "confirmed",
      confirmedAt: serverTimestamp(),
      adminEmail: adminEmail || null
    });
    return { alreadyHandled: false, status: "confirmed", balance: next };
  });
}

export async function rejectTopup({ topupId, adminEmail }) {
  return runTransaction(db, async (tx) => {
    const topupRef = doc(db, "topups", topupId);
    const tSnap = await tx.get(topupRef);
    if (!tSnap.exists()) throw new Error("TOPUP_NOT_FOUND");
    const t = tSnap.data();
    if (t.status !== "pending") {
      return { alreadyHandled: true, status: t.status };
    }
    tx.update(topupRef, {
      status: "rejected",
      confirmedAt: serverTimestamp(),
      adminEmail: adminEmail || null
    });
    return { alreadyHandled: false, status: "rejected" };
  });
}
