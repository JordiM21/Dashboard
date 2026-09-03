import { FieldValue, Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "./admin";
import type { LessonLink, WeeklyPlanDoc, WeeklyPlanTagDoc } from "@/lib/types";

/**
 * Server-only Firestore CRUD for `weeklyPlans` — the lessons the Classroom
 * view plans, runs and reviews. See lib/types.ts's WeeklyPlanDoc.
 *
 * These docs used to own a blank `.excalidraw` scene in Firebase Storage,
 * provisioned on create and moved/deleted alongside the doc. That whole
 * limb is gone: whiteboards are local Excalidraw files opened straight from
 * the browser, and a lesson just links to one like it links to a YouTube
 * video. The dead `excalidrawPath` field is simply ignored on read, so no
 * migration was needed.
 */

const WEEKLY_PLANS = "weeklyPlans";

function tsToIso(value: unknown): string | undefined {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return undefined;
}

function linksFrom(value: unknown): LessonLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): LessonLink[] => {
    if (!raw || typeof raw !== "object") return [];
    const l = raw as Record<string, unknown>;
    if (typeof l.url !== "string" || !l.url) return [];
    return [{ id: typeof l.id === "string" ? l.id : l.url, url: l.url, title: typeof l.title === "string" ? l.title : "" }];
  });
}

function planFromDoc(doc: QueryDocumentSnapshot<DocumentData>): WeeklyPlanDoc {
  const data = doc.data();
  return {
    id: doc.id,
    groupId: typeof data.groupId === "string" ? data.groupId : "",
    date: typeof data.date === "string" ? data.date : "",
    topic: typeof data.topic === "string" ? data.topic : "",
    teacherNotes: typeof data.teacherNotes === "string" ? data.teacherNotes : "",
    takeaways: typeof data.takeaways === "string" ? data.takeaways : "",
    links: linksFrom(data.links),
    historyEntryId: typeof data.historyEntryId === "string" ? data.historyEntryId : "",
    emojis: Array.isArray(data.emojis) ? data.emojis.filter((e: unknown): e is string => typeof e === "string") : [],
    order: typeof data.order === "number" ? data.order : undefined,
    tagIds: Array.isArray(data.tagIds) ? data.tagIds.filter((t: unknown): t is string => typeof t === "string") : [],
    createdAt: tsToIso(data.createdAt),
    updatedAt: tsToIso(data.updatedAt),
  };
}

/** Every lesson, newest first — the Classroom view slices this per group into "planned" and "taught" itself. */
export async function listWeeklyPlans(): Promise<WeeklyPlanDoc[]> {
  const snap = await getAdminDb().collection(WEEKLY_PLANS).get();
  const plans = snap.docs.map((doc) => planFromDoc(doc as QueryDocumentSnapshot<DocumentData>));
  return plans.sort((a, b) => b.date.localeCompare(a.date));
}

export async function createWeeklyPlan(data: {
  groupId: string;
  date: string;
  topic: string;
  teacherNotes: string;
  emojis: string[];
  tagIds?: string[];
}): Promise<WeeklyPlanDoc> {
  const ref = getAdminDb().collection(WEEKLY_PLANS).doc();
  await ref.set({
    groupId: data.groupId,
    date: data.date,
    topic: data.topic,
    teacherNotes: data.teacherNotes,
    takeaways: "",
    links: [],
    historyEntryId: "",
    emojis: data.emojis,
    tagIds: data.tagIds ?? [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return planFromDoc(doc as QueryDocumentSnapshot<DocumentData>);
}

export interface WeeklyPlanUpdates {
  order?: number;
  teacherNotes?: string;
  takeaways?: string;
  links?: LessonLink[];
  historyEntryId?: string;
  tagIds?: string[];
  groupId?: string;
  date?: string;
  topic?: string;
  emojis?: string[];
}

export async function updateWeeklyPlan(id: string, updates: WeeklyPlanUpdates): Promise<WeeklyPlanDoc | null> {
  const ref = getAdminDb().collection(WEEKLY_PLANS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;
  await ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return planFromDoc(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function getWeeklyPlan(id: string): Promise<WeeklyPlanDoc | null> {
  const doc = await getAdminDb().collection(WEEKLY_PLANS).doc(id).get();
  if (!doc.exists) return null;
  return planFromDoc(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteWeeklyPlan(id: string): Promise<boolean> {
  const ref = getAdminDb().collection(WEEKLY_PLANS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

// ---------------------------------------------------------------------------
// Lesson tags — reusable, created-first entities (not freeform text).
// Attached to a lesson by id via WeeklyPlanDoc.tagIds; the tag picker
// creates one here before it can be selected.
// ---------------------------------------------------------------------------

const WEEKLY_PLAN_TAGS = "weeklyPlanTags";

function tagFromDoc(doc: QueryDocumentSnapshot<DocumentData>): WeeklyPlanTagDoc {
  const data = doc.data();
  return { id: doc.id, name: typeof data.name === "string" ? data.name : "", color: typeof data.color === "string" ? data.color : "" };
}

export async function listWeeklyPlanTags(): Promise<WeeklyPlanTagDoc[]> {
  const snap = await getAdminDb().collection(WEEKLY_PLAN_TAGS).orderBy("name").get();
  return snap.docs.map((doc) => tagFromDoc(doc as QueryDocumentSnapshot<DocumentData>));
}

export async function createWeeklyPlanTag(name: string, color: string): Promise<WeeklyPlanTagDoc> {
  const ref = getAdminDb().collection(WEEKLY_PLAN_TAGS).doc();
  await ref.set({ name, color });
  return { id: ref.id, name, color };
}

export async function updateWeeklyPlanTag(id: string, updates: { name?: string; color?: string }): Promise<boolean> {
  const ref = getAdminDb().collection(WEEKLY_PLAN_TAGS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.update(updates);
  return true;
}

/** Deletes the tag and strips it from every lesson that carries it. */
export async function deleteWeeklyPlanTag(id: string): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.collection(WEEKLY_PLAN_TAGS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;

  const plansSnap = await db.collection(WEEKLY_PLANS).where("tagIds", "array-contains", id).get();
  const batch = db.batch();
  for (const doc of plansSnap.docs) {
    const tagIds = (doc.data().tagIds as string[] | undefined) ?? [];
    batch.update(doc.ref, { tagIds: tagIds.filter((t) => t !== id), updatedAt: FieldValue.serverTimestamp() });
  }
  batch.delete(ref);
  await batch.commit();
  return true;
}
