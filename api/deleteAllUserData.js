import admin, { db } from './firebase-init.js';
import { ADMIN_EMAILS } from '../js/admin-config.js';
import { deleteUserDataByEmail } from './delete-user-data-helper.js';

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

  const { deleteAll } = req.body;

  try {
    let totalDeleted = 0;

    if (deleteAll) {
      // Delete all users
      const appSnap = await db.collection('applications').get();
      for (const doc of appSnap.docs) {
        const email = String(doc.data().email || '').toLowerCase();
        if (email) {
          const count = await deleteUserDataByEmail(email);
          totalDeleted += count;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: deleteAll ? 'Deleted all user data' : 'Done',
      totalDeleted
    });
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to delete data');
  }
}
