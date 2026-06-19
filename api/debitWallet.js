import admin from 'firebase-admin';

// Initialize Firebase Admin (uses GOOGLE_APPLICATION_CREDENTIALS environment variable)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
  });
}

const db = admin.firestore();

/**
 * Secure wallet debit for order placement
 * Runs on Vercel (server-side) - user can't cheat
 */
export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Firebase ID token
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = decodedToken.uid;
  const userEmail = decodedToken.email;
  const { amount, orderId, note } = req.body;

  // Validate inputs
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (!orderId) {
    return res.status(400).json({ error: 'Missing orderId' });
  }

  try {
    // Use transaction to prevent race conditions
    const result = await db.runTransaction(async (transaction) => {
      // 1. Verify the order exists and belongs to this user
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        throw new Error('Order not found');
      }

      const order = orderSnap.data();
      if (order.userId !== userId && order.userEmail !== userEmail) {
        throw new Error('Order does not belong to this user');
      }

      if (order.status !== 'placed') {
        throw new Error('Order status is not placed');
      }

      // 2. Get current wallet balance
      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);
      const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;

      // 3. Check sufficient funds
      if (currentBalance < amount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      const newBalance = currentBalance - amount;

      // 4. Update wallet
      transaction.set(
        walletRef,
        {
          balance: newBalance,
          email: userEmail,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      // 5. Create wallet history entry
      const historyRef = db.collection('walletHistory').doc();
      transaction.set(historyRef, {
        userId,
        userEmail,
        type: 'order_debit',
        amount: -amount,
        balanceAfter: newBalance,
        ref: orderId,
        note: note || 'Order payment',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        newBalance,
        transactionId: historyRef.id
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Debit error:', error);

    if (error.message === 'INSUFFICIENT_FUNDS') {
      return res.status(402).json({ error: 'INSUFFICIENT_FUNDS' });
    }
    if (error.message === 'Order not found') {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (error.message === 'Order does not belong to this user') {
      return res.status(403).json({ error: 'Order does not belong to this user' });
    }

    return res.status(500).json({ error: 'Failed to process payment' });
  }
}
