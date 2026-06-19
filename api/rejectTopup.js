import admin, { db } from './firebase-init.js';

/**
 * Secure topup rejection
 * Only admins can reject topups (via Admin SDK)
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

  const adminEmail = decodedToken.email;
  const { topupId } = req.body;

  // Check if user is admin
  const adminEmails = ['ihavedawat@gmail.com', 'igotdawat@gmail.com'];
  if (!adminEmails.includes((adminEmail || '').toLowerCase())) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (!topupId) {
    return res.status(400).json({ error: 'Missing topupId' });
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 1. Get the topup
      const topupRef = db.collection('topups').doc(topupId);
      const topupSnap = await transaction.get(topupRef);

      if (!topupSnap.exists) {
        throw new Error('TOPUP_NOT_FOUND');
      }

      const topup = topupSnap.data();

      // 2. Check if already handled
      if (topup.status !== 'pending') {
        return { alreadyHandled: true, status: topup.status };
      }

      // 3. Update topup status
      transaction.update(topupRef, {
        status: 'rejected',
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminEmail: adminEmail.toLowerCase()
      });

      return {
        alreadyHandled: false,
        status: 'rejected'
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Reject topup error:', error);

    if (error.message === 'TOPUP_NOT_FOUND') {
      return res.status(404).json({ error: 'Topup not found' });
    }

    return res.status(500).json({ error: error.message || 'Failed to reject topup' });
  }
}
