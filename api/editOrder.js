import admin from 'firebase-admin';

// Initialize Firebase Admin with service account from env var
if (!admin.apps.length) {
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(credentials),
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
  });
}

const db = admin.firestore();

/**
 * Secure order edit with wallet adjustment
 * Updates order and adjusts wallet for price difference
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
  const { orderId, items, total } = req.body;

  if (!orderId || !items || total === undefined) {
    return res.status(400).json({ error: 'Missing orderId, items, or total' });
  }

  try {
    // Query for wallet history BEFORE transaction (reads must be outside)
    const historySnap = await db.collection('walletHistory')
      .where('userId', '==', userId)
      .where('ref', '==', orderId)
      .limit(1)
      .get();

    const result = await db.runTransaction(async (transaction) => {
      // 1. Get the original order
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists) {
        throw new Error('Order not found');
      }

      const order = orderSnap.data();
      if (order.userId !== userId && order.userEmail !== userEmail) {
        throw new Error('Order does not belong to this user');
      }

      const prevTotal = Number(order.total || 0);
      const diff = total - prevTotal;

      // 2. Get wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);
      const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;

      if (diff > 0 && currentBalance < diff) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      const newBalance = currentBalance - diff;

      // 3. NOW do all the writes
      // Update order
      transaction.update(orderRef, {
        items,
        total,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update wallet if price changed
      if (diff !== 0) {
        transaction.update(walletRef, {
          balance: newBalance,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update history if it exists
        if (!historySnap.empty) {
          const histDocRef = historySnap.docs[0].ref;
          const newDebitAmount = -total;

          transaction.update(histDocRef, {
            amount: newDebitAmount,
            balanceAfter: newBalance,
            note: 'Order (edited)',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      return {
        success: true,
        newTotal: total
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Edit error:', error);

    if (error.message === 'INSUFFICIENT_FUNDS') {
      return res.status(402).json({ error: 'INSUFFICIENT_FUNDS' });
    }
    if (error.message === 'Order not found') {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (error.message === 'Order does not belong to this user') {
      return res.status(403).json({ error: 'Order does not belong to this user' });
    }

    return res.status(500).json({ error: error.message || 'Failed to edit order' });
  }
}
