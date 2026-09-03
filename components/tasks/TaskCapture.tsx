"use client";

import { useEffect, useRef, useState } from "react";
import { parseQuickTask, SIZE_LABEL, SIZES } from "@/lib/tasks";
import { formatDateDMY, localDateIso, addDays } from "@/lib/dateUtils";
import type { Project, Task, TaskSize } from "@/lib/types";

/**
 * The zero-friction capture box: one field, always visible, always focused
 * after a save so a brain-dump is just type-Enter-type-Enter. Everything a
 * task can carry is typeable inline — "call the bank tomorrow !urgent
 * #admin" — and the chips underneath show what was understood before you
 * commit, so the shorthand is discoverable instead of being a secret.
 *
 * The size control sits outside the input because it's the one field
 * that's a judgement call rather than a fact, and it's what the morning
 * ordering leans on (see compareTasks) — worth one tap, not a syntax.
 */
export default function TaskCapture({
  projects,
  defaultProjectId,
  defaultDue = null,
  onCreate,
  placeholder = "What needs doing? — try \"call the bank tomorrow !urgent #admin\"",
  autoFocus = false,
  compact = false,
}: {
  projects: Project[];
  defaultProjectId?: string | null;
  /** Where an undated capture lands. The Overview passes today — something typed into the day's own panel is for the day, not the backlog. */
  defaultDue?: string | null;
  onCreate: (fields: Partial<Task>) => void | Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [size, setSize] = useState<TaskSize>("M");
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId ?? null);
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProjectId(defaultProjectId ?? null);
  }, [defaultProjectId]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const parsed = value.trim() ? parseQuickTask(value) : null;

  function submit(overrideDue?: string | null) {
    const draft = parseQuickTask(value);
    if (!draft.title) return;
    onCreate({
      ...draft,
      due: overrideDue !== undefined ? overrideDue : (draft.due ?? defaultDue),
      size,
      projectId,
      status: "todo",
      notes: "",
      subtasks: [],
    });
    setValue("");
    setSize("M");
    setFlash(true);
    window.setTimeout(() => setFlash(false), 700);
    inputRef.current?.focus();
  }

  return (
    <div className={`capture${compact ? " capture-compact" : ""}${flash ? " capture-flash" : ""}`}>
      <div className="capture-row">
        <span className="capture-plus" aria-hidden>
          +
        </span>
        <input
          ref={inputRef}
          className="capture-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Shift+Enter drops it on tomorrow without typing the word —
            // the single most common thing during a night review.
            submit(e.shiftKey ? addDays(localDateIso(), 1) : undefined);
          }}
          aria-label="Add a task"
        />
        {projects.length > 0 && (
          <select
            className="capture-select"
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value || null)}
            aria-label="Project"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon ? `${p.icon} ` : ""}
                {p.title}
              </option>
            ))}
          </select>
        )}
        <div className="capture-sizes" role="group" aria-label="Size">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={`capture-size${size === s ? " active" : ""}`}
              onClick={() => setSize(s)}
              title={SIZE_LABEL[s]}
            >
              {s}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-sm capture-submit" onClick={() => submit()} disabled={!parsed?.title}>
          Add
        </button>
      </div>

      {parsed && (
        <div className="capture-preview">
          <span className="capture-preview-title">{parsed.title || "…"}</span>
          {(parsed.due ?? defaultDue) && <span className="chip chip-due">{formatDateDMY(parsed.due ?? defaultDue)}</span>}
          {parsed.category && <span className="chip">#{parsed.category}</span>}
          <span className={`badge badge-${parsed.priority.toLowerCase()}`}>{parsed.priority}</span>
          <span className="chip chip-size">{SIZE_LABEL[size]}</span>
          <span className="capture-hint">Enter to add · Shift+Enter for tomorrow</span>
        </div>
      )}
    </div>
  );
}
