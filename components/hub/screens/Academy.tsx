"use client";

/**
 * Academy (§5.5): the group board is the focal point; students (payments,
 * parents), groups (members, schedule) and the curriculum board.
 * Groups and curriculum are deliberately separate: planning which lesson a
 * group does lives in the Keeds app.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Clock, MagnifyingGlass, PencilSimple, Plus, X, UsersThree, DotsThree, DotsSixVertical } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { capacity, currentTeachingHours, DAYS, freeSeats, groupStatus, hoursAtTarget, lifecycle, members, mrr, PRICE, scheduleLabel, seatsNeeded, studentsToTarget, tenureMonths, payingStudents, CAPACITY, type Lifecycle } from "@/lib/hub/metrics";
import { studentPaymentStatus, PAYMENT_STATUS_LABEL } from "@/lib/studentStatus";
import { monthKey } from "@/lib/hub/util";
import { toast } from "@/lib/hub/fx";
import { authFetch } from "@/lib/firebase/authFetch";
import type { GroupStatus } from "@/lib/hub/types";
import type { CurriculumLevelDoc, GroupDoc } from "@/lib/types";
import { Toolbar, useShell } from "../Shell";
import { StudentBody } from "../Inspector";
import { Select, Avatar, Fade, Kpi, Progress, Segmented, Empty, spring, useDropdown } from "../ui";

type Tab = "students" | "groups" | "curriculum";

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
          <GroupBoard selected={tab === "groups" ? groupId : null} onOpen={(id) => (setGroupId(id), router.replace(`/academy?tab=groups&group=${id}`, { scroll: false }))} />
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
                  <span className="callout muted">have {live.groups.filter((g) => groupStatus(s, g.id) !== "closed").length}</span>
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
              {free} seats left to fill. Scaling ads past {need} enrolments needs {Math.max(0, hoursAtTarget() - Math.round(nowH))} more teaching hours a week. Kommo lead counts arrive in Phase 3.
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

/* ---------------------------------------------------------------- group board */

const LEVELS = ["Beginner", "Intermediate", "Advanced"];
const AGE_BANDS = ["7-10", "11-14"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];

async function setStudentGroup(id: string, classGroup: string): Promise<void> {
  const r = await authFetch(`/api/students/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classGroup }) }).catch(() => null);
  if (!r?.ok) toast(r?.status === 401 ? "Sign in to change who’s in a group" : "That didn’t save. Try again.");
}

/**
 * The source of truth for capacity: one card per group, ordered by time. An
 * open slot is simply a group set to "filling", so there is no slot list to
 * keep in sync, and seats are always counted from real members.
 */
function GroupBoard({ selected, onOpen }: { selected: string | null; onOpen: (id: string) => void }) {
  const s = useHub();
  const live = useLive();
  const { inspect } = useShell();
  const firstClass = (id: string) => s.groupMeta[id]?.slots?.[0]?.start ?? "99";
  const shown = live.groups.filter((g) => groupStatus(s, g.id) !== "closed").sort((a, b) => firstClass(a.id).localeCompare(firstClass(b.id)) || a.name.localeCompare(b.name));
  const closed = live.groups.filter((g) => groupStatus(s, g.id) === "closed");
  const names = new Set(live.groups.map((g) => g.name.trim().toLowerCase()));
  const noGroup = live.students.filter((x) => x.status === "active" && !names.has((x.classGroup ?? "").trim().toLowerCase()));

  const addGroup = async () => {
    const letter = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((l) => !names.has(`group ${l.toLowerCase()}`));
    const r = await authFetch("/api/board/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Group ${letter}` }) }).catch(() => null);
    if (!r?.ok) return toast(r?.status === 401 ? "Sign in to add a group" : "That didn’t save. Try again.");
    A.setGroupMeta((await r.json()).id, { status: "filling", capacity: CAPACITY });
  };

  return (
    <>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))" }}>
        {shown.map((g) => (
          <GroupCard key={g.id} g={g} selected={selected === g.id} onOpen={() => onOpen(g.id)} />
        ))}
        <button className="card col" style={{ placeItems: "center", justifyContent: "center", minHeight: 120, borderStyle: "dashed", color: "var(--text-3)", boxShadow: "none" }} onClick={addGroup}>
          <Plus size={18} /> New group
        </button>
      </div>
      {noGroup.length + closed.length > 0 && (
        <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
          {noGroup.length > 0 && <span className="caption muted">Not in a group:</span>}
          {noGroup.map((x) => (
            <button key={x.id} className="chip" onClick={() => inspect({ kind: "student", id: x.id })}>
              {x.name}
            </button>
          ))}
          {closed.length > 0 && <span className="caption muted">Closed:</span>}
          {closed.map((g) => (
            <button key={g.id} className="chip" title="Set back to running" onClick={() => A.setGroupMeta(g.id, { status: "running" })}>
              {g.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function GroupCard({ g, selected, onOpen }: { g: GroupDoc; selected: boolean; onOpen: () => void }) {
  const s = useHub();
  const live = useLive();
  const { inspect } = useShell();
  const drop = useDropdown();
  const meta = s.groupMeta[g.id] ?? {};
  const slots = meta.slots ?? [];
  const [editing, setEditing] = useState(!slots.length);
  const mem = members(g, live.students);
  const cap = capacity(s, g.id);
  const open = cap - mem.length;
  const when = scheduleLabel(slots);
  const late = mem.filter((x) => studentPaymentStatus(x.nextPayment) === "late").length;
  const first = slots[0] ?? { start: "22:00", minutes: 60 };
  const seatTaker = (e: React.MouseEvent) => {
    const others = live.students.filter((x) => x.status === "active" && !mem.includes(x)).sort((a, b) => Number(!!a.classGroup) - Number(!!b.classGroup) || a.name.localeCompare(b.name));
    drop(e, others.length ? others.map((x) => ({ label: x.name, hint: x.classGroup || "No group", onClick: () => setStudentGroup(x.id, g.name) })) : [{ label: "No active students to add" }]);
  };

  return (
    <article className="card col" style={{ gap: 12, ...(selected ? { boxShadow: "0 0 0 2px var(--accent)" } : {}) }}>
      <div className="row">
        <button className="headline grow" style={{ textAlign: "left" }} onClick={onOpen}>
          {g.name}
        </button>
        <Select className="select" style={{ width: 124 }} aria-label={`${g.name} status`} value={groupStatus(s, g.id)} onChange={(e) => A.setGroupMeta(g.id, { status: e.target.value as GroupStatus })}>
          <option value="filling">Filling</option>
          <option value="running">Running</option>
          <option value="closed">Closed</option>
        </Select>
      </div>
      <button className="row callout" style={{ textAlign: "left", gap: 6, color: when ? undefined : "var(--warning-ink)" }} aria-expanded={editing} onClick={() => setEditing(!editing)}>
        <Clock size={14} className="faint" />
        <span className="grow">{when || "No time set"}</span>
        <PencilSimple size={14} className="faint" />
      </button>
      {editing && (
        <div className="col" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 4, flexWrap: "wrap" }} role="group" aria-label="Class days">
            {WEEK.map((n) => {
              const on = slots.some((x) => x.day === n);
              return (
                <button key={n} className={`chip ${on ? "accent" : ""}`} aria-pressed={on} onClick={() => A.setGroupMeta(g.id, { slots: on ? slots.filter((x) => x.day !== n) : [...slots, { day: n, start: first.start, minutes: first.minutes }] })}>
                  {DAYS[n]}
                </button>
              );
            })}
          </div>
          <div className="row">
            <input className="input" type="time" style={{ width: 130 }} aria-label="Start time" disabled={!slots.length} value={first.start} onChange={(e) => e.target.value && A.setGroupMeta(g.id, { slots: slots.map((x) => ({ ...x, start: e.target.value })) })} />
            <input className="input" type="number" min={15} step={15} style={{ width: 80 }} aria-label="Minutes" disabled={!slots.length} value={first.minutes} onChange={(e) => A.setGroupMeta(g.id, { slots: slots.map((x) => ({ ...x, minutes: Number(e.target.value) || 60 })) })} />
            <span className="caption muted">min</span>
          </div>
        </div>
      )}
      <div className="row">
        <Select className="select grow" style={{ minWidth: 0 }} aria-label={`${g.name} level`} value={meta.level ?? ""} onChange={(e) => A.setGroupMeta(g.id, { level: e.target.value })}>
          <option value="">Any level</option>
          {LEVELS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
        <Select className="select grow" style={{ minWidth: 0 }} aria-label={`${g.name} age band`} value={meta.ageBand ?? ""} onChange={(e) => A.setGroupMeta(g.id, { ageBand: e.target.value })}>
          <option value="">Any age</option>
          {AGE_BANDS.map((x) => (
            <option key={x} value={x}>
              Age {x}
            </option>
          ))}
        </Select>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {mem.map((x) => (
          <motion.button key={x.id} layout transition={spring.ui} initial={{ scale: 0.6 }} animate={{ scale: 1 }} title={x.name} aria-label={`${x.name}, seat options`} onClick={(e) => drop(e, [{ label: "Open student", onClick: () => inspect({ kind: "student", id: x.id }) }, { label: `Remove from ${g.name}`, danger: true, onClick: () => setStudentGroup(x.id, "") }])}>
            <Avatar name={x.name} src={x.photoUrl} />
          </motion.button>
        ))}
        {Array.from({ length: Math.max(0, open) }, (_, i) => (
          <motion.button key={i} layout transition={spring.ui} className="seat-add" aria-label={`Add a student to ${g.name}`} onClick={seatTaker}>
            <Plus size={14} />
          </motion.button>
        ))}
        <span className="spacer" />
        <label className="row caption muted" style={{ gap: 4 }}>
          {mem.length} /
          <input className="input" type="number" min={1} style={{ width: 56 }} aria-label={`${g.name} capacity`} value={cap} onChange={(e) => A.setGroupMeta(g.id, { capacity: Number(e.target.value) || CAPACITY })} />
        </label>
      </div>
      <div className="row">
        <span className="callout" style={{ fontWeight: 500, color: open > 0 ? "var(--warning-ink)" : "var(--success-ink)" }}>
          {seatsNeeded(g, live.students, s)}
        </span>
        <span className="spacer" />
        <span className="caption muted">
          ${mem.length * PRICE}/mo{late ? ` · ${late} late` : ""}
        </span>
      </div>
    </article>
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
            <Select className="select" style={{ width: 90 }} value={sl.day} onChange={(e) => A.setGroupMeta(g.id, { slots: slots.map((x, j) => (j === i ? { ...x, day: Number(e.target.value) } : x)) })}>
              {DAYS.map((d, n) => (
                <option key={d} value={n}>
                  {d}
                </option>
              ))}
            </Select>
            <input className="input" type="time" style={{ width: 130 }} value={sl.start} onChange={(e) => A.setGroupMeta(g.id, { slots: slots.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
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
        Your syllabus. Click to edit, drag to reorder.
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
