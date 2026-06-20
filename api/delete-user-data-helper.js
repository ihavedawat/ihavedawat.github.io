// Shared utility for deleting user data across collections
import admin, { db } from './firebase-init.js';
import { FIRESTORE_BATCH_LIMIT } from './constants.js';

export async function deleteUserDataByEmail(userEmail) {
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
    // Silently continue on wallet delete failure
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
