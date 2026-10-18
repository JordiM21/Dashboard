"use client";

/** Project page (§5.3, §10 Tasks): outcome, progress, milestones track, tasks. */
import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Flag, Plus, Warning, Copy, X, Note as NoteIcon } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import * as A from "@/lib/hub/actions";
import { projectProgress } from "@/lib/hub/metrics";
import { formatDateDMY, uid, today } from "@/lib/hub/util";
import type { Milestone, Project as P } from "@/lib/hub/types";
import { Toolbar, useShell } from "../Shell";
import TaskRow, { rowMotion } from "../TaskRow";
import { Check, Fade, Segmented, useDropdown, Empty } from "../ui";

export default function Project() {
  const { id } = useParams<{ id: string }>();
  const s = useHub();
  const { inspect } = useShell();
  const drop = useDropdown();
  const p = s.projects.find((x) => x.id === id);
  const [title, setTitle] = useState("");
  const [ms, setMs] = useState("");
  if (!p)
    return (
      <>
        <Toolbar title="Project" />
        <div className="canvas">
          <Empty text="This project doesn’t exist." />
        </div>
      </>
    );
  const up = (patch: Partial<P>) => A.updateProject(p.id, patch);
  const pr = projectProgress(p.id, s.tasks);
  const area = s.areas.find((a) => a.id === p.areaId);
  const done = s.tasks.filter((t) => t.projectId === p.id && t.status === "done" && !t.archivedAt);
  const notes = s.notes.filter((n) => n.projectId === p.id && !n.archivedAt);
  const milestones = [...p.milestones].sort((a, b) => (a.date ?? "9").localeCompare(b.date ?? "9"));
  const setMilestone = (mid: string, patch: Partial<Milestone>) => up({ milestones: p.milestones.map((m) => (m.id === mid ? { ...m, ...patch } : m)) });

  return (
    <>
      <Toolbar title="Tasks">
        <Link href="/tasks" className="btn btn-sm btn-ghost" onClick={() => A.setUi({ taskView: "projects" })}>
          <ArrowLeft size={14} /> Projects
        </Link>
      </Toolbar>
      <Fade className="canvas" style={{ maxWidth: 1040 }}>
        <div className="row" style={{ marginBottom: 8, gap: 10 }}>
          <span className="chip chip-area" style={{ "--c": area?.color } as CSSProperties}>
            <span className="dot" style={{ "--c": area?.color } as CSSProperties} />
            <select className="input-bare caption" value={p.areaId} onChange={(e) => up({ areaId: e.target.value })} aria-label="Area">
              {s.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </span>
          <Segmented label="Project status" size="sm" value={p.status} onChange={(v) => up({ status: v })} options={(["planned", "active", "paused", "done", "dropped"] as const).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
          <span className="spacer" />
          <button className="btn btn-sm" onClick={() => A.saveTemplate(p.id)}>
            <Copy size={14} /> Save as template
          </button>
          <button className="btn btn-sm" onClick={(e) => drop(e, s.templates.map((t) => ({ label: t.name, hint: `${t.tasks.length} tasks`, onClick: () => A.applyTemplate(t.id, { projectId: p.id }) })))}>
            <Plus size={14} /> From template
          </button>
        </div>
        <input className="input-bare display-xl" value={p.title} onChange={(e) => up({ title: e.target.value })} aria-label="Project title" />
        <textarea
          className="input-bare"
          rows={1}
          style={{ fontSize: 18, lineHeight: "26px", color: "var(--text-2)", resize: "none", marginTop: 8 }}
          value={p.outcome}
          placeholder="One sentence: what does done look like?"
          onChange={(e) => up({ outcome: e.target.value })}
          aria-label="Outcome"
        />

        <section className="card" style={{ marginTop: 24 }}>
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="display-l">{Math.round(pr.pct * 100)}%</span>
            <span className="callout muted">
              {pr.done}/{pr.total} tasks · by estimated minutes
            </span>
            <span className="spacer" />
            <span className="callout muted">Target</span>
            <input className="input" type="date" style={{ width: 160 }} value={p.target ?? ""} onChange={(e) => up({ target: e.target.value || null })} />
            {p.areaId === "let" && (
              <select className="select" style={{ width: 130 }} value={p.track ?? ""} onChange={(e) => up({ track: (e.target.value || undefined) as P["track"] })} aria-label="Track">
                <option value="">No track</option>
                <option value="delivery">Delivery</option>
                <option value="growth">Growth</option>
              </select>
            )}
          </div>
          <div className="boss-hp" style={{ height: 12 }}>
            <i style={{ width: `${pr.pct * 100}%`, left: 0, right: "auto", background: area?.color ?? "var(--accent)" }} />
          </div>

          <div style={{ position: "relative", marginTop: 28, paddingBottom: 6 }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 9, height: 2, background: "var(--line-strong)", borderRadius: 1 }} />
            <div className="row" style={{ gap: 0, alignItems: "flex-start", overflowX: "auto" }}>
              {milestones.map((m) => (
                <div key={m.id} className="col" style={{ minWidth: 150, gap: 4, position: "relative", alignItems: "flex-start" }}>
                  <Check square checked={m.done} label={m.title} onChange={() => setMilestone(m.id, { done: !m.done })} />
                  <input className="input-bare callout" style={{ fontWeight: 500, ...(m.done ? { color: "var(--text-3)" } : {}) }} value={m.title} onChange={(e) => setMilestone(m.id, { title: e.target.value })} />
                  <span className="row" style={{ gap: 2 }}>
                    <input className="input-bare caption muted" type="date" value={m.date ?? ""} onChange={(e) => setMilestone(m.id, { date: e.target.value || null })} style={{ width: 120 }} />
                    <button className="icon-btn" style={{ width: 20, height: 20 }} aria-label="Remove milestone" onClick={() => up({ milestones: p.milestones.filter((x) => x.id !== m.id) })}>
                      <X size={11} />
                    </button>
                  </span>
                </div>
              ))}
              <form
                className="col"
                style={{ minWidth: 170, gap: 4 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!ms.trim()) return;
                  up({ milestones: [...p.milestones, { id: uid(), title: ms.trim(), date: null, done: false }] });
                  setMs("");
                }}
              >
                <span style={{ width: 18, height: 18, borderRadius: 6, border: "1.5px dashed var(--line-strong)", background: "var(--bg-surface)", display: "grid", placeItems: "center" }}>
                  <Flag size={10} className="faint" />
                </span>
                <input className="input-bare callout" placeholder="Add milestone" value={ms} onChange={(e) => setMs(e.target.value)} />
              </form>
            </div>
          </div>
        </section>

        <section className="card" style={{ marginTop: 16, padding: "16px 12px" }}>
          <div className="list-group-head">
            <span className="headline">Tasks</span>
            {p.status === "active" && !pr.next && (
              <span className="chip warning">
                <Warning size={12} /> No next task
              </span>
            )}
          </div>
          <form
            className="task-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              A.addTask({ title: title.trim(), projectId: p.id, areaId: p.areaId, status: "next" });
              setTitle("");
            }}
          >
            <Plus size={18} className="faint" style={{ margin: "0 1px" }} />
            <input className="input-bare" placeholder="Add a task to this project" value={title} onChange={(e) => setTitle(e.target.value)} />
          </form>
          <AnimatePresence initial={false}>
            {pr.open.map((t) => (
              <motion.div key={t.id} {...rowMotion}>
                <TaskRow t={t} showProject={false} />
              </motion.div>
            ))}
          </AnimatePresence>
          {done.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary className="caption muted" style={{ cursor: "pointer", padding: "4px 10px" }}>
                {done.length} done
              </summary>
              {done.map((t) => (
                <TaskRow key={t.id} t={t} showProject={false} compact />
              ))}
            </details>
          )}
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <span className="headline">Notes</span>
            <span className="spacer" />
            <button className="btn btn-sm" onClick={() => inspect({ kind: "note", id: A.addNote({ title: `${p.title} · ${formatDateDMY(today())}`, projectId: p.id, areaId: p.areaId }).id })}>
              <Plus size={14} /> Note
            </button>
          </div>
          {notes.length === 0 && <span className="callout faint">No notes yet.</span>}
          {notes.map((n) => (
            <button key={n.id} className="task-row" style={{ width: "100%" }} onClick={() => inspect({ kind: "note", id: n.id })}>
              <NoteIcon size={16} className="faint" />
              <span className="grow truncate" style={{ textAlign: "left" }}>
                {n.title}
              </span>
              <span className="caption faint">{formatDateDMY(n.updatedAt)}</span>
            </button>
          ))}
        </section>
      </Fade>
    </>
  );
}
