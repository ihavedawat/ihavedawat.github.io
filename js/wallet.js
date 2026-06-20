// Wallet helpers — single source of truth for reading balance,
// debiting an order, and crediting a refund/top-up. Everything that
// touches `wallets/{uid}.balance` goes through here so the audit log
// in `walletHistory` stays consistent.
//
// Schema:
//   wallets/{uid}        { balance, email, updatedAt }
//   walletHistory/{auto} { userId, userEmail, type, amount (signed),
//                          balanceAfter, ref, note, createdAt, byAdmin? }
//   topups/{auto}        { userId, userEmail, amount, bankRef, note,
//                          status: "pending"|"confirmed"|"rejected",
//                          requestedAt, confirmedAt, adminEmail }

import { db } from "./firebase.js";
import {
  doc, getDoc, setDoc, onSnapshot,
  collection, addDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Subscribe to a user's wallet balance. Returns the unsubscribe fn.
// If the wallet doc doesn't exist yet, the callback fires with 0.
export function subscribeWallet(userId, cb) {
  return onSnapshot(doc(db, "wallets", userId), (snap) => {
    cb(snap.exists() ? Number(snap.data().balance || 0) : 0);
  });
}

// One-shot read of current balance.
export async function getBalance(userId) {
  const snap = await getDoc(doc(db, "wallets", userId));
  return snap.exists() ? Number(snap.data().balance || 0) : 0;
}

// Debit the wallet for an order in a single Firestore transaction so
// two simultaneous orders can't both pass the balance check and push
// the wallet negative. Returns the new balance on success.
// Throws "INSUFFICIENT_FUNDS" if balance < amount.
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

// Credit the wallet (refund on cancel, or admin-confirmed top-up).
// `type` is one of "order_refund" | "topup" | "manual_adjustment".
export async function creditWallet({ userId, userEmail, amount, type, ref, note, byAdmin }) {
  console.log("[creditWallet] Starting transaction for", userId, "amount:", amount, "type:", type);
  return runTransaction(db, async (tx) => {
    const walletRef = doc(db, "wallets", userId);
    const wSnap = await tx.get(walletRef);
    const current = wSnap.exists() ? Number(wSnap.data().balance || 0) : 0;
    const next = current + amount;
    console.log("[creditWallet] Transaction: current balance =", current, "adding", amount, "new balance =", next);
    tx.set(walletRef, {
      balance: next,
      email: userEmail,
      updatedAt: serverTimestamp()
    }, { merge: true });
    const txnRef = doc(collection(db, "walletHistory"));
    tx.set(txnRef, {
      userId, userEmail,
      type,
      amount: amount,
      balanceAfter: next,
      ref: ref || null,
      note: note || "",
      byAdmin: byAdmin || null,
      createdAt: serverTimestamp()
    });
    console.log("[creditWallet] Transaction complete, returning balance:", next);
    return next;
  });
}

// Customer submits a top-up request after sending money to the bank.
// Admin confirms it later from the admin top-ups page.
export async function requestTopup({ userId, userEmail, amount, bankRef, note }) {
  const amt = Math.round(Number(amount));
  console.log("[wallet.js] requestTopup amount:", amount, "-> stored:", amt);
  return addDoc(collection(db, "topups"), {
    userId, userEmail,
    amount: amt,
    bankRef: String(bankRef || "").trim(),
    note: String(note || "").trim(),
    status: "pending",
    requestedAt: serverTimestamp()
  });
}

// Admin action: confirm a pending top-up. Reads the topup doc inside a
// transaction and only credits + marks confirmed if it's still
// "pending" — so a double-click / network retry never double-credits.
// Returns { alreadyHandled, status, balance? }.
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

// Admin action: decline a pending top-up. Same idempotency guard.
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
