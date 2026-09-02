/**
 * One-time migration: uploads every .excalidraw scene in lessons/ (the old
 * local-disk store) into Firebase Storage under the same key, so lesson
 * boards drawn before Teaching moved off local disk aren't lost.
 *
 * Local disk worked on a laptop and failed on Vercel, whose lambda filesystem
 * is read-only — every save returned `EROFS: read-only file system`. See the
 * header of lib/firebase/weeklyPlans.ts.
 *
 * Safe to run more than once — skips any scene already in Storage rather than
 * overwriting it, so a board edited in production is never clobbered by the
 * stale copy still sitting on disk.
 *
 * Run from the project root:
 *   npx tsx scripts/migrateLessonsToStorage.ts
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import fs from "fs";
import path from "path";
import { getAdminStorage } from "../lib/firebase/admin";

const ROOT = path.join(process.cwd(), "lessons");

/** Every .excalidraw under lessons/, as posix keys relative to the project root. */
function findScenes(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findScenes(full);
    if (!entry.name.endsWith(".excalidraw")) return [];
    return [path.relative(process.cwd(), full).split(path.sep).join("/")];
  });
}

async function main() {
  if (!fs.existsSync(ROOT)) {
    console.log("No lessons/ directory found — nothing to migrate.");
    return;
  }

  const bucket = getAdminStorage().bucket();
  const keys = findScenes(ROOT);
  console.log(`Found ${keys.length} scene(s) on disk.`);

  let uploaded = 0;
  let skipped = 0;
  for (const key of keys) {
    const file = bucket.file(key);
    const [exists] = await file.exists();
    if (exists) {
      console.log(`  skip    ${key} (already in Storage)`);
      skipped++;
      continue;
    }
    await file.save(fs.readFileSync(path.join(process.cwd(), key)), {
      contentType: "application/json",
    });
    console.log(`  upload  ${key}`);
    uploaded++;
  }

  console.log(`\nDone — ${uploaded} uploaded, ${skipped} already present.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
