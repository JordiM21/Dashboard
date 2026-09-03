/**
 * One-time migration: uploads data/projects/*.md into Firestore (collection
 * "projects"), so the Projects page can move off fs reads — the same problem
 * Resources had: a typical deployed host's filesystem is read-only/ephemeral,
 * so the page would break (or silently fail to persist writes) once deployed
 * anywhere but your own machine.
 *
 * Safe to run more than once — skips any doc whose title already exists in
 * the matching Firestore collection.
 *
 * Run from the project root:
 *   npx tsx scripts/migrateMarkdownToFirebase.ts
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { getAdminDb } from "../lib/firebase/admin";

const DATA_ROOT = path.join(process.cwd(), "data");

async function migrateCollection(dirName: string, firestoreCollection: string) {
  const dir = path.join(DATA_ROOT, dirName);
  if (!fs.existsSync(dir)) {
    console.log(`No data/${dirName}/ found — skipping.`);
    return { created: 0, skipped: 0 };
  }

  const db = getAdminDb();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  let created = 0;
  let skipped = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    const { data, content } = matter(raw);
    const title = (data.title ?? data.name) as string | undefined;
    if (!title) {
      console.warn(`Skipping ${dirName}/${file} — no title/name in frontmatter.`);
      continue;
    }

    const existing = await db.collection(firestoreCollection).where("title", "==", title).limit(1).get();
    const existingByName =
      existing.empty && data.name
        ? await db.collection(firestoreCollection).where("name", "==", data.name).limit(1).get()
        : existing;
    if (!existingByName.empty) {
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    await db.collection(firestoreCollection).add({
      ...data,
      content: content.trim(),
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Migrated ${dirName}/${file} -> ${firestoreCollection}`);
    created++;
  }

  return { created, skipped };
}

async function main() {
  const projects = await migrateCollection("projects", "projects");
  console.log(`\nDone. Projects: ${projects.created} created, ${projects.skipped} already existed.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
