"use client";

import { useState } from "react";
import ColorSwatchPicker from "@/components/ColorSwatchPicker";
import LoadingLabel from "@/components/LoadingLabel";
import { authFetch } from "@/lib/firebase/authFetch";
import type { WeeklyPlanTagDoc } from "@/lib/types";

/**
 * Multiselect tag chips — tags are created-first entities (POST here),
 * never freeform text. Toggling a chip adds/removes its id from
 * `selectedIds`; "+ new tag" reveals a tiny inline create form.
 */
export default function TagPicker({
  tags,
  selectedIds,
  onChange,
  onTagCreated,
}: {
  tags: WeeklyPlanTagDoc[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onTagCreated: (tag: WeeklyPlanTagDoc) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#c9772f");
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((t) => t !== id) : [...selectedIds, id]);
  }

  async function createTag() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/board/weekly-plan-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      if (res.ok) {
        const tag = (await res.json()) as WeeklyPlanTagDoc;
        onTagCreated(tag);
        onChange([...selectedIds, tag.id]);
        setNewName("");
        setCreating(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tags.map((tag) => {
          const active = selectedIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                cursor: "pointer",
                border: active ? "1px solid transparent" : "1px solid var(--line)",
                background: active ? tag.color : "var(--white)",
                color: active ? "#fff" : "var(--ink)",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? "#fff" : tag.color, display: "inline-block" }} />
              {tag.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCreating((c) => !c)}
          className="btn btn-ghost btn-sm"
          style={{ padding: "4px 10px", fontSize: 12 }}
        >
          + New tag
        </button>
      </div>

      {creating && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: 8, background: "var(--cake)", borderRadius: "var(--radius-sm)" }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Tag name"
            onKeyDown={(e) => e.key === "Enter" && createTag()}
            style={{ flex: "1 1 120px", minWidth: 100 }}
          />
          <ColorSwatchPicker value={newColor} onChange={setNewColor} />
          <button type="button" className="btn btn-primary btn-sm" onClick={createTag} disabled={saving || !newName.trim()}>
            <LoadingLabel loading={saving}>Add</LoadingLabel>
          </button>
        </div>
      )}
    </div>
  );
}
