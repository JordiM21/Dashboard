"use client";

/** Academy (§5.5): capacity strip is the focal point; students list + detail, groups, curriculum track, lessons. */
import { Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardText, MagnifyingGlass, Plus, X, FileText, Image as ImageIcon, UsersThree, ArrowSquareOut } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { capacity, currentTeachingHours, freeSeats, hoursAtTarget, lifecycle, members, mrr, PRICE, studentsToTarget, tenureMonths, payingStudents, CAPACITY, type Lifecycle } from "@/lib/hub/metrics";
import { studentPaymentStatus, PAYMENT_STATUS_LABEL } from "@/lib/studentStatus";
import { formatDateDMY, monthKey, relDay } from "@/lib/hub/util";
import type { GroupDoc } from "@/lib/types";
import { Toolbar, useShell } from "../Shell";
import { StudentBody } from "../Inspector";
import { Avatar, Fade, Kpi, Progress, Segmented, Empty } from "../ui";

type Tab = "students" | "groups" | "curriculum" | "lessons";
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
  const { lessonLog } = useShell();
  const tab = (params.get("tab") as Tab) ?? (params.get("group") ? "groups" : "students");
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
        <Segmented label="Section" size="sm" value={tab} onChange={setTab} options={[{ value: "students", label: "Students", count: live.students.length }, { value: "groups", label: "Groups" }, { value: "curriculum", label: "Curriculum" }, { value: "lessons", label: "Lessons" }]} />
        <button className="btn" onClick={() => lessonLog()}>
          <ClipboardText size={16} /> Log lesson
        </button>
      </Toolbar>
      <Fade className="canvas">
        <section aria-label="Capacity" style={{ marginBottom: 28 }}>
          <div className="row" style={{ marginBottom: 12, alignItems: "baseline" }}>
            <h1 className="display-xl">Academy</h1>
            <span className="spacer" />
            <span className="display-l">{free}</span>
            <span className="callout muted">free seats · ${free * PRICE} MRR waiting to be filled</span>
          </div>
          <div className="grid-cards" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(live.groups.length, 1), 6)}, minmax(0, 1fr))`, paddingTop: 0 }}>
            {live.groups.map((g) => {
              const mem = members(g, live.students);
              const cap = capacity(s, g.id);
              const lvl = live.curriculum.find((l) => l.levelNumber === g.currentLevel);
              return (
                <button key={g.id} className="card hoverable col" style={{ textAlign: "left", gap: 10, ...(groupId === g.id && tab === "groups" ? { boxShadow: "0 0 0 2px var(--accent)" } : {}) }} onClick={() => (setGroupId(g.id), router.replace(`/academy?tab=groups&group=${g.id}`, { scroll: false }))}>
                  <div className="row">
                    <span className="headline grow">{g.name}</span>
                    <span className="caption muted">Lv {g.currentLevel}</span>
                  </div>
                  <div className="row" style={{ gap: 5 }} aria-label={`${mem.length} of ${cap} seats`}>
                    {Array.from({ length: cap }, (_, i) => (
                      <span key={i} className="seat" data-on={i < mem.length} />
                    ))}
                    <span className="caption muted" style={{ marginLeft: 4 }}>
                      {mem.length}/{cap}
                    </span>
                  </div>
                  <span className="callout muted truncate">{g.currentTopic}</span>
                  {lvl && <span className="caption faint truncate">{lvl.title}</span>}
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
          {tab === "curriculum" && <Curriculum focusGroup={params.get("group")} />}
          {tab === "lessons" && <Lessons />}
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
  const selected = list.find((r) => r.x.id === sel)?.x.id ?? list[0]?.x.id;
  const count = (v: Lifecycle) => live.students.filter((x) => lifecycle(x, s.studentMeta[x.id]) === v).length;

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
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
            <button key={x.id} className="ld-row" role="option" aria-selected={x.id === selected} onClick={() => setSel(x.id)}>
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
  const { inspect, lessonLog } = useShell();
  const g = live.groups.find((x) => x.id === groupId);
  if (!g) return <Empty text="No groups yet." />;
  const mem = members(g, live.students);
  const lvl = live.curriculum.find((l) => l.levelNumber === g.currentLevel);
  const covered = new Set([...s.lessons.filter((l) => l.groupId === g.id).map((l) => l.topic), ...live.plans.filter((p) => p.groupId === g.id && p.historyEntryId).map((p) => p.topic)]);
  const topics = lvl?.subtopics ?? [];
  const pct = topics.length ? topics.filter((t) => covered.has(t)).length / topics.length : 0;
  const meta = s.groupMeta[g.id] ?? {};
  const slots = meta.slots ?? [];
  const logs = s.lessons.filter((l) => l.groupId === g.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);

  return (
    <div className="bento">
      <section className="card span-7">
        <div className="card-head">
          <UsersThree size={18} className="faint" />
          <h2 className="title">{g.name}</h2>
          <span className="spacer" />
          <button className="btn btn-sm" onClick={() => lessonLog(g.id)}>
            <ClipboardText size={14} /> Log lesson
          </button>
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="callout">
            Level {g.currentLevel}
            {lvl ? ` · ${lvl.title}` : ""} — <b>{Math.round(pct * 100)}%</b> of level covered
          </span>
        </div>
        <Progress value={pct} label="Level covered" />
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {topics.map((t) => (
            <span key={t} className={`chip ${covered.has(t) ? "success" : t === g.currentTopic ? "accent" : ""}`}>
              {t}
            </span>
          ))}
        </div>
        <hr className="divider" style={{ margin: "18px 0" }} />
        <div className="label" style={{ marginBottom: 8 }}>
          Members · {mem.length}/{capacity(s, g.id)}
        </div>
        {mem.map((x) => (
          <button key={x.id} className="ld-row" onClick={() => inspect({ kind: "student", id: x.id })}>
            <Avatar name={x.name} src={x.photoUrl} />
            <span className="grow" style={{ textAlign: "left" }}>
              {x.name}
            </span>
            <span className="caption muted">{PAYMENT_STATUS_LABEL[studentPaymentStatus(x.nextPayment)]}</span>
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
        <hr className="divider" />
        <div className="headline">Recent lessons</div>
        {logs.length === 0 && <span className="callout faint">No lessons logged in v2 yet.</span>}
        {logs.map((l) => {
          const n = Object.values(l.attendance).length;
          const here = Object.values(l.attendance).filter(Boolean).length;
          return (
            <div key={l.id} className="row callout" style={{ minHeight: 26 }}>
              <span className="faint" style={{ width: 86 }}>
                {formatDateDMY(l.date)}
              </span>
              <span className="grow truncate">{l.topic}</span>
              <span className="caption muted">
                {here}/{n}
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- curriculum */

function Curriculum({ focusGroup }: { focusGroup: string | null }) {
  const s = useHub();
  const live = useLive();
  const levels = [...live.curriculum].sort((a, b) => a.levelNumber - b.levelNumber);
  const [open, setOpen] = useState<string | null>(null);
  const focus = live.groups.find((g) => g.id === focusGroup);
  useEffect(() => {
    if (focus) setOpen(`${focus.currentLevel}:${focus.currentTopic}`);
    document.getElementById(`lvl-${focus?.currentLevel}`)?.scrollIntoView({ block: "center" });
  }, [focus]);

  const coverage = (topic: string) => {
    const out: { group: GroupDoc; date: string }[] = [];
    for (const g of live.groups) {
      const dates = [...s.lessons.filter((l) => l.groupId === g.id && l.topic === topic).map((l) => l.date), ...live.plans.filter((p) => p.groupId === g.id && p.topic === topic && p.historyEntryId).map((p) => p.date.slice(0, 10))].sort();
      if (dates.length) out.push({ group: g, date: dates.at(-1)! });
    }
    return out;
  };
  const resources = (topic: string) => live.files.filter((f) => f.tags.some((t) => t.toLowerCase() === topic.toLowerCase()));

  return (
    <div className="card" style={{ padding: "8px 24px" }}>
      {levels.map((l, i) => {
        const here = live.groups.filter((g) => g.currentLevel === l.levelNumber);
        const stage = i === 0 || levels[i - 1].stageName !== l.stageName;
        return (
          <div key={l.id} id={`lvl-${l.levelNumber}`}>
            {stage && <div className="label" style={{ padding: "18px 0 8px" }}>{l.stageName}</div>}
            <div className="row" style={{ alignItems: "flex-start", gap: 16, padding: "10px 0" }}>
              <div className="col" style={{ alignItems: "center", gap: 0, width: 36 }}>
                <span className="display-m" style={{ color: here.length ? "var(--accent)" : "var(--text-3)" }}>
                  {l.levelNumber}
                </span>
              </div>
              <div className="grow col" style={{ gap: 4 }}>
                <div className="row">
                  <span className="headline">{l.title}</span>
                  {here.map((g) => (
                    <span key={g.id} className="chip accent">
                      {g.name}
                    </span>
                  ))}
                </div>
                {l.subtopics.map((t) => {
                  const cov = coverage(t);
                  const res = resources(t);
                  const key = `${l.levelNumber}:${t}`;
                  return (
                    <div key={t}>
                      <button className="task-row" style={{ width: "100%", minHeight: 36 }} onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
                        <span className="grow" style={{ textAlign: "left" }}>
                          {t}
                        </span>
                        {cov.map((c) => (
                          <span key={c.group.id} className="caption muted" title={`Covered ${formatDateDMY(c.date)}`}>
                            {c.group.name.replace("Group ", "")} · {relDay(c.date)}
                          </span>
                        ))}
                        <span className="chip">
                          <FileText size={12} /> {res.length}
                        </span>
                      </button>
                      {open === key && (
                        <div className="tile" style={{ margin: "4px 0 8px 10px" }}>
                          {res.length === 0 && <span className="callout faint">No resources tagged “{t}”. Tag files in the library to link them here.</span>}
                          {res.map((f) => (
                            <a key={f.id} className="row callout task-row" style={{ minHeight: 32 }} href={`/api/resources/files/${f.id}/content`} target="_blank" rel="noreferrer">
                              {f.mimeType.startsWith("image") ? <ImageIcon size={16} /> : <FileText size={16} />}
                              <span className="grow">{f.title}</span>
                              <ArrowSquareOut size={14} className="faint" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- lessons */

function Lessons() {
  const s = useHub();
  const live = useLive();
  const rows = [...s.lessons].filter((l) => !l.archivedAt).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60);
  return (
    <div className="card" style={{ padding: 8 }}>
      <table className="table">
        <thead>
          <tr>
            <th className="label">Date</th>
            <th className="label">Group</th>
            <th className="label">Topic</th>
            <th className="label num">Attendance</th>
            <th className="label">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const v = Object.values(l.attendance);
            return (
              <tr key={l.id}>
                <td>{formatDateDMY(l.date)}</td>
                <td>{live.groups.find((g) => g.id === l.groupId)?.name ?? "—"}</td>
                <td>{l.topic}</td>
                <td className="num">
                  {v.filter(Boolean).length}/{v.length}
                </td>
                <td className="muted truncate" style={{ maxWidth: 280 }}>
                  {l.notes}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <Empty text="No lessons logged yet." />}
    </div>
  );
}

