/**
 * Mirrors the dashboard into a folder of Markdown files ("the Brain") that
 * Claude can be pointed at. Firestore stays the source of truth; this only
 * reads it. Layout and question routing are documented in the CLAUDE.md it
 * writes at the Brain root.
 *
 *   npx tsx scripts/exportBrain.ts           one full export
 *   npx tsx scripts/exportBrain.ts --watch   re-export a few seconds after any change
 *
 * Folder: BRAIN_DIR, default ../Brain next to this repo — outside git, since
 * it holds student and payment data. Only areas/, business/,
 * journal/activity/, NOW.md and CLAUDE.md are owned (wiped and rewritten);
 * PROFILE.md, inbox/ and the rest of journal/ are Jordi's and Claude's.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAdminDb } from "../lib/firebase/admin";
import { formatDateDMY } from "../lib/dateUtils";
import { PAYMENT_STATUS_LABEL, studentPaymentStatus } from "../lib/studentStatus";
import { addDays, DAY_START_HOUR, dayOf, localDateIso, today } from "../lib/hub/util";
import type { LiveData } from "../lib/hub/live";
import type { Area, Collection, Goal, HubState, Item, LocalExpense, Note, Project, Task } from "../lib/hub/types";
import type { CurriculumLevelDoc, FinanceEntry, GroupDoc, RecurringTransaction, ResourceFile, ResourceFolder, Student } from "../lib/types";
import type { SocialPost } from "../lib/social/rules";

// metrics.ts pulls in the browser Firebase client, which reads NEXT_PUBLIC_* at import time — so it
// must load after loadEnvConfig, and static imports are hoisted above it.
let goalProgress: Metrics["goalProgress"], lifecycle: Metrics["lifecycle"], members: Metrics["members"], mrr: Metrics["mrr"];
let price: Metrics["price"], projectProgress: Metrics["projectProgress"], receivables: Metrics["receivables"];
type Metrics = typeof import("../lib/hub/metrics");

const DIR = path.resolve(process.env.BRAIN_DIR || path.join(process.cwd(), "..", "Brain"));
const OWNED = ["areas", "business", "journal/activity", "NOW.md", "CLAUDE.md"];
const ACTIVITY_DAYS = 60;

const REPO = process.cwd();
const RUN = `Run \`npm run brain\` in ${REPO} first.`;
const PUBLISH = `Finally run \`npm run brain\` again so the dashboard's Brain page shows the new file. Use DD-MM-YYYY for dates in the text.`;
/**
 * The Claude scheduled tasks that write journal/. `hours` is the longest gap between runs before the
 * Brain page calls a task late. Prompts are pasted into CLAUDE.md and the desktop app's task list.
 */
const TASKS = [
  {
    id: "daily-close", name: "Daily close", when: "every day 23:30", cron: "30 23 * * *", folder: "journal/daily", hours: 26,
    prompt: `${RUN} Read CLAUDE.md, PROFILE.md, NOW.md and journal/activity/<today>.md. Write journal/daily/<today>.md (today = the date in NOW.md's front-matter) with these sections: Done (grouped by area), Progressed, Stuck or slipped (overdue, waiting), Money (payments in or out today), Notes worth remembering, Tomorrow's top 3 (from NOW.md, explaining why each one). Keep it under 300 words. ${PUBLISH}`,
  },
  {
    id: "morning-brief", name: "Morning brief", when: "every day 08:00", cron: "0 8 * * *", folder: "journal/briefs", hours: 26,
    prompt: `${RUN} Read CLAUDE.md, PROFILE.md, NOW.md and the latest file in journal/daily/. Write journal/briefs/<today>.md with: the plan for today (max 5 items, most important first), overdue items to decide on (do, reschedule or drop), students to chase for payment, classes today, and one focus suggestion tied to a pinned goal. Under 200 words. ${PUBLISH}`,
  },
  {
    id: "weekly-review", name: "Weekly review", when: "Sundays 19:00", cron: "0 19 * * 0", folder: "journal/weekly", hours: 24 * 7 + 2,
    prompt: `${RUN} Read CLAUDE.md, PROFILE.md, this week's journal/daily files (fall back to journal/activity), every area's _overview.md and business/students.md. Write journal/weekly/<YYYY>-W<ww>.md with: Wins, Goals that moved and goals that stalled (with numbers), Time balance across areas (judged from activity), Patterns (what keeps slipping, and why), Business (MRR, new or lost students, who owes), and the 3 priorities for next week. ${PUBLISH}`,
  },
  {
    id: "monthly-report", name: "Monthly report", when: "1st of the month 09:00", cron: "0 9 1 * *", folder: "journal/monthly", hours: 24 * 32,
    prompt: `${RUN} Read CLAUDE.md, PROFILE.md, business/payments/<last month>.md, business/students.md, business/recurring.md, last month's weekly reviews and the LET Junior _overview.md. Write journal/monthly/<YYYY-MM>.md (last month) with: revenue vs expenses vs the month before, MRR and paying students, new, churned and late students, ad spend and cost per student if visible, goal progress, and 3 concrete actions for this month. ${PUBLISH}`,
  },
];

const COLLECTIONS = [
  "hub_areas", "hub_tasks", "hub_projects", "hub_goals", "hub_notes", "hub_collections", "hub_items", "hub_expenses", "hub_state",
  "students", "transactions", "recurringTransactions", "groups", "curriculum", "resourceFolders", "resourceFiles", "hub_social_posts",
] as const;
type Raw = Record<(typeof COLLECTIONS)[number], Record<string, unknown>[]>;

// ---------------------------------------------------------------- helpers

const d = (iso?: string | null) => (iso ? formatDateDMY(day(iso)) : "—");
/** The hub day a timestamp belongs to (rolls over at DAY_START_HOUR). Hub records hold local time; webhook/Stripe ones are UTC (Z). */
const day = (iso?: string | null) =>
  !iso ? "" : iso.length === 10 ? iso : /(Z|[+-]\d\d:\d\d)$/.test(iso) ? localDateIso(new Date(Date.parse(iso) - DAY_START_HOUR * 3600e3)) : dayOf(iso);
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const cell = (v: unknown) => (v == null || v === "" ? "" : String(Array.isArray(v) ? v.join(", ") : v)).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const table = (head: string[], rows: unknown[][]) =>
  rows.length ? [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n") : "_None._";
const isOpen = (t: Task) => !t.archivedAt && t.status !== "done" && t.status !== "dropped";
const live = <T extends { archivedAt?: string | null }>(xs: T[]) => xs.filter((x) => !x.archivedAt);
/** A data: URL cover is an inline image — megabytes of base64 Claude can't use. */
const url = (v?: string) => (v && !v.startsWith("data:") ? v : undefined);

function fm(o: Record<string, unknown>): string {
  const lines = Object.entries(o).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length));
  return `---\n${lines.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n\n`;
}

function slug(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "untitled";
}

/** Stable, unique file names per folder: a clash gets the record id's first chars appended. */
function namer() {
  const used = new Set<string>();
  return (title: string, id: string) => {
    let s = slug(title);
    if (used.has(s)) s = `${s}-${id.slice(0, 6).toLowerCase()}`;
    used.add(s);
    return s;
  };
}

function write(rel: string, text: string) {
  const file = path.join(DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.trimEnd() + "\n");
}

function taskLine(t: Task, st: Snapshot, withArea = false): string {
  const bits = [
    withArea && st.areaName(t.areaId),
    `P${t.priority}`,
    t.status !== "next" && t.status !== "done" && t.status,
    t.due && `due ${d(t.due)}`,
    t.scheduled && `planned ${d(t.scheduled)}`,
    t.estimate && `${t.estimate} min`,
    t.waitingOn && `waiting on ${t.waitingOn}`,
    t.completedAt && `done ${d(t.completedAt)}`,
    t.projectId && withArea && `project: ${st.projects.get(t.projectId)?.title}`,
  ].filter(Boolean);
  const sub = [
    t.notes?.trim() && `  - Notes: ${t.notes.trim().replace(/\r?\n/g, " ")}`,
    ...t.checklist.map((c) => `  - [${c.done ? "x" : " "}] ${c.title}`),
  ].filter(Boolean);
  return [`- [${t.status === "done" ? "x" : " "}] ${t.title.trim()} —${bits.join(" · ")}`, ...sub].join("\n");
}

// ---------------------------------------------------------------- load

interface Snapshot {
  st: HubState;
  live: LiveData;
  areas: Area[];
  projects: Map<string, Project>;
  areaName: (id: string) => string;
  areaDir: Map<string, string>;
  social: SocialPost[];
}

/** Older docs (webhook-created students, Stripe transactions) hold Firestore Timestamps where the app expects ISO strings. */
const plain = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate: () => Date }).toDate().toISOString() : v]));

async function load(): Promise<Snapshot> {
  const db = getAdminDb();
  const raw = Object.fromEntries(
    await Promise.all(COLLECTIONS.map(async (c) => [c, (await db.collection(c).get()).docs.map((x) => ({ ...plain(x.data()), id: x.id }))]))
  ) as Raw;
  const meta = (raw.hub_state.find((x) => x.id === "meta") ?? {}) as Partial<HubState>;
  const st = {
    areas: raw.hub_areas, tasks: raw.hub_tasks, projects: raw.hub_projects, goals: raw.hub_goals, notes: raw.hub_notes,
    collections: raw.hub_collections, items: raw.hub_items, expenses: raw.hub_expenses, time: [], lessons: [],
    templates: [], studentMeta: {}, groupMeta: {}, adSpend: {}, reviews: [], monthly: [],
    ...meta,
  } as unknown as HubState;
  const lv = {
    mode: "live", ready: true, error: null, plans: [],
    students: raw.students, transactions: raw.transactions, recurring: raw.recurringTransactions, groups: raw.groups,
    curriculum: raw.curriculum, folders: raw.resourceFolders, files: raw.resourceFiles,
  } as unknown as LiveData;
  const areas = live(st.areas).sort((a, b) => a.sort - b.sort);
  return {
    st,
    live: lv,
    areas,
    projects: new Map(st.projects.map((p) => [p.id, p])),
    areaName: (id) => st.areas.find((a) => a.id === id)?.name ?? id,
    areaDir: new Map(areas.map((a) => [a.id, slug(a.name)])),
    social: raw.hub_social_posts as unknown as SocialPost[],
  };
}

// ---------------------------------------------------------------- areas

function exportAreas(s: Snapshot) {
  const { st } = s;
  for (const area of s.areas) {
    const base = `areas/${s.areaDir.get(area.id)}`;
    const inArea = <T extends { areaId: string; archivedAt?: string | null }>(xs: T[]) => live(xs).filter((x) => x.areaId === area.id);
    const tasks = inArea(st.tasks);
    const projects = inArea(st.projects);
    const goals = inArea(st.goals);
    const notes = inArea(st.notes);
    const collections = inArea(st.collections);
    const goalName = namer(), projName = namer(), noteName = namer(), colName = namer();
    const projFile = new Map(projects.map((p) => [p.id, projName(p.title, p.id)]));

    const goalRows: string[] = [];
    for (const g of goals) {
      const p = goalProgress(g, st, s.live);
      const f = goalName(g.title, g.id);
      const progress = `${p.value} / ${p.target} ${g.unit} (${Math.round(p.pct * 100)}%)`;
      goalRows.push(`- [${g.title}](goals/${f}.md) — ${g.horizon} · ${progress}${g.deadline ? ` · by ${d(g.deadline)}` : ""}${g.pinned ? " · pinned" : ""}`);
      write(
        `${base}/goals/${f}.md`,
        fm({ type: "goal", id: g.id, area: area.name, horizon: g.horizon, metric: g.metric, pinned: g.pinned, deadline: g.deadline, updated: g.updatedAt }) +
          [
            `# ${g.title}`,
            g.description,
            `**Progress:** ${progress}${p.defeated ? " — reached" : ""}`,
            p.pace && `**Pace needed:** ${p.pace}`,
            g.deadline && `**Deadline:** ${d(g.deadline)}`,
            g.projectId && `**Project:** [${s.projects.get(g.projectId)?.title}](../projects/${projFile.get(g.projectId)}.md)`,
            g.horizon === "someday" && [g.timeframe && `**Timeframe:** ${g.timeframe}`, g.budget != null && `**Budget:** ${money(g.budget)}`, g.planStatus && `**Plan status:** ${g.planStatus}`].filter(Boolean).join("\n"),
            g.log.length && `## Log\n${table(["Date", "Value"], [...g.log].sort((a, b) => (a.date < b.date ? -1 : 1)).map((l) => [d(l.date), l.value]))}`,
            url(g.cover) && `![cover](${g.cover})`,
          ].filter(Boolean).join("\n\n")
      );
    }

    const projRows: string[] = [];
    for (const p of projects) {
      const f = projFile.get(p.id)!;
      const pt = tasks.filter((t) => t.projectId === p.id);
      const open = pt.filter(isOpen), done = pt.filter((t) => t.status === "done");
      const pr = projectProgress(p.id, st.tasks);
      projRows.push(`- [${p.title}](projects/${f}.md) — ${p.status} · ${open.length} open / ${done.length} done${p.target ? ` · target ${d(p.target)}` : ""}`);
      write(
        `${base}/projects/${f}.md`,
        fm({ type: "project", id: p.id, area: area.name, status: p.status, start: p.start, target: p.target, open: open.length, done: done.length, updated: p.updatedAt }) +
          [
            `# ${p.title}`,
            p.outcome && `**Outcome:** ${p.outcome}`,
            p.description,
            `**Status:** ${p.status} · ${Math.round(pr.pct * 100)}% done · ${d(p.start)} → ${d(p.target)}`,
            p.milestones.length && `## Milestones\n${p.milestones.map((m) => `- [${m.done ? "x" : " "}] ${m.title}${m.date ? ` — ${d(m.date)}` : ""}`).join("\n")}`,
            `## Open tasks\n${open.map((t) => taskLine(t, s)).join("\n") || "_None._"}`,
            done.length && `## Done\n${done.sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1)).map((t) => taskLine(t, s)).join("\n")}`,
            url(p.cover) && `![cover](${p.cover})`,
          ].filter(Boolean).join("\n\n")
      );
    }

    const loose = tasks.filter((t) => !t.projectId);
    const recentDone = loose.filter((t) => t.status === "done" && day(t.completedAt) >= addDays(today(), -30));
    const byStatus = ["doing", "next", "waiting", "inbox"].map((k) => [k, loose.filter((t) => isOpen(t) && t.status === k)] as const).filter(([, xs]) => xs.length);
    write(
      `${base}/tasks.md`,
      fm({ type: "tasks", area: area.name, open: loose.filter(isOpen).length }) +
        [
          `# ${area.name} — tasks outside projects`,
          ...byStatus.map(([k, xs]) => `## ${k}\n${xs.map((t) => taskLine(t, s)).join("\n")}`),
          recentDone.length && `## Done in the last 30 days\n${recentDone.map((t) => taskLine(t, s)).join("\n")}`,
        ].filter(Boolean).join("\n\n")
    );

    const noteRows: string[] = [];
    for (const n of notes) {
      const f = noteName(n.title, n.id);
      noteRows.push(`- [${n.title}](notes/${f}.md) — ${n.type}${n.pinned ? " · pinned" : ""}${n.tags?.length ? ` · ${n.tags.join(", ")}` : ""}`);
      write(
        `${base}/notes/${f}.md`,
        fm({ type: "note", kind: n.type, id: n.id, area: area.name, tags: n.tags, project: n.projectId && s.projects.get(n.projectId)?.title, link: n.link, created: n.createdAt, updated: n.updatedAt }) +
          `# ${n.title}\n\n${n.body}`
      );
    }

    const colRows: string[] = [];
    for (const c of collections) {
      const f = colName(c.name, c.id);
      const items = live(st.items).filter((i) => i.collectionId === c.id);
      colRows.push(`- [${c.name}](collections/${f}.md) — ${items.length} items`);
      write(`${base}/collections/${f}.md`, renderCollection(c, items, area.name));
    }

    const open = tasks.filter(isOpen);
    write(
      `${base}/_overview.md`,
      fm({ type: "area", id: area.id, area: area.name, open_tasks: open.length, active_projects: projects.filter((p) => p.status === "active").length }) +
        [
          `# ${area.name}`,
          `Open tasks: ${open.length} (${open.filter((t) => t.status === "doing").length} doing, ${open.filter((t) => t.status === "waiting").length} waiting, ${open.filter((t) => t.due && t.due < today()).length} overdue). Loose ones are in [tasks.md](tasks.md).`,
          `## Goals\n${goalRows.join("\n") || "_None._"}`,
          `## Projects\n${projRows.join("\n") || "_None._"}`,
          `## Notes\n${noteRows.join("\n") || "_None._"}`,
          `## Collections\n${colRows.join("\n") || "_None._"}`,
        ].join("\n\n")
    );
  }
}

function renderCollection(c: Collection, items: Item[], areaName: string): string {
  const fields = c.fields.filter((f) => f.type !== "image");
  const rows = items.map((i) => [
    i.title,
    ...fields.map((f) => (f.type === "date" ? d(i.values[f.key] as string) : i.values[f.key])),
    i.tags,
    i.link ?? "",
    i.doneAt ? d(i.doneAt) : "",
  ]);
  const described = items.filter((i) => i.description?.trim());
  return (
    fm({ type: "collection", id: c.id, area: areaName, items: items.length, updated: c.updatedAt }) +
    [
      `# ${c.name}`,
      c.description,
      c.fields.length && `Fields (keys for brain:do \`values\`): ${c.fields.map((f) => `\`${f.key}\` ${f.label} (${f.type}${f.options?.length ? `: ${f.options.join(" / ")}` : ""})`).join(", ")}`,
      table(["Title", ...fields.map((f) => f.label), "Tags", "Link", "Done"], rows),
      described.length && `## Item notes\n${described.map((i) => `### ${i.title}\n${i.description}`).join("\n\n")}`,
    ].filter(Boolean).join("\n\n")
  );
}

// ---------------------------------------------------------------- business

function exportBusiness(s: Snapshot) {
  const { st, live: lv } = s;
  const studentName = namer(), groupName = namer();
  const groupOf = (stu: Student) => lv.groups.find((g) => g.name.trim().toLowerCase() === (stu.classGroup ?? "").trim().toLowerCase());
  const studentFile = new Map(lv.students.map((x) => [x.id, studentName(x.name, x.id)]));
  const groupFile = new Map(lv.groups.map((g) => [g.id, groupName(g.name, g.id)]));
  const nameOf = (id?: string | null) => (id ? lv.students.find((x) => x.id === id)?.name ?? "" : "");

  const roster: unknown[][] = [];
  for (const stu of [...lv.students].sort((a, b) => a.name.localeCompare(b.name))) {
    const meta = st.studentMeta[stu.id];
    const g = groupOf(stu);
    const pay = PAYMENT_STATUS_LABEL[studentPaymentStatus(stu.nextPayment, today())];
    const life = lifecycle(stu, meta);
    const tx = lv.transactions.filter((t) => t.studentId === stu.id).sort((a, b) => (a.date < b.date ? 1 : -1));
    const paid = tx.filter((t) => t.amount > 0);
    const tasks = live(st.tasks).filter((t) => t.studentId === stu.id);
    const notes = live(st.notes).filter((n) => n.studentId === stu.id);
    const f = studentFile.get(stu.id)!;
    roster.push([`[${stu.name}](students/${f}.md)`, life, stu.status, g?.name ?? stu.classGroup ?? "", meta?.level ?? "", money(price(stu)), pay, d(stu.nextPayment), paid[0] ? d(paid[0].date) : ""]);
    write(
      `business/students/${f}.md`,
      fm({ type: "student", id: stu.id, lifecycle: life, status: stu.status, group: g?.name ?? stu.classGroup, level: meta?.level, plan: stu.plan, payment: pay, next_payment: stu.nextPayment, tags: stu.tags, source: stu.source, updated: stu.updatedAt }) +
        [
          `# ${stu.name}`,
          table(["Field", "Value"], [
            ["Lifecycle", life],
            ["Group", g ? `${g.name} (level ${g.currentLevel}: ${g.currentTopic})` : stu.classGroup],
            ["Schedule", stu.schedule],
            ["Plan", stu.plan],
            ["Monthly fee", money(price(stu))],
            ["Payment status", `${pay} — next due ${d(stu.nextPayment)}`],
            ["Started", d(meta?.startDate ?? stu.createdAt)],
            ["Level", meta?.level],
            ["Parent email", stu.parentEmail],
            ["Contact", stu.contact],
            ["Total paid", money(paid.reduce((a, t) => a + t.amount, 0))],
            meta?.churnedAt ? ["Churned", d(meta.churnedAt)] : null,
            meta?.returningOffer ? ["Returning offer", meta.returningOffer] : null,
          ].filter((r) => r && r[1] != null && r[1] !== "") as unknown[][]),
          stu.notes?.trim() && `## Things to remember\n${stu.notes.trim()}`,
          `## Payments\n${table(["Date", "Description", "Amount", "Source"], tx.map((t) => [d(t.date), t.description, money(t.amount), t.source ?? "manual"]))}`,
          tasks.length && `## Tasks\n${tasks.map((t) => taskLine(t, s, true)).join("\n")}`,
          notes.length && `## Notes\n${notes.map((n) => `### ${n.title} (${d(n.updatedAt)})\n${n.body}`).join("\n\n")}`,
        ].filter(Boolean).join("\n\n")
    );
  }
  const owed = receivables(lv, st);
  write(
    "business/students.md",
    fm({ type: "roster", students: lv.students.length, paying: lv.students.filter((x) => lifecycle(x, st.studentMeta[x.id]) === "active").length, mrr: mrr(lv, st) }) +
      [
        "# Students",
        `MRR: **${money(mrr(lv, st))}** from ${lv.students.filter((x) => lifecycle(x, st.studentMeta[x.id]) === "active").length} paying students.`,
        owed.length && `## Owed now\n${owed.map((r) => `- ${r.student.name} — ${PAYMENT_STATUS_LABEL[r.status]}, ${money(r.amount)}, due ${d(r.student.nextPayment)}`).join("\n")}`,
        table(["Student", "Lifecycle", "Status", "Group", "Level", "Fee", "Payment", "Next due", "Last paid"], roster),
      ].filter(Boolean).join("\n\n")
  );

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (const g of lv.groups) {
    const gm = st.groupMeta[g.id];
    const ms = members(g, lv.students);
    write(
      `business/groups/${groupFile.get(g.id)}.md`,
      fm({ type: "group", id: g.id, level: g.currentLevel, topic: g.currentTopic, members: ms.length, capacity: gm?.capacity }) +
        [
          `# ${g.name}`,
          `**Curriculum:** level ${g.currentLevel} — ${g.currentTopic}`,
          `**Schedule:** ${(gm?.slots ?? []).map((x) => `${dayNames[x.day]} ${x.start} (${x.minutes} min)`).join(", ") || "not set"}`,
          `**Seats:** ${ms.length} / ${gm?.capacity ?? 4}`,
          `## Members\n${ms.map((m) => `- [${m.name}](../students/${studentFile.get(m.id)}.md)`).join("\n") || "_None._"}`,
        ].join("\n\n")
    );
  }

  const months = new Map<string, { tx: FinanceEntry[]; ex: LocalExpense[] }>();
  const bucket = (m: string) => months.get(m) ?? months.set(m, { tx: [], ex: [] }).get(m)!;
  lv.transactions.forEach((t) => bucket(t.date.slice(0, 7)).tx.push(t));
  live(st.expenses).forEach((e) => bucket(e.date.slice(0, 7)).ex.push(e));
  for (const [m, { tx, ex }] of months) {
    const inc = tx.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
    const out = tx.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0);
    const exBy = (scope: string) => ex.filter((e) => e.scope === scope).reduce((a, e) => a + e.amount, 0);
    write(
      `business/payments/${m}.md`,
      fm({ type: "payments", month: m, income: inc, expenses: -out, net: inc + out }) +
        [
          `# Payments ${m.slice(5)}-${m.slice(0, 4)}`,
          `Business ledger: income **${money(inc)}**, expenses **${money(-out)}**, net **${money(inc + out)}**.`,
          `## Ledger\n${table(["Date", "Description", "Category", "Amount", "Student", "Source"], [...tx].sort((a, b) => (a.date < b.date ? -1 : 1)).map((t) => [d(t.date), t.description, t.category, money(t.amount), nameOf(t.studentId), t.source ?? "manual"]))}`,
          ex.length && `## Expenses logged in the hub\nBusiness ${money(exBy("business"))} · personal ${money(exBy("personal"))}\n\n${table(["Date", "Description", "Category", "Amount", "Scope", "Recurring"], ex.map((e) => [d(e.date), e.description, e.category, money(e.amount), e.scope, e.recurring ? "yes" : ""]))}`,
        ].filter(Boolean).join("\n\n")
    );
  }

  write(
    "business/recurring.md",
    fm({ type: "recurring" }) +
      `# Recurring payments\n\n${table(["Description", "Type", "Amount", "Every (months)", "Next", "Last", "Active"], (lv.recurring as RecurringTransaction[]).map((r) => [r.description, r.type, money(r.amount), r.frequencyMonths, d(r.nextPayment), d(r.lastPayment), r.active ? "yes" : "no"]))}`
  );

  const levels = [...(lv.curriculum as CurriculumLevelDoc[])].sort((a, b) => a.levelNumber - b.levelNumber);
  write(
    "business/curriculum.md",
    fm({ type: "curriculum", levels: levels.length }) +
      `# Curriculum\n\n${levels.map((l) => {
        const here = lv.groups.filter((g) => g.currentLevel === l.levelNumber).map((g) => `${g.name} (on "${g.currentTopic}")`);
        return `## ${l.levelNumber}. ${l.title} — ${l.stageName}\n${l.subtopics.map((t) => `- ${t}`).join("\n")}${here.length ? `\n\nGroups here: ${here.join(", ")}` : ""}`;
      }).join("\n\n")}`
  );

  const folders = lv.folders as ResourceFolder[];
  const folderPath = (id: string | null): string => {
    const f = folders.find((x) => x.id === id);
    return f ? `${f.parentId ? folderPath(f.parentId) + " / " : ""}${f.name}` : "(no folder)";
  };
  const byFolder = new Map<string, ResourceFile[]>();
  (lv.files as ResourceFile[]).forEach((f) => (byFolder.get(folderPath(f.folderId)) ?? byFolder.set(folderPath(f.folderId), []).get(folderPath(f.folderId))!).push(f));
  write(
    "business/resources.md",
    fm({ type: "resources", files: lv.files.length }) +
      `# Resources (Firebase Storage)\n\nFiles are not downloaded; \`storagePath\` is the object path in the Storage bucket.\n\n${[...byFolder].sort(([a], [b]) => a.localeCompare(b)).map(([f, xs]) => `## ${f}\n${table(["Title", "Description", "Tags", "Type", "storagePath"], xs.map((x) => [x.title, x.description, x.tags, x.mimeType, x.storagePath]))}`).join("\n\n")}`
  );

  const posts = [...s.social].sort((a, b) => ((a.scheduledAt ?? a.updatedAt ?? "") < (b.scheduledAt ?? b.updatedAt ?? "") ? 1 : -1));
  write(
    "business/social.md",
    fm({ type: "social", posts: posts.length }) +
      `# Social posts (Facebook + Instagram)\n\n${table(["When", "Status", "Platforms", "Kind", "Caption"], posts.map((p) => [d(p.scheduledAt), p.status, p.platforms, p.kind, (p.caption ?? "").slice(0, 200)]))}`
  );
}

// ---------------------------------------------------------------- NOW + activity

function exportNow(s: Snapshot) {
  const { st, live: lv } = s;
  const t = today(), week = addDays(t, 7);
  const open = st.tasks.filter(isOpen).sort((a, b) => a.priority - b.priority);
  const section = (title: string, xs: Task[]) => `## ${title}\n${xs.map((x) => taskLine(x, s, true)).join("\n") || "_None._"}`;
  const pinned = live(st.goals).filter((g) => g.pinned);
  const owed = receivables(lv, st);
  const recurring = (lv.recurring as RecurringTransaction[]).filter((r) => r.active && r.nextPayment <= week);
  const posts = s.social.filter((p) => p.scheduledAt && day(p.scheduledAt) >= t && day(p.scheduledAt) <= week && p.status !== "published");
  write(
    "NOW.md",
    fm({ type: "now", today: t, generated: new Date().toISOString() }) +
      [
        `# Now — ${d(t)}`,
        `Exported ${new Date().toLocaleString("en-GB")}. MRR ${money(mrr(lv, st))}.`,
        section("Overdue", open.filter((x) => x.due && x.due < t)),
        section("Today (planned or due)", open.filter((x) => x.scheduled === t || x.due === t)),
        section("Doing", open.filter((x) => x.status === "doing")),
        section("Due in the next 7 days", open.filter((x) => x.due && x.due > t && x.due <= week)),
        section("Waiting on someone", open.filter((x) => x.status === "waiting")),
        `## Pinned goals\n${pinned.map((g) => { const p = goalProgress(g, st, lv); return `- ${g.title} (${s.areaName(g.areaId)}) — ${p.value} / ${p.target} ${g.unit}${p.pace ? ` · ${p.pace}` : ""}`; }).join("\n") || "_None._"}`,
        `## Students owing\n${owed.map((r) => `- ${r.student.name} — ${PAYMENT_STATUS_LABEL[r.status]}, ${money(r.amount)}, due ${d(r.student.nextPayment)}`).join("\n") || "_None._"}`,
        `## Recurring payments due this week\n${recurring.map((r) => `- ${r.description} — ${r.type}, ${money(r.amount)} on ${d(r.nextPayment)}`).join("\n") || "_None._"}`,
        `## Social posts coming up\n${posts.map((p) => `- ${d(p.scheduledAt)} ${p.platforms.join("+")} — ${(p.caption ?? "").slice(0, 80)}`).join("\n") || "_None._"}`,
        `## Inbox\n${open.filter((x) => x.status === "inbox").length} unprocessed tasks.`,
      ].join("\n\n")
  );
}

function exportActivity(s: Snapshot) {
  const { st, live: lv } = s;
  const from = addDays(today(), -ACTIVITY_DAYS);
  const days = new Map<string, string[]>();
  const add = (iso: string | null | undefined, line: string) => {
    const k = day(iso);
    if (k >= from) (days.get(k) ?? days.set(k, []).get(k)!).push(line);
  };
  const track = (kind: string, xs: { createdAt: string; updatedAt: string; archivedAt?: string | null }[], label: (x: never) => string) => {
    for (const x of xs) {
      const name = `${kind} "${label(x as never)}"`;
      add(x.createdAt, `Created ${name}`);
      if (day(x.updatedAt) !== day(x.createdAt)) add(x.updatedAt, `Edited ${name}`);
      if (x.archivedAt) add(x.archivedAt, `Archived ${name}`);
    }
  };
  for (const t of st.tasks) {
    const where = `${s.areaName(t.areaId)}${t.projectId ? ` / ${s.projects.get(t.projectId)?.title}` : ""}`;
    add(t.createdAt, `Created task "${t.title}" (${where})`);
    if (t.completedAt) add(t.completedAt, `Completed task "${t.title}" (${where})`);
    else if (day(t.updatedAt) !== day(t.createdAt)) add(t.updatedAt, `Updated task "${t.title}" → ${t.status} (${where})`);
  }
  track("project", st.projects, (p: Project) => p.title);
  track("goal", st.goals, (g: Goal) => g.title);
  track("note", st.notes, (n: Note) => n.title);
  track("collection", st.collections, (c: Collection) => c.name);
  track("item", st.items, (i: Item) => `${i.title}" in "${st.collections.find((c) => c.id === i.collectionId)?.name ?? "?"}`);
  for (const g of st.goals) for (const l of g.log) add(l.date, `Goal "${g.title}" logged ${l.value} ${g.unit}`);
  for (const t of lv.transactions as FinanceEntry[]) add(t.date, `${t.amount >= 0 ? "Income" : "Expense"} ${money(t.amount)} — ${t.description}${t.studentId ? ` (${lv.students.find((x) => x.id === t.studentId)?.name ?? "student"})` : ""}`);
  for (const e of st.expenses) add(e.date, `Hub expense ${money(-e.amount)} — ${e.description} (${e.scope})`);
  for (const x of lv.students as Student[]) add(x.createdAt, `New student "${x.name}"${x.source ? ` via ${x.source}` : ""}`);
  for (const p of s.social) if (p.status === "published") add(p.scheduledAt, `Published ${p.platforms.join("+")} post: ${(p.caption ?? "").slice(0, 60)}`);

  for (const [k, lines] of days) {
    write(
      `journal/activity/${k}.md`,
      fm({ type: "activity", date: k, events: lines.length }) +
        `# Activity ${d(k)}\n\nGenerated from record timestamps. "Edited" only shows a record's latest edit, so earlier edits of the same record are missing; the daily log in journal/daily/ keeps the full story.\n\n${lines.map((l) => `- ${l}`).join("\n")}`
    );
  }
}

// ---------------------------------------------------------------- router

function exportRouter(s: Snapshot) {
  const areaList = s.areas.map((a) => `- \`areas/${s.areaDir.get(a.id)}/\` — ${a.name}`).join("\n");
  write(
    "CLAUDE.md",
    `# Jordi's Brain — read this first

This folder mirrors Jordi's dashboard (LET Junior, an online English academy for kids, plus Jordi's personal life). It's generated from Firestore by \`npm run brain\` in the dashboard repo (\`${process.cwd()}\`).

**Rules**
- Don't read everything. Use the routing table and open only the files a question needs. Grep the YAML front-matter (\`status:\`, \`area:\`, \`type:\`, \`lifecycle:\`) to filter without opening files.
- Generated files (\`areas/\`, \`business/\`, \`journal/activity/\`, \`NOW.md\`, this file) are overwritten on every export. Never edit them: to change data (tasks, notes, collection items, goal values, student notes) use \`brain:do\`, described below. Write files only where the "Writable" list allows.
- Before answering anything time-sensitive, run \`npm run brain\` in the repo folder above so the mirror is fresh.
- Dates shown to Jordi are DD-MM-YYYY. File names and front-matter use YYYY-MM-DD. "Today" rolls over at Jordi's night-owl hour, not at midnight.
- \`PROFILE.md\` says who Jordi is and what Jordi is optimising for. Read it before giving advice.

## Where things are
- \`NOW.md\` — today: overdue, planned, doing, due this week, waiting, pinned goals, students owing, upcoming payments and posts. **Start here for "what should I do".**
- \`areas/<area>/_overview.md\` — the area's goals, projects, notes and collections, with links. Areas:
${areaList}
- \`areas/<area>/goals/\`, \`projects/\` (each project lists its tasks), \`tasks.md\` (tasks outside projects), \`notes/\`, \`collections/\` (lists like wishlist, books, places)
- \`business/students.md\` — roster, MRR, who owes. \`business/students/<name>.md\` — one student: group, level, payments, notes, tasks
- \`business/groups/<name>.md\` — schedule, seats, members, curriculum position. \`business/curriculum.md\` — the 20 levels
- \`business/payments/<YYYY-MM>.md\` — that month's ledger and totals. \`business/recurring.md\` — subscriptions and bills
- \`business/resources.md\` — teaching files in Storage. \`business/social.md\` — FB/IG posts
- \`journal/activity/<YYYY-MM-DD>.md\` — what changed that day (generated from timestamps, last ${ACTIVITY_DAYS} days)
- \`journal/daily/\`, \`journal/briefs/\`, \`journal/weekly/\`, \`journal/monthly/\` — written by Claude's scheduled tasks
- \`inbox/\` — files and images Jordi drops in for context

## Question → files
| Question | Open |
|---|---|
| What should I do today / tomorrow? | NOW.md, then the latest journal/briefs |
| What did I do yesterday / on a date? | journal/daily/<date>.md; if missing, journal/activity/<date>.md |
| How is my week / month going? | journal/weekly, journal/monthly, then journal/activity for the range |
| How is goal X going? | grep \`type: "goal"\` under areas/, open the match |
| What's left on project X? | areas/<area>/projects/<x>.md |
| How is student X doing / did they pay? | business/students/<x>.md |
| Who owes money? MRR? | business/students.md ("Owed now") |
| Revenue or expenses in a month | business/payments/<YYYY-MM>.md |
| Which group is on what topic / free seats | business/groups/, business/curriculum.md |
| Relationship, personal, hobbies, studies, home | that area's _overview.md |

## Writable
- \`journal/daily|briefs|weekly|monthly/\` — scheduled-task output only, one file per period, never overwrite another day's file
- \`inbox/\` — only Jordi adds files here

## Changing dashboard data (brain:do)
When Jordi asks you to create, update or complete something, write it to the dashboard's database with \`brain:do\`. The change appears in the dashboard immediately and in these files a few seconds later. Never edit the generated Markdown for this; it would be overwritten.

- **When to ask first:** if Jordi asked for the exact change ("add a task to call Jeanpaul tomorrow"), apply it. If you're proposing changes yourself, or the request is vague, run with \`--dry\` first, show Jordi the planned lines, and apply only after a yes. Scheduled tasks never use brain:do.
- **How:** from the Brain folder, pipe JSON into the command in the dashboard repo. One op or an array; a batch applies fully or not at all:
\`\`\`bash
cd "${REPO}" && npm run brain:do --silent -- --dry <<'EOF'
[
  { "op": "task.add", "title": "Chase Jeanpaul for October tuition", "area": "LET Junior", "due": "2026-10-25", "priority": 1 },
  { "op": "student.note", "student": "Jeanpaul", "text": "Reminded about October payment on WhatsApp" }
]
EOF
\`\`\`
  Drop \`--dry\` to apply. Each line of output says what changed; on any error nothing is written, and the error says why (e.g. an ambiguous name, with the candidates and their ids).
- **References:** \`area\`, \`project\`, \`task\`, \`note\`, \`collection\`, \`item\`, \`goal\` and \`student\` take an id (from a file's front-matter), an exact name, or a fragment matching exactly one record. Dates are \`YYYY-MM-DD\`; "today" is the \`today\` in NOW.md.

| op | Required | Optional |
|---|---|---|
| \`task.add\` | \`title\` | \`area\` (default LET Junior, or the project's area), \`project\`, \`status\` (inbox/next/doing/waiting/dropped), \`priority\` (1 high … 3 low, default 2), \`due\`, \`scheduled\` (the day it's planned for), \`estimate\` (minutes), \`notes\`, \`checklist\` (list of strings), \`waitingOn\` |
| \`task.update\` | \`task\` | any task.add field (\`null\` clears \`due\`/\`scheduled\`/\`project\`), \`appendNotes\` (adds to existing notes). Don't set status done here |
| \`task.done\` | \`task\` | — (a recurring task gets its next occurrence, as in the app) |
| \`note.add\` | \`title\`, \`body\` (Markdown) | \`area\`, \`project\`, \`type\` (doc/plan/meeting/reference), \`tags\`, \`pinned\`, \`link\` |
| \`note.append\` | \`note\`, \`text\` | — |
| \`item.add\` | \`collection\`, \`title\` | \`values\` (keyed by the collection's field keys; see its table columns), \`tags\`, \`link\`, \`description\` |
| \`item.update\` | \`item\` | \`collection\` (to narrow the search), \`title\`, \`values\` (merged), \`tags\`, \`link\`, \`description\` |
| \`goal.log\` | \`goal\`, \`value\` | \`date\` (default today; replaces that day's value). Manual goals only; MRR/students/revenue/tasks goals update themselves |
| \`student.note\` | \`student\`, \`text\` | — (adds a dated line to the student's "Things to remember") |

Not possible here: deleting anything, payments and money, student status, due dates or groups, projects and goals themselves, and XP. Tell Jordi to do those in the dashboard.

## Scheduled task prompts
Each one runs with this folder as the working folder. The dashboard's Brain page reads this same list.

${TASKS.map((t) => `**${t.name} (${t.when}):**\n> ${t.prompt}`).join("\n\n")}
`
  );
}

const PROFILE = `# Profile — written by Jordi, never overwritten by the export

Fill this in. Claude reads it before giving any advice.

## Who I am
-

## What I'm optimising for right now
- Business:
- Personal:
- Relationship:

## How I like answers
-

## Things Claude should always keep in mind
-
`;

// ---------------------------------------------------------------- run

async function exportOnce() {
  const started = Date.now();
  ({ goalProgress, lifecycle, members, mrr, price, projectProgress, receivables } = await import("../lib/hub/metrics"));
  const s = await load();
  for (const rel of OWNED) fs.rmSync(path.join(DIR, rel), { recursive: true, force: true });
  for (const sub of ["journal/daily", "journal/briefs", "journal/weekly", "journal/monthly", "inbox"]) fs.mkdirSync(path.join(DIR, sub), { recursive: true });
  if (!fs.existsSync(path.join(DIR, "PROFILE.md"))) write("PROFILE.md", PROFILE);
  exportAreas(s);
  exportBusiness(s);
  exportNow(s);
  exportActivity(s);
  exportRouter(s);
  const synced = await publish(Date.now() - started);
  console.log(`[brain] exported to ${DIR} in ${Date.now() - started} ms (${synced} files changed in the dashboard copy)`);
}

// ---------------------------------------------------------------- dashboard copy

/**
 * The dashboard runs on Vercel and can't see this PC, so the Brain page reads a copy in Firestore:
 * `hub_brain_files/{path with / → ~}` holds each file, `hub_brain/status` the run summary and the
 * scheduled tasks' last runs. Only files whose content changed are written, so an export after one
 * edit costs a handful of writes, not one per file.
 */
let remote: Map<string, string> | null = null;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith(".")).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

async function publish(ms: number): Promise<number> {
  const db = getAdminDb();
  if (!remote) remote = new Map((await db.collection("hub_brain_files").select("hash").get()).docs.map((x) => [x.id, x.get("hash") as string]));
  const files = walk(DIR).map((abs) => {
    const rel = path.relative(DIR, abs).split(path.sep).join("/");
    const stat = fs.statSync(abs);
    // Inbox images and PDFs are listed, not copied: Firestore docs cap at 1 MB.
    const content = /\.md$/i.test(rel) && stat.size < 900_000 ? fs.readFileSync(abs, "utf8") : null;
    const hash = createHash("sha1").update(content ?? `${stat.size}:${stat.mtimeMs}`).digest("hex");
    return { id: rel.replace(/\//g, "~"), path: rel, content, bytes: stat.size, modified: stat.mtime.toISOString(), hash };
  });
  const ops: [string, object | null][] = files.filter((f) => remote!.get(f.id) !== f.hash).map((f) => [f.id, f]);
  const keep = new Set(files.map((f) => f.id));
  for (const id of remote.keys()) if (!keep.has(id)) ops.push([id, null]);
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    for (const [id, data] of ops.slice(i, i + 400)) data ? b.set(db.collection("hub_brain_files").doc(id), data) : b.delete(db.collection("hub_brain_files").doc(id));
    await b.commit();
  }
  remote = new Map(files.map((f) => [f.id, f.hash]));

  const tasks = TASKS.map((t) => {
    const last = files.filter((f) => f.path.startsWith(`${t.folder}/`)).sort((a, b) => (a.modified < b.modified ? 1 : -1))[0];
    return { ...t, lastRun: last?.modified ?? null, lastFile: last?.path ?? null };
  });
  await db.doc("hub_brain/status").set({ exportedAt: new Date().toISOString(), ms, dir: DIR, files: files.length, bytes: files.reduce((a, f) => a + f.bytes, 0), tasks });
  return ops.length;
}

/** One watcher at a time: two would each react to the other's file writes and re-export forever. */
export function watcherRunning(): boolean {
  try {
    process.kill(Number(fs.readFileSync(path.join(DIR, ".watch.pid"), "utf8")), 0); // throws if that process is gone
    return true;
  } catch {
    return false;
  }
}

async function watch() {
  if (!watcherRunning()) {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, ".watch.pid"), String(process.pid));
  } else return console.log(`[brain] another watcher is already running (see ${DIR}\\.watch.pid) — exiting`), process.exit(0);
  const db = getAdminDb();
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> = Promise.resolve();
  // The export rewrites journal/activity itself; folder events until shortly after it finishes are its own echo.
  let quietUntil = 0;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      running = running
        .then(() => ((quietUntil = Infinity), exportOnce()))
        .catch((e) => console.error("[brain] export failed", e))
        .finally(() => (quietUntil = Date.now() + 1500));
    }, 3000);
  };
  // Each listener fires once on attach, so the first export happens right away.
  for (const c of COLLECTIONS) db.collection(c).onSnapshot(schedule, (e) => console.error(`[brain] ${c}`, e));
  // Files Claude or Jordi add (journal entries, inbox drops).
  for (const sub of ["journal", "inbox"]) {
    fs.mkdirSync(path.join(DIR, sub), { recursive: true });
    fs.watch(path.join(DIR, sub), { recursive: true }, (_, f) => Date.now() > quietUntil && !/^activity/.test(String(f ?? "")) && schedule());
  }
  console.log(`[brain] watching ${COLLECTIONS.length} collections + journal/ and inbox/ → ${DIR}`);
}

export { exportOnce };

// Run only when started directly; scripts/brainDo.ts imports exportOnce to refresh after its writes.
if (/exportBrain\.ts$/.test(process.argv[1] ?? ""))
  (process.argv.includes("--watch") ? watch() : exportOnce().then(() => process.exit(0))).catch((err) => {
    console.error(err);
    process.exit(1);
  });
