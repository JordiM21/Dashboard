"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import TagPicker from "@/components/TagPicker";
import LoadingLabel from "@/components/LoadingLabel";
import { authFetch } from "@/lib/firebase/authFetch";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { localDateIso } from "@/lib/dateUtils";
import type { CurriculumLevelDoc, GroupDoc, WeeklyPlanDoc, WeeklyPlanTagDoc } from "@/lib/types";

// A small fixed picker, not a full emoji keyboard — plenty for tagging a
// lesson plan's mood/topic at a glance in the sidebar queue.
const EMOJI_CHOICES = ["📚", "🎨", "🎲", "🗣️", "✏️", "🎧", "🧩", "🌟", "🎭", "⏰", "🍎", "🌍"];

export default function NewLessonModal({
  groups,
  tags,
  onTagCreated,
  onClose,
  onCreated,
}: {
  groups: GroupDoc[];
  tags: WeeklyPlanTagDoc[];
  onTagCreated: (tag: WeeklyPlanTagDoc) => void;
  onClose: () => void;
  onCreated: (plan: WeeklyPlanDoc) => void;
}) {
  const { data: levels } = useFirestoreCollection<CurriculumLevelDoc>("curriculum", { orderByField: "levelNumber" });
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [date, setDate] = useState(localDateIso());
  const [topic, setTopic] = useState("");
  const [emojis, setEmojis] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId && groups[0]) setGroupId(groups[0].id);
  }, [groups, groupId]);

  // Flattened straight off the live syllabus — every subtopic is a
  // selectable option, grouped by level so it's still findable at a glance.
  const topicsByLevel = useMemo(() => (levels ?? []).filter((l) => l.subtopics.length > 0), [levels]);

  function toggleEmoji(e: string) {
    setEmojis((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  async function save() {
    if (!groupId || !date || !topic.trim()) {
      setError("Group, date, and topic are all required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/board/weekly-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, date, topic: topic.trim(), teacherNotes: "", emojis, tagIds }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);
      onCreated(body as WeeklyPlanDoc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the lesson.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Lesson" onClose={onClose}>
      {error && (
        <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{error}</div>
      )}

      <div className="form-row">
        <label>Group</label>
        {groups.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            No groups yet — add one to the &quot;groups&quot; Firestore collection first.
          </div>
        ) : (
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="form-row">
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="form-row">
        <label>Topic</label>
        {topicsByLevel.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            No syllabus subtopics yet — add some on the Curriculum Board first.
          </div>
        ) : (
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Select a topic…</option>
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
        <label>Emojis</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {EMOJI_CHOICES.map((e) => {
            const active = emojis.includes(e);
            return (
              <button
                key={e}
                type="button"
                onClick={() => toggleEmoji(e)}
                title={active ? "Remove" : "Add"}
                style={{
                  fontSize: 18,
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: active ? "2px solid var(--accent)" : "1px solid var(--line)",
                  background: active ? "var(--cake)" : "var(--white)",
                  cursor: "pointer",
                }}
              >
                {e}
              </button>
            );
          })}
        </div>
      </div>

      <div className="form-row">
        <label>Tags</label>
        <TagPicker tags={tags} selectedIds={tagIds} onChange={setTagIds} onTagCreated={onTagCreated} />
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving || groups.length === 0}>
          <LoadingLabel loading={saving}>Create Lesson</LoadingLabel>
        </button>
      </div>
    </Modal>
  );
}
