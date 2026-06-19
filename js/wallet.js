// Wallet system: handle balance reads, debits (orders), and credits (refunds/topups)
// Firestore collections:
//   wallets/{uid}        - user balance (single source of truth)
//   walletHistory/{auto} - audit log of all transactions
//   topups/{auto}        - pending/confirmed topup requests

import { db } from "./firebase.js";
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

// DEPRECATED: Use secureDebitForOrder from wallet-secure.js instead
// That function calls the Vercel API endpoint for server-side validation

// DEPRECATED: Use secureRefundForOrder from wallet-secure.js instead
// That function calls the Vercel API endpoint for server-side validation

// User submits topup request after sending money to bank
export async function requestTopup({ userId, userEmail, amount, bankRef, note }) {
  return addDoc(collection(db, "topups"), {
    userId, userEmail,
    amount: Math.round(Number(amount)),
    bankRef: String(bankRef || "").trim(),
    note: String(note || "").trim(),
    status: "pending",
    requestedAt: serverTimestamp()
  });
}

// Admin confirms pending topup (idempotent - safe for retries)
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

// Admin rejects pending topup (idempotent - safe for retries)
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
