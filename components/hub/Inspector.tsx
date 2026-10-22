"use client";

/** Inspector (§3): any record opens here, over the Dock, never over the canvas. Edits save as you type. */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, Archive, Plus, Trash, ArrowSquareOut, PushPin, CheckCircle, ArrowCounterClockwise, Eye, PencilSimple } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { lifecycle, members, price, tenureMonths, goalProgress } from "@/lib/hub/metrics";
import { studentPaymentStatus, PAYMENT_STATUS_LABEL } from "@/lib/studentStatus";
import { formatDateDMY, money, nowIso, relDay, uid, today, hhmm } from "@/lib/hub/util";
import type { Collection, FieldDef, Goal, Item, Note, Task, TaskStatus } from "@/lib/hub/types";
import { Avatar, Check, Progress, Segmented, spring, useSheetDrag } from "./ui";
import { CoverPicker, IconPicker, TagInput, useAllTags } from "./Customize";
import type { Rec } from "./Shell";

/** Desktop: slides in over the Dock. Phone: a full-height bottom sheet you can pull down to close. */
export default function Inspector({ rec, onClose, mobile }: { rec: Rec; onClose: () => void; mobile?: boolean }) {
  const drag = useSheetDrag(onClose);
  const panels = (
    <>
      {rec.kind === "task" && <TaskPanel id={rec.id} onClose={onClose} />}
      {rec.kind === "student" && <StudentPanel id={rec.id} onClose={onClose} />}
      {rec.kind === "note" && <NotePanel id={rec.id} onClose={onClose} />}
      {rec.kind === "item" && <ItemPanel id={rec.id} onClose={onClose} />}
      {rec.kind === "goal" && <GoalPanel id={rec.id} onClose={onClose} />}
      {rec.kind === "tx" && <TxPanel id={rec.id} onClose={onClose} />}
    </>
  );
  if (mobile)
    return (
      <>
        <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
        <motion.div className="inspector inspector-sheet" role="dialog" aria-label="Inspector" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%", transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }} transition={spring.panel} {...drag}>
          <div className="sheet-grab" aria-hidden />
          {panels}
        </motion.div>
      </>
    );
  return (
    <motion.div className="inspector" role="dialog" aria-label="Inspector" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }} transition={spring.panel}>
      {panels}
    </motion.div>
  );
}

function Head({ kind, onClose, children }: { kind: string; onClose: () => void; children?: ReactNode }) {
  return (
    <div className="insp-head">
      <span className="label">{kind}</span>
      <span className="spacer" />
      {children}
      <button className="icon-btn" onClick={onClose} aria-label="Close inspector (Esc)" title="Close (Esc)">
        <X size={18} />
      </button>
    </div>
  );
}

const Gone = ({ onClose }: { onClose: () => void }) => (
  <>
    <Head kind="Record" onClose={onClose} />
    <div className="insp-body muted">This record no longer exists.</div>
  </>
);

/* ---------------------------------------------------------------- task */

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "next", label: "Next" },
  { value: "doing", label: "Doing" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
];

function TaskPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useHub();
  const live = useLive();
  const t = s.tasks.find((x) => x.id === id);
  const [newItem, setNewItem] = useState("");
  if (!t) return <Gone onClose={onClose} />;
  const up = (patch: Partial<Task>) => A.updateTask(t.id, patch);
  const area = s.areas.find((a) => a.id === t.areaId);

  return (
    <>
      <Head kind="Task" onClose={onClose}>
        <button className="icon-btn" onClick={() => (A.archive("tasks", t.id, "Task archived"), onClose())} aria-label="Archive task" title="Archive">
          <Archive size={18} />
        </button>
      </Head>
      <div className="insp-body" style={{ borderTop: `4px solid ${area?.color ?? "transparent"}` }}>
        <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
          <span style={{ marginTop: 4 }}>
            <Check
              checked={t.status === "done"}
              priority={t.priority}
              label="Complete"
              onChange={(e) => (t.status === "done" ? A.reopenTask(t.id) : A.completeTask(t.id, { x: e.clientX, y: e.clientY }))}
            />
          </span>
          <textarea className="input-bare title" rows={2} style={{ resize: "none" }} value={t.title} onChange={(e) => up({ title: e.target.value })} aria-label="Title" />
        </div>
        <Segmented label="Status" size="sm" value={t.status === "dropped" ? "next" : t.status} onChange={(v) => (v === "done" ? A.completeTask(t.id) : up({ status: v, completedAt: null }))} options={STATUSES} />
        {t.status === "waiting" && (
          <div className="tile prop-grid">
            <span>Waiting on</span>
            <input className="input" value={t.waitingOn ?? ""} onChange={(e) => up({ waitingOn: e.target.value })} placeholder="Parent reply, template approval…" />
            <span>Follow up</span>
            <input className="input" type="date" value={t.followUp ?? ""} onChange={(e) => up({ followUp: e.target.value || null })} />
          </div>
        )}
        <div className="prop-grid">
          <span>Area</span>
          <select className="select" value={t.areaId} onChange={(e) => up({ areaId: e.target.value })}>
            {s.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <span>Project</span>
          <select className="select" value={t.projectId ?? ""} onChange={(e) => up({ projectId: e.target.value || null })}>
            <option value="">None</option>
            {s.projects.filter((p) => !p.archivedAt).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <span>Priority</span>
          <Segmented label="Priority" size="sm" value={String(t.priority)} onChange={(v) => up({ priority: Number(v) as 1 | 2 | 3 })} options={[{ value: "1", label: "P1" }, { value: "2", label: "P2" }, { value: "3", label: "P3" }]} />
          <span>Scheduled</span>
          <input className="input" type="date" value={t.scheduled ?? ""} onChange={(e) => up({ scheduled: e.target.value || null })} />
          <span>Due</span>
          <input className="input" type="date" value={t.due ?? ""} onChange={(e) => up({ due: e.target.value || null })} />
          <span>Estimate</span>
          <div className="row">
            <input className="input" type="number" min={0} step={5} value={t.estimate ?? ""} onChange={(e) => up({ estimate: e.target.value ? Number(e.target.value) : null })} placeholder="min" style={{ width: 100 }} />
            <span className="callout muted">minutes</span>
          </div>
          <span>Repeats</span>
          <select
            className="select"
            value={t.recurrence ? (t.recurrence.kind === "after" ? `after:${t.recurrence.n}` : t.recurrence.kind) : ""}
            onChange={(e) => {
              const v = e.target.value;
              up({ recurrence: !v ? null : v.startsWith("after") ? { kind: "after", n: Number(v.split(":")[1]) } : v === "weekly" ? { kind: "weekly", days: [new Date().getDay()] } : { kind: v as "daily" | "monthly" } });
            }}
          >
            <option value="">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="after:3">3 days after completion</option>
            <option value="after:7">7 days after completion</option>
          </select>
          {t.recurrence?.kind === "weekly" && (
            <>
              <span>On</span>
              <div className="row" style={{ gap: 4 }}>
                {"SMTWTFS".split("").map((d, i) => {
                  const on = t.recurrence?.days?.includes(i);
                  return (
                    <button key={i} className={`btn btn-sm ${on ? "btn-accent" : ""}`} style={{ width: 30, padding: 0 }} aria-pressed={on} onClick={() => up({ recurrence: { kind: "weekly", days: on ? t.recurrence!.days!.filter((x) => x !== i) : [...(t.recurrence!.days ?? []), i] } })}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <span>Student</span>
          <select className="select" value={t.studentId ?? ""} onChange={(e) => up({ studentId: e.target.value || null })}>
            <option value="">None</option>
            {live.students.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <span>Group</span>
          <select className="select" value={t.groupId ?? ""} onChange={(e) => up({ groupId: e.target.value || null })}>
            <option value="">None</option>
            {live.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <section>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="label">Checklist</span>
            <span className="spacer" />
            {t.checklist.length > 0 && <span className="caption muted">{t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span>}
          </div>
          {t.checklist.map((c) => (
            <div key={c.id} className="row" style={{ minHeight: 32 }}>
              <Check square checked={c.done} label={c.title} onChange={() => up({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} />
              <input className="input-bare grow" value={c.title} onChange={(e) => up({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)) })} style={c.done ? { color: "var(--text-3)", textDecoration: "line-through" } : undefined} />
              <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Remove item" onClick={() => up({ checklist: t.checklist.filter((x) => x.id !== c.id) })}>
                <X size={12} />
              </button>
            </div>
          ))}
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newItem.trim()) return;
              up({ checklist: [...t.checklist, { id: uid(), title: newItem.trim(), done: false }] });
              setNewItem("");
            }}
          >
            <Plus size={16} className="faint" />
            <input className="input-bare callout" placeholder="Add a step" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
          </form>
        </section>

        <label className="field">
          <span>Notes</span>
          <textarea className="textarea" value={t.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="Context, links, what done looks like…" />
        </label>

        {t.log.length > 0 && (
          <section>
            <div className="label" style={{ marginBottom: 6 }}>
              Activity
            </div>
            {[...t.log].reverse().slice(0, 8).map((l, i) => (
              <div key={i} className="row callout muted" style={{ minHeight: 24 }}>
                <span className="faint caption" style={{ width: 120 }}>
                  {formatDateDMY(l.at)} {hhmm(new Date(l.at))}
                </span>
                {l.text}
              </div>
            ))}
            <div className="caption faint">Created {formatDateDMY(t.createdAt)}</div>
          </section>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- student */

function StudentPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const live = useLive();
  const st = live.students.find((x) => x.id === id);
  if (!st) return <Gone onClose={onClose} />;
  return (
    <>
      <Head kind="Student" onClose={onClose}>
        <button className="btn btn-sm" onClick={() => A.addTask({ title: `Follow up with ${st.name}'s parent`, areaId: "let", priority: 1, due: today(), studentId: id })}>
          <Plus size={14} /> Follow-up task
        </button>
      </Head>
      <div className="insp-body">
        <StudentBody id={id} />
      </div>
    </>
  );
}

/** Student detail — used by the Inspector and by Academy's list + detail. */
export function StudentBody({ id }: { id: string }) {
  const s = useHub();
  const live = useLive();
  const st = live.students.find((x) => x.id === id);
  if (!st) return null;
  const meta = s.studentMeta[id];
  const lc = lifecycle(st, meta);
  const status = studentPaymentStatus(st.nextPayment);
  const group = live.groups.find((g) => g.name.trim().toLowerCase() === (st.classGroup ?? "").trim().toLowerCase());
  const logs = s.lessons.filter((l) => l.groupId === group?.id && l.attendance[id] !== undefined);
  const att = logs.length ? Math.round((logs.filter((l) => l.attendance[id]).length / logs.length) * 100) : null;
  const payments = live.transactions.filter((t) => t.studentId === id || (st.parentEmail && t.payerEmail === st.parentEmail)).slice(0, 8);
  const tasks = s.tasks.filter((t) => t.studentId === id && !t.archivedAt);
  const notes = s.notes.filter((n) => n.studentId === id && !n.archivedAt);
  const tone = status === "late" ? "danger" : status === "pending" ? "warning" : status === "up_to_date" ? "success" : "";

  return (
    <>
        <div className="row" style={{ gap: 14 }}>
          <Avatar name={st.name} src={st.photoUrl} size="lg" />
          <div className="col" style={{ gap: 4 }}>
            <h2 className="title">{st.name}</h2>
            <div className="row">
              <span className={`chip ${tone}`}>{PAYMENT_STATUS_LABEL[status]}</span>
              {group && <span className="chip">{group.name}</span>}
            </div>
          </div>
        </div>
        <div className="prop-grid">
          <span>Lifecycle</span>
          <select className="select" value={lc} onChange={(e) => A.setStudentMeta(id, { lifecycle: e.target.value as any, churnedAt: ["churned", "alumni"].includes(e.target.value) ? today() : null })}>
            {["lead", "trial", "active", "paused", "alumni", "churned"].map((x) => (
              <option key={x} value={x}>
                {x[0].toUpperCase() + x.slice(1)}
              </option>
            ))}
          </select>
          <span>Price paid</span>
          <span>
            ${price(st)}/mo {price(st) < 50 && <span className="chip accent">Discount</span>}
          </span>
          <span>Next payment</span>
          <span>{formatDateDMY(st.nextPayment)}</span>
          <span>Tenure</span>
          <span>{tenureMonths(st, meta)} months</span>
          <span>Start date</span>
          <input className="input" type="date" value={meta?.startDate ?? (st.createdAt ?? "").slice(0, 10)} onChange={(e) => A.setStudentMeta(id, { startDate: e.target.value })} />
          <span>Attendance</span>
          <span>{att == null ? "No logs yet" : `${att}% · ${logs.length} lessons`}</span>
          <span>Parent</span>
          <span className="truncate">{st.parentEmail ?? "—"}</span>
        </div>
        {lc === "alumni" && (
          <label className="field">
            <span>Returning-student offer</span>
            <input className="input" value={meta?.returningOffer ?? ""} onChange={(e) => A.setStudentMeta(id, { returningOffer: e.target.value })} placeholder="e.g. First month $40, sent 02-10" />
          </label>
        )}
        <section>
          <div className="label" style={{ marginBottom: 6 }}>
            Payments
          </div>
          {payments.length === 0 && <span className="callout faint">No payments linked yet.</span>}
          {payments.map((p) => (
            <div key={p.id} className="row callout" style={{ minHeight: 30 }}>
              <span className="faint" style={{ width: 86 }}>
                {formatDateDMY(p.date)}
              </span>
              <span className="grow truncate">{p.description}</span>
              <span style={{ fontWeight: 600 }}>${money(p.amount, 2)}</span>
            </div>
          ))}
        </section>
        <section>
          <div className="label" style={{ marginBottom: 6 }}>
            Tasks
          </div>
          {tasks.length === 0 && <span className="callout faint">No linked tasks.</span>}
          {tasks.map((t) => (
            <MiniTask key={t.id} t={t} />
          ))}
        </section>
        <section>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="label">Notes timeline</span>
            <span className="spacer" />
            <button className="btn btn-sm btn-ghost" onClick={() => A.addNote({ title: `Note · ${st.name}`, studentId: id, areaId: "let", type: "meeting" })}>
              <Plus size={14} /> Note
            </button>
          </div>
          {st.notes && <div className="tile callout" style={{ marginBottom: 6 }}>{st.notes}</div>}
          {notes.map((n) => (
            <div key={n.id} className="tile callout" style={{ marginBottom: 6 }}>
              <div className="row">
                <b>{n.title}</b>
                <span className="spacer" />
                <span className="caption faint">{formatDateDMY(n.createdAt)}</span>
              </div>
              <textarea className="input-bare callout" style={{ resize: "vertical", marginTop: 4 }} rows={2} value={n.body} onChange={(e) => A.updateNote(n.id, { body: e.target.value })} placeholder="Write…" />
            </div>
          ))}
        </section>
    </>
  );
}

function MiniTask({ t }: { t: Task }) {
  return (
    <div className="row callout" style={{ minHeight: 32 }}>
      <Check checked={t.status === "done"} priority={t.priority} label={t.title} onChange={(e) => (t.status === "done" ? A.reopenTask(t.id) : A.completeTask(t.id, { x: e.clientX, y: e.clientY }))} />
      <span className="grow truncate" style={t.status === "done" ? { color: "var(--text-3)", textDecoration: "line-through" } : undefined}>
        {t.title}
      </span>
      <span className="caption faint">{relDay(t.due ?? t.scheduled)}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- note */

function NotePanel({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useHub();
  const n = s.notes.find((x) => x.id === id);
  const [edit, setEdit] = useState(() => !n?.body);
  const tags = useAllTags();
  if (!n) return <Gone onClose={onClose} />;
  const up = (p: Partial<Note>) => A.updateNote(n.id, p);
  return (
    <>
      <Head kind="Note" onClose={onClose}>
        <button className="icon-btn" aria-pressed={n.pinned} title={n.pinned ? "Unpin" : "Pin to top"} onClick={() => up({ pinned: !n.pinned })} style={n.pinned ? { color: "var(--accent)" } : undefined}>
          <PushPin size={18} weight={n.pinned ? "fill" : "regular"} />
        </button>
        <button className="icon-btn" title={edit ? "Preview" : "Edit"} onClick={() => setEdit(!edit)}>
          {edit ? <Eye size={18} /> : <PencilSimple size={18} />}
        </button>
        <button className="icon-btn" onClick={() => (A.archive("notes", n.id, "Note archived"), onClose())} aria-label="Archive note">
          <Archive size={18} />
        </button>
      </Head>
      <div className="insp-body">
        {n.cover && <CoverPicker value={n.cover} onChange={(cover) => up({ cover })} height={120} />}
        <div className="row" style={{ gap: 10 }}>
          <IconPicker icon={n.icon ?? "Note"} color={s.areas.find((a) => a.id === n.areaId)?.color} size={36} onIcon={(icon) => up({ icon })} />
          <input className="input-bare title grow" value={n.title} onChange={(e) => up({ title: e.target.value })} aria-label="Title" />
          {!n.cover && <CoverPicker value={undefined} compact onChange={(cover) => up({ cover })} />}
        </div>
        <div className="prop-grid">
          <span>Type</span>
          <Segmented label="Type" size="sm" value={n.type} onChange={(v) => up({ type: v })} options={[{ value: "doc", label: "Doc" }, { value: "plan", label: "Plan" }, { value: "meeting", label: "Meeting" }, { value: "reference", label: "Ref" }]} />
          <span>Area</span>
          <select className="select" value={n.areaId} onChange={(e) => up({ areaId: e.target.value })}>
            {s.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <span>Project</span>
          <select className="select" value={n.projectId ?? ""} onChange={(e) => up({ projectId: e.target.value || null })}>
            <option value="">None</option>
            {s.projects.filter((p) => !p.archivedAt).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <span>Link</span>
          <div className="row">
            <input className="input" value={n.link ?? ""} onChange={(e) => up({ link: e.target.value })} placeholder="obsidian://… or https://…" />
            {n.link && (
              <a className="icon-btn" href={n.link} target={n.link.startsWith("obsidian:") ? undefined : "_blank"} rel="noreferrer" aria-label="Open link">
                <ArrowSquareOut size={18} />
              </a>
            )}
          </div>
          <span>Tags</span>
          <TagInput value={n.tags ?? []} onChange={(tags) => up({ tags })} suggest={tags} />
        </div>
        {edit ? (
          <textarea className="textarea" style={{ minHeight: 320, fontFamily: "var(--font-mono)", fontSize: 13 }} value={n.body} onChange={(e) => up({ body: e.target.value })} placeholder="Markdown…" autoFocus />
        ) : (
          <div className="prose" onDoubleClick={() => setEdit(true)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.body || "_Empty — double-click to write._"}</ReactMarkdown>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- item */

export function FieldInput({ f, value, onChange }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (f.type) {
    case "number":
      return <input className="input" type="number" value={(value as number) ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "date":
      return <input className="input" type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "checkbox":
      return <Check square checked={!!value} label={f.label} onChange={() => onChange(!value)} />;
    case "select":
      return (
        <select className="select" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {f.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case "multiselect": {
      const arr = (value as string[]) ?? [];
      return (
        <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
          {f.options?.map((o) => (
            <button key={o} className={`chip ${arr.includes(o) ? "accent" : ""}`} onClick={() => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])}>
              {o}
            </button>
          ))}
        </div>
      );
    }
    default:
      return <input className="input" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} type={f.type === "url" || f.type === "image" ? "url" : "text"} />;
  }
}

function ItemPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useHub();
  const it = s.items.find((x) => x.id === id);
  const c = s.collections.find((x) => x.id === it?.collectionId) as Collection | undefined;
  const tags = useAllTags();
  if (!it || !c) return <Gone onClose={onClose} />;
  const up = (p: Partial<Item>) => A.updateItem(it.id, p);
  return (
    <>
      <Head kind={c.name} onClose={onClose}>
        <button className="icon-btn" onClick={() => (A.archive("items", it.id, "Item archived"), onClose())} aria-label="Archive item">
          <Archive size={18} />
        </button>
      </Head>
      <div className="insp-body">
        {it.image ? <CoverPicker value={it.image} onChange={(image) => up({ image })} height={200} /> : <CoverPicker value={undefined} onChange={(image) => up({ image })} />}
        <input className="input-bare title" value={it.title} onChange={(e) => up({ title: e.target.value })} aria-label="Title" />
        <textarea className="textarea" style={{ minHeight: 70 }} value={it.description ?? ""} onChange={(e) => up({ description: e.target.value })} placeholder="Notes, thoughts, where you left off…" aria-label="Description" />
        {it.doneAt && <span className="chip success">Done · {formatDateDMY(it.doneAt)}</span>}
        <div className="prop-grid">
          {c.fields.map((f) => (
            <FieldRow key={f.key} label={f.label}>
              <FieldInput f={f} value={it.values[f.key]} onChange={(v) => up({ values: { [f.key]: v } })} />
            </FieldRow>
          ))}
          <span>Link</span>
          <input className="input" value={it.link ?? ""} onChange={(e) => up({ link: e.target.value })} placeholder="https://…" />
          <span>Tags</span>
          <TagInput value={it.tags ?? []} onChange={(tags) => up({ tags })} suggest={tags} />
        </div>
        {!c.doneField && (
          <button className="btn" onClick={() => up({ doneAt: it.doneAt ? null : nowIso() })}>
            {it.doneAt ? <ArrowCounterClockwise size={16} /> : <CheckCircle size={16} />} {it.doneAt ? "Mark not done" : "Mark done"}
          </button>
        )}
      </div>
    </>
  );
}

const FieldRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <span>{label}</span>
    <div>{children}</div>
  </>
);

/* ---------------------------------------------------------------- goal */

function GoalPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const s = useHub();
  const live = useLive();
  const g = s.goals.find((x) => x.id === id);
  const [val, setVal] = useState("");
  const prog = useMemo(() => (g ? goalProgress(g, s, live) : null), [g, s, live]);
  if (!g || !prog) return <Gone onClose={onClose} />;
  const up = (p: Partial<Goal>) => A.updateGoal(g.id, p);
  const someday = g.horizon === "someday";
  return (
    <>
      <Head kind={someday ? "Plan" : "Goal"} onClose={onClose}>
        {someday && (
          <button
            className="btn btn-sm"
            onClick={() => {
              const p = A.addProject({ title: g.title, areaId: g.areaId, outcome: "", status: "planned" });
              A.updateGoal(g.id, { planStatus: "booked", projectId: p.id });
              router.push(`/tasks/p/${p.id}`);
            }}
          >
            Promote to project
          </button>
        )}
        <button className="icon-btn" onClick={() => (A.archive("goals", g.id, "Archived"), onClose())} aria-label="Archive">
          <Trash size={18} />
        </button>
      </Head>
      <div className="insp-body">
        {g.cover && <CoverPicker value={g.cover} onChange={(cover) => up({ cover })} height={120} />}
        <div className="row" style={{ gap: 10 }}>
          <IconPicker icon={g.icon ?? (someday ? "Folder" : "Target")} color={s.areas.find((a) => a.id === g.areaId)?.color} size={36} onIcon={(icon) => up({ icon })} />
          <input className="input-bare title grow" value={g.title} onChange={(e) => up({ title: e.target.value })} aria-label="Title" />
          {!g.cover && <CoverPicker value={undefined} compact onChange={(cover) => up({ cover })} />}
        </div>
        <textarea className="input-bare callout inline-edit" rows={2} style={{ resize: "none", color: "var(--text-2)" }} value={g.description ?? ""} onChange={(e) => up({ description: e.target.value })} placeholder="Why this matters…" aria-label="Description" />
        {!someday && (
          <div className="col">
            <Progress value={prog.pct} label="Goal progress" />
            <div className="row callout">
              <b>
                {g.unit === "$" ? `$${money(prog.value)}` : prog.value} / {g.unit === "$" ? `$${money(prog.target)}` : `${prog.target} ${g.unit}`}
              </b>
              <span className="spacer" />
              <span className="muted">{prog.pace ?? (prog.defeated ? "Defeated" : "")}</span>
            </div>
          </div>
        )}
        <div className="prop-grid">
          <span>Area</span>
          <select className="select" value={g.areaId} onChange={(e) => up({ areaId: e.target.value })}>
            {s.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <span>Horizon</span>
          <Segmented label="Horizon" size="sm" value={g.horizon} onChange={(v) => up({ horizon: v })} options={[{ value: "week", label: "Week" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }, { value: "someday", label: "Someday" }]} />
          {someday ? (
            <>
              <span>Timeframe</span>
              <input className="input" value={g.timeframe ?? ""} onChange={(e) => up({ timeframe: e.target.value })} placeholder="Spring, next year…" />
              <span>Budget</span>
              <input className="input" type="number" value={g.budget ?? ""} onChange={(e) => up({ budget: e.target.value ? Number(e.target.value) : null })} />
              <span>Status</span>
              <select className="select" value={g.planStatus ?? "idea"} onChange={(e) => up({ planStatus: e.target.value as Goal["planStatus"] })}>
                <option value="idea">Idea</option>
                <option value="saving">Saving</option>
                <option value="booked">Booked</option>
                <option value="done">Done</option>
              </select>
            </>
          ) : (
            <>
              <span>Source</span>
              <select className="select" value={g.metric} onChange={(e) => up({ metric: e.target.value as Goal["metric"] })}>
                <option value="mrr">Stripe · MRR</option>
                <option value="students">Stripe · paying students</option>
                <option value="revenue">Stripe · revenue this month</option>
                <option value="tasks">Tasks done in a project</option>
                <option value="collection">Collection items done</option>
                <option value="manual">Manual entry</option>
              </select>
              {g.metric === "tasks" && (
                <>
                  <span>Project</span>
                  <select className="select" value={g.projectId ?? ""} onChange={(e) => up({ projectId: e.target.value || null })}>
                    <option value="">—</option>
                    {s.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {g.metric === "collection" && (
                <>
                  <span>Collection</span>
                  <select className="select" value={g.collectionId ?? ""} onChange={(e) => up({ collectionId: e.target.value || null })}>
                    <option value="">—</option>
                    {s.collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {g.metric !== "tasks" && (
                <>
                  <span>Target</span>
                  <input className="input" type="number" value={g.target} onChange={(e) => up({ target: Number(e.target.value) })} />
                </>
              )}
              <span>Starting value</span>
              <input className="input" type="number" value={g.start} onChange={(e) => up({ start: Number(e.target.value) })} />
              <span>Unit</span>
              <input className="input" value={g.unit} onChange={(e) => up({ unit: e.target.value })} />
              <span>Deadline</span>
              <input className="input" type="date" value={g.deadline ?? ""} onChange={(e) => up({ deadline: e.target.value || null })} />
              <span>Pinned</span>
              <Check square checked={g.pinned} label="Pinned to Today" onChange={() => up({ pinned: !g.pinned })} />
            </>
          )}
        </div>
        {g.metric === "manual" && !someday && (
          <section>
            <div className="label" style={{ marginBottom: 6 }}>
              Log a value
            </div>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (val === "") return;
                A.logGoal(g.id, Number(val));
                setVal("");
              }}
            >
              <input className="input" type="number" value={val} onChange={(e) => setVal(e.target.value)} placeholder={`Current ${g.unit || "value"}`} />
              <button className="btn">Log</button>
            </form>
            {[...g.log].reverse().slice(0, 6).map((l) => (
              <div key={l.date} className="row callout muted" style={{ minHeight: 26 }}>
                <span className="faint" style={{ width: 90 }}>
                  {formatDateDMY(l.date)}
                </span>
                {g.unit === "$" ? `$${money(l.value)}` : `${l.value} ${g.unit}`}
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- transaction */

function TxPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const live = useLive();
  const s = useHub();
  const t = live.transactions.find((x) => x.id === id);
  const local = s.expenses.find((x) => x.id === id);
  if (!t && !local) return <Gone onClose={onClose} />;
  if (local)
    return (
      <>
        <Head kind="Expense" onClose={onClose}>
          <button className="icon-btn" onClick={() => (A.archive("expenses", local.id, "Expense archived"), onClose())} aria-label="Archive expense">
            <Archive size={18} />
          </button>
        </Head>
        <div className="insp-body">
          <span className="display-l">
            −<span className="unit">$</span>
            {money(local.amount, 2)}
          </span>
          <div className="prop-grid">
            <span>Description</span>
            <span>{local.description}</span>
            <span>Date</span>
            <span>{formatDateDMY(local.date)}</span>
            <span>Category</span>
            <span>{local.category}</span>
            <span>Scope</span>
            <span>{local.scope === "business" ? "Business" : "Personal"}</span>
            <span>Recurring</span>
            <span>{local.recurring ? "Monthly, auto-created on the 1st" : "No"}</span>
          </div>
        </div>
      </>
    );
  const st = live.students.find((x) => x.id === t!.studentId);
  return (
    <>
      <Head kind="Transaction" onClose={onClose} />
      <div className="insp-body">
        <span className="display-l" style={{ color: t!.amount >= 0 ? "var(--success-ink)" : undefined }}>
          {t!.amount < 0 ? "−" : "+"}
          <span className="unit">$</span>
          {money(Math.abs(t!.amount), 2)}
        </span>
        <div className="prop-grid">
          <span>Description</span>
          <span>{t!.description}</span>
          <span>Date</span>
          <span>{formatDateDMY(t!.date)}</span>
          <span>Category</span>
          <span>{t!.category}</span>
          <span>Source</span>
          <span style={{ textTransform: "capitalize" }}>{t!.source ?? "manual"}</span>
          {t!.originalCurrency && (
            <>
              <span>Charged</span>
              <span>
                {money(t!.originalAmount ?? 0, 0)} {t!.originalCurrency.toUpperCase()} · rate {t!.exchangeRate}
              </span>
            </>
          )}
          <span>Payer</span>
          <span className="truncate">{t!.payerEmail ?? "—"}</span>
          <span>Student</span>
          <span>{st ? st.name : <span className="faint">Not linked</span>}</span>
        </div>
        <p className="caption faint">Stripe records are read-only here. They update automatically from the webhook.</p>
      </div>
    </>
  );
}

