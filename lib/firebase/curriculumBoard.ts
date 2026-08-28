import type { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "./admin";
import type { CurriculumLevelDoc, GroupDoc, GroupHistoryEntry } from "@/lib/types";

/**
 * Server-only Firestore CRUD for the new Curriculum Board — replaces the
 * regex parsing in lib/curriculum.ts (curriculum-20-levels.md,
 * group-history.md). See lib/types.ts for the collection shapes and
 * app/api/board/** for the routes that call these.
 */

const CURRICULUM = "curriculum";
const GROUPS = "groups";
const HISTORY = "history";
const RECALL_DAYS = 90;

function curriculumFromDoc(doc: QueryDocumentSnapshot<DocumentData>): CurriculumLevelDoc {
  const data = doc.data();
  return {
    id: doc.id,
    levelNumber: Number(data.levelNumber) || 0,
    stageName: typeof data.stageName === "string" ? data.stageName : "",
    title: typeof data.title === "string" ? data.title : "",
    subtopics: Array.isArray(data.subtopics) ? data.subtopics.filter((s: unknown): s is string => typeof s === "string") : [],
    emoji: typeof data.emoji === "string" ? data.emoji : "",
    color: typeof data.color === "string" ? data.color : null,
  };
}

/** The syllabus, straight from the `curriculum` collection — the Curriculum Board's static columns. */
export async function listCurriculumLevels(): Promise<CurriculumLevelDoc[]> {
  const snap = await getAdminDb().collection(CURRICULUM).orderBy("levelNumber").get();
  return snap.docs.map((doc) => curriculumFromDoc(doc as QueryDocumentSnapshot<DocumentData>));
}

/**
 * Inserts a new blank level at the end of `stageName`'s levels (or at the
 * very end of the whole syllabus if `stageName` doesn't match any existing
 * stage — i.e. a brand new stage), cascading every level that comes after
 * the insertion point up by one number. Doc ids are just `level-N` at
 * creation time and never renamed afterward — only the `levelNumber` field
 * is authoritative for ordering, so a level keeps its original doc id for
 * life even after being renumbered by this or reorderCurriculumLevels.
 */
export async function createCurriculumLevel(stageName: string): Promise<CurriculumLevelDoc> {
  const db = getAdminDb();
  const levels = await listCurriculumLevels();

  const lastInStage = levels.filter((l) => l.stageName === stageName).at(-1);
  const insertAfterNumber = lastInStage?.levelNumber ?? levels.reduce((max, l) => Math.max(max, l.levelNumber), 0);
  const newNumber = insertAfterNumber + 1;

  const toShift = levels.filter((l) => l.levelNumber >= newNumber);
  const batch = db.batch();
  for (const l of toShift) batch.update(db.collection(CURRICULUM).doc(l.id), { levelNumber: l.levelNumber + 1 });

  const ref = db.collection(CURRICULUM).doc(`level-${Date.now()}`);
  const data = { levelNumber: newNumber, stageName, title: "New Level", subtopics: [] as string[], emoji: "⭐", color: null as string | null };
  batch.set(ref, data);
  await batch.commit();

  return { id: ref.id, ...data };
}

/** Edit-mode updates (title/subtopics/emoji/color) — the level detail modal. Reordering/restaging goes through reorderCurriculumLevels instead, since a lone levelNumber/stageName write here would break the sequence. */
export async function updateCurriculumLevel(
  id: string,
  updates: Partial<Pick<CurriculumLevelDoc, "title" | "subtopics" | "emoji" | "color">>
): Promise<CurriculumLevelDoc | null> {
  const ref = getAdminDb().collection(CURRICULUM).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  await ref.update(updates);
  const doc = await ref.get();
  return curriculumFromDoc(doc as QueryDocumentSnapshot<DocumentData>);
}

/**
 * Applies a full drag-reorder in one batch — `order` is every level id in
 * its new visual sequence, each tagged with the stage it now belongs to
 * (unchanged for a same-stage reorder, different for a drag across a stage
 * boundary). Renumbers everything 1..N to match array position, so the
 * whole syllabus — every stage, not just the one that moved — always comes
 * back consistent. Returns false if `order` doesn't name exactly the
 * current set of level ids (guards against a stale drag racing a concurrent
 * add/delete).
 */
export async function reorderCurriculumLevels(order: { id: string; stageName: string }[]): Promise<boolean> {
  const db = getAdminDb();
  const levels = await listCurriculumLevels();
  const knownIds = new Set(levels.map((l) => l.id));
  if (order.length !== levels.length || !order.every((o) => knownIds.has(o.id))) return false;

  const batch = db.batch();
  order.forEach((o, i) => {
    const level = levels.find((l) => l.id === o.id)!;
    const levelNumber = i + 1;
    if (level.levelNumber === levelNumber && level.stageName === o.stageName) return; // no-op write avoided
    batch.update(db.collection(CURRICULUM).doc(o.id), { levelNumber, stageName: o.stageName });
  });
  await batch.commit();
  return true;
}

/** Deletes a level and closes the number gap it leaves behind — every level after it shifts down by one. */
export async function deleteCurriculumLevel(id: string): Promise<boolean> {
  const db = getAdminDb();
  const levels = await listCurriculumLevels();
  const target = levels.find((l) => l.id === id);
  if (!target) return false;

  const batch = db.batch();
  batch.delete(db.collection(CURRICULUM).doc(id));
  for (const l of levels) {
    if (l.id !== id && l.levelNumber > target.levelNumber) {
      batch.update(db.collection(CURRICULUM).doc(l.id), { levelNumber: l.levelNumber - 1 });
    }
  }
  await batch.commit();
  return true;
}

function groupFromDoc(doc: QueryDocumentSnapshot<DocumentData>): GroupDoc {
  const data = doc.data();
  return {
    id: doc.id,
    name: typeof data.name === "string" ? data.name : "",
    currentLevel: Number(data.currentLevel) || 1,
    currentTopic: typeof data.currentTopic === "string" ? data.currentTopic : "",
  };
}

/** Every group's current curriculum placement — the Curriculum Board's pills. */
export async function listGroups(): Promise<GroupDoc[]> {
  const snap = await getAdminDb().collection(GROUPS).orderBy("name").get();
  return snap.docs.map((doc) => groupFromDoc(doc as QueryDocumentSnapshot<DocumentData>));
}

/** "Group C" -> doc id "group-c" — same slugging scripts/generate-week.ts used, so a group's id lines up with its /lessons folder. */
function slugifyGroupName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}

/** Creates a new group at Level 1, no current topic yet — the board's "+ New Group" button. */
export async function createGroup(name: string): Promise<GroupDoc> {
  const ref = getAdminDb().collection(GROUPS).doc(slugifyGroupName(name));
  const data = { name, currentLevel: 1, currentTopic: "" };
  await ref.set(data);
  return { id: ref.id, ...data };
}

/** Drops a group's pill onto a level/subtopic — the only write the board itself needs. Returns null if the group doesn't exist. */
export async function updateGroupPlacement(
  groupId: string,
  placement: { currentLevel: number; currentTopic: string }
): Promise<GroupDoc | null> {
  const ref = getAdminDb().collection(GROUPS).doc(groupId);
  const existing = await ref.get();
  if (!existing.exists) return null;
  await ref.update({ currentLevel: placement.currentLevel, currentTopic: placement.currentTopic });
  const doc = await ref.get();
  return groupFromDoc(doc as QueryDocumentSnapshot<DocumentData>);
}

function historyFromDoc(doc: QueryDocumentSnapshot<DocumentData>): GroupHistoryEntry {
  const data = doc.data();
  return {
    id: doc.id,
    date: typeof data.date === "string" ? data.date : "",
    topic: typeof data.topic === "string" ? data.topic : "",
    status: data.status === "Mastered" ? "Mastered" : "Review Pending",
    teacherNotes: typeof data.teacherNotes === "string" ? data.teacherNotes : "",
  };
}

/** Every history entry from `sinceDate` (inclusive) onward, newest first — the "Generate Parent Report" button's 30-day window. */
export async function listGroupHistorySince(groupId: string, sinceDate: string): Promise<GroupHistoryEntry[]> {
  const snap = await getAdminDb()
    .collection(GROUPS)
    .doc(groupId)
    .collection(HISTORY)
    .where("date", ">=", sinceDate)
    .orderBy("date", "desc")
    .get();
  return snap.docs.map((doc) => historyFromDoc(doc as QueryDocumentSnapshot<DocumentData>));
}

export async function addGroupHistoryEntry(
  groupId: string,
  entry: Omit<GroupHistoryEntry, "id">
): Promise<GroupHistoryEntry> {
  const ref = getAdminDb().collection(GROUPS).doc(groupId).collection(HISTORY).doc();
  await ref.set(entry);
  const doc = await ref.get();
  return historyFromDoc(doc as QueryDocumentSnapshot<DocumentData>);
}

/** Edits an existing history entry — the Students view's Edit Syllabus mode, clicking a "RECENT HISTORY" row. */
export async function updateGroupHistoryEntry(
  groupId: string,
  entryId: string,
  updates: Partial<Omit<GroupHistoryEntry, "id">>
): Promise<GroupHistoryEntry | null> {
  const ref = getAdminDb().collection(GROUPS).doc(groupId).collection(HISTORY).doc(entryId);
  const existing = await ref.get();
  if (!existing.exists) return null;
  await ref.update(updates);
  const doc = await ref.get();
  return historyFromDoc(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteGroupHistoryEntry(groupId: string, entryId: string): Promise<boolean> {
  const ref = getAdminDb().collection(GROUPS).doc(groupId).collection(HISTORY).doc(entryId);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

/**
 * True when this group's most recent "Mastered" entry is 90+ days old — the
 * board's "Review Suggested" badge. Simplification: only looks at the single
 * latest Mastered entry, not every topic the group has ever mastered — good
 * enough while a group tracks one current topic at a time, but worth
 * revisiting if a group can have several topics in flight.
 */
export async function isRecallDue(groupId: string, todayIso: string): Promise<boolean> {
  const snap = await getAdminDb()
    .collection(GROUPS)
    .doc(groupId)
    .collection(HISTORY)
    .where("status", "==", "Mastered")
    .orderBy("date", "desc")
    .limit(1)
    .get();
  if (snap.empty) return false;

  const lastMastered = historyFromDoc(snap.docs[0]! as QueryDocumentSnapshot<DocumentData>);
  const days = (Date.parse(todayIso) - Date.parse(lastMastered.date)) / (1000 * 60 * 60 * 24);
  return Number.isFinite(days) && days >= RECALL_DAYS;
}
