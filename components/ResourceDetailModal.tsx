"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import type { ResourceFile } from "@/lib/types";
import { fileCategory, fileIcon, formatBytes } from "@/lib/resourceUtils";
import { formatDateDMY } from "@/lib/dateUtils";

export default function ResourceDetailModal({
  file,
  onClose,
  onSave,
  onDelete,
}: {
  file: ResourceFile;
  onClose: () => void;
  onSave: (updates: { title: string; description: string; tags: string[] }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(file.title);
  const [description, setDescription] = useState(file.description);
  const [tags, setTags] = useState<string[]>(file.tags);
  const [tagInput, setTagInput] = useState("");

  const category = fileCategory(file.mimeType);
  const contentUrl = `/api/resources/files/${file.id}/content`;

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  function removeTag(t: string) {
    setTags(tags.filter((tag) => tag !== t));
  }

  return (
    <Modal title={file.title} onClose={onClose}>
      <div style={{ marginBottom: 12 }}>
        {category === "image" && (
          <img src={contentUrl} alt={file.title} style={{ width: "100%", borderRadius: 12, maxHeight: 320, objectFit: "contain", background: "var(--cake)" }} />
        )}
        {category === "video" && (
          <video src={contentUrl} controls style={{ width: "100%", borderRadius: 12, maxHeight: 320, background: "#000" }} />
        )}
        {(category === "document" || category === "other") && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 160,
              borderRadius: 12,
              background: "var(--cake)",
              fontSize: 56,
            }}
          >
            {fileIcon(category)}
          </div>
        )}
      </div>

      <div className="modal-actions" style={{ justifyContent: "center", marginTop: 0, marginBottom: 12 }}>
        <a className="btn btn-secondary" href={contentUrl} target="_blank" rel="noopener noreferrer">
          Open
        </a>
      </div>

      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>
        {file.originalName} · {formatBytes(file.size)} · Added {formatDateDMY(file.createdAt)}
      </div>

      <div className="form-row">
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="form-row">
        <label>Description</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="form-row">
        <label>Tags</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {tags.map((t) => (
            <span key={t} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`Remove tag ${t}`}
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Type a tag and press Enter"
        />
      </div>

      <div className="modal-actions" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-danger" onClick={onDelete}>
          Delete
        </button>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onSave({ title, description, tags })}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
