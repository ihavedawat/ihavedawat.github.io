import admin, { db } from './firebase-init.js';
import { ADMIN_EMAILS } from '../js/admin-config.js';
import { deleteUserDataByEmail } from './delete-user-data-helper.js';

async function deleteAllUserData(req, res, decodedToken) {
  const adminEmail = decodedToken.email;
  if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes((adminEmail || '').toLowerCase())) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { deleteAll } = req.body;

  try {
    let totalDeleted = 0;

    if (deleteAll) {
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

async function wipeUserData(req, res, decodedToken) {
  const adminEmail = decodedToken.email;
  if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes((adminEmail || '').toLowerCase())) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  let { email, userId, appId } = req.body;

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

async function sendNotification(req, res, decodedToken, requireAdmin = false) {
  if (requireAdmin) {
    const adminEmail = decodedToken.email;
    if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes((adminEmail || '').toLowerCase())) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
  }

  const { message, link = "", linkText = "", type = "info", action } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    if (action === 'admin-new-app') {
      await db.collection('notifications').add({
        userId: '',
        userEmail: '',
        audience: 'admin',
        message: String(message).substring(0, 500),
        link: 'applications#pending',
        linkText: 'Review',
        type: 'application-new',
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await db.collection('notifications').add({
        userId: "",
        userEmail: "",
        audience: "admin",
        message,
        link,
        linkText,
        type,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to send notification');
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

  const { action } = req.body;

  switch (action) {
    case 'delete-all':
      return deleteAllUserData(req, res, decodedToken);
    case 'wipe':
      return wipeUserData(req, res, decodedToken);
    case 'notify':
      return sendNotification(req, res, decodedToken, true);
    case 'admin-new-app':
    case 'notify-system':
      return sendNotification(req, res, decodedToken, false);
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
}
