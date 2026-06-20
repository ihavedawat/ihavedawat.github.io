import admin, { db } from './firebase-init.js';
import { ADMIN_EMAILS } from '../js/admin-config.js';

const FIRESTORE_BATCH_LIMIT = 450;

async function purgeUserDataByEmail(userEmail) {
  const e = String(userEmail || '').toLowerCase();
  if (!e) return 0;

  let totalDeleted = 0;
  let foundUid = null;

  // Delete wallets
  try {
    const wsnap = await db.collection('wallets').where('email', '==', e).get();
    for (const d of wsnap.docs) {
      if (!foundUid) foundUid = d.id;
      await d.ref.delete();
      totalDeleted++;
    }
  } catch (err) {
    console.error('Wallet purge failed for ' + e, err);
  }

  // Delete orders, walletHistory, topups
  const cols = ['orders', 'walletHistory', 'topups'];
  for (const col of cols) {
    const snap = await db.collection(col).where('userEmail', '==', e).get();
    if (snap.empty) continue;
    if (!foundUid) {
      const withUid = snap.docs.find((d) => d.data().userId);
      if (withUid) foundUid = withUid.data().userId;
    }
    let batch = admin.firestore().batch();
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      n++;
      if (n >= FIRESTORE_BATCH_LIMIT) {
        await batch.commit();
        totalDeleted += n;
        batch = admin.firestore().batch();
        n = 0;
      }
    }
    if (n) {
      await batch.commit();
      totalDeleted += n;
    }
  }

  // Delete notifications by email and userId
  const seen = new Set();
  const deleteNotifs = async (query) => {
    const snap = await query.get();
    if (snap.empty) return;
    let batch = admin.firestore().batch();
    let n = 0;
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      if (!foundUid && d.data().userId) foundUid = d.data().userId;
      batch.delete(d.ref);
      n++;
      if (n >= FIRESTORE_BATCH_LIMIT) {
        await batch.commit();
        totalDeleted += n;
        batch = admin.firestore().batch();
        n = 0;
      }
    }
    if (n) {
      await batch.commit();
      totalDeleted += n;
    }
  };

  await deleteNotifs(db.collection('notifications').where('userEmail', '==', e));
  if (foundUid) {
    await deleteNotifs(db.collection('notifications').where('userId', '==', foundUid));
  }

  return totalDeleted;
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

  const adminEmail = decodedToken.email;
  if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes((adminEmail || '').toLowerCase())) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { purgeAll } = req.body;

  try {
    let totalPurged = 0;

    if (purgeAll) {
      // Purge all users
      const appSnap = await db.collection('applications').get();
      for (const doc of appSnap.docs) {
        const email = String(doc.data().email || '').toLowerCase();
        if (email) {
          const count = await purgeUserDataByEmail(email);
          totalPurged += count;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: purgeAll ? 'Purged all user data' : 'Done',
      totalPurged
    });
  } catch (error) {
    console.error('Purge all user data error:', error);
    return res.status(500).json({ error: error.message || 'Failed to purge data' });
  }
}
