/**
 * One-time migration: uploads everything in data/resources/ (the old
 * local-disk store) into Firebase Storage + Firestore, so files added before
 * the Resources feature moved off local disk aren't lost.
 *
 * Safe to run more than once — skips any folder/file whose name already
 * exists in Firestore rather than duplicating it.
 *
 * Run from the project root:
 *   npx tsx scripts/migrateResourcesToFirebase.ts
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import fs from "fs";
import path from "path";
import { getAdminDb, getAdminStorage } from "../lib/firebase/admin";
import type { ResourcesManifest } from "../lib/types";

const ROOT = path.join(process.cwd(), "data", "resources");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");
const FILES_DIR = path.join(ROOT, "files");

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log("No data/resources/manifest.json found — nothing to migrate.");
    return;
  }

  const manifest: ResourcesManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  const db = getAdminDb();
  const bucket = getAdminStorage().bucket();

  const folderIdMap = new Map<string, string>(); // old local id -> new Firestore id
  let foldersCreated = 0;
  let foldersSkipped = 0;

  // Folders first, in creation order, so a child's parentId can always be remapped.
  const sortedFolders = [...manifest.folders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const folder of sortedFolders) {
    const existing = await db.collection("resourceFolders").where("name", "==", folder.name).limit(1).get();
    if (!existing.empty) {
      folderIdMap.set(folder.id, existing.docs[0]!.id);
      foldersSkipped++;
      continue;
    }

    const ref = db.collection("resourceFolders").doc();
    await ref.set({
      name: folder.name,
      parentId: folder.parentId ? folderIdMap.get(folder.parentId) ?? null : null,
      createdAt: folder.createdAt,
    });
    folderIdMap.set(folder.id, ref.id);
    foldersCreated++;
  }

  let filesCreated = 0;
  let filesSkipped = 0;
  let filesMissing = 0;

  for (const file of manifest.files) {
    const existing = await db
      .collection("resourceFiles")
      .where("originalName", "==", file.originalName)
      .where("title", "==", file.title)
      .limit(1)
      .get();
    if (!existing.empty) {
      filesSkipped++;
      continue;
    }

    const localPath = path.join(FILES_DIR, (file as any).storedName ?? "");
    if (!fs.existsSync(localPath)) {
      console.warn(`Skipping "${file.title}" — blob missing at ${localPath}.`);
      filesMissing++;
      continue;
    }

    const ref = db.collection("resourceFiles").doc();
    const storagePath = `resources/${ref.id}/${file.originalName}`;
    await bucket.upload(localPath, { destination: storagePath, metadata: { contentType: file.mimeType } });

    await ref.set({
      title: file.title,
      description: file.description,
      tags: file.tags,
      folderId: file.folderId ? folderIdMap.get(file.folderId) ?? null : null,
      originalName: file.originalName,
      storagePath,
      mimeType: file.mimeType,
      size: file.size,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    });
    console.log(`Uploaded "${file.title}" -> ${storagePath}`);
    filesCreated++;
  }

  console.log(
    `\nDone. Folders: ${foldersCreated} created, ${foldersSkipped} already existed. ` +
      `Files: ${filesCreated} uploaded, ${filesSkipped} already existed, ${filesMissing} missing on disk.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
