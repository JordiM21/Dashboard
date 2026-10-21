/**
 * Game layer rules (Design Guide §8). Pure functions over plain data so the
 * numbers can be checked without React — see game.check.ts.
 */
import type { HubState, Task, XpEvent } from "./types";
import { addDays, DAY_START_HOUR, dayOf, dayOfWeek, today as todayIso } from "./util";

export const XP = {
  plan: 30,
  lesson: 15,
  inbox: 20,
  review: 150,
  priority: 100,
  project: 200,
  student: 500,
} as const;

const PRIORITY_XP = { 1: 40, 2: 20, 3: 10 } as const;
const DAILY_TASK_CAP = 400;

/**
 * XP for completing a task. `taskXpToday` is task XP already earned today
 * (pre-cap), `recurringEarnedToday` whether this recurring task already paid
 * out today.
 */
export function taskXp(task: Pick<Task, "priority" | "estimate" | "createdAt" | "recurrence">, at: Date, taskXpToday: number, recurringEarnedToday = false): number {
  const createdMs = Date.parse(task.createdAt);
  if (at.getTime() - createdMs < 2 * 60 * 1000) return 2;
  if (task.recurrence && recurringEarnedToday) return 2;
  const raw = PRIORITY_XP[task.priority] + Math.min(30, Math.floor((task.estimate ?? 0) / 5));
  const room = Math.max(0, DAILY_TASK_CAP - taskXpToday);
  const full = Math.min(raw, room);
  return full + Math.round((raw - full) * 0.25);
}

/** XP needed to go from level n to n + 1. */
export const xpForLevel = (n: number) => Math.round(100 * Math.pow(n, 1.5));

export function levelFromXp(total: number): { level: number; into: number; need: number; pct: number } {
  let level = 1;
  let left = total;
  while (left >= xpForLevel(level)) {
    left -= xpForLevel(level);
    level++;
  }
  const need = xpForLevel(level);
  return { level, into: left, need, pct: left / need };
}

export const totalXp = (xp: XpEvent[]) => xp.reduce((s, e) => s + e.amount, 0);

/**
 * hub_state/game is one Firestore doc (1 MB cap) rewritten on every award, so
 * the history can't grow forever. Events before `cutoff` fold into one per
 * area per month: totals, area totals and the 8-week chart are unchanged.
 */
export function compactXp(xp: XpEvent[], cutoff: string): XpEvent[] {
  const keep: XpEvent[] = [];
  const rolled = new Map<string, XpEvent>();
  for (const e of xp) {
    if (e.at.slice(0, 10) >= cutoff) {
      keep.push(e);
      continue;
    }
    const k = `${e.at.slice(0, 7)}|${e.areaId ?? ""}`;
    const r = rolled.get(k);
    if (r) rolled.set(k, { ...r, amount: r.amount + e.amount });
    else rolled.set(k, { id: "xp-" + k, at: `${e.at.slice(0, 7)}-01T00:00:00.000Z`, amount: e.amount, areaId: e.areaId, label: "Earlier XP", source: "archive" });
  }
  return [...rolled.values(), ...keep];
}

export function xpByArea(xp: XpEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of xp) if (e.areaId) out[e.areaId] = (out[e.areaId] ?? 0) + e.amount;
  return out;
}

/** Focus list: open tasks scheduled for or due by `day`, plus overdue. */
export function isFocus(t: Task, day: string): boolean {
  if (t.archivedAt || t.status === "done" || t.status === "dropped" || t.status === "inbox") return false;
  return (t.scheduled != null && t.scheduled <= day) || (t.due != null && t.due <= day);
}

/** Focus tasks completed on `day` — a task counts if it was scheduled/due by that day. */
export function focusDoneOn(tasks: Task[], day: string): number {
  return tasks.filter(
    (t) =>
      t.completedAt &&
      dayOf(t.completedAt) === day &&
      ((t.scheduled != null && t.scheduled <= day) || (t.due != null && t.due <= day))
  ).length;
}

export function dayCounts(state: Pick<HubState, "tasks" | "game">, day: string): boolean {
  return !!state.game.dayPlans[day] && focusDoneOn(state.tasks, day) >= 3;
}

export interface StreakInfo {
  current: number;
  longest: number;
  freezes: number;
  todayCounted: boolean;
  atRisk: boolean;
  week: { date: string; state: "done" | "today" | "missed" | "rest" | "future" }[];
}

/**
 * Walks forward from the first planned day. Rest days are skipped, a
 * freeze is earned every 7 counted days (max 2 banked) and spent
 * automatically on a missed day. Today never breaks the streak — it only
 * adds once it counts.
 */
export function streak(state: Pick<HubState, "tasks" | "game" | "settings">, now: Date = new Date()): StreakInfo {
  const t = todayIso();
  const rest = state.settings.restDay;
  const planned = Object.keys(state.game.dayPlans).sort();
  let current = 0;
  let longest = 0;
  let freezes = 0;
  if (planned.length) {
    for (let d = planned[0]; d < t; d = addDays(d, 1)) {
      if (dayCounts(state, d)) {
        current++;
        if (current % 7 === 0) freezes = Math.min(2, freezes + 1);
      } else if (dayOfWeek(d) === rest) {
        // rest days never break a streak
      } else if (freezes > 0) {
        freezes--;
      } else {
        current = 0;
      }
      longest = Math.max(longest, current);
    }
  }
  const todayCounted = dayCounts(state, t);
  if (todayCounted) current++;
  longest = Math.max(longest, current);

  const monday = addDays(t, dayOfWeek(t) === 0 ? -6 : 1 - dayOfWeek(t));
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const state_: StreakInfo["week"][number]["state"] =
      date > t ? "future" : dayCounts(state, date) ? "done" : date === t ? "today" : dayOfWeek(date) === rest ? "rest" : "missed";
    return { date, state: state_ };
  });

  return {
    current,
    longest,
    freezes,
    todayCounted,
    atRisk: !todayCounted && (now.getHours() >= 18 || now.getHours() < DAY_START_HOUR) && dayOfWeek(t) !== rest,
    week,
  };
}

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface AchievementDef {
  id: string;
  name: string;
  rarity: Rarity;
  unlock: string;
  goal: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-blood", name: "First Blood", rarity: "common", unlock: "First task completed in v2", goal: 1 },
  { id: "zero-inbox", name: "Zero Inbox", rarity: "rare", unlock: "Inbox emptied on 10 different days", goal: 10 },
  { id: "full-house", name: "Full House", rarity: "rare", unlock: "A group reaches 4/4 students", goal: 1 },
  { id: "iron-streak", name: "Iron Streak", rarity: "epic", unlock: "30-day streak", goal: 30 },
  { id: "recruiter", name: "Recruiter", rarity: "epic", unlock: "5 new paying students in one month", goal: 5 },
  { id: "bookkeeper", name: "Bookkeeper", rarity: "epic", unlock: "Monthly review done 3 months in a row", goal: 3 },
  { id: "completionist", name: "Completionist", rarity: "rare", unlock: "A game marked finished in the Games collection", goal: 1 },
  { id: "boss-slayer", name: "Boss Slayer", rarity: "legendary", unlock: "Any boss defeated", goal: 1 },
];
