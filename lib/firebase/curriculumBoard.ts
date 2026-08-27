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
  };
}

/** The 20-level syllabus, straight from the `curriculum` collection — the Curriculum Board's static columns. */
export async function listCurriculumLevels(): Promise<CurriculumLevelDoc[]> {
  const snap = await getAdminDb().collection(CURRICULUM).orderBy("levelNumber").get();
  return snap.docs.map((doc) => curriculumFromDoc(doc as QueryDocumentSnapshot<DocumentData>));
}

/** Appends a new blank level after the highest existing levelNumber — the board's "+ Add New Level" button. */
export async function createCurriculumLevel(): Promise<CurriculumLevelDoc> {
  const levels = await listCurriculumLevels();
  const nextNumber = levels.reduce((max, l) => Math.max(max, l.levelNumber), 0) + 1;
  const ref = getAdminDb().collection(CURRICULUM).doc(`level-${nextNumber}`);
  const data = {
    levelNumber: nextNumber,
    stageName: levels[levels.length - 1]?.stageName ?? "New Stage",
    title: "New Level",
    subtopics: [] as string[],
    emoji: "⭐",
  };
  await ref.set(data);
  return { id: ref.id, ...data };
}

/** Edit-mode updates (title/subtopics) — the board's inline add/rename/delete-topic actions. */
export async function updateCurriculumLevel(
  id: string,
  updates: Partial<Pick<CurriculumLevelDoc, "title" | "subtopics">>
): Promise<CurriculumLevelDoc | null> {
  const ref = getAdminDb().collection(CURRICULUM).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  await ref.update(updates);
  const doc = await ref.get();
  return curriculumFromDoc(doc as QueryDocumentSnapshot<DocumentData>);
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
