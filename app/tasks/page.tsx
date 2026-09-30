"use client";

import { useEffect, useMemo, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import LiveBadge from "@/components/LiveBadge";
import ViewToggle from "@/components/ViewToggle";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import TaskCapture from "@/components/tasks/TaskCapture";
import TaskCard from "@/components/tasks/TaskCard";
import CardMenu from "@/components/tasks/CardMenu";
import TaskEditModal from "@/components/tasks/TaskEditModal";
import ProjectModal from "@/components/tasks/ProjectModal";
import ProgressRing from "@/components/tasks/ProgressRing";
import { useTaskStore } from "@/lib/useTaskStore";
import {
  allTags,
  BUCKET_LABEL,
  compareTasks,
  completedToday,
  groupByBucket,
  hasTag,
  projectProgress,
  weekDates,
  weekdayShort,
  weekProgress,
  weekStart,
} from "@/lib/tasks";
import { formatDayMonth, localDateIso } from "@/lib/dateUtils";
import { withTransition } from "@/lib/viewTransition";
import type { Project, Task } from "@/lib/types";

type Lens = "week" | "board" | "all" | "done";

const LENS_HINT: Record<Lens, string> = {
  week: "Your next seven days. Drag a card onto a day to reschedule it, or into the backlog to unschedule it.",
  board: "Where everything stands. Drag a card between columns to start, pause, or finish it.",
  all: "Everything open, grouped by when it's due.",
  done: "Finished work, most recent first.",
};

const DRAG_TYPE = "application/x-task-id";

/** A column that accepts a dragged task card. Native HTML drag-and-drop — mouse-first, which is the desktop planner's job; touch keeps the card's own buttons. */
function DropZone({
  className,
  onDropTask,
  children,
}: {
  className: string;
  onDropTask: (id: string) => void;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <section
      className={`${className}${over ? " drop-over" : ""}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (id) onDropTask(id);
      }}
    >
      {children}
    </section>
  );
}

export default function TasksPage() {
  const store = useTaskStore();
  const { tasks, projects } = store;

  const [lens, setLens] = useState<Lens>("week");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [projectModal, setProjectModal] = useState<{ project: Project | null } | null>(null);
  const [dragging, setDragging] = useState(false);

  const today = localDateIso();
  const days = useMemo(() => weekDates(today), [today]);
  const monday = weekStart(today);

  // Deep links from the global quick-add: ?new=1 focuses the capture box,
  // ?newProject=1 opens the project modal. Both drop the param afterwards
  // so a refresh doesn't reopen them.
  const [captureFocus, setCaptureFocus] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("newProject")) setProjectModal({ project: null });
    if (params.has("new")) setCaptureFocus(true);
    if (params.has("new") || params.has("newProject")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const tags = useMemo(() => allTags(tasks, projects), [tasks, projects]);

  // Project and tag filters narrow every lens; each lens then picks its own slice.
  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        if (projectFilter && t.projectId !== projectFilter) return false;
        if (tagFilter !== "all" && !hasTag(t, tagFilter)) return false;
        return true;
      }),
    [tasks, tagFilter, projectFilter]
  );
  const open = useMemo(() => filtered.filter((t) => t.status !== "done").sort((a, b) => compareTasks(a, b, today)), [filtered, today]);
  const finishedToday = useMemo(() => completedToday(filtered, today), [filtered, today]);
  const doneThisWeek = useMemo(
    () =>
      filtered
        .filter((t) => t.status === "done" && (t.completedAt ?? "").slice(0, 10) >= monday)
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    [filtered, monday]
  );

  // Week lens: today's column also collects anything overdue and anything
  // in flight without a date — it's all work for today.
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>(days.map((d) => [d, []]));
    for (const t of open) {
      const key = t.due === null ? (t.status === "doing" ? today : null) : t.due < today ? today : t.due;
      if (key) map.get(key)?.push(t);
    }
    return map;
  }, [open, days, today]);
  const backlog = useMemo(
    () => open.filter((t) => t.status !== "doing" && (t.due === null || t.due > days[days.length - 1])),
    [open, days]
  );

  const bucketSections = useMemo(() => groupByBucket(open, today), [open, today]);
  const doneSorted = useMemo(
    () => filtered.filter((t) => t.status === "done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    [filtered]
  );

  // The scoreboard counts everything, not just the filtered slice — it's
  // the week, not the current view.
  const week = weekProgress(tasks, today);
  const openAll = tasks.filter((t) => t.status !== "done");
  const stats = {
    doing: openAll.filter((t) => t.status === "doing").length,
    overdue: openAll.filter((t) => t.due !== null && t.due < today).length,
    today: openAll.filter((t) => t.due === today).length,
    upcoming: openAll.filter((t) => t.due !== null && t.due > today && t.due <= days[days.length - 1]).length,
  };

  const activeProjects = projects.filter((p) => !p.archived);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  /** Every drop and tick goes through a view transition, so the card visibly travels to where it now belongs. */
  function move(id: string, updates: Partial<Task>) {
    const task = taskById.get(id);
    if (!task) return;
    // Rescheduling a finished task means it isn't finished after all.
    const reopen = "due" in updates && task.status === "done" ? { status: "todo" as const } : {};
    withTransition(() => void store.patch(id, { ...updates, ...reopen }));
  }
  const toggleDone = (t: Task) => withTransition(() => void store.toggleDone(t));
  const toggleDoing = (t: Task) => withTransition(() => void store.toggleDoing(t));

  function card(task: Task, i: number, compact = false) {
    return (
      <div
        key={task.id}
        className="task-grid-item"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, task.id);
          e.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        style={{ animationDelay: `${Math.min(i, 12) * 28}ms`, viewTransitionName: `t-${task.id}` } as React.CSSProperties}
      >
        <TaskCard
          compact={compact}
          task={task}
          project={task.projectId ? projectById.get(task.projectId) : undefined}
          onToggleDone={toggleDone}
          onToggleDoing={toggleDoing}
          onPatch={store.patch}
          onOpen={setEditing}
          onDelete={store.remove}
        />
      </div>
    );
  }

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Tasks</div>
          <div className="page-subtitle">
            {week.open} on the radar this week{finishedToday.length > 0 ? ` · ${finishedToday.length} finished today` : ""}
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => setProjectModal({ project: null })}>
          + New project
        </button>
      </div>

      {store.error && <FetchFailedState message={store.error} />}

      <ErrorBoundary label="the task board">
        <LiveBadge lastUpdated={store.lastUpdated} loading={store.loading} />

        <div className="task-stats">
          <div className="task-stats-hero">
            <ProgressRing pct={week.pct} size={64} label={`${week.pct}% of this week's work done`} />
            <div>
              <div className="task-stats-title">This week</div>
              <div className="task-stats-sub">
                {week.done} done since Monday · {week.open} to go
              </div>
            </div>
          </div>
          <div className={`task-stat${stats.doing ? " task-stat-doing" : ""}`}>
            <span className="task-stat-value">{stats.doing}</span>
            <span className="task-stat-label">In progress</span>
          </div>
          <div className={`task-stat${stats.overdue ? " task-stat-danger" : ""}`}>
            <span className="task-stat-value">{stats.overdue}</span>
            <span className="task-stat-label">Overdue</span>
          </div>
          <div className="task-stat">
            <span className="task-stat-value">{stats.today}</span>
            <span className="task-stat-label">Due today</span>
          </div>
          <div className="task-stat">
            <span className="task-stat-value">{stats.upcoming}</span>
            <span className="task-stat-label">Rest of the week</span>
          </div>
        </div>

        <TaskCapture
          projects={activeProjects}
          knownTags={tags}
          defaultProjectId={projectFilter}
          // Enter saves and drops you straight into the sheet: a task worth
          // typing usually has steps, and having to find the new card and
          // tap it again is where that intent gets lost.
          onCreate={async (fields) => {
            const created = await store.create(fields);
            if (created) setEditing(created);
          }}
          autoFocus={captureFocus}
        />

        {activeProjects.length > 0 && (
          <div className="project-rail">
            <button
              type="button"
              className={`project-chip-card${projectFilter === null ? " active" : ""}`}
              onClick={() => setProjectFilter(null)}
            >
              <span className="project-chip-icon">✦</span>
              <span className="project-chip-title">Everything</span>
              <span className="project-chip-meta">{openAll.length} open</span>
            </button>
            {activeProjects.map((p) => {
              const progress = projectProgress(p, tasks);
              return (
                // A div rather than a button: the whole card toggles the
                // filter, but it also contains the ⋯ menu's own button, and
                // a button inside a button is invalid HTML (browsers drop
                // the inner one, taking its click handler with it).
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  className={`project-chip-card${projectFilter === p.id ? " active" : ""}`}
                  onClick={() => setProjectFilter((cur) => (cur === p.id ? null : p.id))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setProjectFilter((cur) => (cur === p.id ? null : p.id));
                    }
                  }}
                  title="Click to filter"
                >
                  <CardMenu
                    label={p.title}
                    onEdit={() => setProjectModal({ project: p })}
                    onDelete={() => store.removeProject(p.id)}
                    deleteTitle="Delete project"
                    deleteMessage={`"${p.title}" will be removed. Its ${progress.total} task${progress.total === 1 ? "" : "s"} stay — they just become unfiled.`}
                  />
                  <span className="project-chip-icon">{p.icon || "🗂️"}</span>
                  <span className="project-chip-title">{p.title}</span>
                  <span className="project-chip-meta">
                    {progress.total === 0 ? "No tasks yet" : `${progress.done}/${progress.total} done · ${progress.pct}%`}
                  </span>
                  <span className="project-chip-track">
                    <span className="project-chip-fill" style={{ width: `${progress.pct}%` }} />
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="filter-bar">
          <ViewToggle
            value={lens}
            onChange={(v) => withTransition(() => setLens(v as Lens))}
            options={[
              { value: "week", label: "Week" },
              { value: "board", label: "Board" },
              { value: "all", label: "Everything" },
              { value: "done", label: "Done" },
            ]}
          />
          {tags.length > 0 && (
            <div className="chip-row">
              <button
                type="button"
                className={`chip chip-button${tagFilter === "all" ? " active" : ""}`}
                onClick={() => setTagFilter("all")}
              >
                All tags
              </button>
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip chip-button${tagFilter === t ? " active" : ""}`}
                  onClick={() => setTagFilter((cur) => (cur === t ? "all" : t))}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="lens-hint">{LENS_HINT[lens]}</p>

        <div className={`task-lens${dragging ? " is-dragging" : ""}`}>
          {lens === "week" && (
            <>
              <div className="week-board">
                {days.map((d, di) => {
                  const list = byDay.get(d) ?? [];
                  const isToday = d === today;
                  const doneHere = isToday ? finishedToday : [];
                  const total = list.length + doneHere.length;
                  return (
                    <DropZone key={d} className={`week-col${isToday ? " week-col-today" : ""}`} onDropTask={(id) => move(id, { due: d })}>
                      <header className="week-col-head">
                        <span className="week-col-day">{di === 0 ? "Today" : di === 1 ? "Tomorrow" : weekdayShort(d)}</span>
                        <span className="week-col-date">{formatDayMonth(d)}</span>
                        <span className="task-section-count">{list.length}</span>
                      </header>
                      {isToday && total > 0 && (
                        <div className="week-col-progress" title={`${doneHere.length} of ${total} done today`}>
                          <span style={{ transform: `scaleX(${doneHere.length / total})` }} />
                        </div>
                      )}
                      <div className="task-column-list">
                        {list.map((t, i) => card(t, i, true))}
                        {doneHere.map((t, i) => card(t, list.length + i, true))}
                        {total === 0 && <div className="week-col-empty">{isToday ? "Clear — drag something in" : "Free"}</div>}
                      </div>
                    </DropZone>
                  );
                })}
              </div>

              <DropZone className="backlog-tray" onDropTask={(id) => move(id, { due: null })}>
                <div className="task-section-head">
                  <h2 className="section-title">Backlog &amp; later</h2>
                  <span className="task-section-count">{backlog.length}</span>
                </div>
                {backlog.length === 0 ? (
                  <p className="week-col-empty">Nothing parked. Drop a card here to unschedule it.</p>
                ) : (
                  <div className="task-grid task-grid-compact">{backlog.map((t, i) => card(t, i, true))}</div>
                )}
              </DropZone>
            </>
          )}

          {lens === "board" && (
            <div className="status-board">
              {(
                [
                  { key: "todo", label: "To do", list: open.filter((t) => t.status === "todo"), updates: { status: "todo" } },
                  { key: "doing", label: "In progress", list: open.filter((t) => t.status === "doing"), updates: { status: "doing" } },
                  { key: "done", label: "Done this week", list: doneThisWeek, updates: { status: "done" } },
                ] as const
              ).map((col) => (
                <DropZone
                  key={col.key}
                  className={`status-col status-col-${col.key}`}
                  onDropTask={(id) => {
                    const t = taskById.get(id);
                    // Starting something commits it to today when it had no date — same rule as the ▶ button.
                    move(id, col.key === "doing" ? { status: "doing", due: t?.due ?? today } : { ...col.updates });
                  }}
                >
                  <header className="task-section-head">
                    <h2 className="section-title">{col.label}</h2>
                    <span className="task-section-count">{col.list.length}</span>
                  </header>
                  <div className="task-column-list">
                    {col.list.map((t, i) => card(t, i, true))}
                    {col.list.length === 0 && <div className="week-col-empty">Drop a card here</div>}
                  </div>
                </DropZone>
              ))}
            </div>
          )}

          {lens === "all" &&
            (bucketSections.length === 0 ? (
              <EmptyState title="No tasks match" hint="Type in the box above — a title is all it takes." />
            ) : (
              <div className="task-board">
                {bucketSections.map((section) => (
                  <section key={section.bucket} className="task-column">
                    <div className="task-section-head">
                      <h2 className="section-title">{BUCKET_LABEL[section.bucket]}</h2>
                      <span className="task-section-count">{section.tasks.length}</span>
                    </div>
                    <div className="task-column-list">{section.tasks.map((t, i) => card(t, i))}</div>
                  </section>
                ))}
              </div>
            ))}

          {lens === "done" &&
            (doneSorted.length === 0 ? (
              <EmptyState title="Nothing finished yet" hint="Tick a task and it lands here." />
            ) : (
              <div className="task-grid">{doneSorted.map((t, i) => card(t, i))}</div>
            ))}
        </div>
      </ErrorBoundary>

      {editing && (
        <TaskEditModal
          task={tasks.find((t) => t.id === editing.id) ?? editing}
          projects={activeProjects}
          knownTags={tags}
          onPatch={store.patch}
          onClose={() => setEditing(null)}
        />
      )}

      {projectModal && (
        <ProjectModal
          project={projectModal.project}
          onSave={store.saveProject}
          onClose={() => setProjectModal(null)}
        />
      )}
    </main>
  );
}
