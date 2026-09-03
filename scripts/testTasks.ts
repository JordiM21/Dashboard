/**
 * Self-check for lib/tasks.ts — the bucketing, the working order, and the
 * capture-box shorthand. These three are what every task view agrees on,
 * so a silent change here quietly reshuffles someone's day.
 *
 *   npx tsx scripts/testTasks.ts
 */

import assert from "assert";
import {
  bucketOf,
  compareTasks,
  isOnDeck,
  parseQuickTask,
  projectProgress,
  subtaskProgress,
} from "../lib/tasks";
import type { Project, Task } from "../lib/types";

const today = "2026-09-03"; // a Thursday
const base: Task = {
  id: "x",
  title: "t",
  notes: "",
  category: "",
  priority: "Medium",
  size: "M",
  status: "todo",
  due: null,
  projectId: null,
  subtasks: [],
};

// --- Bucketing --------------------------------------------------------------
assert.equal(bucketOf({ ...base, due: null }, today), "someday", "no due date is someday, never today");
assert.equal(bucketOf({ ...base, due: "2026-09-02" }, today), "overdue");
assert.equal(bucketOf({ ...base, due: "2026-09-03" }, today), "today");
assert.equal(bucketOf({ ...base, due: "2026-09-04" }, today), "tomorrow");
assert.equal(bucketOf({ ...base, due: "2026-09-09" }, today), "week");
assert.equal(bucketOf({ ...base, due: "2026-11-01" }, today), "later");
assert.equal(bucketOf({ ...base, due: "2026-09-01", status: "done" }, today), "done", "done outranks overdue");

// --- Working order ----------------------------------------------------------
const doing: Task = { ...base, id: "doing", status: "doing", priority: "Low", size: "S" };
const urgent: Task = { ...base, id: "urgent", priority: "Urgent", due: today };
assert.equal([urgent, doing].sort((a, b) => compareTasks(a, b, today))[0].id, "doing", "in-flight work sorts first");

const bigRock: Task = { ...base, id: "big", due: today, priority: "High", size: "L" };
const quickWin: Task = { ...base, id: "small", due: today, priority: "High", size: "S" };
assert.equal(
  [quickWin, bigRock].sort((a, b) => compareTasks(a, b, today))[0].id,
  "big",
  "big rocks come before quick wins at equal priority"
);

// --- On deck ----------------------------------------------------------------
assert.ok(isOnDeck({ ...base, status: "doing" }, today), "in-flight with no date is still on deck");
assert.ok(isOnDeck({ ...base, due: "2026-08-01" }, today), "overdue is on deck");
assert.ok(!isOnDeck({ ...base, due: "2026-09-05" }, today), "a future task is not on deck");
assert.ok(!isOnDeck({ ...base, due: today, status: "done" }, today), "a finished task is never on deck");

// --- Progress ---------------------------------------------------------------
assert.equal(subtaskProgress(base), 0, "no subtasks is 0%, not 100%");
assert.equal(
  subtaskProgress({ ...base, subtasks: [{ id: "a", title: "a", done: true }, { id: "b", title: "b", done: false }] }),
  50
);

const project: Project = { id: "p1", title: "P", field: "", archived: false, content: "" };
const progress = projectProgress(project, [
  { ...base, id: "1", projectId: "p1", status: "done" },
  { ...base, id: "2", projectId: "p1" },
  { ...base, id: "3", projectId: "other" },
]);
assert.deepEqual({ ...progress }, { pct: 50, done: 1, total: 2 }, "project progress counts only its own tasks");
assert.equal(projectProgress(project, []).total, 0, "an empty project is 0 of 0, not a division by zero");

// --- Capture shorthand ------------------------------------------------------
const parsed = parseQuickTask("email the parents tomorrow !urgent #admin", today);
assert.equal(parsed.title, "email the parents", "every token is stripped out of the title");
assert.equal(parsed.due, "2026-09-04");
assert.equal(parsed.priority, "Urgent");
assert.equal(parsed.category, "admin");
assert.equal(parseQuickTask("just a plain task", today).due, null, "a plain title gets no due date");
assert.equal(parseQuickTask("ship it thu", today).due, "2026-09-10", "a weekday typed on that weekday means next week");

console.log("lib/tasks.ts — all checks passed");
