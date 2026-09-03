/**
 * Everything the task views agree on: how a task is bucketed by its due
 * date, what order the day gets worked in, and how a project's progress is
 * derived. Pure functions, no Firestore — the Tasks page and the Overview
 * "Today" panel both import from here so the two can never disagree about
 * what "urgent" or "tomorrow" means.
 *
 * Self-check: npx tsx scripts/testTasks.ts
 */

import { addDays, localDateIso } from "@/lib/dateUtils";
import type { Project, Task, TaskPriority, TaskSize } from "@/lib/types";

export const PRIORITIES: TaskPriority[] = ["Urgent", "High", "Medium", "Low"];
export const SIZES: TaskSize[] = ["S", "M", "L"];

export const SIZE_LABEL: Record<TaskSize, string> = {
  S: "Quick",
  M: "Chunk",
  L: "Big rock",
};

/** Where a task lands in the day view. Ordered — the UI renders these top to bottom. */
export type Bucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "someday" | "done";

export const BUCKET_ORDER: Bucket[] = ["overdue", "today", "tomorrow", "week", "later", "someday", "done"];

export const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
  someday: "Someday",
  done: "Done",
};

/**
 * A task with no due date is "someday" — never "today". Anything already
 * done is "done" regardless of its date, so a task finished late doesn't
 * keep shouting from the Overdue section after it's been ticked.
 */
export function bucketOf(task: Task, today = localDateIso()): Bucket {
  if (task.status === "done") return "done";
  if (!task.due) return "someday";
  if (task.due < today) return "overdue";
  if (task.due === today) return "today";
  if (task.due === addDays(today, 1)) return "tomorrow";
  if (task.due <= addDays(today, 7)) return "week";
  return "later";
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const SIZE_WEIGHT: Record<TaskSize, number> = { L: 0, M: 1, S: 2 };

/**
 * The morning order: what's already in flight first (finishing beats
 * starting), then by how overdue/soon it is, then by priority, and only
 * then biggest-chunk-first — the "eat the big rock while you still have
 * the energy" rule. Small quick wins deliberately sink to the bottom of
 * an equal-priority group instead of being done first because they're easy.
 */
export function compareTasks(a: Task, b: Task, today = localDateIso()): number {
  const doing = Number(b.status === "doing") - Number(a.status === "doing");
  if (doing) return doing;

  const dueA = a.due ?? "9999-99-99";
  const dueB = b.due ?? "9999-99-99";
  if (dueA !== dueB) return dueA < dueB ? -1 : 1;

  const prio = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  if (prio) return prio;

  const size = SIZE_WEIGHT[a.size] - SIZE_WEIGHT[b.size];
  if (size) return size;

  return a.title.localeCompare(b.title);
}

/** Tasks grouped into buckets, each bucket internally in working order. Empty buckets are omitted. */
export function groupByBucket(tasks: Task[], today = localDateIso()): { bucket: Bucket; tasks: Task[] }[] {
  const map = new Map<Bucket, Task[]>();
  for (const task of tasks) {
    const bucket = bucketOf(task, today);
    const list = map.get(bucket);
    if (list) list.push(task);
    else map.set(bucket, [task]);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => ({
    bucket,
    tasks: (map.get(bucket) ?? []).sort((a, b) => compareTasks(a, b, today)),
  }));
}

/**
 * What the Overview surfaces and what a "focus" filter means: anything
 * overdue, due today, or currently in flight. Deliberately includes an
 * in-flight task with no due date — starting something is itself a
 * commitment to today, whether or not a date was ever typed.
 */
export function isOnDeck(task: Task, today = localDateIso()): boolean {
  if (task.status === "done") return false;
  if (task.status === "doing") return true;
  return task.due !== null && task.due <= today;
}

/** Completed today — the night review's "here's what you actually got done" list. */
export function completedToday(tasks: Task[], today = localDateIso()): Task[] {
  return tasks.filter((t) => t.status === "done" && (t.completedAt ?? "").slice(0, 10) === today);
}

/** Percent of a task's subtasks ticked; 0 when it has none (so a bare task never shows a misleading 100%). */
export function subtaskProgress(task: Task): number {
  if (task.subtasks.length === 0) return 0;
  return Math.round((task.subtasks.filter((s) => s.done).length / task.subtasks.length) * 100);
}

/**
 * A project's progress is its tasks' completion — the whole point of not
 * storing a hand-dragged percentage any more. A project with no tasks yet
 * is 0%, and `total` lets the UI say "no tasks yet" instead of "0% done".
 */
export function projectProgress(project: Project, tasks: Task[]): { pct: number; done: number; total: number } {
  const mine = tasks.filter((t) => t.projectId === project.id);
  const done = mine.filter((t) => t.status === "done").length;
  return { pct: mine.length === 0 ? 0 : Math.round((done / mine.length) * 100), done, total: mine.length };
}

/** Every category in use, plus every project's field — one vocabulary, so the filter chips and the category datalist match. */
export function allCategories(tasks: Task[], projects: Project[]): string[] {
  const set = new Set<string>();
  for (const t of tasks) if (t.category) set.add(t.category);
  for (const p of projects) if (p.field) set.add(p.field);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Natural-language dates typed straight into the capture box: "buy domain
 * tomorrow", "invoice friday !urgent #admin". Parsing happens on the way
 * in so capturing never costs a trip to a date picker — the token is
 * stripped from the title, and anything unrecognized is just part of the
 * title.
 */
export function parseQuickTask(input: string, today = localDateIso()): Pick<Task, "title" | "due" | "priority" | "category"> {
  let title = input;
  let due: string | null = null;
  let priority: TaskPriority = "Medium";
  let category = "";

  const priorityMatch = title.match(/(^|\s)!(urgent|high|medium|low)\b/i);
  if (priorityMatch) {
    const word = priorityMatch[2].toLowerCase();
    priority = (word[0].toUpperCase() + word.slice(1)) as TaskPriority;
    title = title.replace(priorityMatch[0], " ");
  }

  const categoryMatch = title.match(/(^|\s)#([\w-]+)/);
  if (categoryMatch) {
    category = categoryMatch[2];
    title = title.replace(categoryMatch[0], " ");
  }

  const dateMatch = title.match(/(^|\s)(today|tomorrow|tonight|mon|tue|wed|thu|fri|sat|sun)\b/i);
  if (dateMatch) {
    const word = dateMatch[2].toLowerCase();
    if (word === "today" || word === "tonight") due = today;
    else if (word === "tomorrow") due = addDays(today, 1);
    else due = nextWeekday(today, ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(word));
    title = title.replace(dateMatch[0], " ");
  }

  return { title: title.replace(/\s+/g, " ").trim(), due, priority, category };
}

/** The next occurrence of a weekday strictly after `today` (so "fri" typed on a Friday means next Friday, not this morning). */
function nextWeekday(today: string, weekday: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const current = new Date(y, m - 1, d).getDay();
  const delta = ((weekday - current + 7) % 7) || 7;
  return addDays(today, delta);
}
