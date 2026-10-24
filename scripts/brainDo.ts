/**
 * brain:do — lets Claude change dashboard data from a Brain session. The Brain's Markdown is
 * regenerated from Firestore, so edits must land in Firestore; this writes them the same way the
 * dashboard's own actions do (lib/hub/actions.ts), then refreshes the Brain.
 *
 *   npm run brain:do -- --dry <<'EOF'          preview, writes nothing
 *   [{ "op": "task.add", "title": "Call Jeanpaul about payment", "area": "LET Junior", "due": "2026-10-25" }]
 *   EOF
 *
 * Input: one op or an array, as JSON on stdin, `--file ops.json`, or the first argument. Every op is
 * validated and every reference resolved before anything is written, then all writes go in one
 * batch — so a batch either fully applies or not at all. References (task, project, note, goal,
 * collection, item, student, area) take an id, an exact name, or a name fragment that matches one
 * record only. Ops and fields are documented in the CLAUDE.md the export writes.
 *
 * Not replicated from the app: XP, achievements and toasts — those happen only when Jordi acts in the dashboard.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import fs from "node:fs";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { getAdminDb } from "../lib/firebase/admin";
import { makeTask } from "../lib/hub/seed";
import { formatDateDMY, nowIso, today, uid } from "../lib/hub/util";
import type { Area, Collection, Goal, Item, Note, Project, Task } from "../lib/hub/types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const status = z.enum(["inbox", "next", "doing", "waiting", "done", "dropped"]);
const priority = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const Op = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("task.add"), title: z.string().min(1), area: z.string().optional(), project: z.string().optional(),
    status: status.optional(), priority: priority.optional(), due: date.nullish(), scheduled: date.nullish(),
    estimate: z.number().int().positive().nullish(), notes: z.string().optional(), checklist: z.array(z.string()).optional(), waitingOn: z.string().optional(),
  }),
  z.strictObject({
    op: z.literal("task.update"), task: z.string(), title: z.string().min(1).optional(), area: z.string().optional(), project: z.string().nullish(),
    status: status.optional(), priority: priority.optional(), due: date.nullish(), scheduled: date.nullish(),
    estimate: z.number().int().positive().nullish(), notes: z.string().optional(), appendNotes: z.string().optional(), waitingOn: z.string().optional(),
  }),
  z.strictObject({ op: z.literal("task.done"), task: z.string() }),
  z.strictObject({
    op: z.literal("note.add"), title: z.string().min(1), body: z.string(), area: z.string().optional(), project: z.string().optional(),
    type: z.enum(["doc", "plan", "meeting", "reference"]).optional(), tags: z.array(z.string()).optional(), pinned: z.boolean().optional(), link: z.string().optional(),
  }),
  z.strictObject({ op: z.literal("note.append"), note: z.string(), text: z.string().min(1) }),
  z.strictObject({
    op: z.literal("item.add"), collection: z.string(), title: z.string().min(1), values: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).optional(), link: z.string().optional(), description: z.string().optional(),
  }),
  z.strictObject({
    op: z.literal("item.update"), item: z.string(), collection: z.string().optional(), title: z.string().min(1).optional(),
    values: z.record(z.string(), z.unknown()).optional(), tags: z.array(z.string()).optional(), link: z.string().optional(), description: z.string().optional(),
  }),
  z.strictObject({ op: z.literal("goal.log"), goal: z.string(), value: z.number(), date: date.optional() }),
  z.strictObject({ op: z.literal("student.note"), student: z.string(), text: z.string().min(1) }),
]);
type Op = z.infer<typeof Op>;

/** Finds one record by id, exact name (case-insensitive) or a fragment matching only one. */
function find<T extends { id: string; archivedAt?: string | null }>(kind: string, xs: T[], ref: string, name: (x: T) => string): T {
  const live = xs.filter((x) => !x.archivedAt);
  const r = ref.trim().toLowerCase();
  const byId = live.find((x) => x.id === ref);
  if (byId) return byId;
  const exact = live.filter((x) => name(x).trim().toLowerCase() === r);
  if (exact.length === 1) return exact[0];
  const part = exact.length ? exact : live.filter((x) => name(x).toLowerCase().includes(r));
  if (part.length === 1) return part[0];
  const list = part.slice(0, 8).map((x) => `"${name(x)}" (${x.id})`).join(", ");
  throw new Error(part.length ? `${kind} "${ref}" is ambiguous: ${list}. Use the id.` : `No ${kind} matches "${ref}".`);
}

function input(): unknown {
  const i = process.argv.indexOf("--file");
  const raw = i > -1 ? fs.readFileSync(process.argv[i + 1], "utf8") : process.argv.slice(2).find((a) => !a.startsWith("--")) ?? fs.readFileSync(0, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const dry = process.argv.includes("--dry");
  const raw = input();
  const ops: Op[] = (Array.isArray(raw) ? raw : [raw]).map((x, i) => {
    const r = Op.safeParse(x);
    if (r.success) return r.data;
    const name = (x as { op?: unknown })?.op;
    const ops = Op.options.map((o) => o.shape.op.value).join(", ");
    throw new Error(`Op ${i + 1}${name ? ` (${name})` : ""} is invalid:\n${Op.options.some((o) => o.shape.op.value === name) ? z.prettifyError(r.error) : `unknown op; use one of ${ops}`}`);
  });
  if (!ops.length) throw new Error("No ops given.");

  const db = getAdminDb();
  const load = async <T,>(c: string) => (await db.collection(c).get()).docs.map((d) => ({ ...d.data(), id: d.id }) as T);
  const [areas, tasks, projects, notes, collections, items, goals, students] = await Promise.all([
    load<Area>("hub_areas"), load<Task>("hub_tasks"), load<Project>("hub_projects"), load<Note>("hub_notes"),
    load<Collection>("hub_collections"), load<Item>("hub_items"), load<Goal>("hub_goals"), load<{ id: string; name: string; notes?: string | null }>("students"),
  ]);
  // metrics/actions pull in the browser Firebase client, which needs the env loaded first.
  const { isItemDone, nextOccurrence } = await import("../lib/hub/actions");

  const area = (ref?: string) => (ref ? find("area", areas, ref, (a) => a.name).id : undefined);
  const project = (ref: string) => find("project", projects, ref, (p) => p.title);
  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? id;
  const writes: [string, string, Record<string, unknown>][] = []; // [collection, id, full doc or patch]
  const said: string[] = [];
  const now = nowIso();

  // Later ops in the same batch see earlier ones (e.g. add a task, then update it by title).
  const put = <T extends { id: string }>(list: T[], c: string, doc: T) => {
    const i = list.findIndex((x) => x.id === doc.id);
    i > -1 ? (list[i] = doc) : list.unshift(doc);
    writes.push([c, doc.id, doc as unknown as Record<string, unknown>]);
  };

  for (const op of ops) {
    switch (op.op) {
      case "task.add": {
        const p = op.project ? project(op.project) : null;
        const areaId = area(op.area) ?? p?.areaId ?? "let";
        const t = makeTask({
          title: op.title, areaId, projectId: p?.id ?? null,
          status: op.status ?? (op.area || op.due || p ? "next" : "inbox"), priority: op.priority ?? 2,
          due: op.due ?? null, scheduled: op.scheduled ?? null, estimate: op.estimate ?? null, notes: op.notes ?? "",
          checklist: (op.checklist ?? []).map((title) => ({ id: uid(), title, done: false })),
          ...(op.waitingOn ? { waitingOn: op.waitingOn } : {}),
          log: [{ at: now, text: "Created by Claude" }],
        });
        put(tasks, "hub_tasks", t);
        said.push(`Created task "${t.title}" in ${areaName(t.areaId)}${p ? ` / ${p.title}` : ""} [${t.status}]${t.due ? `, due ${formatDateDMY(t.due)}` : ""} (${t.id})`);
        break;
      }
      case "task.update": {
        const t = find("task", tasks, op.task, (x) => x.title);
        const { op: _, task: __, appendNotes, area: a, project: p, ...rest } = op;
        const patch: Partial<Task> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
        if (a) patch.areaId = area(a);
        if (p !== undefined) patch.projectId = p === null ? null : project(p).id;
        if (appendNotes) patch.notes = [t.notes, appendNotes].filter(Boolean).join("\n\n");
        if (patch.status === "done" && t.status !== "done") throw new Error(`Use task.done to complete "${t.title}" (it handles recurring tasks).`);
        const log = patch.status && patch.status !== t.status ? [...t.log, { at: now, text: `Status → ${patch.status} (Claude)` }] : t.log;
        put(tasks, "hub_tasks", { ...t, ...patch, log, completedAt: patch.status && patch.status !== "done" ? null : t.completedAt, updatedAt: now });
        said.push(`Updated task "${t.title}": ${Object.keys(patch).join(", ")}`);
        break;
      }
      case "task.done": {
        const t = find("task", tasks, op.task, (x) => x.title);
        if (t.status === "done") {
          said.push(`Task "${t.title}" was already done`);
          break;
        }
        put(tasks, "hub_tasks", { ...t, status: "done", completedAt: now, updatedAt: now, log: [...t.log, { at: now, text: "Completed (Claude)" }] });
        let extra = "";
        if (t.recurrence) {
          // Same as completeTask in lib/hub/actions.ts: a recurring task spawns its next occurrence.
          const t0 = today();
          const anchor = t.scheduled ?? t.due ?? t0;
          const next = nextOccurrence(t.recurrence, anchor < t0 ? t0 : anchor);
          const spawned = makeTask({ ...t, id: uid(), createdAt: now, updatedAt: now, status: "next", completedAt: null, scheduled: t.scheduled ? next : null, due: t.due ? next : null, checklist: t.checklist.map((c) => ({ ...c, done: false })), log: [] });
          put(tasks, "hub_tasks", spawned);
          extra = `; next one on ${formatDateDMY(next)}`;
        }
        said.push(`Completed task "${t.title}"${extra}`);
        break;
      }
      case "note.add": {
        const p = op.project ? project(op.project) : null;
        const n: Note = {
          id: uid(), createdAt: now, updatedAt: now, archivedAt: null, title: op.title, body: op.body, type: op.type ?? "doc",
          areaId: area(op.area) ?? p?.areaId ?? "let", pinned: op.pinned ?? false, projectId: p?.id ?? null,
          ...(op.tags ? { tags: op.tags } : {}), ...(op.link ? { link: op.link } : {}),
        };
        put(notes, "hub_notes", n);
        said.push(`Created note "${n.title}" in ${areaName(n.areaId)} (${n.id})`);
        break;
      }
      case "note.append": {
        const n = find("note", notes, op.note, (x) => x.title);
        put(notes, "hub_notes", { ...n, body: [n.body.trimEnd(), op.text].filter(Boolean).join("\n\n"), updatedAt: now });
        said.push(`Appended to note "${n.title}"`);
        break;
      }
      case "item.add": {
        const c = find("collection", collections, op.collection, (x) => x.name);
        const i: Item = {
          id: uid(), createdAt: now, updatedAt: now, archivedAt: null, collectionId: c.id, title: op.title, values: op.values ?? {}, doneAt: null,
          ...(op.tags ? { tags: op.tags } : {}), ...(op.link ? { link: op.link } : {}), ...(op.description ? { description: op.description } : {}),
        };
        i.doneAt = isItemDone(c, i) ? now : null;
        put(items, "hub_items", i);
        said.push(`Added "${i.title}" to ${c.name} (${i.id})`);
        break;
      }
      case "item.update": {
        const c = op.collection ? find("collection", collections, op.collection, (x) => x.name) : null;
        const i = find("item", c ? items.filter((x) => x.collectionId === c.id) : items, op.item, (x) => x.title);
        const col = collections.find((x) => x.id === i.collectionId);
        const next: Item = {
          ...i, updatedAt: now, values: { ...i.values, ...(op.values ?? {}) },
          ...(op.title ? { title: op.title } : {}), ...(op.tags ? { tags: op.tags } : {}), ...(op.link ? { link: op.link } : {}), ...(op.description ? { description: op.description } : {}),
        };
        next.doneAt = isItemDone(col, next) ? i.doneAt ?? now : null; // same rule as updateItem
        put(items, "hub_items", next);
        said.push(`Updated "${i.title}" in ${col?.name ?? "?"}`);
        break;
      }
      case "goal.log": {
        const g = find("goal", goals, op.goal, (x) => x.title);
        if (g.metric !== "manual") throw new Error(`Goal "${g.title}" is measured automatically (${g.metric}); only manual goals take logged values.`);
        const d = op.date ?? today();
        put(goals, "hub_goals", { ...g, log: [...g.log.filter((l) => l.date !== d), { date: d, value: op.value }], updatedAt: now });
        said.push(`Logged ${op.value} ${g.unit} on "${g.title}" for ${formatDateDMY(d)}`);
        break;
      }
      case "student.note": {
        const s = find("student", students, op.student, (x) => x.name);
        const notes = [s.notes?.trim(), `${formatDateDMY(today())}: ${op.text}`].filter(Boolean).join("\n");
        s.notes = notes;
        writes.push(["students", s.id, { notes, updatedAt: FieldValue.serverTimestamp() }]);
        said.push(`Added a note to student ${s.name}`);
        break;
      }
    }
  }

  console.log(said.map((s) => `${dry ? "[dry] " : "✓ "}${s}`).join("\n"));
  if (dry) return;
  const batch = db.batch();
  for (const [c, id, data] of writes) {
    // Hub docs are written whole (as the app does); students get a merge so other fields stay untouched.
    const clean = c === "students" ? data : JSON.parse(JSON.stringify(data));
    batch.set(db.collection(c).doc(id), clean, { merge: c === "students" });
  }
  await batch.commit();

  const { exportOnce, watcherRunning } = await import("./exportBrain");
  if (watcherRunning()) console.log("The watcher will refresh the Brain in a few seconds.");
  else await exportOnce();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`✗ ${e instanceof Error ? e.message : e}\nNothing was written.`);
    process.exit(1);
  });
