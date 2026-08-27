import { FieldValue, Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorage } from "./firebase/admin";
import type { LessonFile } from "./types";

/**
 * Server-only Lessons CRUD for the Teaching view — Firestore for metadata,
 * Firebase Storage for the actual `.excalidraw` JSON bytes. Same split as
 * lib/resources.ts (deliberately not reusing that collection: lessons are
 * a distinct thing from the general file library, with their own
 * content-read/content-write routes below).
 */

const LESSONS = "lessonFiles";
const STORAGE_PREFIX = "lessons";
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

export async function listLessonFiles(): Promise<LessonFile[]> {
  const snap = await getAdminDb().collection(LESSONS).orderBy("title").get();
  return snap.docs.map((doc) => fromDoc<LessonFile>(doc));
}

export async function getLessonFile(id: string): Promise<LessonFile | null> {
  const doc = await getAdminDb().collection(LESSONS).doc(id).get();
  if (!doc.exists) return null;
  return fromDoc<LessonFile>(doc as QueryDocumentSnapshot<DocumentData>);
}

/** Creates a new lesson from an uploaded `.excalidraw`/`.json` file's raw bytes. */
export async function createLessonFile(buffer: Buffer, title: string): Promise<LessonFile> {
  const ref = getAdminDb().collection(LESSONS).doc();
  const storagePath = `${STORAGE_PREFIX}/${ref.id}.excalidraw`;
  await getAdminStorage().bucket().file(storagePath).save(buffer, { contentType: "application/json" });

  const now = FieldValue.serverTimestamp();
  await ref.set({ title, storagePath, size: buffer.byteLength, createdAt: now, updatedAt: now });
  const doc = await ref.get();
  return fromDoc<LessonFile>(doc as QueryDocumentSnapshot<DocumentData>);
}

/** Creates a brand-new blank lesson (no upload) — "New Lesson" in the Teaching sidebar. */
export async function createBlankLessonFile(title: string): Promise<LessonFile> {
  return createLessonFile(Buffer.from(JSON.stringify({ type: "excalidraw", version: 2, elements: [], appState: {} })), title);
}

export async function renameLessonFile(id: string, title: string): Promise<LessonFile | null> {
  const ref = getAdminDb().collection(LESSONS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  await ref.update({ title, updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<LessonFile>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteLessonFile(id: string): Promise<boolean> {
  const ref = getAdminDb().collection(LESSONS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  const record = fromDoc<LessonFile>(existing as QueryDocumentSnapshot<DocumentData>);
  await getAdminStorage().bucket().file(record.storagePath).delete({ ignoreNotFound: true });
  await ref.delete();
  return true;
}

/** The lesson's raw `.excalidraw` JSON bytes, parsed — what the Teaching view loads into the canvas. */
export async function readLessonContent(record: LessonFile): Promise<unknown> {
  const [buffer] = await getAdminStorage().bucket().file(record.storagePath).download();
  return JSON.parse(buffer.toString("utf-8"));
}

/** Overwrites the lesson's stored scene — the Teaching view's Save button. */
export async function writeLessonContent(id: string, scene: unknown): Promise<LessonFile | null> {
  const ref = getAdminDb().collection(LESSONS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  const record = fromDoc<LessonFile>(existing as QueryDocumentSnapshot<DocumentData>);

  const buffer = Buffer.from(JSON.stringify(scene));
  await getAdminStorage().bucket().file(record.storagePath).save(buffer, { contentType: "application/json" });
  await ref.update({ size: buffer.byteLength, updatedAt: FieldValue.serverTimestamp() });

  const doc = await ref.get();
  return fromDoc<LessonFile>(doc as QueryDocumentSnapshot<DocumentData>);
}

/** A short-lived signed URL for downloading the raw file — used by the sidebar's "Download" action, not by the canvas loader (that goes through the JSON content route instead, to avoid a client-side cross-origin fetch). */
export async function getSignedLessonUrl(record: LessonFile): Promise<string> {
  const [url] = await getAdminStorage()
    .bucket()
    .file(record.storagePath)
    .getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_TTL_MS });
  return url;
}
