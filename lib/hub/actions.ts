"use client";

/**
 * Every write v2 makes. Optimistic by construction: the store is local, so
 * the screen updates in the same frame. Game XP is awarded here so a
 * completion can never forget its reward.
 */
import type { Collection, Goal, HubState, Item, LessonLog, LocalExpense, Note, Project, Recurrence, Task, TimeEntry, XpEvent } from "./types";
import { XP, levelFromXp, taskXp, totalXp } from "./game";
import { fx, toast, announce } from "./fx";
import { getState, setState } from "./store";
import { makeTask } from "./seed";
import { addDays, dayOfWeek, hhmm, nowIso, today, uid } from "./util";
import { addMonths } from "@/lib/dateUtils";

type Origin = { x: number; y: number } | undefined;

const touch = <T extends { updatedAt: string }>(x: T, patch: Partial<T>): T => ({ ...x, ...patch, updatedAt: nowIso() });

// ---------------------------------------------------------------- XP

export function award(amount: number, label: string, source: string, areaId: string | null, refId?: string, from?: Origin): void {
  if (amount <= 0) return;
  const before = levelFromXp(totalXp(getState().game.xp)).level;
  const ev: XpEvent = { id: uid(), at: nowIso(), amount, label, source, areaId, refId };
  setState((s) => ({ ...s, game: { ...s.game, xp: [...s.game.xp, ev] } }));
  const after = levelFromXp(totalXp(getState().game.xp)).level;
  if (getState().settings.game !== "off") {
    fx({ type: "xp", amount, from, label });
    if (after > before) setTimeout(() => fx({ type: "levelup", level: after }), 650);
  }
  announce(`${label}, plus ${amount} XP${after > before ? `. Level ${after}` : ""}`);
}

function revokeXp(refId: string): void {
  setState((s) => ({ ...s, game: { ...s.game, xp: s.game.xp.filter((e) => e.refId !== refId || e.at.slice(0, 10) !== today()) } }));
}

// ---------------------------------------------------------------- Tasks

export function addTask(p: Partial<Task> & { title: string }): Task {
  const t = makeTask({ status: p.areaId || p.due || p.projectId ? "next" : "inbox", ...p });
  setState((s) => ({ ...s, tasks: [t, ...s.tasks] }));
  return t;
}

export function updateTask(id: string, patch: Partial<Task>): void {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => {
      if (t.id !== id) return t;
      const log = patch.status && patch.status !== t.status ? [...t.log, { at: nowIso(), text: `Status → ${patch.status}` }] : t.log;
      return touch(t, { ...patch, log });
    }),
  }));
  checkInboxZero();
}

function nextOccurrence(r: Recurrence, from: string): string {
  if (r.kind === "daily") return addDays(from, 1);
  if (r.kind === "monthly") return addMonths(from, 1);
  if (r.kind === "after") return addDays(today(), r.n ?? 1);
  const days = r.days?.length ? r.days : [dayOfWeek(from)];
  for (let i = 1; i <= 7; i++) if (days.includes(dayOfWeek(addDays(from, i)))) return addDays(from, i);
  return addDays(from, 7);
}

export function completeTask(id: string, from?: Origin): void {
  const s = getState();
  const task = s.tasks.find((t) => t.id === id);
  if (!task || task.status === "done") return;
  const now = new Date();
  const t0 = today();
  const todayTaskXp = s.game.xp.filter((e) => e.source === "task" && e.at.slice(0, 10) === t0).reduce((a, e) => a + e.amount, 0);
  const recurringEarned = !!task.recurrence && s.game.xp.some((e) => e.refId === id && e.at.slice(0, 10) === t0);
  const amount = taskXp(task, now, todayTaskXp, recurringEarned);

  let spawned: Task | null = null;
  if (task.recurrence) {
    const anchor = task.scheduled ?? task.due ?? t0;
    const next = nextOccurrence(task.recurrence, anchor < t0 ? t0 : anchor);
    spawned = makeTask({ ...task, id: uid(), status: "next", completedAt: null, scheduled: task.scheduled ? next : null, due: task.due ? next : null, checklist: task.checklist.map((c) => ({ ...c, done: false })), log: [] });
  }
  setState((st) => ({
    ...st,
    tasks: [...(spawned ? [spawned] : []), ...st.tasks.map((t) => (t.id === id ? touch(t, { status: "done", completedAt: nowIso(), log: [...t.log, { at: nowIso(), text: "Completed" }] }) : t))],
  }));
  award(amount, task.title, "task", task.areaId, id, from);

  const priority = s.reviews.at(-1)?.priorities.includes(id);
  if (priority) setTimeout(() => award(XP.priority, "Weekly priority done", "priority", task.areaId, id + ":p"), 700);
  if (!s.game.unlocked["first-blood"]) unlock("first-blood");

  toast(`Completed “${task.title}”`, {
    undo: () => {
      setState((st) => ({
        ...st,
        tasks: st.tasks.filter((t) => t.id !== spawned?.id).map((t) => (t.id === id ? touch(t, { status: task.status, completedAt: null }) : t)),
      }));
      revokeXp(id);
      revokeXp(id + ":p");
    },
  });
}

export function reopenTask(id: string): void {
  updateTask(id, { status: "next", completedAt: null });
  revokeXp(id);
}

export function archive(kind: "areas" | "tasks" | "notes" | "projects" | "goals" | "items" | "collections" | "expenses" | "time", id: string, label = "Archived"): void {
  const at = nowIso();
  const set = (v: string | null) =>
    setState((s) => ({ ...s, [kind]: (s[kind] as { id: string; archivedAt?: string | null }[]).map((x) => (x.id === id ? { ...x, archivedAt: v } : x)) }));
  set(at);
  toast(label, { undo: () => set(null) });
  checkInboxZero();
}

export function planDay(taskIds: string[]): void {
  const t0 = today();
  const first = !getState().game.dayPlans[t0];
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => (taskIds.includes(t.id) ? touch(t, { scheduled: t0, status: t.status === "inbox" ? "next" : t.status }) : t)),
    game: { ...s.game, dayPlans: { ...s.game.dayPlans, [t0]: { at: nowIso(), taskIds } } },
  }));
  if (first) {
    if (new Date().getHours() < 11) award(XP.plan, "Day planned", "plan", null, "plan:" + t0);
    else toast("Day planned. Plan before 11:00 to earn +30 XP");
  }
  checkInboxZero();
}

function checkInboxZero(): void {
  const s = getState();
  const t0 = today();
  const inbox = s.tasks.filter((t) => t.status === "inbox" && !t.archivedAt).length;
  if (inbox === 0 && !s.game.inboxZeroDays.includes(t0) && s.tasks.some((t) => t.log.length || t.updatedAt.slice(0, 10) === t0)) {
    setState((st) => ({ ...st, game: { ...st.game, inboxZeroDays: [...st.game.inboxZeroDays, t0] } }));
    award(XP.inbox, "Inbox zero", "inbox", null, "inbox:" + t0);
  }
}

// ---------------------------------------------------------------- Areas

export function addArea(name: string, color: string, icon = "Folder"): void {
  setState((s) => ({ ...s, areas: [...s.areas, { id: uid(), createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null, name, color, icon, active: true, sort: s.areas.length }] }));
}

export function updateArea(id: string, patch: Partial<HubState["areas"][number]>): void {
  setState((s) => ({ ...s, areas: s.areas.map((a) => (a.id === id ? touch(a, patch) : a)) }));
}

export function moveArea(id: string, by: -1 | 1): void {
  setState((s) => {
    const list = [...s.areas].sort((a, b) => a.sort - b.sort);
    const i = list.findIndex((a) => a.id === id);
    const j = i + by;
    if (j < 0 || j >= list.length) return s;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...s, areas: list.map((a, n) => ({ ...a, sort: n })) };
  });
}

// ---------------------------------------------------------------- Projects, templates

export function addProject(p: Partial<Project> & { title: string; areaId: string }): Project {
  const pr: Project = { id: uid(), createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null, status: "active", start: today(), target: null, outcome: "", milestones: [], ...p };
  setState((s) => ({ ...s, projects: [pr, ...s.projects] }));
  return pr;
}

export function updateProject(id: string, patch: Partial<Project>): void {
  const prev = getState().projects.find((p) => p.id === id);
  setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? touch(p, patch) : p)) }));
  if (prev && patch.status === "done" && prev.status !== "done") award(XP.project, `Project done: ${prev.title}`, "project", prev.areaId, "project:" + id);
}

export function applyTemplate(tplId: string, opts: { projectId?: string | null; start?: string; studentId?: string } = {}): number {
  const tpl = getState().templates.find((t) => t.id === tplId);
  if (!tpl) return 0;
  const start = opts.start ?? today();
  const tasks = tpl.tasks.map((x) =>
    makeTask({ title: x.title, areaId: tpl.areaId, priority: x.priority, estimate: x.estimate, due: addDays(start, x.offsetDays), projectId: opts.projectId ?? null, studentId: opts.studentId ?? null })
  );
  setState((s) => ({ ...s, tasks: [...tasks, ...s.tasks] }));
  return tasks.length;
}

export function saveTemplate(projectId: string): void {
  const s = getState();
  const p = s.projects.find((x) => x.id === projectId);
  if (!p) return;
  const tasks = s.tasks.filter((t) => t.projectId === projectId && !t.archivedAt);
  const first = tasks.map((t) => t.due ?? t.scheduled).filter(Boolean).sort()[0] ?? today();
  const tpl = {
    id: uid(),
    name: p.title,
    areaId: p.areaId,
    tasks: tasks.map((t) => ({ title: t.title, priority: t.priority, estimate: t.estimate, offsetDays: Math.max(0, Math.round((Date.parse(t.due ?? t.scheduled ?? first) - Date.parse(first)) / 86400000)) })),
  };
  setState((st) => ({ ...st, templates: [...st.templates, tpl] }));
  toast(`Saved “${p.title}” as a template`);
}

// ---------------------------------------------------------------- Goals, notes, collections

export function addGoal(g: Partial<Goal> & { title: string; areaId: string }): Goal {
  const goal: Goal = { id: uid(), createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null, horizon: "quarter", metric: "manual", target: 1, start: 0, unit: "", deadline: null, pinned: false, log: [], ...g };
  setState((s) => ({ ...s, goals: [...s.goals, goal] }));
  return goal;
}

export function updateGoal(id: string, patch: Partial<Goal>): void {
  setState((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? touch(g, patch) : g)) }));
}

export function logGoal(id: string, value: number): void {
  setState((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? touch(g, { log: [...g.log.filter((l) => l.date !== today()), { date: today(), value }] }) : g)) }));
}

export function addNote(n: Partial<Note> & { title: string }): Note {
  const note: Note = { id: uid(), createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null, body: "", type: "doc", areaId: "let", pinned: false, ...n };
  setState((s) => ({ ...s, notes: [note, ...s.notes] }));
  return note;
}

export function updateNote(id: string, patch: Partial<Note>): void {
  setState((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? touch(n, patch) : n)) }));
}

export function addCollection(c: Partial<Collection> & { name: string; areaId: string }): Collection {
  const col: Collection = { id: uid(), createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null, icon: "Folder", fields: [], view: "list", ...c };
  setState((s) => ({ ...s, collections: [...s.collections, col] }));
  return col;
}

export function updateCollection(id: string, patch: Partial<Collection>): void {
  setState((s) => ({ ...s, collections: s.collections.map((c) => (c.id === id ? touch(c, patch) : c)) }));
}

export function isItemDone(c: Collection | undefined, i: Item): boolean {
  if (!c?.doneField) return !!i.doneAt;
  const v = i.values[c.doneField];
  return c.doneValue === "true" ? v === true : v === c.doneValue;
}

export function addItem(collectionId: string, title: string, values: Record<string, unknown> = {}): Item {
  const item: Item = { id: uid(), createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null, collectionId, title, values, doneAt: null };
  setState((s) => ({ ...s, items: [item, ...s.items] }));
  return item;
}

export function updateItem(id: string, patch: Partial<Item>): void {
  const s = getState();
  setState((st) => ({
    ...st,
    items: st.items.map((i) => {
      if (i.id !== id) return i;
      const next = touch(i, { ...patch, values: { ...i.values, ...(patch.values ?? {}) } });
      const c = st.collections.find((x) => x.id === i.collectionId);
      const done = isItemDone(c, next);
      return { ...next, doneAt: done ? i.doneAt ?? nowIso() : null };
    }),
  }));
  const item = getState().items.find((i) => i.id === id)!;
  const col = s.collections.find((c) => c.id === item.collectionId);
  if (item.doneAt && col?.name === "Games backlog" && !s.game.unlocked.completionist) unlock("completionist");
}

// ---------------------------------------------------------------- Time

export function runningTimer(s: HubState = getState()): TimeEntry | undefined {
  return s.time.find((e) => e.end === null && !e.archivedAt);
}

export function startTimer(p: { label: string; areaId: string; taskId?: string; projectId?: string | null; track?: "delivery" | "growth" }): void {
  stopTimer(true);
  const e: TimeEntry = { id: uid(), createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null, start: nowIso(), end: null, source: "timer", ...p };
  setState((s) => ({ ...s, time: [e, ...s.time] }));
  toast(`Timer started · ${p.label}`);
}

export function stopTimer(silent = false): void {
  const r = runningTimer();
  if (!r) return;
  setState((s) => ({ ...s, time: s.time.map((e) => (e.id === r.id ? touch(e, { end: nowIso() }) : e)) }));
  if (!silent) toast(`Logged ${Math.max(1, Math.round((Date.now() - Date.parse(r.start)) / 60000))} min · ${r.label}`);
}

export function addTimeEntry(e: Omit<TimeEntry, "id" | "createdAt" | "updatedAt">): void {
  setState((s) => ({ ...s, time: [{ id: uid(), createdAt: nowIso(), updatedAt: nowIso(), ...e }, ...s.time] }));
}

// ---------------------------------------------------------------- Academy, finance

export function logLesson(l: Omit<LessonLog, "id" | "createdAt" | "updatedAt">): void {
  const log: LessonLog = { id: uid(), createdAt: nowIso(), updatedAt: nowIso(), archivedAt: null, ...l };
  setState((s) => ({ ...s, lessons: [log, ...s.lessons] }));
  award(XP.lesson, "Lesson logged", "lesson", "let", "lesson:" + log.id);
}

export function setStudentMeta(id: string, patch: HubState["studentMeta"][string]): void {
  setState((s) => ({ ...s, studentMeta: { ...s.studentMeta, [id]: { ...s.studentMeta[id], ...patch } } }));
}

export function setGroupMeta(id: string, patch: HubState["groupMeta"][string]): void {
  setState((s) => ({ ...s, groupMeta: { ...s.groupMeta, [id]: { ...s.groupMeta[id], ...patch } } }));
}

export function addExpense(e: Omit<LocalExpense, "id" | "createdAt" | "updatedAt">): void {
  setState((s) => ({ ...s, expenses: [{ id: uid(), createdAt: nowIso(), updatedAt: nowIso(), ...e }, ...s.expenses] }));
}

export function setAdSpend(month: string, amount: number): void {
  setState((s) => ({ ...s, adSpend: { ...s.adSpend, [month]: amount } }));
}

// ---------------------------------------------------------------- Reviews, game

export function completeReview(priorities: string[], notes: string, week: string): void {
  setState((s) => ({ ...s, reviews: [...s.reviews, { id: uid(), week, doneAt: nowIso(), priorities, notes }] }));
  award(XP.review, "Weekly review", "review", null, "review:" + week);
}

export function saveMonthly(month: string, reflection: string): void {
  setState((s) => ({ ...s, monthly: [...s.monthly.filter((m) => m.month !== month), { month, reflection, doneAt: nowIso() }] }));
  toast("Monthly review saved");
}

export function unlock(id: string): void {
  if (getState().game.unlocked[id]) return;
  setState((s) => ({ ...s, game: { ...s.game, unlocked: { ...s.game.unlocked, [id]: nowIso() } } }));
  if (getState().settings.game !== "off") fx({ type: "achievement", id });
}

export function setSettings(patch: Partial<HubState["settings"]>): void {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function setUi(patch: Partial<HubState["ui"]>): void {
  setState((s) => ({ ...s, ui: { ...s.ui, ...patch } }));
}

export function markAutomation(key: string): boolean {
  if (getState().game.automations[key]) return false;
  setState((s) => ({ ...s, game: { ...s.game, automations: { ...s.game.automations, [key]: nowIso() } } }));
  return true;
}

export { hhmm };
