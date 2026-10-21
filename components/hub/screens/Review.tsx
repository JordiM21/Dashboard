"use client";

/** Weekly review (§5.4): full-canvas stepper, one step per screen, 150 XP shown from the start. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check as CheckIcon, Plus, Warning } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { XP } from "@/lib/hub/game";
import { goalProgress, projectProgress } from "@/lib/hub/metrics";
import { addDays, dayOf, daysBetween, relDay, today, weekStart } from "@/lib/hub/util";
import { Toolbar } from "../Shell";
import TaskRow from "../TaskRow";
import { Progress, Pip, spring } from "../ui";

const STEPS = ["Clear the Inbox", "Review active projects", "Update manual goals", "Review Waiting", "Pick 3 priorities"];

export default function Review() {
  const s = useHub();
  const live = useLive();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [picks, setPicks] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [newTask, setNewTask] = useState<Record<string, string>>({});
  const [vals, setVals] = useState<Record<string, string>>({});
  const game = s.settings.game !== "off";
  const go = (n: number) => (setDir(n > step ? 1 : -1), setStep(n));

  const inbox = s.tasks.filter((t) => t.status === "inbox" && !t.archivedAt);
  const projects = s.projects.filter((p) => p.status === "active" && !p.archivedAt);
  const manual = s.goals.filter((g) => g.metric === "manual" && g.horizon !== "someday" && !g.archivedAt);
  const waiting = s.tasks.filter((t) => t.status === "waiting" && !t.archivedAt);
  const open = s.tasks.filter((t) => !t.archivedAt && ["next", "doing"].includes(t.status)).sort((a, b) => a.priority - b.priority);

  const finish = () => {
    A.completeReview(picks, notes, weekStart());
    router.push("/today");
  };

  return (
    <>
      <Toolbar areas={false} title="Weekly review" />
      <div className="canvas" style={{ maxWidth: 820 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="label">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="spacer" />
          {game && <span className="xp-chip">+{XP.review} XP on completion</span>}
        </div>
        <Progress value={(step + 1) / STEPS.length} label="Review progress" />
        <AnimatePresence mode="wait" custom={dir}>
          <motion.section key={step} initial={{ opacity: 0, x: 24 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 * dir, transition: { duration: 0.15 } }} transition={spring.ui} style={{ marginTop: 28 }}>
            <h1 className="display-xl" style={{ marginBottom: 6 }}>
              {STEPS[step]}
            </h1>

            {step === 0 && (
              <>
                <p className="callout muted">Give every captured item a home. {inbox.length} left.</p>
                <div className="card" style={{ padding: 8 }}>
                  {inbox.length === 0 ? <Done text="Inbox is empty." /> : inbox.map((t) => <TaskRow key={t.id} t={t} />)}
                </div>
                <p className="caption faint">Right-click a row to move it to an area or schedule it.</p>
              </>
            )}

            {step === 1 && (
              <>
                <p className="callout muted">Every active project needs a next task.</p>
                <div className="col" style={{ gap: 10 }}>
                  {projects.map((p) => {
                    const pr = projectProgress(p.id, s.tasks);
                    const stale = !pr.next && daysBetween(dayOf(p.updatedAt), today()) >= 3;
                    return (
                      <div key={p.id} className="card col" style={{ gap: 8 }}>
                        <div className="row">
                          <span className="headline grow">{p.title}</span>
                          {stale && (
                            <span className="chip danger">
                              <Warning size={12} /> No open task for 3+ days
                            </span>
                          )}
                          <span className="caption muted">{Math.round(pr.pct * 100)}%</span>
                        </div>
                        {pr.next ? (
                          <TaskRow t={pr.next} showProject={false} compact />
                        ) : (
                          <form
                            className="row"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!newTask[p.id]?.trim()) return;
                              A.addTask({ title: newTask[p.id].trim(), projectId: p.id, areaId: p.areaId, status: "next" });
                              setNewTask((x) => ({ ...x, [p.id]: "" }));
                            }}
                          >
                            <Plus size={16} className="faint" />
                            <input className="input" placeholder="Next task…" value={newTask[p.id] ?? ""} onChange={(e) => setNewTask((x) => ({ ...x, [p.id]: e.target.value }))} />
                            <button className="btn btn-sm">Add</button>
                          </form>
                        )}
                        <div className="row">
                          <button className="btn btn-sm btn-ghost" onClick={() => A.updateProject(p.id, { status: "paused" })}>
                            Pause
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => A.updateProject(p.id, { status: "done" })}>
                            Mark done
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {projects.length === 0 && <Done text="No active projects." />}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="callout muted">Goals that can’t read from a source need a number from you.</p>
                <div className="col" style={{ gap: 10 }}>
                  {manual.map((g) => {
                    const p = goalProgress(g, s, live);
                    return (
                      <form
                        key={g.id}
                        className="card row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (vals[g.id] == null || vals[g.id] === "") return;
                          A.logGoal(g.id, Number(vals[g.id]));
                          setVals((v) => ({ ...v, [g.id]: "" }));
                        }}
                      >
                        <div className="grow col" style={{ gap: 6 }}>
                          <span className="headline">{g.title}</span>
                          <Progress value={p.pct} />
                          <span className="caption muted">
                            Now {p.value} / {p.target} {g.unit}
                          </span>
                        </div>
                        <input className="input" type="number" style={{ width: 120 }} placeholder="New value" value={vals[g.id] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [g.id]: e.target.value }))} />
                        <button className="btn">Log</button>
                      </form>
                    );
                  })}
                  {manual.length === 0 && <Done text="No manual goals to update." />}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p className="callout muted">Still waiting? Nudge, reschedule the follow-up, or close it.</p>
                <div className="card col" style={{ gap: 4 }}>
                  {waiting.map((t) => (
                    <div key={t.id} className="row">
                      <div className="grow">
                        <TaskRow t={t} />
                      </div>
                      <span className="caption muted" style={{ width: 120 }}>
                        Follow up {relDay(t.followUp) || "—"}
                      </span>
                      <button className="btn btn-sm btn-ghost" onClick={() => A.updateTask(t.id, { followUp: addDays(today(), 3) })}>
                        +3 days
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => A.updateTask(t.id, { status: "next" })}>
                        Unblocked
                      </button>
                    </div>
                  ))}
                  {waiting.length === 0 && <Done text="Nothing waiting on anyone." />}
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <p className="callout muted">
                  Three things that would make next week a win. Each is a weekly quest worth {XP.priority} XP. {picks.length}/3
                </p>
                <div className="card" style={{ padding: 8, maxHeight: 420, overflow: "auto" }}>
                  {open.map((t) => {
                    const on = picks.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        className="task-row"
                        style={{ width: "100%", ...(on ? { background: "var(--accent-soft)" } : {}) }}
                        aria-pressed={on}
                        disabled={!on && picks.length >= 3}
                        onClick={() => setPicks((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                      >
                        <span className="check" aria-checked={on} role="presentation">
                          <CheckIcon size={12} weight="bold" style={{ opacity: on ? 1 : 0 }} />
                        </span>
                        <span className="grow truncate" style={{ textAlign: "left" }}>
                          {t.title}
                        </span>
                        <span className="caption muted">P{t.priority}</span>
                      </button>
                    );
                  })}
                </div>
                <label className="field" style={{ marginTop: 16 }}>
                  <span>Notes for next week (optional)</span>
                  <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 60 }} />
                </label>
              </>
            )}
          </motion.section>
        </AnimatePresence>

        <div className="row" style={{ marginTop: 28 }}>
          <button className="btn" disabled={step === 0} onClick={() => go(step - 1)}>
            <ArrowLeft size={14} /> Back
          </button>
          <span className="spacer" />
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => go(step + 1)}>
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={finish} disabled={picks.length === 0}>
              Complete review {game && <span className="xp-chip" style={{ height: 20 }}>+{XP.review}</span>}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function Done({ text }: { text: string }) {
  return (
    <div className="empty">
      <Pip state="happy" size={56} />
      {text}
    </div>
  );
}
