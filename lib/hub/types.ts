/**
 * Hub v2 entities (Feature Spec §4). These live in the local-first store
 * (lib/hub/store.ts) until v2 is wired to Firestore. Existing entities —
 * students, transactions, groups, curriculum, resources — stay in Firestore
 * and are read through lib/hub/live.ts; v2 only layers extra fields on top
 * of them (StudentMeta, GroupMeta) without touching the live documents.
 */

export type ID = string;

export interface Base {
  id: ID;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface Area extends Base {
  name: string;
  color: string;
  icon: string; // Phosphor icon name, see components/hub/icons.tsx
  sort: number;
  active: boolean;
}

export type TaskStatus = "inbox" | "next" | "doing" | "waiting" | "done" | "dropped";
export type Priority = 1 | 2 | 3;

export interface Recurrence {
  kind: "daily" | "weekly" | "monthly" | "after";
  days?: number[]; // weekly: 0 = Sun … 6 = Sat
  n?: number; // after: days after completion
}

export interface CheckItem {
  id: ID;
  title: string;
  done: boolean;
}

export interface LogLine {
  at: string;
  text: string;
}

export interface Task extends Base {
  title: string;
  notes: string;
  areaId: ID;
  projectId: ID | null;
  milestoneId?: ID | null;
  status: TaskStatus;
  priority: Priority;
  due: string | null; // YYYY-MM-DD
  scheduled: string | null; // YYYY-MM-DD — the day it's planned for
  estimate: number | null; // minutes
  recurrence: Recurrence | null;
  checklist: CheckItem[];
  waitingOn?: string;
  followUp?: string | null;
  studentId?: ID | null;
  groupId?: ID | null;
  noteId?: ID | null;
  completedAt: string | null;
  log: LogLine[];
}

export type ProjectStatus = "planned" | "active" | "paused" | "done" | "dropped";

export interface Milestone {
  id: ID;
  title: string;
  date: string | null;
  done: boolean;
}

export interface Project extends Base {
  title: string;
  icon?: string; // Phosphor icon name (components/hub/ui.tsx ICONS)
  cover?: string; // image URL or a resized data: URL
  description?: string;

  areaId: ID;
  status: ProjectStatus;
  start: string | null;
  target: string | null;
  outcome: string;
  milestones: Milestone[];
  track?: "delivery" | "growth"; // LET Junior only — feeds the Time split
}

export type Horizon = "week" | "quarter" | "year" | "someday";
export type GoalMetric = "mrr" | "students" | "revenue" | "tasks" | "collection" | "manual";

export interface Goal extends Base {
  title: string;
  icon?: string; // Phosphor icon name (components/hub/ui.tsx ICONS)
  cover?: string; // image URL or a resized data: URL
  description?: string;

  areaId: ID;
  horizon: Horizon;
  metric: GoalMetric;
  target: number;
  start: number;
  unit: string; // "$", "students", "games"…
  deadline: string | null;
  pinned: boolean;
  projectId?: ID | null;
  collectionId?: ID | null;
  log: { date: string; value: number }[]; // manual metric history
  // Someday plans only
  timeframe?: string;
  budget?: number | null;
  planStatus?: "idea" | "saving" | "booked" | "done";
}

export type NoteType = "doc" | "plan" | "meeting" | "reference";

export interface Note extends Base {
  title: string;
  icon?: string;
  cover?: string;
  body: string;
  type: NoteType;
  areaId: ID;
  projectId?: ID | null;
  studentId?: ID | null;
  groupId?: ID | null;
  link?: string;
  pinned: boolean;
}

export type FieldType = "text" | "number" | "select" | "multiselect" | "date" | "checkbox" | "url" | "image";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
}

export interface Collection extends Base {
  name: string;
  cover?: string;
  description?: string;
  areaId: ID;
  icon: string;
  fields: FieldDef[];
  view: "list" | "grid" | "board";
  boardField?: string; // a select field key
  doneField?: string; // the select/checkbox field whose "done" value counts toward goals
  doneValue?: string;
}

export interface Item extends Base {
  collectionId: ID;
  title: string;
  values: Record<string, unknown>;
  image?: string;
  link?: string;
  description?: string;
  doneAt: string | null;
}

export interface TimeEntry extends Base {
  start: string;
  end: string | null; // null while the timer runs
  taskId?: ID | null;
  projectId?: ID | null;
  areaId: ID;
  source: "timer" | "calendar" | "manual";
  track?: "delivery" | "growth";
  label: string;
}

export interface LessonLog extends Base {
  date: string;
  groupId: ID;
  topic: string;
  attendance: Record<ID, boolean>;
  notes: string;
}

/** Local overlay on a live Firestore student — the spec's new Student fields. */
export interface StudentMeta {
  lifecycle?: "lead" | "trial" | "active" | "paused" | "alumni" | "churned";
  startDate?: string;
  level?: number;
  churnedAt?: string | null;
  returningOffer?: string;
}

export interface ClassSlot {
  day: number; // 0 = Sun … 6 = Sat
  start: string; // "17:00"
  minutes: number;
}

/** Local overlay on a live Firestore group. */
export interface GroupMeta {
  capacity?: number;
  slots?: ClassSlot[];
}

export interface LocalExpense extends Base {
  date: string;
  description: string;
  category: string;
  amount: number; // positive
  scope: "business" | "personal";
  recurring: boolean;
}

export interface Template {
  id: ID;
  name: string;
  areaId: ID;
  tasks: { title: string; offsetDays: number; priority: Priority; estimate: number | null }[];
}

export interface XpEvent {
  id: ID;
  at: string;
  amount: number;
  areaId: ID | null;
  label: string;
  source: string; // "task" | "plan" | "lesson" | "inbox" | "review" | "priority" | "project" | "student"
  refId?: ID;
}

export interface Review {
  id: ID;
  week: string; // Monday of the reviewed week, YYYY-MM-DD
  doneAt: string;
  priorities: ID[];
  notes: string;
}

export interface MonthlyReview {
  month: string; // YYYY-MM
  reflection: string;
  doneAt: string;
}

export interface Settings {
  game: "full" | "subtle" | "off";
  restDay: number; // 0 = Sunday
  theme: "system" | "light" | "dark";
  sidebar: "auto" | "open" | "rail";
  dock: "auto" | "open" | "rail";
  ownerName: string;
  avatar?: string;
  sound: boolean;
  volume: number; // 0–1
  navKeys: "arrows" | "wasd"; // WASD also moves the selector when chosen; arrows always do
  keys: Record<string, string>; // action id -> combo, overrides lib/hub/keys.ts defaults
}

export interface HubState {
  version: number;
  areas: Area[];
  tasks: Task[];
  projects: Project[];
  goals: Goal[];
  notes: Note[];
  collections: Collection[];
  items: Item[];
  time: TimeEntry[];
  lessons: LessonLog[];
  expenses: LocalExpense[];
  templates: Template[];
  studentMeta: Record<ID, StudentMeta>;
  groupMeta: Record<ID, GroupMeta>;
  adSpend: Record<string, number>; // YYYY-MM -> $
  game: {
    xp: XpEvent[];
    dayPlans: Record<string, { at: string; taskIds: ID[] }>; // YYYY-MM-DD
    inboxZeroDays: string[];
    unlocked: Record<string, string>; // achievement id -> ISO
    seenActive: ID[]; // students already rewarded as new paying
    automations: Record<string, string>; // run keys, e.g. "feedback:2026-10"
  };
  reviews: Review[];
  monthly: MonthlyReview[];
  settings: Settings;
  ui: {
    area: ID | "all";
    taskView: "projects" | "list" | "board" | "week";
    listGroup: "area" | "project" | "priority" | "date";
    finScope: "business" | "personal" | "all";
  };
}
