"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { PRIORITIES } from "@/lib/tasks";
import { addDays, localDateIso } from "@/lib/dateUtils";
import type { Project, Subtask, Task, TaskPriority } from "@/lib/types";

/**
 * The full edit surface — everything the card's one-tap actions don't
 * cover. Edits are saved on close rather than per-keystroke, but the
 * subtask checkboxes write through immediately, because ticking a step off
 * mid-work is the one thing here that happens while you're actually doing
 * the task rather than planning it.
 */
export default function TaskEditModal({
  task,
  projects,
  knownTags,
  onPatch,
  onClose,
}: {
  task: Task;
  projects: Project[];
  /** Every tag already in use — offered as chips here too, so this modal reuses the vocabulary instead of quietly growing it. */
  knownTags: string[];
  onPatch: (id: string, updates: Partial<Task>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Task>(task);
  const [newSubtask, setNewSubtask] = useState("");
  const [newTag, setNewTag] = useState("");

  function toggleTag(tag: string) {
    setDraft((d) => ({
      ...d,
      tags: d.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? d.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...d.tags, tag],
    }));
  }

  function addTypedTag() {
    const tag = newTag.trim().replace(/^#/, "");
    if (!tag) return;
    if (!draft.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) toggleTag(tag);
    setNewTag("");
  }

  function set<K extends keyof Task>(key: K, value: Task[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setSubtasks(subtasks: Subtask[]) {
    setDraft((d) => ({ ...d, subtasks }));
    onPatch(task.id, { subtasks });
  }

  function addSubtask() {
    const title = newSubtask.trim();
    if (!title) return;
    setSubtasks([...draft.subtasks, { id: crypto.randomUUID(), title, done: false }]);
    setNewSubtask("");
  }

  function saveAndClose() {
    onPatch(task.id, {
      title: draft.title.trim() || task.title,
      notes: draft.notes,
      tags: draft.tags,
      priority: draft.priority,
      due: draft.due,
      projectId: draft.projectId,
    });
    onClose();
  }

  return (
    <Modal title="Task" onClose={saveAndClose}>
      <div className="form-row">
        <label>Title</label>
        <input value={draft.title} onChange={(e) => set("title", e.target.value)} autoFocus />
      </div>

      <div className="form-grid-2">
        <div className="form-row">
          <label>Due</label>
          <input type="date" value={draft.due ?? ""} onChange={(e) => set("due", e.target.value || null)} />
          <div className="chip-row">
            <button type="button" className="chip chip-button" onClick={() => set("due", localDateIso())}>
              Today
            </button>
            <button type="button" className="chip chip-button" onClick={() => set("due", addDays(localDateIso(), 1))}>
              Tomorrow
            </button>
            <button type="button" className="chip chip-button" onClick={() => set("due", null)}>
              Someday
            </button>
          </div>
        </div>

        <div className="form-row">
          <label>Project (optional)</label>
          <select value={draft.projectId ?? ""} onChange={(e) => set("projectId", e.target.value || null)}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon ? `${p.icon} ` : ""}
                {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <label>Priority</label>
        <div className="segmented" role="group" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={`segmented-item priority-${p.toLowerCase()}${draft.priority === p ? " active" : ""}`}
              aria-pressed={draft.priority === p}
              onClick={() => set("priority", p as TaskPriority)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <label>Tags</label>
        <div className="chip-row">
          {draft.tags.map((t) => (
            <button key={t} type="button" className="chip chip-button active" onClick={() => toggleTag(t)} title="Remove tag">
              #{t} ×
            </button>
          ))}
          {knownTags
            .filter((t) => !draft.tags.some((d) => d.toLowerCase() === t.toLowerCase()))
            .map((t) => (
              <button key={t} type="button" className="chip chip-button chip-ghost" onClick={() => toggleTag(t)}>
                #{t}
              </button>
            ))}
        </div>
        <input
          value={newTag}
          placeholder="New tag, then Enter…"
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTypedTag();
            }
          }}
          onBlur={addTypedTag}
        />
      </div>

      <div className="form-row">
        <label>Steps</label>
        <div className="subtask-list">
          {draft.subtasks.map((s) => (
            <div key={s.id} className={`subtask-row${s.done ? " subtask-row-done" : ""}`}>
              <button
                type="button"
                className="task-check task-check-sm"
                aria-pressed={s.done}
                aria-label={s.done ? `Mark "${s.title}" as not done` : `Mark "${s.title}" as done`}
                onClick={() => setSubtasks(draft.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <polyline points="5,12.5 10,17.5 19,7" />
                </svg>
              </button>
              <input
                className="subtask-input"
                value={s.title}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    subtasks: d.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)),
                  }))
                }
                onBlur={() => onPatch(task.id, { subtasks: draft.subtasks })}
              />
              <button
                type="button"
                className="subtask-remove"
                aria-label={`Remove step "${s.title}"`}
                onClick={() => setSubtasks(draft.subtasks.filter((x) => x.id !== s.id))}
              >
                ×
              </button>
            </div>
          ))}
          <div className="subtask-row subtask-row-new">
            <span className="subtask-plus" aria-hidden>
              +
            </span>
            <input
              className="subtask-input"
              value={newSubtask}
              placeholder="Add a step…"
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSubtask();
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="form-row">
        <label>Notes</label>
        <textarea rows={3} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>

      {/* No Delete here on purpose — deleting lives on the card's "⋯"
          menu, so there is exactly one destructive path with one
          confirmation, rather than two that behave differently. */}
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={saveAndClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
