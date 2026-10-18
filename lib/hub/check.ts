/**
 * Smallest runnable check for the rules that would silently break:
 * quick-add parsing, XP/level math and the streak walk.
 *   npx tsx --env-file=.env.local lib/hub/check.ts
 */
import assert from "node:assert/strict";
import { parseQuickAdd } from "./parse";
import { bindings, comboOf } from "./keys";
import { changes } from "./cloud";
import { demoSeed } from "./seed";
import { levelFromXp, streak, taskXp, xpForLevel } from "./game";
import { addDays, today } from "./util";
import type { HubState, Task } from "./types";

const ctx = {
  areas: [{ id: "let", name: "LET Junior" }, { id: "home", name: "Home" }],
  projects: [{ id: "meta", name: "Meta campaign" }],
  students: [{ id: "s1", name: "Valentina Ruiz" }],
  collections: [{ id: "games", name: "Games backlog" }],
};
const base = "2026-10-18"; // a Sunday

let p = parseQuickAdd("Call parent tomorrow #let !1 @valentina +meta", ctx, base);
assert.equal(p.title, "Call parent");
assert.equal(p.due, "2026-10-19");
assert.deepEqual([p.areaId, p.priority, p.studentId, p.projectId], ["let", 1, "s1", "meta"]);

p = parseQuickAdd("Pay rent fri", ctx, base);
assert.equal(p.due, "2026-10-23");
p = parseQuickAdd("Review next week #nope", ctx, base);
assert.equal(p.due, "2026-10-19");
assert.equal(p.title, "Review #nope");
p = parseQuickAdd("/games Elden Ring", ctx, base);
assert.deepEqual([p.collectionId, p.title, p.due], ["games", "Elden Ring", null]);
p = parseQuickAdd("Book flights 02-01", ctx, base);
assert.equal(p.due, "2027-01-02");

assert.equal(xpForLevel(1), 100);
assert.equal(xpForLevel(10), 3162);
assert.deepEqual(levelFromXp(0).level, 1);
assert.deepEqual(levelFromXp(100).level, 2);
assert.equal(levelFromXp(99).level, 1);

const old = { priority: 1 as const, estimate: 60, createdAt: "2026-01-01T00:00:00Z", recurrence: null };
assert.equal(taskXp(old, new Date(), 0), 52);
assert.equal(taskXp(old, new Date(), 400), 13);
assert.equal(taskXp({ ...old, createdAt: new Date().toISOString() }, new Date(), 0), 2);

// Streak: 3 counted days ending yesterday, today not yet counted.
const t = today();
const mk = (day: string, n: number): Task[] =>
  Array.from({ length: n }, (_, i) => ({ id: day + i, scheduled: day, due: null, completedAt: day + "T10:00:00", status: "done" } as Task));
const days = [3, 2, 1].map((n) => addDays(t, -n));
const s: Pick<HubState, "tasks" | "game" | "settings"> = {
  tasks: days.flatMap((d) => mk(d, 3)),
  game: { dayPlans: Object.fromEntries(days.map((d) => [d, { at: d, taskIds: [] }])) } as unknown as HubState["game"],
  settings: { restDay: 9 } as HubState["settings"],
};
assert.equal(streak(s).current, 3);
s.tasks = s.tasks.filter((x) => !x.id.startsWith(days[1])); // miss the middle day, no freeze banked
assert.equal(streak(s).current, 1);

// Keybind combos: shift only counts for letters/named keys, Ctrl and Cmd are one modifier.
const ev = (key: string, m: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m }) as KeyboardEvent;
assert.equal(comboOf(ev("N", { shiftKey: true })), "shift+n");
assert.equal(comboOf(ev("?", { shiftKey: true })), "?");
assert.equal(comboOf(ev(" ")), "Space");
assert.equal(comboOf(ev("\\", { metaKey: true })), "ctrl+\\");
assert.equal(bindings({ quickAdd: "q" }).quickAdd, "q");

// Cloud sync writes only what changed: one edited task, nothing else.
const base0 = demoSeed();
const edited = { ...base0, tasks: base0.tasks.map((x, i) => (i === 0 ? { ...x, title: "edited" } : x)) };
const ch = changes(base0, edited);
assert.deepEqual(ch.map(([c, id]) => [c, id]), [["hub_tasks", base0.tasks[0].id]]);
assert.deepEqual(changes(base0, { ...base0, settings: { ...base0.settings, sound: false } }).map(([c, id]) => c + "/" + id), ["hub_state/settings"]);
assert.equal(changes(base0, { ...base0, tasks: base0.tasks.slice(1) })[0][2], null);

console.log("hub checks passed");
