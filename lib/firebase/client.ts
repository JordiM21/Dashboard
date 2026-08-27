import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

/**
 * Client-side Firebase SDK — safe to import from "use client" components.
 * Used for Firestore's real-time onSnapshot listeners (Phase 5).
 *
 * These NEXT_PUBLIC_* values are not secret — they identify the Firebase
 * project to the browser the same way a Google Sheets ID did, but unlike a
 * private Sheet, Firestore is reachable from anywhere once these are known.
 * Access control lives entirely in firestore.rules, not in these values.
 */
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// getApps() guard avoids "Firebase App named '[DEFAULT]' already exists" on Next.js hot reload.
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
