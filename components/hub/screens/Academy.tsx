"use client";

/**
 * Academy (§5.5): capacity strip is the focal point; students (payments,
 * parents), groups (members, schedule, seats) and the curriculum board.
 * Groups and curriculum are deliberately separate: planning which lesson a
 * group does lives in the Keeds app.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MagnifyingGlass, Plus, X, UsersThree, DotsThree, DotsSixVertical } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { capacity, currentTeachingHours, freeSeats, hoursAtTarget, lifecycle, members, mrr, PRICE, studentsToTarget, tenureMonths, payingStudents, CAPACITY, type Lifecycle } from "@/lib/hub/metrics";
import { studentPaymentStatus, PAYMENT_STATUS_LABEL } from "@/lib/studentStatus";
import { monthKey } from "@/lib/hub/util";
import { toast } from "@/lib/hub/fx";
import { authFetch } from "@/lib/firebase/authFetch";
import type { CurriculumLevelDoc } from "@/lib/types";
import { Toolbar, useShell } from "../Shell";
import { StudentBody } from "../Inspector";
import { Avatar, Fade, Kpi, Progress, Segmented, Empty, useDropdown } from "../ui";

type Tab = "students" | "groups" | "curriculum";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AcademyPage() {
  return (
    <Suspense>
      <Academy />
    </Suspense>
  );
}

function Academy() {
  const s = useHub();
  const live = useLive();
  const params = useSearchParams();
  const router = useRouter();
  const tab = ((["students", "groups", "curriculum"] as const).find((t) => t === params.get("tab")) ?? (params.get("group") ? "groups" : "students")) as Tab;
  const setTab = (t: Tab) => router.replace(`/academy?tab=${t}`, { scroll: false });
  const [groupId, setGroupId] = useState<string | null>(params.get("group"));
  useEffect(() => {
    if (params.get("group")) setGroupId(params.get("group"));
  }, [params]);

  const free = freeSeats(live, s);
  const m = mrr(live, s);
  const need = studentsToTarget(m);
  const nowH = currentTeachingHours(live, s);
  const churned = live.students.filter((x) => s.studentMeta[x.id]?.churnedAt?.startsWith(monthKey())).length;
  const paying = payingStudents(live, s);
  const avgTenure = paying.length ? paying.reduce((a, x) => a + tenureMonths(x, s.studentMeta[x.id]), 0) / paying.length : 0;

  return (
    <>
      <Toolbar areas={false} title="Academy">
        <Segmented label="Section" size="sm" value={tab} onChange={setTab} options={[{ value: "students", label: "Students", count: live.students.length }, { value: "groups", label: "Groups", count: live.groups.length }, { value: "curriculum", label: "Curriculum" }]} />
      </Toolbar>
      <Fade className="canvas">
        <section aria-label="Capacity" style={{ marginBottom: 28 }}>
          <div className="row head-row" style={{ marginBottom: 12, alignItems: "baseline" }}>
            <h1 className="display-xl">Academy</h1>
            <span className="spacer" />
            <span className="display-l">{free}</span>
            <span className="callout muted">free seats · ${free * PRICE} MRR waiting to be filled</span>
          </div>
          <div className="grid-cards" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(live.groups.length, 1), 6)}, minmax(0, 1fr))`, paddingTop: 0 }}>
            {live.groups.map((g) => {
              const mem = members(g, live.students);
              const cap = capacity(s, g.id);
              const late = mem.filter((x) => studentPaymentStatus(x.nextPayment) === "late").length;
              return (
                <button key={g.id} className="card hoverable col" style={{ textAlign: "left", gap: 10, ...(groupId === g.id && tab === "groups" ? { boxShadow: "0 0 0 2px var(--accent)" } : {}) }} onClick={() => (setGroupId(g.id), router.replace(`/academy?tab=groups&group=${g.id}`, { scroll: false }))}>
                  <div className="row">
                    <span className="headline grow">{g.name}</span>
                  </div>
                  <div className="row" style={{ gap: 5 }} aria-label={`${mem.length} of ${cap} seats`}>
                    {Array.from({ length: cap }, (_, i) => (
                      <span key={i} className="seat" data-on={i < mem.length} />
                    ))}
                    <span className="caption muted" style={{ marginLeft: 4 }}>
                      {mem.length}/{cap}
                    </span>
                  </div>
                  <span className="callout muted truncate">
                    ${mem.length * PRICE}/mo{late ? ` · ${late} late` : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="bento" style={{ gap: 24 }}>
              <div className="span-3">
                <Kpi label="Students to $1,500 target">
                  <span className="display-l">{need}</span>
                  <span className="callout muted">at ${PRICE}</span>
                </Kpi>
              </div>
              <div className="span-3">
                <Kpi label="Teaching hours / week" foot={<Progress value={nowH / hoursAtTarget()} thin />}>
                  <span className="display-l">{Math.round(nowH)}</span>
                  <span className="callout muted">of {hoursAtTarget()}h at target</span>
                </Kpi>
              </div>
              <div className="span-3">
                <Kpi label="Groups needed at target">
                  <span className="display-l">{Math.ceil(1500 / PRICE / CAPACITY)}</span>
                  <span className="callout muted">have {live.groups.length}</span>
                </Kpi>
              </div>
              <div className="span-3">
                <Kpi label="Churn this month · avg tenure">
                  <span className="display-l">{churned}</span>
                  <span className="callout muted">· {avgTenure.toFixed(1)} months</span>
                </Kpi>
              </div>
            </div>
            <p className="caption muted" style={{ margin: "14px 0 0" }}>
              Fill the {free} free seats before opening a new group. Scaling ads past {need} enrolments needs {Math.max(0, hoursAtTarget() - Math.round(nowH))} more teaching hours a week. Kommo lead counts arrive in Phase 3.
            </p>
          </div>
        </section>

        <Fade k={tab}>
          {tab === "students" && <Students />}
          {tab === "groups" && <Groups groupId={groupId ?? live.groups[0]?.id} />}
          {tab === "curriculum" && <Curriculum />}
        </Fade>
      </Fade>
    </>
  );
}

/* ---------------------------------------------------------------- students */

const LC_ORDER: Lifecycle[] = ["active", "trial", "lead", "paused", "alumni", "churned"];

function Students() {
  const s = useHub();
  const live = useLive();
  const [q, setQ] = useState("");
  const [lc, setLc] = useState<Lifecycle | "all">("active");
  const list = useMemo(
    () =>
      live.students
        .map((x) => ({ x, lc: lifecycle(x, s.studentMeta[x.id]), pay: studentPaymentStatus(x.nextPayment) }))
        .filter((r) => (lc === "all" || r.lc === lc) && (!q || r.x.name.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => a.x.name.localeCompare(b.x.name)),
    [live.students, s.studentMeta, lc, q]
  );
  const [sel, setSel] = useState<string | null>(null);
  const { mobile, inspect } = useShell();
  const selected = list.find((r) => r.x.id === sel)?.x.id ?? list[0]?.x.id;
  const count = (v: Lifecycle) => live.students.filter((x) => lifecycle(x, s.studentMeta[x.id]) === v).length;

  return (
    <>
      <div className="row head-row" style={{ marginBottom: 12 }}>
        <Segmented label="Lifecycle" size="sm" value={lc} onChange={setLc} options={[{ value: "all" as const, label: "All", count: live.students.length }, ...LC_ORDER.filter((v) => count(v) > 0 || v === "active").map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), count: count(v) }))]} />
        <span className="spacer" />
        <div className="row sb-search" style={{ width: 240, margin: 0 }}>
          <MagnifyingGlass size={14} />
          <input className="input-bare callout" placeholder="Find a student" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="list-detail">
        <div className="card ld-list" role="listbox" aria-label="Students">
          {list.length === 0 && <Empty text="No students here." />}
          {list.map(({ x, lc: l, pay }) => (
            <button key={x.id} className="ld-row" role="option" aria-selected={x.id === selected} onClick={() => (mobile ? inspect({ kind: "student", id: x.id }) : setSel(x.id))}>
              <Avatar name={x.name} src={x.photoUrl} />
              <span className="grow col" style={{ gap: 0, minWidth: 0 }}>
                <span className="truncate" style={{ fontWeight: 500 }}>
                  {x.name}
                </span>
                <span className="caption muted">{x.classGroup || l}</span>
              </span>
              {l === "active" && <span className={`chip ${pay === "late" ? "danger" : pay === "pending" ? "warning" : pay === "up_to_date" ? "success" : ""}`}>{PAYMENT_STATUS_LABEL[pay]}</span>}
              {l !== "active" && <span className="chip">{l}</span>}
            </button>
          ))}
        </div>
        <div className="card col" style={{ gap: 18, padding: 24 }}>
          {selected ? <StudentBody id={selected} key={selected} /> : <Empty text="Pick a student." />}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- groups */

function Groups({ groupId }: { groupId?: string }) {
  const s = useHub();
  const live = useLive();
  const { inspect } = useShell();
  const g = live.groups.find((x) => x.id === groupId);
  if (!g) return <Empty text="No groups yet." />;
  const mem = members(g, live.students);
  const meta = s.groupMeta[g.id] ?? {};
  const slots = meta.slots ?? [];

  return (
    <div className="bento">
      <section className="card span-7">
        <div className="card-head">
          <UsersThree size={18} className="faint" />
          <h2 className="title">{g.name}</h2>
          <span className="spacer" />
          <span className="callout muted">${mem.length * PRICE}/mo</span>
        </div>
        <div className="label" style={{ marginBottom: 8 }}>
          Members · {mem.length}/{capacity(s, g.id)}
        </div>
        {mem.map((x) => (
          <button key={x.id} className="ld-row" onClick={() => inspect({ kind: "student", id: x.id })}>
            <Avatar name={x.name} src={x.photoUrl} />
            <span className="grow" style={{ textAlign: "left" }}>
              {x.name}
            </span>
            {(() => {
              const pay = studentPaymentStatus(x.nextPayment);
              return <span className={`chip ${pay === "late" ? "danger" : pay === "pending" ? "warning" : pay === "up_to_date" ? "success" : ""}`}>{PAYMENT_STATUS_LABEL[pay]}</span>;
            })()}
          </button>
        ))}
      </section>
      <section className="card span-5 col" style={{ gap: 14 }}>
        <div className="headline">Schedule</div>
        {slots.map((sl, i) => (
          <div key={i} className="row">
            <select className="select" style={{ width: 90 }} value={sl.day} onChange={(e) => A.setGroupMeta(g.id, { slots: slots.map((x, j) => (j === i ? { ...x, day: Number(e.target.value) } : x)) })}>
              {DAYS.map((d, n) => (
                <option key={d} value={n}>
                  {d}
                </option>
              ))}
            </select>
            <input className="input" type="time" style={{ width: 110 }} value={sl.start} onChange={(e) => A.setGroupMeta(g.id, { slots: slots.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
            <input className="input" type="number" style={{ width: 80 }} value={sl.minutes} onChange={(e) => A.setGroupMeta(g.id, { slots: slots.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)) })} aria-label="Minutes" />
            <span className="caption muted">min</span>
            <button className="icon-btn" aria-label="Remove slot" onClick={() => A.setGroupMeta(g.id, { slots: slots.filter((_, j) => j !== i) })}>
              <X size={14} />
            </button>
          </div>
        ))}
        <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => A.setGroupMeta(g.id, { slots: [...slots, { day: 1, start: "17:00", minutes: 60 }] })}>
          <Plus size={14} /> Add class slot
        </button>
        <label className="row callout">
          Capacity
          <input className="input" type="number" min={1} style={{ width: 80 }} value={capacity(s, g.id)} onChange={(e) => A.setGroupMeta(g.id, { capacity: Number(e.target.value) || CAPACITY })} />
        </label>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- curriculum */

const TINTS = ["var(--accent)", "var(--success)", "var(--warning)", "var(--epic)", "var(--ember)", "var(--volt)"];

async function board(path: string, method: string, body?: object): Promise<void> {
  const r = await authFetch(`/api/board/curriculum${path}`, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) }).catch(() => null);
  if (!r?.ok) toast(r?.status === 401 ? "Sign in to edit the curriculum" : "That didn’t save. Try again.");
}

/**
 * The syllabus as an editable board, on its own: stages → levels → lessons.
 * Click any text to edit it, drag lessons between levels, drag level cards to
 * reorder them or move them to another stage. Lesson planning per group lives
 * in the Keeds app, so nothing here is tied to a group.
 */
function Curriculum() {
  const live = useLive();
  const drop = useDropdown();
  const levels = useMemo(() => [...live.curriculum].sort((a, b) => a.levelNumber - b.levelNumber), [live.curriculum]);
  const stages = [...new Set(levels.map((l) => l.stageName))];
  const [over, setOver] = useState<string | null>(null);

  const reorder = (order: { id: string; stageName: string }[]) => board("/reorder", "PATCH", { order });
  const moveLevel = (id: string, stageName: string, beforeId: string | null) => {
    const rest = levels.filter((l) => l.id !== id).map((l) => ({ id: l.id, stageName: l.stageName }));
    const at = beforeId ? rest.findIndex((l) => l.id === beforeId) : rest.map((l) => l.stageName).lastIndexOf(stageName) + 1;
    rest.splice(at < 0 ? rest.length : at, 0, { id, stageName });
    reorder(rest);
  };
  const moveLesson = (from: string, i: number, to: string, before: number | null) => {
    const src = levels.find((l) => l.id === from)!;
    const topic = src.subtopics[i];
    const srcTopics = src.subtopics.filter((_, j) => j !== i);
    const dst = from === to ? srcTopics : [...levels.find((l) => l.id === to)!.subtopics];
    const at = before == null ? dst.length : before - (from === to && before > i ? 1 : 0);
    dst.splice(at, 0, topic);
    if (from !== to) board(`/${from}`, "PATCH", { subtopics: srcTopics });
    board(`/${to}`, "PATCH", { subtopics: dst });
  };
  /** One handler for every drop: `level:<id>` cards and `lesson:<levelId>:<index>` chips. */
  const onDrop = (stageName: string, levelId: string | null, before: number | null) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    const [kind, id, idx] = e.dataTransfer.getData("text/plain").split(":");
    if (kind === "level" && id !== levelId) moveLevel(id, stageName, levelId);
    if (kind === "lesson" && levelId) moveLesson(id, Number(idx), levelId, before);
  };
  const hover = (key: string) => (e: React.DragEvent) => (e.preventDefault(), e.stopPropagation(), setOver(key));
  const commit = (l: CurriculumLevelDoc, patch: Partial<Pick<CurriculumLevelDoc, "title" | "emoji" | "subtopics">>) => {
    if (Object.entries(patch).some(([k, v]) => JSON.stringify(v) !== JSON.stringify(l[k as keyof CurriculumLevelDoc]))) board(`/${l.id}`, "PATCH", patch);
  };
  const renameStage = (from: string) => {
    const to = prompt("Stage name", from)?.trim();
    if (to && to !== from) reorder(levels.map((l) => ({ id: l.id, stageName: l.stageName === from ? to : l.stageName })));
  };

  if (!levels.length) return <Empty text="No curriculum yet." action="Add a stage" onAction={() => board("", "POST", { stageName: "Stage 1" })} />;

  return (
    <div className="col" style={{ gap: 28 }}>
      <p className="callout muted" style={{ margin: 0, maxWidth: 720 }}>
        Your syllabus, separate from the groups. Click any text to edit it. Drag lessons between levels and drag level cards to reorder them or move them to another stage.
      </p>
      {stages.map((stage, si) => {
        const tint = TINTS[si % TINTS.length];
        const own = levels.filter((l) => l.stageName === stage);
        return (
          <section key={stage} className="col" style={{ gap: 12 }} onDragOver={hover("stage:" + stage)} onDrop={onDrop(stage, null, null)}>
            <div className="row">
              <span className="sb-dot" style={{ background: tint, width: 10, height: 10 }} />
              <button className="headline" onClick={() => renameStage(stage)} title="Rename stage">
                {stage}
              </button>
              <span className="caption faint">
                Levels {own[0]?.levelNumber}–{own.at(-1)?.levelNumber}
              </span>
            </div>
            <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", paddingTop: 0, outline: over === "stage:" + stage ? `2px dashed ${tint}` : undefined, outlineOffset: 6, borderRadius: "var(--r-card)" }}>
              {own.map((l) => {
                const c = l.color ?? tint;
                return (
                  <article
                    key={l.id}
                    className="card col"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", `level:${l.id}`)}
                    onDragOver={hover("level:" + l.id)}
                    onDragLeave={() => setOver(null)}
                    onDrop={onDrop(stage, l.id, null)}
                    style={{ gap: 10, padding: 16, cursor: "grab", borderTop: `3px solid ${c}`, boxShadow: over === "level:" + l.id ? `0 0 0 2px ${c}` : undefined }}
                  >
                    <div className="row" style={{ gap: 8 }}>
                      <input key={l.emoji} className="input-bare" style={{ width: 28, fontSize: 20 }} defaultValue={l.emoji} aria-label="Level emoji" onBlur={(e) => commit(l, { emoji: e.target.value })} />
                      <span className="display-m" style={{ color: c }}>
                        {l.levelNumber}
                      </span>
                      <input key={l.title} className="input-bare headline grow" defaultValue={l.title} aria-label="Level title" onBlur={(e) => commit(l, { title: e.target.value.trim() || l.title })} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
                      <button
                        className="icon-btn"
                        aria-label={`More for level ${l.levelNumber}`}
                        onClick={(e) =>
                          drop(e, [
                            ...stages.filter((x) => x !== stage).map((x) => ({ label: `Move to ${x}`, onClick: () => moveLevel(l.id, x, null) })),
                            { sep: true, label: "" },
                            { label: "Delete level", danger: true, onClick: () => confirm(`Delete level ${l.levelNumber} · ${l.title}?`) && board(`/${l.id}`, "DELETE") },
                          ])
                        }
                      >
                        <DotsThree size={18} />
                      </button>
                    </div>
                    <div className="col" style={{ gap: 4 }}>
                      {l.subtopics.map((t, i) => (
                        <div
                          key={`${t}-${i}`}
                          className="row"
                          draggable
                          onDragStart={(e) => (e.stopPropagation(), e.dataTransfer.setData("text/plain", `lesson:${l.id}:${i}`))}
                          onDragOver={hover(`lesson:${l.id}:${i}`)}
                          onDrop={onDrop(stage, l.id, i)}
                          style={{ gap: 6, padding: "4px 8px", borderRadius: "var(--r-ctl)", background: "var(--bg-sunken)", cursor: "grab", borderTop: over === `lesson:${l.id}:${i}` ? `2px solid ${c}` : "2px solid transparent" }}
                        >
                          <DotsSixVertical size={14} className="faint" />
                          <input className="input-bare callout grow" defaultValue={t} aria-label="Lesson" onBlur={(e) => commit(l, { subtopics: l.subtopics.map((x, j) => (j === i ? e.target.value.trim() || x : x)) })} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
                          <button className="icon-btn" style={{ width: 22, height: 22 }} aria-label={`Remove ${t}`} onClick={() => commit(l, { subtopics: l.subtopics.filter((_, j) => j !== i) })}>
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <input
                        className="input-bare callout"
                        style={{ padding: "4px 8px" }}
                        placeholder="+ Add a lesson"
                        aria-label={`Add a lesson to level ${l.levelNumber}`}
                        onKeyDown={(e) => {
                          const v = e.currentTarget.value.trim();
                          if (e.key === "Enter" && v) {
                            commit(l, { subtopics: [...l.subtopics, v] });
                            e.currentTarget.value = "";
                          }
                        }}
                      />
                    </div>
                  </article>
                );
              })}
              <button className="card col" style={{ placeItems: "center", justifyContent: "center", minHeight: 120, borderStyle: "dashed", color: "var(--text-3)", boxShadow: "none" }} onClick={() => board("", "POST", { stageName: stage })}>
                <Plus size={18} /> Add level
              </button>
            </div>
          </section>
        );
      })}
      <button
        className="btn"
        style={{ alignSelf: "flex-start" }}
        onClick={() => {
          const name = prompt("New stage name")?.trim();
          if (name) board("", "POST", { stageName: name });
        }}
      >
        <Plus size={14} /> Add stage
      </button>
    </div>
  );
}
