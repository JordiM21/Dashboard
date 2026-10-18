/**
 * Business metrics (Feature Spec §6) and goal values. Every number here
 * names the decision it drives; nothing is stored, everything is derived
 * from live data + the local overlay.
 */
import type { FinanceEntry, GroupDoc, Student } from "@/lib/types";
import { studentPaymentStatus } from "@/lib/studentStatus";
import type { LiveData } from "./live";
import type { ClassSlot, Goal, HubState, StudentMeta } from "./types";
import { isItemDone } from "./actions";
import { addDays, daysBetween, dayOfWeek, monthKey, prevMonth, today, toMinutes, weekStart } from "./util";

export const MRR_TARGET = 1500;
export const PRICE = 50;
export const CAPACITY = 4;
export const HOURS_PER_GROUP = 3;

export type Lifecycle = NonNullable<StudentMeta["lifecycle"]>;

export function lifecycle(s: Student, meta: StudentMeta | undefined): Lifecycle {
  if (meta?.lifecycle) return meta.lifecycle;
  if (s.status === "active") return s.plan === "Initial Demo" ? "trial" : "active";
  return s.plan === "Initial Demo" ? "lead" : "paused";
}

export const startDate = (s: Student, meta?: StudentMeta) => meta?.startDate ?? (s.createdAt ?? "").slice(0, 10);

export function payingStudents(live: LiveData, st: HubState): Student[] {
  return live.students.filter((s) => lifecycle(s, st.studentMeta[s.id]) === "active");
}

export const price = (s: Student) => (typeof s.tuition === "number" && s.tuition > 0 ? s.tuition : PRICE);

export function mrr(live: LiveData, st: HubState): number {
  return payingStudents(live, st).reduce((sum, s) => sum + price(s), 0);
}

export const studentsToTarget = (m: number) => Math.max(0, Math.ceil((MRR_TARGET - m) / PRICE));

export function members(g: GroupDoc, students: Student[]): Student[] {
  const key = g.name.trim().toLowerCase();
  return students.filter((s) => (s.classGroup ?? "").trim().toLowerCase() === key && s.status === "active");
}

export const capacity = (st: HubState, gid: string) => st.groupMeta[gid]?.capacity ?? CAPACITY;

export function freeSeats(live: LiveData, st: HubState): number {
  return live.groups.reduce((sum, g) => sum + Math.max(0, capacity(st, g.id) - members(g, live.students).length), 0);
}

/** Weekly teaching hours needed to serve the whole target roster. */
export const hoursAtTarget = () => Math.ceil(MRR_TARGET / PRICE / CAPACITY) * HOURS_PER_GROUP;

export function currentTeachingHours(live: LiveData, st: HubState): number {
  return live.groups.reduce((sum, g) => sum + (st.groupMeta[g.id]?.slots ?? []).reduce((a, x) => a + x.minutes, 0), 0) / 60;
}

export function receivables(live: LiveData, st: HubState) {
  const t = today();
  return payingStudents(live, st)
    .map((s) => ({ student: s, status: studentPaymentStatus(s.nextPayment, t), days: s.nextPayment ? daysBetween(s.nextPayment, t) : 0, amount: price(s) }))
    .filter((r) => r.status === "late" || r.status === "pending")
    .sort((a, b) => b.days - a.days);
}

export function dueSoon(live: LiveData, st: HubState, days = 3) {
  const t = today();
  return payingStudents(live, st).filter((s) => s.nextPayment && s.nextPayment >= t && daysBetween(t, s.nextPayment) <= days);
}

export interface LedgerRow {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number; // signed USD
  scope: "business" | "personal";
  source: string;
  studentId?: string | null;
  raw?: FinanceEntry;
}

export function ledger(live: LiveData, st: HubState): LedgerRow[] {
  const rows: LedgerRow[] = live.transactions.map((t) => ({
    id: t.id, date: t.date, description: t.description, category: t.category, amount: t.amount, scope: "business", source: t.source ?? "manual", studentId: t.studentId, raw: t,
  }));
  for (const e of st.expenses) if (!e.archivedAt) rows.push({ id: e.id, date: e.date, description: e.description, category: e.category, amount: -Math.abs(e.amount), scope: e.scope, source: e.recurring ? "recurring" : "manual" });
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function monthNet(rows: LedgerRow[], month: string, scope: "business" | "personal" | "all" = "business") {
  const r = rows.filter((x) => x.date.startsWith(month) && (scope === "all" || x.scope === scope));
  const income = r.filter((x) => x.amount > 0).reduce((a, x) => a + x.amount, 0);
  const expense = r.filter((x) => x.amount < 0).reduce((a, x) => a - x.amount, 0);
  return { income, expense, net: income - expense };
}

export function newPaying(live: LiveData, st: HubState, month: string): Student[] {
  return payingStudents(live, st).filter((s) => startDate(s, st.studentMeta[s.id]).startsWith(month));
}

export function adSpend(live: LiveData, st: HubState, month: string): number {
  if (st.adSpend[month] != null) return st.adSpend[month];
  return ledger(live, st).filter((r) => r.date.startsWith(month) && /ads?\b|meta/i.test(r.category + " " + r.description) && r.amount < 0).reduce((a, r) => a - r.amount, 0);
}

export function costPerStudent(live: LiveData, st: HubState, month = monthKey()): number | null {
  const n = newPaying(live, st, month).length;
  return n ? adSpend(live, st, month) / n : null;
}

/** MRR at the end of each of the last n months, from start dates. */
export function mrrHistory(live: LiveData, st: HubState, n = 6): { month: string; value: number }[] {
  const cur = monthKey();
  return Array.from({ length: n }, (_, i) => {
    const m = prevMonth(cur, n - 1 - i);
    const end = m + "-31";
    const value = live.students
      .filter((s) => {
        const meta = st.studentMeta[s.id];
        const lc = lifecycle(s, meta);
        const started = startDate(s, meta) <= end;
        const leftLater = (lc === "churned" || lc === "alumni") && !!meta?.churnedAt && meta.churnedAt > end;
        return started && (lc === "active" || leftLater);
      })
      .reduce((a, s) => a + price(s), 0);
    return { month: m, value };
  });
}

export function weekDamage(live: LiveData, st: HubState): number {
  const ws = weekStart();
  return payingStudents(live, st).filter((s) => startDate(s, st.studentMeta[s.id]) >= ws).reduce((a, s) => a + price(s), 0);
}

export function tenureMonths(s: Student, meta?: StudentMeta): number {
  const sd = startDate(s, meta);
  return sd ? Math.max(0, Math.round(daysBetween(sd, today()) / 30.4)) : 0;
}

// ---------------------------------------------------------------- schedule

export interface ClassOccurrence {
  group: GroupDoc;
  slot: ClassSlot;
  date: string;
  startMin: number;
  endMin: number;
}

export function classesOn(date: string, live: LiveData, st: HubState): ClassOccurrence[] {
  const dow = dayOfWeek(date);
  return live.groups
    .flatMap((g) => (st.groupMeta[g.id]?.slots ?? []).filter((x) => x.day === dow).map((slot) => ({ group: g, slot, date, startMin: toMinutes(slot.start), endMin: toMinutes(slot.start) + slot.minutes })))
    .sort((a, b) => a.startMin - b.startMin);
}

/** Classes that ended 2h+ ago in the last 3 days with no lesson log. */
export function missingLogs(live: LiveData, st: HubState): ClassOccurrence[] {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const out: ClassOccurrence[] = [];
  for (let i = 0; i < 3; i++) {
    const d = addDays(today(), -i);
    for (const c of classesOn(d, live, st)) {
      if (i === 0 && c.endMin + 120 > nowMin) continue;
      const logged = st.lessons.some((l) => l.groupId === c.group.id && l.date === d) || live.plans.some((p) => p.groupId === c.group.id && p.date.slice(0, 10) === d && p.historyEntryId);
      if (!logged) out.push(c);
    }
  }
  return out;
}

// ---------------------------------------------------------------- goals

export function goalValue(g: Goal, st: HubState, live: LiveData): number {
  switch (g.metric) {
    case "mrr":
      return mrr(live, st);
    case "students":
      return payingStudents(live, st).length;
    case "revenue":
      return monthNet(ledger(live, st), monthKey()).income;
    case "tasks":
      return st.tasks.filter((t) => t.projectId === g.projectId && t.status === "done" && !t.archivedAt).length;
    case "collection": {
      const c = st.collections.find((x) => x.id === g.collectionId);
      return st.items.filter((i) => i.collectionId === g.collectionId && !i.archivedAt && isItemDone(c, i) && (i.doneAt ?? "") >= `${today().slice(0, 4)}-01-01`).length;
    }
    default:
      return g.log.length ? [...g.log].sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1)!.value : g.start;
  }
}

export function goalTarget(g: Goal, st: HubState): number {
  if (g.metric === "tasks") return st.tasks.filter((t) => t.projectId === g.projectId && !t.archivedAt && t.status !== "dropped").length;
  return g.target;
}

export function goalProgress(g: Goal, st: HubState, live: LiveData) {
  const value = goalValue(g, st, live);
  const target = goalTarget(g, st);
  const span = Math.max(1, target - g.start);
  const pct = Math.max(0, Math.min(1, (value - g.start) / span));
  const gap = Math.max(0, target - value);
  let pace: string | null = null;
  if (g.deadline && gap > 0) {
    const weeks = Math.max(1, daysBetween(today(), g.deadline) / 7);
    const per = gap / weeks;
    const unit = g.metric === "mrr" ? "students" : g.unit || "";
    const perUnit = g.metric === "mrr" ? per / PRICE : per;
    pace = `+${perUnit < 10 ? perUnit.toFixed(1).replace(/\.0$/, "") : Math.ceil(perUnit)} ${unit} per week to hit ${g.deadline.slice(8, 10)}-${g.deadline.slice(5, 7)}`;
  }
  return { value, target, pct, gap, pace, defeated: target > 0 && value >= target };
}

// ---------------------------------------------------------------- projects

/** Completed estimate ÷ total estimate; falls back to task count when nothing is estimated (§5.3). */
export function projectProgress(projectId: string, tasks: HubState["tasks"]) {
  const ts = tasks.filter((t) => t.projectId === projectId && !t.archivedAt && t.status !== "dropped");
  const done = ts.filter((t) => t.status === "done");
  const est = ts.reduce((a, t) => a + (t.estimate ?? 0), 0);
  const pct = est > 0 ? done.reduce((a, t) => a + (t.estimate ?? 0), 0) / est : ts.length ? done.length / ts.length : 0;
  const open = ts.filter((t) => t.status !== "done").sort((a, b) => a.priority - b.priority || (a.due ?? "9").localeCompare(b.due ?? "9"));
  return { pct, total: ts.length, done: done.length, next: open[0] ?? null, open };
}
