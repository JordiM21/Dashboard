"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import LoadingLabel from "@/components/LoadingLabel";
import { authFetch } from "@/lib/firebase/authFetch";
import type { ResourceFile } from "@/lib/types";

const KINDS = [
  { key: "markdown", label: "📝 Markdown note", placeholder: "New Note" },
  { key: "text", label: "📄 Text file", placeholder: "New File" },
] as const;

/** The Resources "+ Create" button — pick a file type, name it, and it's created (blank) and opened for editing right away. */
export default function CreateResourceModal({
  folderId,
  onClose,
  onCreated,
}: {
  folderId: string | null;
  onClose: () => void;
  onCreated: (file: ResourceFile) => void;
}) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("markdown");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    const name = title.trim() || KINDS.find((k) => k.key === kind)!.placeholder;
    setSaving(true);
    try {
      const res = await authFetch("/api/resources/files/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title: name, folderId }),
      });
      if (res.ok) onCreated((await res.json()) as ResourceFile);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Create" onClose={onClose}>
      <div className="form-row">
        <label>Type</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className="btn"
              style={{
                justifyContent: "flex-start",
                border: kind === k.key ? "2px solid var(--accent)" : "1px solid var(--line)",
                background: kind === k.key ? "var(--cake)" : "var(--white)",
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-row">
        <label>Name</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={KINDS.find((k) => k.key === kind)!.placeholder}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={create} disabled={saving}>
          <LoadingLabel loading={saving}>Create</LoadingLabel>
        </button>
      </div>
    </Modal>
  );
}
