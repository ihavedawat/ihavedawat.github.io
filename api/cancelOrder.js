import admin, { db } from './firebase-init.js';

/**
 * Secure order cancellation with refund
 * 1. Verifies order belongs to user
 * 2. Checks order status can be cancelled
 * 3. Refunds wallet amount
 * 4. Marks order as cancelled
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: 'Missing orderId' });
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 1. Get the order
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        throw new Error('Order not found');
      }

      const order = orderSnap.data();

      // 2. Verify order belongs to this user
      if (order.userId !== userId && order.userEmail !== userEmail) {
        throw new Error('Order does not belong to this user');
      }

      // 3. Check order can be cancelled
      if (order.status === 'cancelled') {
        throw new Error('Order already cancelled');
      }
      if (order.status !== 'placed') {
        throw new Error('Order cannot be cancelled (status: ' + order.status + ')');
      }

      // 4. Refund wallet if order was paid
      const refundAmount = Number(order.total || 0);
      if (refundAmount > 0 && order.paid) {
        const walletRef = db.collection('wallets').doc(userId);
        const walletSnap = await transaction.get(walletRef);
        const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;
        const newBalance = currentBalance + refundAmount;

        transaction.update(walletRef, {
          balance: newBalance,
          email: userEmail.toLowerCase(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Create refund history entry
        const historyRef = db.collection('walletHistory').doc();
        transaction.set(historyRef, {
          userId,
          userEmail: userEmail.toLowerCase(),
          type: 'order_refund',
          amount: refundAmount,
          balanceAfter: newBalance,
          ref: orderId,
          note: 'Order (cancelled) for ' + order.forDate,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // 5. Mark order as cancelled
      transaction.update(orderRef, {
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'Order cancelled successfully'
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to cancel order');
  }
}
