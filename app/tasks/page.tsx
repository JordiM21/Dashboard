"use client";

import { useEffect, useMemo, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import LiveBadge from "@/components/LiveBadge";
import ViewToggle from "@/components/ViewToggle";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import TaskCapture from "@/components/tasks/TaskCapture";
import TaskCard from "@/components/tasks/TaskCard";
import TaskEditModal from "@/components/tasks/TaskEditModal";
import ProjectModal from "@/components/tasks/ProjectModal";
import { useTaskStore } from "@/lib/useTaskStore";
import { allCategories, BUCKET_LABEL, compareTasks, completedToday, groupByBucket, isOnDeck, projectProgress } from "@/lib/tasks";
import { localDateIso } from "@/lib/dateUtils";
import type { Project, Task } from "@/lib/types";

type Lens = "focus" | "all" | "done";

const LENS_HINT: Record<Lens, string> = {
  focus: "Overdue, due today, and whatever you already started.",
  all: "Everything open, grouped by when it's due.",
  done: "Finished work, most recent first.",
};

export default function TasksPage() {
  const store = useTaskStore();
  const { tasks, projects } = store;

  const [lens, setLens] = useState<Lens>("focus");
  const [category, setCategory] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [projectModal, setProjectModal] = useState<{ project: Project | null } | null>(null);

  const today = localDateIso();

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

  const categories = useMemo(() => allCategories(tasks, projects), [tasks, projects]);

  const visible = useMemo(() => {
    return tasks.filter((t) => {
      if (projectFilter && t.projectId !== projectFilter) return false;
      if (category !== "all" && t.category !== category) return false;
      if (lens === "done") return t.status === "done";
      if (t.status === "done") return false;
      return lens === "all" || isOnDeck(t, today);
    });
  }, [tasks, lens, category, projectFilter, today]);

  const sections = useMemo(() => {
    if (lens === "done") {
      const done = [...visible].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
      return done.length ? [{ bucket: "done" as const, tasks: done }] : [];
    }
    if (lens === "focus") {
      // One flat, ranked list — a focus view that still asks you to pick
      // between four headings isn't a focus view.
      const ranked = [...visible].sort((a, b) => compareTasks(a, b, today));
      return ranked.length ? [{ bucket: "today" as const, tasks: ranked }] : [];
    }
    return groupByBucket(visible, today);
  }, [visible, lens, today]);

  const onDeckCount = tasks.filter((t) => isOnDeck(t, today)).length;
  const doneToday = completedToday(tasks, today).length;
  const activeProjects = projects.filter((p) => !p.archived);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Tasks</div>
          <div className="page-subtitle">
            {onDeckCount} on deck{doneToday > 0 ? ` · ${doneToday} finished today` : ""}
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => setProjectModal({ project: null })}>
          + New project
        </button>
      </div>

      {store.error && <FetchFailedState message={store.error} />}

      <ErrorBoundary label="the task board">
        <LiveBadge lastUpdated={store.lastUpdated} loading={store.loading} />

        <TaskCapture
          projects={activeProjects}
          defaultProjectId={projectFilter}
          onCreate={store.create}
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
              <span className="project-chip-meta">{tasks.filter((t) => t.status !== "done").length} open</span>
            </button>
            {activeProjects.map((p) => {
              const progress = projectProgress(p, tasks);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`project-chip-card${projectFilter === p.id ? " active" : ""}`}
                  onClick={() => setProjectFilter((cur) => (cur === p.id ? null : p.id))}
                  onDoubleClick={() => setProjectModal({ project: p })}
                  title="Click to filter · double-click to edit"
                >
                  <span className="project-chip-icon">{p.icon || "🗂️"}</span>
                  <span className="project-chip-title">{p.title}</span>
                  <span className="project-chip-meta">
                    {progress.total === 0 ? "No tasks yet" : `${progress.done}/${progress.total} done`}
                  </span>
                  <span className="project-chip-track">
                    <span className="project-chip-fill" style={{ width: `${progress.pct}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="filter-bar">
          <ViewToggle
            value={lens}
            onChange={(v) => setLens(v as Lens)}
            options={[
              { value: "focus", label: "Focus" },
              { value: "all", label: "Everything" },
              { value: "done", label: "Done" },
            ]}
          />
          {categories.length > 0 && (
            <div className="chip-row">
              <button
                type="button"
                className={`chip chip-button${category === "all" ? " active" : ""}`}
                onClick={() => setCategory("all")}
              >
                All categories
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`chip chip-button${category === c ? " active" : ""}`}
                  onClick={() => setCategory((cur) => (cur === c ? "all" : c))}
                >
                  #{c}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="lens-hint">{LENS_HINT[lens]}</p>

        {sections.length === 0 && (
          <EmptyState
            title={lens === "focus" ? "Nothing on deck" : lens === "done" ? "Nothing finished yet" : "No tasks match"}
            hint={
              lens === "focus"
                ? "Everything due is handled. Switch to Everything to pull work forward."
                : "Type in the box above — a title is all it takes."
            }
          />
        )}

        {sections.map((section) => (
          <section key={section.bucket} className="task-section">
            <div className="task-section-head">
              <h2 className="section-title">{lens === "focus" ? "On deck" : BUCKET_LABEL[section.bucket]}</h2>
              <span className="task-section-count">{section.tasks.length}</span>
            </div>
            <div className="task-grid">
              {section.tasks.map((task, i) => (
                <div key={task.id} className="task-grid-item" style={{ animationDelay: `${Math.min(i, 12) * 28}ms` }}>
                  <TaskCard
                    task={task}
                    project={task.projectId ? projectById.get(task.projectId) : undefined}
                    onToggleDone={store.toggleDone}
                    onToggleDoing={store.toggleDoing}
                    onPatch={store.patch}
                    onOpen={setEditing}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </ErrorBoundary>

      {editing && (
        <TaskEditModal
          task={tasks.find((t) => t.id === editing.id) ?? editing}
          projects={activeProjects}
          onPatch={store.patch}
          onDelete={store.remove}
          onClose={() => setEditing(null)}
        />
      )}

      {projectModal && (
        <ProjectModal
          project={projectModal.project}
          onSave={store.saveProject}
          onDelete={store.removeProject}
          onClose={() => setProjectModal(null)}
        />
      )}
    </main>
  );
}
