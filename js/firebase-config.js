// ============================================================
// Firebase Configuration
// ⚠️ REPLACE the values below with YOUR OWN from Firebase Console
//
// Steps to get these values:
//   1. Go to https://console.firebase.google.com
//   2. Open your project → ⚙️ Project Settings
//   3. Scroll to "Your apps" → copy the firebaseConfig object
//   4. Paste it below replacing the placeholder values
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

// 👇 REPLACE THIS BLOCK with your own Firebase config
const firebaseConfig = {
apiKey: "AIzaSyCn65hGSU_rayIk0yzaJrQv4qzEdPkgVes",
authDomain: "boarding-expense.firebaseapp.com",
projectId: "boarding-expense",
storageBucket: "boarding-expense.firebasestorage.app",
messagingSenderId: "1012179644838",
appId: "1:1012179644838:web:f673e4df0f628b0b1a5f67"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 🔑 Admin password — CHANGE THIS before deploying!
const ADMIN_PASSWORD = "Kalana@12";

export {
  db,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  ADMIN_PASSWORD
};
