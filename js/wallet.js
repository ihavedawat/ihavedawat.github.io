// Wallet system: handle balance reads, debits (orders), and credits (refunds/topups)
// Firestore collections:
//   wallets/{uid}        - user balance (single source of truth)
//   walletHistory/{auto} - audit log of all transactions
//   topups/{auto}        - pending/confirmed topup requests

import { db } from "./firebase.js";
import {
  doc, getDoc, onSnapshot,
  collection, addDoc, serverTimestamp
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
