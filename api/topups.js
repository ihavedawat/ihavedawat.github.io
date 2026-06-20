import admin, { db } from './firebase-init.js';
import { ADMIN_EMAILS } from '../js/admin-config.js';

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

  const adminEmail = decodedToken.email;
  if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes((adminEmail || '').toLowerCase())) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { action, topupId } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
  }
  if (!topupId) {
    return res.status(400).json({ error: 'Missing topupId' });
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      const topupRef = db.collection('topups').doc(topupId);
      const topupSnap = await transaction.get(topupRef);

      if (!topupSnap.exists) {
        throw new Error('TOPUP_NOT_FOUND');
      }

      const topup = topupSnap.data();

      if (topup.status !== 'pending') {
        return { alreadyHandled: true, status: topup.status };
      }

      if (action === 'confirm') {
        const amount = Number(topup.amount || 0);
        if (amount <= 0) {
          throw new Error('Invalid topup amount');
        }

        const walletRef = db.collection('wallets').doc(topup.userId);
        const walletSnap = await transaction.get(walletRef);
        const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;
        const newBalance = currentBalance + amount;

        transaction.set(walletRef, {
          balance: newBalance,
          email: topup.userEmail,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const historyRef = db.collection('walletHistory').doc();
        transaction.set(historyRef, {
          userId: topup.userId,
          userEmail: topup.userEmail,
          type: 'topup',
          amount,
          balanceAfter: newBalance,
          ref: topupId,
          note: 'BRAC ref ' + (topup.bankRef || ''),
          byAdmin: adminEmail.toLowerCase(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.update(topupRef, {
          status: 'confirmed',
          confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          adminEmail: adminEmail.toLowerCase()
        });

        return {
          alreadyHandled: false,
          status: 'confirmed',
          balance: newBalance
        };
      } else if (action === 'reject') {
        transaction.update(topupRef, {
          status: 'rejected',
          rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
          adminEmail: adminEmail.toLowerCase()
        });

        return {
          alreadyHandled: false,
          status: 'rejected'
        };
      } else {
        throw new Error('Invalid action');
      }
    });

    return res.status(200).json(result);
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to process top-up');
  }
}
