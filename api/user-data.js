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

  const { action, email, userId, appId } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
  }

  try {
    if (action === 'delete-all') {
      let totalDeleted = 0;
      const appSnap = await db.collection('applications').get();
      for (const doc of appSnap.docs) {
        const docEmail = String(doc.data().email || '').toLowerCase();
        if (docEmail) {
          const count = await deleteUserDataByEmail(docEmail);
          totalDeleted += count;
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Deleted all user data',
        totalDeleted
      });
    } else if (action === 'wipe') {
      let lookupEmail = email;

      if (appId && (!email || email === null) && (!userId || userId === null)) {
        try {
          const appDoc = await db.collection('applications').doc(appId).get();
          if (!appDoc.exists) {
            return res.status(400).json({ error: 'Application not found' });
          }
          const appData = appDoc.data();
          lookupEmail = appData.email || appId;
        } catch (err) {
          console.error("Application lookup failed:", err);
          return res.status(400).json({ error: 'Application lookup failed' });
        }
      }

      if (userId && !lookupEmail) {
        try {
          const userRecord = await admin.auth().getUser(userId);
          lookupEmail = userRecord.email;
        } catch (err) {
          console.error("User lookup failed:", err);
          return res.status(400).json({ error: 'User not found' });
        }
      }

      if (!lookupEmail) {
        return res.status(400).json({ error: 'Missing email' });
      }

      const userEmail = String(lookupEmail || '').toLowerCase();
      if (!userEmail) {
        return res.status(400).json({ error: 'Invalid email' });
      }

      const totalDeleted = await deleteUserDataByEmail(userEmail);

      return res.status(200).json({
        success: true,
        message: `Wiped user data for ${userEmail}`,
        totalDeleted,
        email: userEmail
      });
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to process user data');
  }
}
