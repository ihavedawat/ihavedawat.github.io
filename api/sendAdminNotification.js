import admin, { db } from './firebase-init.js';

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

  const { message, link = "", linkText = "", type = "info" } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    // Create admin notification using Admin SDK (bypasses permission rules)
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
  } catch (error) {
    console.error('Send admin notification error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send notification' });
  }
}
