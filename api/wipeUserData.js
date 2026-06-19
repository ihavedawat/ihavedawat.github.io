import admin, { db } from './firebase-init.js';
import { ADMIN_EMAILS } from '../js/admin-config.js';

/**
 * Secure data wipe for admin
 * Deletes all user data across all collections
 * Only admins can perform this operation
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
  let { email, userId } = req.body;

  if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes((adminEmail || '').toLowerCase())) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // If userId is provided but no email, look it up from Firebase Auth
  if (userId && !email) {
    try {
      const userRecord = await admin.auth().getUser(userId);
      email = userRecord.email;
    } catch (err) {
      return res.status(400).json({ error: 'User not found' });
    }
  }

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  try {
    const userEmail = String(email || '').toLowerCase();
    if (!userEmail) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    let foundUid = null;
    let totalDeleted = 0;

    // 1. Delete wallets
    try {
      const walletsSnap = await db.collection('wallets').where('email', '==', userEmail).get();
      for (const doc of walletsSnap.docs) {
        if (!foundUid) foundUid = doc.id;
        await doc.ref.delete();
        totalDeleted++;
      }
    } catch (err) {
      console.error('Wallet delete failed:', err);
    }

    // 2. Delete collections by email
    const collections = ['orders', 'walletHistory', 'topups'];
    for (const collName of collections) {
      const snap = await db.collection(collName).where('userEmail', '==', userEmail).get();
      if (!snap.empty) {
        if (!foundUid) {
          const withUid = snap.docs.find(d => d.data().userId);
          if (withUid) foundUid = withUid.data().userId;
        }
        const batch = admin.firestore().batch();
        let count = 0;
        for (const doc of snap.docs) {
          batch.delete(doc.ref);
          count++;
          if (count >= 450) {
            await batch.commit();
            totalDeleted += count;
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
          totalDeleted += count;
        }
      }
    }

    // 3. Delete notifications by userId if found
    if (foundUid) {
      const notifSnap = await db.collection('notifications').where('userId', '==', foundUid).get();
      if (!notifSnap.empty) {
        const batch = admin.firestore().batch();
        let count = 0;
        for (const doc of notifSnap.docs) {
          batch.delete(doc.ref);
          count++;
          if (count >= 450) {
            await batch.commit();
            totalDeleted += count;
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
          totalDeleted += count;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Wiped user data for ${userEmail}`,
      totalDeleted
    });
  } catch (error) {
    console.error('Wipe user data error:', error);
    return res.status(500).json({ error: error.message || 'Failed to wipe user data' });
  }
}
