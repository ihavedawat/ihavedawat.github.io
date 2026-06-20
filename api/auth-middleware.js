import admin from 'firebase-init.js';

export async function verifyAuth(req) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return { error: 'Missing authorization token', status: 401 };
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return { decodedToken };
  } catch (err) {
    return { error: 'Invalid token', status: 401 };
  }
}
