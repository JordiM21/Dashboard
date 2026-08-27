import { FieldValue, Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorage } from "./firebase/admin";
import type { ResourceFile, ResourceFolder, ResourcesManifest } from "./types";

/**
 * Server-only Resources CRUD — Firestore for folder/file metadata, Firebase
 * Storage for the actual bytes. Replaces an earlier local-disk (fs) version:
 * that broke as soon as this app ran anywhere other than the developer's own
 * machine, since a deployed server's filesystem is typically read-only (or
 * ephemeral) outside the request that wrote to it. This follows the same
 * Firestore CRUD convention as lib/firebase/db.ts (doc id = Firestore's own
 * id, createdAt/updatedAt via serverTimestamp()).
 */

const FOLDERS = "resourceFolders";
const FILES = "resourceFiles";
const STORAGE_PREFIX = "resources";
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

function tsToIso(value: unknown): string | undefined {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return undefined;
}

function fromDoc<T>(doc: QueryDocumentSnapshot<DocumentData>): T {
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  } as T;
}

export async function readManifest(): Promise<ResourcesManifest> {
  const db = getAdminDb();
  const [foldersSnap, filesSnap] = await Promise.all([
    db.collection(FOLDERS).orderBy("createdAt").get(),
    db.collection(FILES).orderBy("createdAt", "desc").get(),
  ]);
  return {
    folders: foldersSnap.docs.map((doc) => fromDoc<ResourceFolder>(doc)),
    files: filesSnap.docs.map((doc) => fromDoc<ResourceFile>(doc)),
  };
}

export async function createFolder(name: string, parentId: string | null): Promise<ResourceFolder> {
  const ref = getAdminDb().collection(FOLDERS).doc();
  await ref.set({ name, parentId, createdAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<ResourceFolder>(doc as QueryDocumentSnapshot<DocumentData>);
}

/** Returns false if the folder doesn't exist, or if moving it into `parentId` would create a cycle. */
export async function updateFolder(
  id: string,
  updates: { name?: string; parentId?: string | null }
): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.collection(FOLDERS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;

  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;

  if (updates.parentId !== undefined) {
    const allFolders = (await db.collection(FOLDERS).get()).docs.map((d) => fromDoc<ResourceFolder>(d));
    let cursor = updates.parentId;
    while (cursor) {
      if (cursor === id) return false; // would nest a folder inside itself
      cursor = allFolders.find((f) => f.id === cursor)?.parentId ?? null;
    }
    patch.parentId = updates.parentId;
  }

  await ref.update(patch);
  return true;
}

/** Recursively deletes a folder, its subfolders, and every file inside them (Storage objects included). */
export async function deleteFolder(id: string): Promise<boolean> {
  const db = getAdminDb();
  const allFolders = (await db.collection(FOLDERS).get()).docs.map((d) => fromDoc<ResourceFolder>(d));
  if (!allFolders.some((f) => f.id === id)) return false;

  const toDelete = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of allFolders) {
      if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
        toDelete.add(f.id);
        grew = true;
      }
    }
  }

  const allFiles = (await db.collection(FILES).get()).docs.map((d) => fromDoc<ResourceFile>(d));
  for (const file of allFiles) {
    if (file.folderId && toDelete.has(file.folderId)) {
      await deleteFile(file.id);
    }
  }

  const batch = db.batch();
  for (const folderId of toDelete) batch.delete(db.collection(FOLDERS).doc(folderId));
  await batch.commit();
  return true;
}

export async function saveFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folderId: string | null,
  title?: string
): Promise<ResourceFile> {
  const ref = getAdminDb().collection(FILES).doc();
  const storagePath = `${STORAGE_PREFIX}/${ref.id}/${originalName}`;
  await getAdminStorage().bucket().file(storagePath).save(buffer, { contentType: mimeType });

  const now = FieldValue.serverTimestamp();
  await ref.set({
    title: title?.trim() || originalName,
    description: "",
    tags: [],
    folderId,
    originalName,
    storagePath,
    mimeType,
    size: buffer.byteLength,
    createdAt: now,
    updatedAt: now,
  });
  const doc = await ref.get();
  return fromDoc<ResourceFile>(doc as QueryDocumentSnapshot<DocumentData>);
}

/** The "+ Create" menu — a blank .md/.txt file, saved and opened for editing immediately. Reuses saveFile's storage/Firestore write, just with generated bytes instead of an upload. */
export async function createBlankFile(kind: "markdown" | "text", title: string, folderId: string | null): Promise<ResourceFile> {
  const spec = {
    markdown: { ext: "md", mimeType: "text/markdown", content: `# ${title}\n` },
    text: { ext: "txt", mimeType: "text/plain", content: "" },
  }[kind];
  return saveFile(Buffer.from(spec.content, "utf-8"), `${title}.${spec.ext}`, spec.mimeType, folderId, title);
}

/** Downloads a file's bytes as text — the resource visualizer's editor for markdown/text content. */
export async function readFileText(record: ResourceFile): Promise<string> {
  const [buffer] = await getAdminStorage().bucket().file(record.storagePath).download();
  return buffer.toString("utf-8");
}

/** Downloads a file's raw bytes — served same-origin (not a redirect to the signed Storage URL) so the browser never taints a <canvas> drawn from it, which the image "Copy" button relies on. */
export async function readFileBuffer(record: ResourceFile): Promise<Buffer> {
  const [buffer] = await getAdminStorage().bucket().file(record.storagePath).download();
  return buffer;
}

/** Overwrites a file's bytes in place (same storagePath) — the resource visualizer's Save action for markdown/text/excalidraw edits. */
export async function writeFileContent(id: string, content: string): Promise<ResourceFile | null> {
  const ref = getAdminDb().collection(FILES).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  const record = fromDoc<ResourceFile>(existing as QueryDocumentSnapshot<DocumentData>);

  const buffer = Buffer.from(content, "utf-8");
  await getAdminStorage().bucket().file(record.storagePath).save(buffer, { contentType: record.mimeType });
  await ref.update({ size: buffer.byteLength, updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<ResourceFile>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function updateFile(
  id: string,
  updates: Partial<Pick<ResourceFile, "title" | "description" | "tags" | "folderId">>
): Promise<ResourceFile | null> {
  const ref = getAdminDb().collection(FILES).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.tags !== undefined) patch.tags = updates.tags;
  if (updates.folderId !== undefined) patch.folderId = updates.folderId;

  await ref.update(patch);
  const doc = await ref.get();
  return fromDoc<ResourceFile>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteFile(id: string): Promise<boolean> {
  const ref = getAdminDb().collection(FILES).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;

  const record = fromDoc<ResourceFile>(existing as QueryDocumentSnapshot<DocumentData>);
  await getAdminStorage().bucket().file(record.storagePath).delete({ ignoreNotFound: true });
  await ref.delete();
  return true;
}

export async function getFileRecord(id: string): Promise<ResourceFile | null> {
  const doc = await getAdminDb().collection(FILES).doc(id).get();
  if (!doc.exists) return null;
  return fromDoc<ResourceFile>(doc as QueryDocumentSnapshot<DocumentData>);
}

/** A short-lived signed URL for reading the file's bytes straight from Storage — supports Range requests natively (image/video preview, downloads) without this app having to stream/proxy the bytes itself. */
export async function getSignedFileUrl(record: ResourceFile): Promise<string> {
  const [url] = await getAdminStorage()
    .bucket()
    .file(record.storagePath)
    .getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_TTL_MS });
  return url;
}
