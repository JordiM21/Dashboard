import fs from "fs";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getStorage, type Storage } from "firebase-admin/storage";

/**
 * Server-only Firebase Admin SDK — for Next.js Route Handlers (app/api/**).
 * Never import this from a "use client" component; it holds a private key.
 *
 * Cloud Functions in functions/src do NOT import this file — they run as a
 * separate deployable Node project with their own firebase-admin init,
 * since Firebase provisions their credentials automatically at deploy time.
 */
export class FirebaseNotConfiguredError extends Error {
  constructor(detail?: string) {
    super(
      detail ??
        "Set FIREBASE_SERVICE_ACCOUNT_KEY_PATH (recommended) or FIREBASE_SERVICE_ACCOUNT_KEY in .env.local — see README.md."
    );
    this.name = "FirebaseNotConfiguredError";
  }
}

let adminApp: App | null = null;

function loadServiceAccount(): Record<string, unknown> {
  // Preferred: point at the JSON file Firebase gave you directly — no
  // manual escaping of the multi-line private_key field required. Falls
  // through to FIREBASE_SERVICE_ACCOUNT_KEY below if the file is missing
  // (e.g. a path from a teammate's machine left in .env.local) instead of
  // hard-failing — only a malformed file that *does* exist is fatal.
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  if (path && fs.existsSync(path)) {
    try {
      return JSON.parse(fs.readFileSync(path, "utf-8"));
    } catch (err) {
      throw new FirebaseNotConfiguredError(
        `Couldn't parse the file at FIREBASE_SERVICE_ACCOUNT_KEY_PATH as JSON: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  }

  // Fallback: the JSON pasted directly into an env var as one line.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new FirebaseNotConfiguredError(
        `FIREBASE_SERVICE_ACCOUNT_KEY isn't valid JSON (${
          err instanceof Error ? err.message : err
        }). This usually means real line breaks got mixed into the value — ` +
          "prefer FIREBASE_SERVICE_ACCOUNT_KEY_PATH instead, pointing at the downloaded JSON file, to avoid this entirely."
      );
    }
  }

  throw new FirebaseNotConfiguredError();
}

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  const serviceAccount = loadServiceAccount();
  adminApp = initializeApp({
    credential: cert(serviceAccount as any),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
  return adminApp;
}

/** Lazily initializes so importing this module never throws — only calling getAdminDb() without credentials does. */
export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

/** Used to verify a client's Firebase ID token server-side — see lib/firebase/verifyAuth.ts. */
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

/** Server-only Storage access (Resources file uploads/downloads) — see lib/firebase/resources.ts. */
export function getAdminStorage(): Storage {
  return getStorage(getAdminApp());
}
