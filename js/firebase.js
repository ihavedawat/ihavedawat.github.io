// ===== Firebase setup =====
// Vanilla HTML / no build tools, so we import the SDK modules directly
// from Google's CDN as ES modules. The config below is from the Firebase
// Console (Project settings → Your apps → dawat-web).
//
// IMPORTANT: this `firebaseConfig` is safe to ship publicly. Firebase
// enforces access via Firestore Security Rules + Auth, NOT by hiding the
// API key. We'll write rules later to lock things down.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsHARUEFuBtY5VI-0XdkMhaOlSc7IPaEY",
  authDomain: "igotdawat-v1.firebaseapp.com",
  projectId: "igotdawat-v1",
  storageBucket: "igotdawat-v1.firebasestorage.app",
  messagingSenderId: "706015685088",
  appId: "1:706015685088:web:30b7a7c479a23517afa385"
};

// Single shared Firebase app instance for the whole site.
export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
