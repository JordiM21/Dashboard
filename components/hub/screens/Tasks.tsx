"use client";

/** Tasks (§5.3 rebuild): Projects · List · Board · Week. The list itself is the focal point. */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { sfx } from "@/lib/hub/sound";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CaretLeft, CaretRight, CaretDown, Plus, Warning, X, Kanban } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import * as A from "@/lib/hub/actions";
import { taskXp } from "@/lib/hub/game";
import { projectProgress } from "@/lib/hub/metrics";
import { addDays, dayName, dayOf, formatDateDMY, monthName, relDay, today, weekStart } from "@/lib/hub/util";
import type { Task, TaskStatus } from "@/lib/hub/types";
import { Toolbar, useArea, useShell } from "../Shell";
import TaskRow, { rowMotion, useTaskMenu } from "../TaskRow";
import { AreaDot, Empty, Fade, IconByName, Progress, Segmented, useDrop, useDropdown, useLongPress, useCoarse } from "../ui";
import { coverCss } from "../Customize";

type View = "projects" | "list" | "board" | "week";
interface Filters {
  status: "open" | "done" | "all";
  priority: 0 | 1 | 2 | 3;
  project: string; // "" = any
}
const DEFAULT: Filters = { status: "open", priority: 0, project: "" };

/** Saved filters persist per view on this device. */
function useFilters(view: View): [Filters, (f: Partial<Filters>) => void] {
  const [f, setF] = useState<Filters>(DEFAULT);
  useEffect(() => {
    try {
      setF({ ...DEFAULT, ...JSON.parse(localStorage.getItem(`hub:filters:${view}`) ?? "{}") });
    } catch {
      setF(DEFAULT);
    }
  }, [view]);
  return [
    f,
    (p) =>
      setF((cur) => {
        const next = { ...cur, ...p };
        try {
          localStorage.setItem(`hub:filters:${view}`, JSON.stringify(next));
        } catch {}
        return next;
      }),
  ];
}

export default function Tasks() {
  const s = useHub();
  const view = s.ui.taskView;
  const [f, setF] = useFilters(view);
  const { match } = useArea();
  const drop = useDropdown();

  const tasks = useMemo(
    () =>
      s.tasks.filter(
        (t) =>
          !t.archivedAt &&
          t.status !== "dropped" &&
          t.status !== "inbox" &&
          match(t.areaId) &&
          (f.status === "all" || (f.status === "done" ? t.status === "done" : t.status !== "done") || view === "board") &&
          (!f.priority || t.priority === f.priority) &&
          (!f.project || t.projectId === f.project)
      ),
    [s.tasks, match, f, view]
  );
  const active = (f.status !== "open" ? 1 : 0) + (f.priority ? 1 : 0) + (f.project ? 1 : 0);
  const projectName = s.projects.find((p) => p.id === f.project)?.title;

  return (
    <>
      <Toolbar title="Tasks">
        <Segmented
          label="View"
          size="sm"
          value={view}
          onChange={(v) => A.setUi({ taskView: v })}
          options={[
            { value: "projects", label: "Projects" },
            { value: "list", label: "List" },
            { value: "board", label: "Board" },
            { value: "week", label: "Week" },
          ]}
        />
      </Toolbar>
      <div className="canvas">
        <p className="callout muted" style={{ margin: "0 0 16px", maxWidth: 720 }}>
          {view === "projects" ? (
            <>Things you deliver, made of tasks. Done when its tasks are.</>
          ) : (
            <>What you’ve decided to do. A day is optional.</>
          )}
        </p>
        {view !== "projects" && (
          <div className="row" style={{ marginBottom: 20, flexWrap: "wrap" }}>
            {view !== "board" && (
              <button className="filter-pill" data-active={f.status !== "open"} onClick={(e) => drop(e, (["open", "done", "all"] as const).map((v) => ({ label: v[0].toUpperCase() + v.slice(1), hint: f.status === v ? "✓" : "", onClick: () => setF({ status: v }) })))}>
                Status: <b>{f.status[0].toUpperCase() + f.status.slice(1)}</b> <CaretDown size={12} />
              </button>
            )}
            <button className="filter-pill" data-active={!!f.priority} onClick={(e) => drop(e, ([0, 1, 2, 3] as const).map((v) => ({ label: v ? `P${v}` : "Any", hint: f.priority === v ? "✓" : "", onClick: () => setF({ priority: v }) })))}>
              Priority: <b>{f.priority ? `P${f.priority}` : "Any"}</b> <CaretDown size={12} />
            </button>
            <button
              className="filter-pill"
              data-active={!!f.project}
              onClick={(e) => drop(e, [{ label: "Any project", onClick: () => setF({ project: "" }) }, ...s.projects.filter((p) => !p.archivedAt && match(p.areaId)).map((p) => ({ label: p.title, hint: f.project === p.id ? "✓" : "", onClick: () => setF({ project: p.id }) }))])}
            >
              Project: <b className="truncate" style={{ maxWidth: 160 }}>{projectName ?? "Any"}</b> <CaretDown size={12} />
            </button>
            {active > 0 && (
              <>
                <span className="badge-count">{active}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => setF(DEFAULT)}>
                  <X size={12} /> Clear
                </button>
              </>
            )}
            <span className="spacer" />
            {view === "list" && (
              <Segmented label="Group by" size="sm" value={s.ui.listGroup} onChange={(v) => A.setUi({ listGroup: v })} options={[{ value: "area", label: "Area" }, { value: "project", label: "Project" }, { value: "date", label: "Date" }]} />
            )}
          </div>
        )}
        <Fade k={view}>
          {view === "list" && <ListView tasks={tasks} />}
          {view === "board" && <BoardView tasks={tasks} />}
          {view === "week" && <WeekView tasks={tasks} />}
          {view === "projects" && <ProjectsView />}
        </Fade>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- list */

function dateBucket(t: Task): [number, string] {
  const d = t.status === "done" ? dayOf(t.completedAt) : t.scheduled ?? t.due;
  const t0 = today();
  if (!d) return [6, "No date"];
  if (t.status === "done") return [d === t0 ? 1 : 0, d === t0 ? "Done today" : "Done earlier"];
  if (d < t0) return [0, "Overdue"];
  if (d === t0) return [1, "Today"];
  if (d === addDays(t0, 1)) return [2, "Tomorrow"];
  if (d < addDays(weekStart(), 7)) return [3, "This week"];
  if (d < addDays(weekStart(), 14)) return [4, "Next week"];
  return [5, "Later"];
}

function ListView({ tasks }: { tasks: Task[] }) {
  const s = useHub();
  const by = s.ui.listGroup;
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; label: ReactNode; order: number; items: Task[] }>();
    for (const t of tasks) {
      let key: string, label: ReactNode, order: number;
      if (by === "area") {
        const a = s.areas.find((x) => x.id === t.areaId);
        key = t.areaId;
        order = a?.sort ?? 99;
        label = (
          <>
            <AreaDot area={a} /> {a?.name}
          </>
        );
      } else if (by === "project") {
        const p = s.projects.find((x) => x.id === t.projectId);
        key = t.projectId ?? "none";
        order = p ? 0 : 1;
        label = p ? <Link href={`/tasks/p/${p.id}`}>{p.title}</Link> : "No project";
      } else {
        const [o, l] = dateBucket(t);
        key = l;
        order = o;
        label = l;
      }
      if (!m.has(key)) m.set(key, { key, label, order, items: [] });
      m.get(key)!.items.push(t);
    }
    return [...m.values()].sort((a, b) => a.order - b.order).map((g) => ({ ...g, items: g.items.sort((a, b) => a.priority - b.priority || (a.scheduled ?? a.due ?? "9").localeCompare(b.scheduled ?? b.due ?? "9")) }));
  }, [tasks, by, s.areas, s.projects]);

  if (!tasks.length) return <Empty text="No tasks match these filters." />;
  return (
    <div className="card" style={{ padding: "16px 12px" }}>
      {groups.map((g) => (
        <section key={g.key} className="list-group">
          <div className="list-group-head">
            <span className="headline row" style={{ gap: 8 }}>
              {g.label}
            </span>
            <span className="caption faint">{g.items.length}</span>
          </div>
          <AnimatePresence initial={false}>
            {g.items.map((t) => (
              <motion.div key={t.id} {...rowMotion}>
                <TaskRow t={t} showProject={by !== "project"} />
              </motion.div>
            ))}
          </AnimatePresence>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- board */

const COLS: { status: TaskStatus; label: string }[] = [
  { status: "next", label: "Next" },
  { status: "doing", label: "Doing" },
  { status: "waiting", label: "Waiting" },
  { status: "done", label: "Done" },
];

function TaskCard({ t, style }: { t: Task; style?: CSSProperties }) {
  const s = useHub();
  const { inspect } = useShell();
  const menu = useTaskMenu();
  const pressed = useRef<Task | null>(null);
  const lp = useLongPress((pt) => {
    if (!pressed.current) return;
    sfx.open();
    menu(pt, pressed.current);
  });
  const press = (t: Task) => ({ ...lp, onPointerDown: (e: React.PointerEvent) => ((pressed.current = t), lp.onPointerDown(e)) });
  const a = s.areas.find((x) => x.id === t.areaId);
  const p = s.projects.find((x) => x.id === t.projectId);
  return (
    <motion.button
      layout
      layoutId={"card" + t.id}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className="board-card"
      draggable
      onDragStart={(e) => (e as unknown as React.DragEvent).dataTransfer.setData("text/plain", t.id)}
      onClick={() => inspect({ kind: "task", id: t.id })}
      onContextMenu={(e) => menu(e, t)}
      {...press(t)}
      style={{ "--c": a?.color, ...style } as CSSProperties}
    >
      <span style={{ fontWeight: 500, ...(t.status === "done" ? { color: "var(--text-3)", textDecoration: "line-through" } : {}) }}>{t.title}</span>
      <span className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        <span className={`chip ${t.priority === 1 ? "danger" : ""}`}>P{t.priority}</span>
        {(t.due ?? t.scheduled) && <span className="caption muted">{relDay(t.due ?? t.scheduled)}</span>}
        {t.estimate ? <span className="caption faint">{t.estimate}m</span> : null}
        {t.status === "waiting" && t.waitingOn && <span className="caption" style={{ color: "var(--warning-ink)" }}>{t.waitingOn}</span>}
      </span>
      {p && <span className="caption faint truncate">{p.title}</span>}
    </motion.button>
  );
}

function BoardCol({ status, label, tasks }: { status: TaskStatus; label: string; tasks: Task[] }) {
  const [all, setAll] = useState(false);
  const { over, props } = useDrop((id) => (status === "done" ? A.completeTask(id) : A.updateTask(id, { status, completedAt: null })));
  const shown = status === "done" && !all ? tasks.slice(0, 5) : tasks;
  return (
    <div className="board-col" data-over={over} {...props}>
      <div className="row" style={{ padding: "2px 4px 4px" }}>
        <span className="headline">{label}</span>
        <span className="caption faint">{tasks.length}</span>
      </div>
      <AnimatePresence initial={false}>
        {shown.map((t) => (
          <TaskCard key={t.id} t={t} />
        ))}
      </AnimatePresence>
      {status === "done" && tasks.length > 5 && (
        <button className="btn btn-sm btn-ghost" onClick={() => setAll(!all)}>
          {all ? "Collapse" : `+${tasks.length - 5} more done`}
        </button>
      )}
    </div>
  );
}

function BoardView({ tasks }: { tasks: Task[] }) {
  return (
    <div className="board">
      {COLS.map((c) => (
        <BoardCol
          key={c.status}
          {...c}
          tasks={tasks.filter((t) => t.status === c.status).sort((a, b) => (c.status === "done" ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : a.priority - b.priority))}
        />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- week */

function DayCol({ date, tasks }: { date: string; tasks: Task[] }) {
  const s = useHub();
  const { inspect } = useShell();
  const menu = useTaskMenu();
  const pressed = useRef<Task | null>(null);
  const lp = useLongPress((pt) => {
    if (!pressed.current) return;
    sfx.open();
    menu(pt, pressed.current);
  });
  const press = (t: Task) => ({ ...lp, onPointerDown: (e: React.PointerEvent) => ((pressed.current = t), lp.onPointerDown(e)) });
  const { over, props } = useDrop((id) => A.updateTask(id, { scheduled: date }));
  const isToday = date === today();
  const col = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Centre today in the sideways-scrolling week (phones) without moving the page vertically.
    const c = col.current;
    const w = c?.parentElement;
    if (isToday && c && w && w.scrollWidth > w.clientWidth) w.scrollLeft = c.offsetLeft - (w.clientWidth - c.offsetWidth) / 2;
  }, [isToday]);
  const mins = tasks.filter((t) => t.status !== "done").reduce((a, t) => a + (t.estimate ?? 0), 0);
  const game = s.settings.game !== "off";
  return (
    <div ref={col} className="week-col" data-over={over} {...props} style={isToday ? { background: "var(--bg-surface)", boxShadow: "var(--e1)" } : undefined}>
      <div className="week-head" data-today={isToday}>
        <div className="label">{dayName(date)}</div>
        <div className="big">{Number(date.slice(8))}</div>
        <div className="caption faint">{mins ? `${Math.round(mins / 6) / 10}h planned` : " "}</div>
      </div>
      <AnimatePresence initial={false}>
        {tasks.map((t) => {
          const a = s.areas.find((x) => x.id === t.areaId);
          return (
            <motion.button
              key={t.id}
              layout
              layoutId={"wk" + t.id}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="ev-card"
              data-done={t.status === "done"}
              draggable
              onDragStart={(e) => (e as unknown as React.DragEvent).dataTransfer.setData("text/plain", t.id)}
              onClick={() => inspect({ kind: "task", id: t.id })}
              onContextMenu={(e) => menu(e, t)}
      {...press(t)}
              style={{ "--c": a?.color } as CSSProperties}
            >
              <div style={{ fontWeight: 500 }}>{t.title}</div>
              <div className="row caption muted" style={{ marginTop: 4, gap: 6 }}>
                <span>P{t.priority}</span>
                {t.estimate ? <span>{t.estimate}m</span> : null}
                {game && t.status !== "done" && <span className="xp-ghost">+{taskXp(t, new Date(), 0)} XP</span>}
              </div>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function WeekView({ tasks }: { tasks: Task[] }) {
  const coarse = useCoarse();
  const [start, setStart] = useState(() => weekStart());
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const t0 = today();
  const on = (d: string) =>
    tasks.filter((t) => {
      const when = t.scheduled ?? t.due;
      if (t.status !== "done" && when && when < t0) return d === t0; // overdue rolls into today, once
      return when === d;
    });
  const unscheduled = tasks.filter((t) => !t.scheduled && !t.due && t.status !== "done");
  const { over, props } = useDrop((id) => A.updateTask(id, { scheduled: null }));
  return (
    <>
      <div className="row head-row" style={{ marginBottom: 12 }}>
        <h2 className="title">
          {monthName(start.slice(0, 7))} {start.slice(0, 4)}
        </h2>
        <span className="caption muted">{coarse ? "Long-press a card to reschedule." : "Drag a card to reschedule."} Overdue rolls into today.</span>
        <span className="spacer" />
        <button className="icon-btn" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}>
          <CaretLeft size={16} />
        </button>
        <button className="btn btn-sm" onClick={() => setStart(weekStart())}>
          This week
        </button>
        <button className="icon-btn" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}>
          <CaretRight size={16} />
        </button>
      </div>
      <div className="week">
        {days.map((d) => (
          <DayCol key={d} date={d} tasks={on(d)} />
        ))}
      </div>
      <section className="card" data-over={over} {...props} style={{ marginTop: 16, ...(over ? { background: "var(--accent-soft)" } : {}) }}>
        <div className="card-head">
          <span className="headline">Unscheduled</span>
          <span className="caption faint">{unscheduled.length} · drag onto a day</span>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {unscheduled.slice(0, 24).map((t) => (
            <TaskCard key={t.id} t={t} style={{ width: 220 }} />
          ))}
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- projects */

function ProjectsView() {
  const s = useHub();
  const router = useRouter();
  const { match } = useArea();
  const [status, setStatus] = useState<"active" | "planned" | "paused" | "done">("active");
  const list = s.projects.filter((p) => !p.archivedAt && match(p.areaId));
  const shown = list.filter((p) => p.status === status);
  const count = (st: string) => list.filter((p) => p.status === st).length;
  const create = () => {
    const p = A.addProject({ title: "New project", areaId: s.ui.area === "all" ? "let" : s.ui.area });
    router.push(`/tasks/p/${p.id}`);
  };
  return (
    <>
      <div className="row head-row" style={{ marginBottom: 16 }}>
        <Segmented label="Project status" size="sm" value={status} onChange={setStatus} options={(["active", "planned", "paused", "done"] as const).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), count: count(v) }))} />
        <span className="spacer" />
        <button className="btn" onClick={create}>
          <Plus size={14} /> New project
        </button>
      </div>
      {shown.length === 0 ? (
        <Empty text={`No ${status} projects.`} action="New project" onAction={create} />
      ) : (
        <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {shown.map((p) => {
            const pr = projectProgress(p.id, s.tasks);
            const a = s.areas.find((x) => x.id === p.areaId);
            return (
              <Link key={p.id} href={`/tasks/p/${p.id}`} className="folder" style={{ "--c": a?.color, minHeight: 190 } as CSSProperties}>
                {p.cover && <div className="card-cover" style={{ background: coverCss(p.cover) }} />}
                <div className="row">
                  <span className="folder-icon">
                    <IconByName name={p.icon ?? "Kanban"} weight="duotone" />
                  </span>
                  <span className="caption muted">{a?.name}</span>
                  <span className="spacer" />
                  {p.target && <span className="caption faint">{formatDateDMY(p.target)}</span>}
                </div>
                <span className="headline">{p.title}</span>
                <span className="callout muted" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {p.outcome || "No outcome sentence yet."}
                </span>
                <span className="spacer" />
                <Progress value={pr.pct} label="Project progress" />
                <div className="row caption">
                  {pr.next ? (
                    <span className="muted truncate">Next: {pr.next.title}</span>
                  ) : p.status === "active" ? (
                    <span className="row" style={{ color: "var(--warning-ink)", gap: 4 }}>
                      <Warning size={13} /> No next task
                    </span>
                  ) : (
                    <span className="faint">—</span>
                  )}
                  <span className="spacer" />
                  <span className="faint">{Math.round(pr.pct * 100)}%</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
