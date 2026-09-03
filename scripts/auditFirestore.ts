/**
 * Read-only audit: every root collection in Firestore with its document
 * count, plus the Storage prefixes actually holding bytes. Run it to see
 * what's still live versus what a removed feature left behind.
 *
 *   npx tsx scripts/auditFirestore.ts
 *
 * Writes nothing. Deleting anything it flags is a separate, deliberate act.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { getAdminDb, getAdminStorage } from "../lib/firebase/admin";

/** Collections something in the app still reads or writes. Anything else the audit finds is orphaned. */
const IN_USE = new Set([
  "students",
  "transactions",
  "recurringTransactions",
  "tasks",
  "projects",
  "curriculum",
  "groups",
  "weeklyPlans",
  "weeklyPlanTags",
  "resourceFolders",
  "resourceFiles",
  "metaAudienceSnapshots",
  "scheduledMetaPosts",
]);

async function main() {
  const db = getAdminDb();
  const collections = await db.listCollections();

  console.log("Firestore root collections\n");
  for (const col of collections) {
    const count = (await col.count().get()).data().count;
    const flag = IN_USE.has(col.id) ? "   " : " ⚠ ";
    console.log(`${flag}${col.id.padEnd(24)} ${String(count).padStart(6)} docs${IN_USE.has(col.id) ? "" : "   ORPHANED"}`);
  }

  const [files] = await getAdminStorage().bucket().getFiles();
  const byPrefix = new Map<string, { count: number; bytes: number }>();
  for (const f of files) {
    const prefix = f.name.split("/")[0] ?? "(root)";
    const entry = byPrefix.get(prefix) ?? { count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes += Number(f.metadata.size ?? 0);
    byPrefix.set(prefix, entry);
  }

  console.log("\nStorage prefixes\n");
  for (const [prefix, { count, bytes }] of [...byPrefix].sort()) {
    console.log(`   ${prefix.padEnd(24)} ${String(count).padStart(6)} objects   ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
