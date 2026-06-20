// Secure wallet operations via Vercel API
// These functions call Vercel serverless endpoints (not direct Firestore writes)
// This prevents users from cheating their wallet balance

import { auth } from "./firebase.js";

// Get the Vercel API base URL (changes based on environment)
const API_BASE = window.location.origin;  // Always use same origin (localhost:9000 in dev, vercel domain in prod)

/**
 * Secure wallet debit for order placement
 * Calls Vercel API endpoint (runs on server, user can't cheat)
 * @param {Object} options - { userId, userEmail, amount, orderId, note }
 * @returns {Promise<Object>} - { success, newBalance, transactionId }
 */
export async function secureDebitForOrder({ userId, userEmail, amount, orderId, note }) {
  try {
    // Get Firebase ID token for authentication
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE}/api/debitWallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        amount,
        orderId,
        note
      })
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.error === 'INSUFFICIENT_FUNDS') {
        throw new Error('INSUFFICIENT_FUNDS');
      }
      throw new Error(data.error || 'Failed to debit wallet');
    }

    return data;
  } catch (err) {
    console.error('Secure debit error:', err);
    throw err;
  }
}

/**
 * Secure wallet refund for order cancellation
 * @param {Object} options - { userId, userEmail, amount, orderId, note }
 * @returns {Promise<Object>} - { success, newBalance, transactionId }
 */
export async function secureRefundForOrder({ userId, userEmail, amount, orderId, note }) {
  try {
    // Get Firebase ID token for authentication
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE}/api/refundWallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        amount,
        orderId,
        note
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to refund wallet');
    }

    return data;
  } catch (err) {
    console.error('Secure refund error:', err);
    throw err;
  }
}
