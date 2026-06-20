import admin, { db } from './firebase-init.js';

/**
 * Secure wallet refund for order cancellation
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
    const result = await db.runTransaction(async (transaction) => {
      // Verify order belongs to user
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        throw new Error('Order not found');
      }

      const order = orderSnap.data();
      if (order.userId !== userId && order.userEmail !== userEmail) {
        throw new Error('Order does not belong to this user');
      }

      // Get current balance
      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);
      const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;

      const newBalance = currentBalance + amount;

      // Update wallet
      transaction.set(
        walletRef,
        {
          balance: newBalance,
          email: userEmail,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      // Create refund history entry
      const historyRef = db.collection('walletHistory').doc();
      transaction.set(historyRef, {
        userId,
        userEmail,
        type: 'order_refund',
        amount: amount,
        balanceAfter: newBalance,
        ref: orderId,
        note: note || 'Order refund',
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
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to process refund');
  }
}
