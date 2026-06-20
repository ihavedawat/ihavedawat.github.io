import admin, { db } from './firebase-init.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
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

  try {
    if (action === 'send-admin') {
      const adminEmails = ['ihavedawat@gmail.com', 'igotdawat@gmail.com'];
      if (!adminEmails.includes(decodedToken.email)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const { message, link = "", linkText = "", type = "info" } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Missing message' });
      }

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

      return res.status(200).json({ success: true });
    } else if (action === 'notify-system' || action === 'notify-new-application') {
      const { message, link = "", linkText = "", type = "info" } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Invalid message' });
      }

      await db.collection('notifications').add({
        userId: '',
        userEmail: '',
        audience: 'admin',
        message: String(message).substring(0, 500),
        link: link || (action === 'notify-new-application' ? 'applications#pending' : ''),
        linkText: linkText || (action === 'notify-new-application' ? 'Review' : ''),
        type: type || (action === 'notify-new-application' ? 'application-new' : 'info'),
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({ success: true });
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to send notification');
  }
}
