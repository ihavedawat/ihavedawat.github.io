import admin, { db } from './firebase-init.js';
import { sendErrorResponse } from './error-handler.js';

async function clearPasswordChangeFlag(req, res, userId, userEmail) {
  try {
    const q = db.collection('applications').where('email', '==', userEmail.toLowerCase());
    const snap = await q.get();

    if (snap.empty) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const appDoc = snap.docs[0];
    if (!appDoc.data().mustChangePassword) {
      return res.status(200).json({ success: true, message: 'Flag already cleared' });
    }

    await appDoc.ref.update({
      mustChangePassword: false,
      passwordChangedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({ success: true, message: 'Password change flag cleared' });
  } catch (error) {
    console.error('Error clearing password flag:', error);
    return sendErrorResponse(res, error, 'Failed to clear password change flag');
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

  const userId = decodedToken.uid;
  const userEmail = decodedToken.email;
  const { action } = req.body;

  switch (action) {
    case 'clearPasswordFlag':
      return clearPasswordChangeFlag(req, res, userId, userEmail);
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
}
