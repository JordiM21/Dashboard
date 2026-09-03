/**
 * One-time purge of data left behind by features that no longer exist:
 * the Games view, the embedded Excalidraw whiteboard, and a handful of
 * older collections nothing in the codebase has read for a while.
 *
 * Dry run (default — lists what it WOULD delete, changes nothing):
 *   npx tsx scripts/purgeOrphanedData.ts
 *
 * For real:
 *   npx tsx scripts/purgeOrphanedData.ts --yes
 *
 * Deleting is irreversible; Firestore has no undo. Run scripts/auditFirestore.ts
 * first, and only pass --yes once its output matches what you expect.
 *
 * Deliberately NOT touched: the local ./lessons folder (your own .excalidraw
 * boards — the whole point of the new workflow), and every collection the app
 * still reads. Only the names listed below are ever addressed, so a typo can
 * shrink the purge but can never widen it.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { getAdminDb, getAdminStorage } from "../lib/firebase/admin";

/** Root collections to delete outright, with why each one is dead. */
const COLLECTIONS: { name: string; why: string }[] = [
  { name: "games", why: "Games view removed" },
  { name: "lessonFiles", why: "old Teaching lessons library — superseded by weeklyPlans" },
  { name: "weeklyPlanFolders", why: "lesson folders removed; a group + a date files a lesson now" },
  { name: "curriculumLevelNotes", why: "never read by any code path" },
  { name: "agents", why: "never read by any code path" },
  { name: "content", why: "never read by any code path" },
  { name: "dashboardMonths", why: "never read by any code path" },
];

/** Storage prefixes to delete, with why. */
const PREFIXES: { name: string; why: string }[] = [
  { name: "gameAudio/", why: "Spelling Bee clips — Games view removed" },
  { name: "lessons/", why: "cloud copies of the embedded whiteboard's scenes; local ./lessons is untouched" },
];

const commit = process.argv.includes("--yes");

async function main() {
  const db = getAdminDb();
  const bucket = getAdminStorage().bucket();

  console.log(commit ? "PURGING (irreversible)\n" : "DRY RUN — nothing will be deleted. Re-run with --yes to commit.\n");

  for (const { name, why } of COLLECTIONS) {
    // Sub-collections (e.g. a game's own children) would survive a plain
    // doc delete and become unreachable orphans, so recursiveDelete is what
    // actually clears the tree rather than just its roots.
    const snap = await db.collection(name).get();
    if (snap.empty) {
      console.log(`   ${name.padEnd(22)} already empty`);
      continue;
    }
    console.log(`${commit ? " ✗ " : "   "}${name.padEnd(22)} ${String(snap.size).padStart(4)} docs   (${why})`);
    if (commit) await db.recursiveDelete(db.collection(name));
  }

  console.log("");

  for (const { name, why } of PREFIXES) {
    const [files] = await bucket.getFiles({ prefix: name });
    if (files.length === 0) {
      console.log(`   ${name.padEnd(22)} already empty`);
      continue;
    }
    const mb = files.reduce((sum, f) => sum + Number(f.metadata.size ?? 0), 0) / 1024 / 1024;
    console.log(`${commit ? " ✗ " : "   "}${name.padEnd(22)} ${String(files.length).padStart(4)} objects  ${mb.toFixed(2)} MB   (${why})`);
    if (commit) await bucket.deleteFiles({ prefix: name });
  }

  console.log(commit ? "\nDone. Re-run scripts/auditFirestore.ts to confirm." : "\nNothing changed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
