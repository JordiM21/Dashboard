"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { authFetch } from "@/lib/firebase/authFetch";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { localDateIso, addMonths } from "@/lib/dateUtils";
import type { CurriculumLevelDoc, GroupDoc, GroupHistoryEntry } from "@/lib/types";

const MONTHS_AGO_PRESETS = [1, 2, 3, 4];

/**
 * Backfills one history entry for a group at a chosen past date — for
 * loading in a group that's already mid-program, so its "already seen"
 * topics show up as grey mastery badges on the Curriculum Board and in
 * parent reports. Pass `entry` to edit (and optionally delete) an existing
 * one instead — the Students view's Edit Syllabus mode, clicking a
 * "RECENT HISTORY" row on a Group Progress card.
 */
export default function AddHistoryModal({
  group,
  entry,
  onClose,
  onSaved,
  onDeleted,
}: {
  group: GroupDoc;
  entry?: GroupHistoryEntry;
  onClose: () => void;
  onSaved: (entry: GroupHistoryEntry) => void;
  onDeleted?: () => void;
}) {
  const { data: levels } = useFirestoreCollection<CurriculumLevelDoc>("curriculum", { orderByField: "levelNumber" });
  const [topic, setTopic] = useState(entry?.topic ?? "");
  const [date, setDate] = useState(entry?.date ?? localDateIso());
  const [status, setStatus] = useState<"Mastered" | "Review Pending">(entry?.status ?? "Mastered");
  const [notes, setNotes] = useState(entry?.teacherNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topicsByLevel = useMemo(() => (levels ?? []).filter((l) => l.subtopics.length > 0), [levels]);

  async function save() {
    if (!topic) {
      setError("Pick a topic.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = entry ? `/api/board/groups/${group.id}/history/${entry.id}` : `/api/board/groups/${group.id}/history`;
      const res = await authFetch(url, {
        method: entry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, topic, status, teacherNotes: notes }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);
      onSaved(body as GroupHistoryEntry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that entry.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!entry || !onDeleted) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/board/groups/${group.id}/history/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Request failed with ${res.status}`);
      }
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that entry.");
      setSaving(false);
    }
  }

  return (
    <Modal title={entry ? `Edit History Entry — ${group.name}` : `Add Past Topic — ${group.name}`} onClose={onClose}>
      {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{error}</div>}

      <div className="form-row">
        <label>Topic</label>
        {topicsByLevel.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>No syllabus subtopics yet.</div>
        ) : (
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Select a topic…</option>
            {topic && !topicsByLevel.some((lvl) => lvl.subtopics.includes(topic)) && (
              <option value={topic}>{topic} (not on the current syllabus)</option>
            )}
            {topicsByLevel.map((lvl) => (
              <optgroup key={lvl.id} label={`Level ${lvl.levelNumber}: ${lvl.title}`}>
                {lvl.subtopics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </div>

      <div className="form-row">
        <label>When</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {MONTHS_AGO_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setDate(addMonths(localDateIso(), -n))}
            >
              {n} month{n === 1 ? "" : "s"} ago
            </button>
          ))}
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={localDateIso()} />
      </div>

      <div className="form-row">
        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as "Mastered" | "Review Pending")}>
          <option value="Mastered">Mastered</option>
          <option value="Review Pending">Review Pending</option>
        </select>
      </div>

      <div className="form-row">
        <label>Notes (optional)</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="modal-actions" style={{ justifyContent: entry ? "space-between" : "flex-end" }}>
        {entry && onDeleted && (
          <button className="btn btn-danger" onClick={remove} disabled={saving}>
            Delete
          </button>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !topic}>
            {saving ? "Saving…" : entry ? "Save Changes" : "Add to History"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
