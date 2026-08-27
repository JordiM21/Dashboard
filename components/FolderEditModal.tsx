"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import ColorSwatchPicker from "@/components/ColorSwatchPicker";
import LoadingLabel from "@/components/LoadingLabel";
import type { WeeklyPlanFolderDoc } from "@/lib/types";

/** Rename, recolor, or delete a weekly-plan folder — opened from its header's edit icon. */
export default function FolderEditModal({
  folder,
  onClose,
  onSave,
  onDelete,
}: {
  folder: WeeklyPlanFolderDoc;
  onClose: () => void;
  onSave: (updates: { name: string; color: string | null }) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState<string | null>(folder.color);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave({ name: name.trim(), color });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit Folder" onClose={onClose}>
      <div className="form-row">
        <label>Name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      </div>
      <div className="form-row">
        <label>Color</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            title="No color"
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
      <div className="modal-actions" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-danger" onClick={remove} disabled={busy}>
          Delete
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !name.trim()}>
            <LoadingLabel loading={busy}>Save</LoadingLabel>
          </button>
        </div>
      </div>
    </Modal>
  );
}
