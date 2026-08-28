"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import ColorSwatchPicker from "@/components/ColorSwatchPicker";
import LoadingLabel from "@/components/LoadingLabel";
import type { CurriculumLevelDoc } from "@/lib/types";

const ICON_CHOICES = ["📚", "🎨", "🎲", "🗣️", "✏️", "🎧", "🧩", "🌟", "🎭", "⏰", "🍎", "🌍", "🎬", "🎓", "🔤", "🧠"];

/**
 * Full level detail/edit modal — opened by clicking a level card's header
 * in Edit Syllabus mode. Covers everything about a level except its
 * position (levelNumber/stageName), which the board's drag-and-drop
 * handles instead — this only ever PATCHes title/emoji/color/subtopics.
 */
export default function LevelEditModal({
  level,
  onClose,
  onSave,
  onDelete,
}: {
  level: CurriculumLevelDoc;
  onClose: () => void;
  onSave: (updates: { title: string; emoji: string; color: string | null; subtopics: string[] }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(level.title);
  const [emoji, setEmoji] = useState(level.emoji);
  const [color, setColor] = useState<string | null>(level.color);
  const [topics, setTopics] = useState<string[]>(level.subtopics);
  const [newTopic, setNewTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function updateTopic(index: number, value: string) {
    setTopics((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function removeTopic(index: number) {
    setTopics((prev) => prev.filter((_, i) => i !== index));
  }

  function addTopic() {
    const t = newTopic.trim();
    if (!t) return;
    setTopics((prev) => [...prev, t]);
    setNewTopic("");
  }

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), emoji, color, subtopics: topics.map((t) => t.trim()).filter(Boolean) });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete Level ${level.levelNumber} — "${level.title}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal title={`Level ${level.levelNumber}`} onClose={onClose} maxWidth={640}>
      <div className="form-row">
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      </div>

      <div className="form-row">
        <label>Icon</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            style={{ width: 56, textAlign: "center", fontSize: 18 }}
            maxLength={4}
          />
          {ICON_CHOICES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              title={e}
              style={{
                fontSize: 16,
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                border: emoji === e ? "2px solid var(--accent)" : "1px solid var(--line)",
                background: emoji === e ? "var(--cake)" : "var(--white)",
                cursor: "pointer",
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <label>Color</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            title="Use the stage's default color"
            onClick={() => setColor(null)}
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "var(--cake-dark)",
              border: color === null ? "2px solid var(--ink)" : "2px solid transparent",
              boxShadow: "0 0 0 1px var(--line)",
              cursor: "pointer",
              padding: 0,
            }}
          />
          <ColorSwatchPicker value={color ?? "#c9772f"} onChange={setColor} />
        </div>
      </div>

      <div className="form-row">
        <label>Topics</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {topics.map((topic, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input value={topic} onChange={(e) => updateTopic(i, e.target.value)} style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => removeTopic(i)}
                aria-label={`Remove topic ${topic}`}
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)" }}
              >
                ×
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTopic();
                }
              }}
              placeholder="Add a topic…"
              style={{ flex: 1 }}
            />
            <button type="button" onClick={addTopic} className="btn btn-secondary btn-sm" disabled={!newTopic.trim()}>
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="modal-actions" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-danger" onClick={remove} disabled={saving || deleting}>
          <LoadingLabel loading={deleting}>Delete Level</LoadingLabel>
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving || deleting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || deleting || !title.trim()}>
            <LoadingLabel loading={saving}>Save</LoadingLabel>
          </button>
        </div>
      </div>
    </Modal>
  );
}
