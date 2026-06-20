import admin, { db } from './firebase-init.js';

async function debitWallet(req, res, userId, userEmail) {
  const { amount, orderId, note } = req.body;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (!orderId) {
    return res.status(400).json({ error: 'Missing orderId' });
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
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

      if (order.debited === true) {
        throw new Error('Order already debited');
      }

      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);
      const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;

      if (currentBalance < amount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      const newBalance = currentBalance - amount;

      transaction.set(
        walletRef,
        {
          balance: newBalance,
          email: userEmail,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

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

      transaction.update(orderRef, {
        debited: true,
        debitedAt: admin.firestore.FieldValue.serverTimestamp()
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
    return sendErrorResponse(res, error, 'Failed to process payment');
  }
}

async function refundWallet(req, res, userId, userEmail) {
  const { amount, orderId, note } = req.body;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (!orderId) {
    return res.status(400).json({ error: 'Missing orderId' });
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        throw new Error('Order not found');
      }

      const order = orderSnap.data();
      if (order.userId !== userId && order.userEmail !== userEmail) {
        throw new Error('Order does not belong to this user');
      }

      if (order.refunded === true) {
        throw new Error('Order already refunded');
      }

      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);
      const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;

      const newBalance = currentBalance + amount;

      transaction.set(
        walletRef,
        {
          balance: newBalance,
          email: userEmail,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

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

      transaction.update(orderRef, {
        refunded: true,
        refundedAt: admin.firestore.FieldValue.serverTimestamp()
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
  const { action } = req.body;

  switch (action) {
    case 'debit':
      return debitWallet(req, res, userId, userEmail);
    case 'refund':
      return refundWallet(req, res, userId, userEmail);
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
}
