import { initializeApp } from "firebase-admin/app";

// Cloud Functions get their credentials automatically at deploy time (or from
// the emulator locally) — no service account JSON needed here, unlike
// lib/firebase/admin.ts in the Next.js app.
initializeApp();

export { metaLeadReceiver } from "./metaLeadReceiver";
export { paymentReceiver } from "./paymentReceiver";
