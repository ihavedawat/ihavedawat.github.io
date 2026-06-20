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
  let { email, userId, appId } = req.body;

  if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes((adminEmail || '').toLowerCase())) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // If appId is provided but no email/userId, look up the application document
  if (appId && (!email || email === null) && (!userId || userId === null)) {
    try {
      const appDoc = await db.collection('applications').doc(appId).get();
      if (!appDoc.exists) {
        return res.status(400).json({ error: 'Application not found' });
      }
      const appData = appDoc.data();
      email = appData.email || appId;
      userId = appData.userId;
    } catch (err) {
      console.error("Application lookup failed:", err);
      return res.status(400).json({ error: 'Application lookup failed' });
    }
  }

  // If userId is provided but no email, look it up from Firebase Auth
  if (userId && !email) {
    try {
      const userRecord = await admin.auth().getUser(userId);
      email = userRecord.email;
    } catch (err) {
      console.error("User lookup failed:", err);
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

    const totalDeleted = await deleteUserDataByEmail(userEmail);

    return res.status(200).json({
      success: true,
      message: `Wiped user data for ${userEmail}`,
      totalDeleted,
      email: userEmail
    });
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to wipe user data');
  }
}
