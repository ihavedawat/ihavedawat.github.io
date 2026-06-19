import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFunctions }  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

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
export const functions = getFunctions(app);
