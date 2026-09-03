"use client";

import { useState } from "react";
import CardMenu from "@/components/tasks/CardMenu";
import { SIZE_LABEL, subtaskProgress } from "@/lib/tasks";
import { addDays, formatDateDMY, localDateIso } from "@/lib/dateUtils";
import type { Project, Task } from "@/lib/types";

/**
 * One task, as a card. Every action that happens more than once a day is a
 * single tap on the card itself — tick it done, start/pause it, push it to
 * tomorrow — and only the rarer edits (notes, subtasks, re-scoping) cost a
 * modal.
 *
 * The checkbox intentionally does NOT wait for the network: the store
 * applies the change optimistically (see lib/useTaskStore.ts), and the
 * `task-card-done` class carries the strike-through/settle animation, so a
 * tick reads as finished the instant your finger leaves the glass.
 */
export default function TaskCard({
  task,
  project,
  onToggleDone,
  onToggleDoing,
  onPatch,
  onOpen,
  onDelete,
  compact = false,
}: {
  task: Task;
  project?: Project;
  onToggleDone: (task: Task) => void;
  onToggleDoing: (task: Task) => void;
  onPatch: (id: string, updates: Partial<Task>) => void;
  onOpen: (task: Task) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}) {
  const [justTicked, setJustTicked] = useState(false);
  const today = localDateIso();
  const progress = subtaskProgress(task);
  const overdue = task.status !== "done" && task.due !== null && task.due < today;
  const dueLabel =
    task.due === null
      ? null
      : task.due === today
        ? "Today"
        : task.due === addDays(today, 1)
          ? "Tomorrow"
          : formatDateDMY(task.due);

  function tick(e: React.MouseEvent) {
    e.stopPropagation();
    setJustTicked(true);
    window.setTimeout(() => setJustTicked(false), 500);
    onToggleDone(task);
  }

  return (
    <article
      className={[
        "task-card",
        compact ? "task-card-compact" : "",
        task.status === "done" ? "task-card-done" : "",
        task.status === "doing" ? "task-card-doing" : "",
        overdue ? "task-card-overdue" : "",
        justTicked ? "task-card-ticked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(task);
        }
      }}
    >
      <div className="task-card-main">
        <button
          type="button"
          className="task-check"
          onClick={tick}
          aria-pressed={task.status === "done"}
          aria-label={task.status === "done" ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <polyline points="5,12.5 10,17.5 19,7" />
          </svg>
        </button>

        <div className="task-card-body">
          <div className="task-card-title">{task.title}</div>

          <div className="task-card-meta">
            {task.status === "doing" && <span className="chip chip-doing">In progress</span>}
            {dueLabel && <span className={`chip chip-due${overdue ? " chip-overdue" : ""}`}>{dueLabel}</span>}
            {project && (
              <span className="chip chip-project">
                {project.icon ? `${project.icon} ` : ""}
                {project.title}
              </span>
            )}
            {task.category && <span className="chip">#{task.category}</span>}
            <span className={`badge badge-${task.priority.toLowerCase()}`}>{task.priority}</span>
            <span className="chip chip-size" title={SIZE_LABEL[task.size]}>
              {SIZE_LABEL[task.size]}
            </span>
          </div>

          {task.subtasks.length > 0 && (
            <div className="task-subprogress" title={`${task.subtasks.filter((s) => s.done).length} of ${task.subtasks.length} steps done`}>
              <div className="task-subprogress-track">
                <div className="task-subprogress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="task-subprogress-label">
                {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="task-card-actions">
        <button
          type="button"
          className={`task-action${task.status === "doing" ? " active" : ""}`}
          title={task.status === "doing" ? "Pause — back to to-do" : "Start working on this"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDoing(task);
          }}
        >
          {task.status === "doing" ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          className="task-action"
          title="Push to tomorrow"
          onClick={(e) => {
            e.stopPropagation();
            onPatch(task.id, { due: addDays(today, 1) });
          }}
        >
          →
        </button>
        <CardMenu
          label={task.title}
          onEdit={() => onOpen(task)}
          onDelete={() => onDelete(task.id)}
          deleteTitle="Delete task"
          deleteMessage={`"${task.title}" will be removed. This can't be undone.`}
        />
      </div>
    </article>
  );
}
