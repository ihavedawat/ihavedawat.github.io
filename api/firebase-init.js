import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Initialize Firebase Admin with service account from env var
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  let credentials;

  try {
    credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS || '{}');
  } catch (e) {
    console.error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS:', e.message);
    throw new Error('Invalid GOOGLE_APPLICATION_CREDENTIALS JSON format');
  }

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID environment variable not set');
  }

  if (!credentials.project_id) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS must contain project_id field');
  }

  admin.initializeApp({
    credential: admin.credential.cert(credentials),
    projectId: projectId
  });
}

export const db = admin.firestore();
export default admin;
