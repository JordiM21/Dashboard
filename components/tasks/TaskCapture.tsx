"use client";

import { useEffect, useRef, useState } from "react";
import { parseQuickTask, PRIORITIES } from "@/lib/tasks";
import { formatDateDMY, localDateIso, addDays } from "@/lib/dateUtils";
import type { Project, Task, TaskPriority } from "@/lib/types";

/**
 * The zero-friction capture box: one field, always visible, always focused
 * after a save so a brain-dump is just type-Enter-type-Enter.
 *
 * Priority is a visible control rather than only a "!urgent" you have to
 * remember — the shorthand still works and wins when typed, but a setting
 * reachable only through syntax is one most days you never touch. Tags are
 * both: type "#anything" for a new one, or tap one you already use, which
 * is what stops "#marketing" and "#Marketing" becoming two things.
 */
export default function TaskCapture({
  projects,
  knownTags,
  defaultProjectId,
  defaultDue = null,
  onCreate,
  placeholder = "What needs doing? — try \"call the bank tomorrow #admin\"",
  autoFocus = false,
  compact = false,
}: {
  projects: Project[];
  /** Every tag already in use, offered as chips so the vocabulary stays small. */
  knownTags: string[];
  defaultProjectId?: string | null;
  /** Where an undated capture lands. The Overview passes today — something typed into the day's own panel is for the day, not the backlog. */
  defaultDue?: string | null;
  onCreate: (fields: Partial<Task>) => void | Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [tags, setTags] = useState<string[]>([]);
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
  // Typed "#tags" and tapped ones are the same list by the time it saves.
  const effectiveTags = Array.from(
    new Map([...tags, ...(parsed?.tags ?? [])].map((t) => [t.toLowerCase(), t])).values()
  );
  const suggestions = knownTags.filter((t) => !effectiveTags.some((e) => e.toLowerCase() === t.toLowerCase())).slice(0, 8);

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? prev.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...prev, tag]
    );
    inputRef.current?.focus();
  }

  function submit(overrideDue?: string | null) {
    const draft = parseQuickTask(value);
    if (!draft.title) return;
    onCreate({
      title: draft.title,
      // A typed "!urgent" beats the control; otherwise the control stands.
      priority: draft.priority ?? priority,
      tags: effectiveTags,
      due: overrideDue !== undefined ? overrideDue : (draft.due ?? defaultDue),
      projectId,
      status: "todo",
      notes: "",
      subtasks: [],
    });
    setValue("");
    setTags([]);
    setPriority("Medium");
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
      </div>

      <div className="capture-controls">
        <div className="segmented" role="group" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={`segmented-item priority-${p.toLowerCase()}${(parsed?.priority ?? priority) === p ? " active" : ""}`}
              aria-pressed={(parsed?.priority ?? priority) === p}
              onClick={() => setPriority(p)}
            >
              {p}
            </button>
          ))}
        </div>

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

        <button type="button" className="btn btn-primary btn-sm capture-submit" onClick={() => submit()} disabled={!parsed?.title}>
          Add
        </button>
      </div>

      {(effectiveTags.length > 0 || suggestions.length > 0) && (
        <div className="capture-tags">
          {effectiveTags.map((t) => (
            <button key={t} type="button" className="chip chip-button active" onClick={() => toggleTag(t)} title="Remove tag">
              #{t} ×
            </button>
          ))}
          {suggestions.map((t) => (
            <button key={t} type="button" className="chip chip-button chip-ghost" onClick={() => toggleTag(t)}>
              #{t}
            </button>
          ))}
        </div>
      )}

      {parsed && (
        <div className="capture-preview">
          <span className="capture-preview-title">{parsed.title || "…"}</span>
          {(parsed.due ?? defaultDue) && <span className="chip chip-due">{formatDateDMY(parsed.due ?? defaultDue)}</span>}
          <span className={`badge badge-${(parsed.priority ?? priority).toLowerCase()}`}>{parsed.priority ?? priority}</span>
          <span className="capture-hint">Enter to add · Shift+Enter for tomorrow</span>
        </div>
      )}
    </div>
  );
}
