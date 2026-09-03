"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import type { Project } from "@/lib/types";

/** A project is a container and a label — title, emoji, category, notes. Its progress isn't editable because it's derived from its tasks (lib/tasks.ts's projectProgress). */
export default function ProjectModal({
  project,
  onSave,
  onDelete,
  onClose,
}: {
  project: Project | null;
  onSave: (id: string | null, fields: Partial<Project>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(project?.title ?? "");
  const [icon, setIcon] = useState(project?.icon ?? "");
  const [field, setField] = useState(project?.field ?? "");
  const [content, setContent] = useState(project?.content ?? "");
  const [archived, setArchived] = useState(project?.archived ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function save() {
    if (!title.trim()) return;
    onSave(project?.id ?? null, { title: title.trim(), icon, field: field.trim(), content, archived });
    onClose();
  }

  return (
    <Modal title={project ? "Project" : "New project"} onClose={onClose}>
      <div className="form-grid-2">
        <div className="form-row">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="form-row">
          <label>Emoji</label>
          <input
            value={icon}
            maxLength={2}
            placeholder="🚀"
            style={{ width: 70, textAlign: "center", fontSize: 18 }}
            onChange={(e) => setIcon(e.target.value)}
          />
        </div>
      </div>

      <div className="form-row">
        <label>Category</label>
        <input value={field} placeholder="Marketing, Product…" onChange={(e) => setField(e.target.value)} />
      </div>

      <div className="form-row">
        <label>Notes</label>
        <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
      </div>

      <label className="form-row checkbox">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        <span>Archived — hide from the project rail (its tasks stay)</span>
      </label>

      <div className="modal-actions">
        {project && (
          <button
            className={confirmDelete ? "btn btn-danger" : "btn btn-ghost"}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              onDelete(project.id);
              onClose();
            }}
          >
            {confirmDelete ? "Really delete — tasks stay" : "Delete"}
          </button>
        )}
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={!title.trim()}>
          Save
        </button>
      </div>
    </Modal>
  );
}
