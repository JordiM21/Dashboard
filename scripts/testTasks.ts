/**
 * Self-check for lib/tasks.ts — the bucketing, the working order, the tag
 * vocabulary, and the capture-box shorthand. These are what every task view
 * agrees on, so a silent change here quietly reshuffles someone's day.
 *
 *   npx tsx scripts/testTasks.ts
 */

import assert from "assert";
import {
  allTags,
  bucketOf,
  compareTasks,
  hasTag,
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
  tags: [],
  priority: "Medium",
  status: "todo",
  due: null,
  projectId: null,
  subtasks: [],
};
const project: Project = { id: "p1", title: "P", field: "", archived: false, content: "" };

// --- Bucketing --------------------------------------------------------------
assert.equal(bucketOf({ ...base, due: null }, today), "someday", "no due date is someday, never today");
assert.equal(bucketOf({ ...base, due: "2026-09-02" }, today), "overdue");
assert.equal(bucketOf({ ...base, due: "2026-09-03" }, today), "today");
assert.equal(bucketOf({ ...base, due: "2026-09-04" }, today), "tomorrow");
assert.equal(bucketOf({ ...base, due: "2026-09-09" }, today), "week");
assert.equal(bucketOf({ ...base, due: "2026-11-01" }, today), "later");
assert.equal(bucketOf({ ...base, due: "2026-09-01", status: "done" }, today), "done", "done outranks overdue");

// --- Working order ----------------------------------------------------------
const doing: Task = { ...base, id: "doing", status: "doing", priority: "Low" };
const urgent: Task = { ...base, id: "urgent", priority: "Urgent", due: today };
assert.equal([urgent, doing].sort((a, b) => compareTasks(a, b, today))[0].id, "doing", "in-flight work sorts first");

// "Big" is measured from the step count rather than declared with a size
// field — the task someone bothered to break down is the bigger chunk.
const bigRock: Task = {
  ...base,
  id: "big",
  due: today,
  priority: "High",
  subtasks: [
    { id: "s1", title: "one", done: false },
    { id: "s2", title: "two", done: false },
  ],
};
const quickWin: Task = { ...base, id: "small", due: today, priority: "High" };
assert.equal(
  [quickWin, bigRock].sort((a, b) => compareTasks(a, b, today))[0].id,
  "big",
  "the broken-down task comes first at equal priority and date"
);
assert.equal(
  [{ ...quickWin, priority: "Urgent" as const }, bigRock].sort((a, b) => compareTasks(a, b, today))[0].id,
  "small",
  "priority still outranks chunk size"
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

const progress = projectProgress(project, [
  { ...base, id: "1", projectId: "p1", status: "done" },
  { ...base, id: "2", projectId: "p1" },
  { ...base, id: "3", projectId: "other" },
]);
assert.deepEqual({ ...progress }, { pct: 50, done: 1, total: 2 }, "project progress counts only its own tasks");
assert.equal(projectProgress(project, []).total, 0, "an empty project is 0 of 0, not a division by zero");

// --- Capture shorthand ------------------------------------------------------
const parsed = parseQuickTask("email the parents tomorrow !urgent #admin #legal", today);
assert.equal(parsed.title, "email the parents", "every token is stripped out of the title");
assert.equal(parsed.due, "2026-09-04");
assert.equal(parsed.priority, "Urgent");
assert.deepEqual(parsed.tags, ["admin", "legal"], "every #tag is kept, not just the first");
assert.equal(parseQuickTask("just a plain task", today).due, null, "a plain title gets no due date");
assert.equal(
  parseQuickTask("just a plain task", today).priority,
  undefined,
  "with no ! token, the visible priority control decides"
);
assert.equal(parseQuickTask("ship it thu", today).due, "2026-09-10", "a weekday typed on that weekday means next week");
assert.deepEqual(parseQuickTask("dedupe #Admin #admin", today).tags, ["Admin"], "the same tag twice is one tag");

// --- Tag vocabulary ---------------------------------------------------------
const tagged = (id: string, tags: string[]): Task => ({ ...base, id, tags });
assert.deepEqual(
  allTags([tagged("1", ["Marketing"]), tagged("2", ["admin", "marketing"])], [project]),
  ["admin", "Marketing"],
  "one spelling per tag, case-insensitively, sorted"
);
assert.deepEqual(
  allTags([], [{ ...project, field: "Sales" }]),
  ["Sales"],
  "a project's category joins the same vocabulary"
);
assert.ok(hasTag(tagged("1", ["Marketing"]), "marketing"), "tag matching ignores case");
assert.ok(!hasTag(tagged("1", ["Marketing"]), "sales"));

console.log("lib/tasks.ts — all checks passed");
