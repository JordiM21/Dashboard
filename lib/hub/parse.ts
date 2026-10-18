/**
 * Quick-add parser (Feature Spec §5.2): dates, #area, +project, !1–!3,
 * @student and a leading /collection. Anything it doesn't recognise stays
 * in the title. Checked by parse.check.ts.
 */
import type { Priority } from "./types";
import { addDays, dayOfWeek, today as todayIso } from "./util";

interface Named {
  id: string;
  name: string;
}

export interface Parsed {
  title: string;
  due: string | null;
  areaId: string | null;
  projectId: string | null;
  priority: Priority | null;
  studentId: string | null;
  collectionId: string | null;
  chips: { kind: string; label: string }[];
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function match(token: string, list: Named[]): Named | undefined {
  const s = slug(token);
  if (!s) return undefined;
  return list.find((x) => slug(x.name) === s) ?? list.find((x) => slug(x.name).startsWith(s)) ?? list.find((x) => slug(x.name.split(" ")[0]) === s);
}

function parseDate(words: string[], i: number, base: string): { date: string; used: number } | null {
  const w = words[i].toLowerCase();
  const next = words[i + 1]?.toLowerCase();
  if (w === "today" || w === "hoy") return { date: base, used: 1 };
  if (w === "tomorrow" || w === "tmr" || w === "mañana") return { date: addDays(base, 1), used: 1 };
  if (w === "next" && next === "week") return { date: addDays(base, ((8 - dayOfWeek(base)) % 7) || 7), used: 2 };
  if (w === "in" && next && /^\d+$/.test(next) && /^days?$/.test(words[i + 2]?.toLowerCase() ?? "")) return { date: addDays(base, Number(next)), used: 3 };
  const dow = DOW.findIndex((d) => w === d || (w.length > 3 && d === w.slice(0, 3) && /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/.test(w)));
  if (dow >= 0) {
    const diff = (dow - dayOfWeek(base) + 7) % 7 || 7;
    return { date: addDays(base, diff), used: 1 };
  }
  const dm = w.match(/^(\d{1,2})[-/](\d{1,2})$/); // DD-MM, next occurrence
  if (dm) {
    const y = Number(base.slice(0, 4));
    let iso = `${y}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
    if (iso < base) iso = `${y + 1}${iso.slice(4)}`;
    return { date: iso, used: 1 };
  }
  return null;
}

export function parseQuickAdd(
  input: string,
  ctx: { areas: Named[]; projects: Named[]; students: Named[]; collections: Named[] },
  base: string = todayIso()
): Parsed {
  const out: Parsed = { title: "", due: null, areaId: null, projectId: null, priority: null, studentId: null, collectionId: null, chips: [] };
  let text = input.trim();

  const coll = text.match(/^\/(\S+)\s*/);
  if (coll) {
    const c = match(coll[1], ctx.collections);
    if (c) {
      out.collectionId = c.id;
      out.chips.push({ kind: "collection", label: c.name });
      text = text.slice(coll[0].length);
    }
  }

  const words = text.split(/\s+/).filter(Boolean);
  const keep: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const p = w.match(/^!([1-3])$/);
    if (p) {
      out.priority = Number(p[1]) as Priority;
      out.chips.push({ kind: "priority", label: `P${p[1]}` });
      continue;
    }
    if (w.startsWith("#") && w.length > 1) {
      const a = match(w.slice(1), ctx.areas);
      if (a) {
        out.areaId = a.id;
        out.chips.push({ kind: "area", label: a.name });
        continue;
      }
    }
    if (w.startsWith("+") && w.length > 1) {
      const pr = match(w.slice(1), ctx.projects);
      if (pr) {
        out.projectId = pr.id;
        out.chips.push({ kind: "project", label: pr.name });
        continue;
      }
    }
    if (w.startsWith("@") && w.length > 1) {
      const s = match(w.slice(1), ctx.students);
      if (s) {
        out.studentId = s.id;
        out.chips.push({ kind: "student", label: s.name });
        continue;
      }
    }
    if (!out.due && !out.collectionId) {
      const d = parseDate(words, i, base);
      if (d) {
        out.due = d.date;
        out.chips.push({ kind: "date", label: d.date });
        i += d.used - 1;
        continue;
      }
    }
    keep.push(w);
  }
  out.title = keep.join(" ");
  return out;
}
