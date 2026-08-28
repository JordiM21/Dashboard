import { FieldValue, Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "./admin";
import { addOneMonth, localDateIso } from "@/lib/dateUtils";
import type {
  Student,
  FinanceEntry,
  Lesson,
  Project,
  ContentItem,
  AgentDoc,
  RecurringTransaction,
  ScheduledMetaPost,
  MetaAudienceSnapshotRecord,
  GameDoc,
} from "@/lib/types";

/**
 * Server-only Firestore CRUD service, used by Next.js Route Handlers
 * (via lib/firebase/admin.ts). Cloud Functions in functions/ do NOT import
 * this — they write directly with their own firebase-admin instance.
 *
 * Convention: a document's `id` is always Firestore's own doc.id, never a
 * field stored inside the document body. Every read here does
 * `{ id: doc.id, ...doc.data() }` — follow the same pattern in Phase 5's
 * onSnapshot listeners so client and server reads stay consistent.
 */

const STUDENTS = "students";
const TRANSACTIONS = "transactions";
const LESSONS = "lessons";
const PROJECTS = "projects";
const GAMES = "games";
const CONTENT = "content";
const AGENTS = "agents";
const RECURRING_TRANSACTIONS = "recurringTransactions";
const SCHEDULED_META_POSTS = "scheduledMetaPosts";
const META_AUDIENCE_SNAPSHOTS = "metaAudienceSnapshots";

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

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export async function listStudents(): Promise<Student[]> {
  const snap = await getAdminDb().collection(STUDENTS).orderBy("name").get();
  return snap.docs.map((doc) => fromDoc<Student>(doc));
}

export async function getStudent(id: string): Promise<Student | null> {
  const doc = await getAdminDb().collection(STUDENTS).doc(id).get();
  if (!doc.exists) return null;
  return fromDoc<Student>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function createStudent(
  data: Omit<Student, "id" | "createdAt" | "updatedAt">
): Promise<Student> {
  const ref = getAdminDb().collection(STUDENTS).doc();
  await ref.set({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return fromDoc<Student>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function updateStudent(id: string, updates: Partial<Student>): Promise<Student | null> {
  const ref = getAdminDb().collection(STUDENTS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safeUpdates } = updates;
  await ref.update({ ...safeUpdates, updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<Student>(doc as QueryDocumentSnapshot<DocumentData>);
}

/**
 * Called after any transaction is recorded — if it can be matched to a
 * student (directly via studentId, or by payerEmail against that student's
 * parentEmail), advances that student's due date by exactly one calendar
 * month from its PREVIOUS due date (not from today or the payment date —
 * fixed schedule, so a late payment doesn't shift future due dates). That
 * alone makes lib/studentStatus.ts's derived status recompute to
 * "up_to_date", since the new due date is now in the future. No-ops
 * silently if neither identifier matches a student — most transactions
 * (ad spend, non-tuition income) aren't tied to a student at all.
 */
export async function applyPaymentToStudent(opts: {
  studentId?: string | null;
  payerEmail?: string | null;
}): Promise<void> {
  const db = getAdminDb();
  let ref;

  if (opts.studentId) {
    ref = db.collection(STUDENTS).doc(opts.studentId);
  } else if (opts.payerEmail) {
    const snap = await db
      .collection(STUDENTS)
      .where("parentEmail", "==", opts.payerEmail.trim().toLowerCase())
      .limit(1)
      .get();
    if (snap.empty) return;
    ref = snap.docs[0]!.ref;
  } else {
    return;
  }

  const doc = await ref.get();
  if (!doc.exists) return;
  const student = fromDoc<Student>(doc as QueryDocumentSnapshot<DocumentData>);

  const nextPayment = addOneMonth(student.nextPayment ?? localDateIso());
  await ref.update({ nextPayment, updatedAt: FieldValue.serverTimestamp() });
}

export async function deleteStudent(id: string): Promise<boolean> {
  const ref = getAdminDb().collection(STUDENTS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export async function listTransactions(): Promise<FinanceEntry[]> {
  const snap = await getAdminDb().collection(TRANSACTIONS).orderBy("date", "desc").get();
  return snap.docs.map((doc) => fromDoc<FinanceEntry>(doc));
}

export async function createTransaction(
  data: Omit<FinanceEntry, "id" | "createdAt" | "updatedAt">
): Promise<FinanceEntry> {
  const ref = getAdminDb().collection(TRANSACTIONS).doc();
  await ref.set({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return fromDoc<FinanceEntry>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function updateTransaction(
  id: string,
  updates: Partial<FinanceEntry>
): Promise<FinanceEntry | null> {
  const ref = getAdminDb().collection(TRANSACTIONS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safeUpdates } = updates;
  await ref.update({ ...safeUpdates, updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<FinanceEntry>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteTransaction(id: string): Promise<boolean> {
  const ref = getAdminDb().collection(TRANSACTIONS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export async function listLessons(): Promise<Lesson[]> {
  const snap = await getAdminDb().collection(LESSONS).orderBy("date", "desc").get();
  return snap.docs.map((doc) => fromDoc<Lesson>(doc));
}

export async function listLessonsForStudent(studentId: string): Promise<Lesson[]> {
  const snap = await getAdminDb()
    .collection(LESSONS)
    .where("studentId", "==", studentId)
    .orderBy("date", "desc")
    .get();
  return snap.docs.map((doc) => fromDoc<Lesson>(doc));
}

export async function createLesson(data: Omit<Lesson, "id" | "createdAt" | "updatedAt">): Promise<Lesson> {
  const ref = getAdminDb().collection(LESSONS).doc();
  await ref.set({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return fromDoc<Lesson>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function updateLesson(id: string, updates: Partial<Lesson>): Promise<Lesson | null> {
  const ref = getAdminDb().collection(LESSONS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safeUpdates } = updates;
  await ref.update({ ...safeUpdates, updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<Lesson>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteLesson(id: string): Promise<boolean> {
  const ref = getAdminDb().collection(LESSONS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(): Promise<Project[]> {
  const snap = await getAdminDb().collection(PROJECTS).orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => fromDoc<Project>(doc));
}

export async function createProject(data: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<Project> {
  const ref = getAdminDb().collection(PROJECTS).doc();
  await ref.set({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<Project>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
  const ref = getAdminDb().collection(PROJECTS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safeUpdates } = updates;
  await ref.update({ ...safeUpdates, updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<Project>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteProject(id: string): Promise<boolean> {
  const ref = getAdminDb().collection(PROJECTS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export async function listGames(): Promise<GameDoc[]> {
  const snap = await getAdminDb().collection(GAMES).orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => fromDoc<GameDoc>(doc));
}

export async function createGame(data: Omit<GameDoc, "id" | "createdAt" | "updatedAt">): Promise<GameDoc> {
  const ref = getAdminDb().collection(GAMES).doc();
  await ref.set({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<GameDoc>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function updateGame(id: string, updates: Partial<GameDoc>): Promise<GameDoc | null> {
  const ref = getAdminDb().collection(GAMES).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safeUpdates } = updates;
  await ref.update({ ...safeUpdates, updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<GameDoc>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteGame(id: string): Promise<boolean> {
  const ref = getAdminDb().collection(GAMES).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export async function listContent(): Promise<ContentItem[]> {
  const snap = await getAdminDb().collection(CONTENT).orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => fromDoc<ContentItem>(doc));
}

export async function createContent(
  data: Omit<ContentItem, "id" | "createdAt" | "updatedAt">
): Promise<ContentItem> {
  const ref = getAdminDb().collection(CONTENT).doc();
  await ref.set({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<ContentItem>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function updateContent(id: string, updates: Partial<ContentItem>): Promise<ContentItem | null> {
  const ref = getAdminDb().collection(CONTENT).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safeUpdates } = updates;
  await ref.update({ ...safeUpdates, updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<ContentItem>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteContent(id: string): Promise<boolean> {
  const ref = getAdminDb().collection(CONTENT).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

// ---------------------------------------------------------------------------
// Agents (read-only in the UI — seeded via scripts/migrateMarkdownToFirebase.ts)
// ---------------------------------------------------------------------------

export async function listAgents(): Promise<AgentDoc[]> {
  const snap = await getAdminDb().collection(AGENTS).orderBy("name").get();
  return snap.docs.map((doc) => fromDoc<AgentDoc>(doc));
}

export async function createAgent(data: Omit<AgentDoc, "id" | "createdAt" | "updatedAt">): Promise<AgentDoc> {
  const ref = getAdminDb().collection(AGENTS).doc();
  await ref.set({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<AgentDoc>(doc as QueryDocumentSnapshot<DocumentData>);
}

// ---------------------------------------------------------------------------
// Recurring transactions (subscriptions / recurring bills — see
// app/api/cron/recurring-payments/route.ts for the auto-trigger logic)
// ---------------------------------------------------------------------------

export async function listRecurringTransactions(): Promise<RecurringTransaction[]> {
  const snap = await getAdminDb().collection(RECURRING_TRANSACTIONS).orderBy("nextPayment").get();
  return snap.docs.map((doc) => fromDoc<RecurringTransaction>(doc));
}

/** Every active recurring template whose next payment is due today or earlier. */
export async function listDueRecurringTransactions(todayIso: string): Promise<RecurringTransaction[]> {
  const snap = await getAdminDb()
    .collection(RECURRING_TRANSACTIONS)
    .where("active", "==", true)
    .where("nextPayment", "<=", todayIso)
    .get();
  return snap.docs.map((doc) => fromDoc<RecurringTransaction>(doc));
}

export async function createRecurringTransaction(
  data: Omit<RecurringTransaction, "id" | "createdAt" | "updatedAt">
): Promise<RecurringTransaction> {
  const ref = getAdminDb().collection(RECURRING_TRANSACTIONS).doc();
  await ref.set({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<RecurringTransaction>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function updateRecurringTransaction(
  id: string,
  updates: Partial<RecurringTransaction>
): Promise<RecurringTransaction | null> {
  const ref = getAdminDb().collection(RECURRING_TRANSACTIONS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safeUpdates } = updates;
  await ref.update({ ...safeUpdates, updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<RecurringTransaction>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteRecurringTransaction(id: string): Promise<boolean> {
  const ref = getAdminDb().collection(RECURRING_TRANSACTIONS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

// ---------------------------------------------------------------------------
// Scheduled Meta posts (Meta view's Calendar tab — see
// app/api/cron/meta-publish/route.ts for the publish trigger)
// ---------------------------------------------------------------------------

export async function getScheduledMetaPost(id: string): Promise<ScheduledMetaPost | null> {
  const doc = await getAdminDb().collection(SCHEDULED_META_POSTS).doc(id).get();
  if (!doc.exists) return null;
  return fromDoc<ScheduledMetaPost>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function listScheduledMetaPosts(): Promise<ScheduledMetaPost[]> {
  const snap = await getAdminDb().collection(SCHEDULED_META_POSTS).orderBy("scheduledFor", "asc").get();
  return snap.docs.map((doc) => fromDoc<ScheduledMetaPost>(doc));
}

/** Every post still `scheduled` whose time has arrived — used by the publish cron/manual trigger. */
export async function listDueScheduledMetaPosts(nowIso: string): Promise<ScheduledMetaPost[]> {
  const snap = await getAdminDb()
    .collection(SCHEDULED_META_POSTS)
    .where("status", "==", "scheduled")
    .where("scheduledFor", "<=", nowIso)
    .get();
  return snap.docs.map((doc) => fromDoc<ScheduledMetaPost>(doc));
}

export async function createScheduledMetaPost(
  data: Omit<ScheduledMetaPost, "id" | "createdAt" | "updatedAt">
): Promise<ScheduledMetaPost> {
  const ref = getAdminDb().collection(SCHEDULED_META_POSTS).doc();
  await ref.set({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<ScheduledMetaPost>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function updateScheduledMetaPost(
  id: string,
  updates: Partial<ScheduledMetaPost>
): Promise<ScheduledMetaPost | null> {
  const ref = getAdminDb().collection(SCHEDULED_META_POSTS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return null;

  const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safeUpdates } = updates;
  await ref.update({ ...safeUpdates, updatedAt: FieldValue.serverTimestamp() });
  const doc = await ref.get();
  return fromDoc<ScheduledMetaPost>(doc as QueryDocumentSnapshot<DocumentData>);
}

export async function deleteScheduledMetaPost(id: string): Promise<boolean> {
  const ref = getAdminDb().collection(SCHEDULED_META_POSTS).doc(id);
  const existing = await ref.get();
  if (!existing.exists) return false;
  await ref.delete();
  return true;
}

// ---------------------------------------------------------------------------
// Meta audience snapshots (daily follower counts — see
// app/api/cron/meta-audience-snapshot/route.ts and lib/api/metaGrowth.ts)
// ---------------------------------------------------------------------------

/** Doc id is the date itself, so capturing the same day twice overwrites instead of duplicating. */
export async function upsertMetaAudienceSnapshot(
  date: string,
  data: { facebookFollowers: number | null; instagramFollowers: number | null }
): Promise<MetaAudienceSnapshotRecord> {
  const ref = getAdminDb().collection(META_AUDIENCE_SNAPSHOTS).doc(date);
  const existing = await ref.get();
  if (existing.exists) {
    await ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
  } else {
    await ref.set({ ...data, date, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  }
  const doc = await ref.get();
  return fromDoc<MetaAudienceSnapshotRecord>(doc as QueryDocumentSnapshot<DocumentData>);
}

/** Every stored snapshot from `sinceDate` (inclusive) onward, oldest first. */
export async function listMetaAudienceSnapshots(sinceDate: string): Promise<MetaAudienceSnapshotRecord[]> {
  const snap = await getAdminDb()
    .collection(META_AUDIENCE_SNAPSHOTS)
    .where("date", ">=", sinceDate)
    .orderBy("date", "asc")
    .get();
  return snap.docs.map((doc) => fromDoc<MetaAudienceSnapshotRecord>(doc));
}

/** Most recent snapshot at or before `date` — used to find the closest known follower count when the exact date wasn't captured. */
export async function findMetaAudienceSnapshotOnOrBefore(date: string): Promise<MetaAudienceSnapshotRecord | null> {
  const snap = await getAdminDb()
    .collection(META_AUDIENCE_SNAPSHOTS)
    .where("date", "<=", date)
    .orderBy("date", "desc")
    .limit(1)
    .get();
  return snap.empty ? null : fromDoc<MetaAudienceSnapshotRecord>(snap.docs[0]!);
}
