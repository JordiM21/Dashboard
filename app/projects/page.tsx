"use client";

import { useMemo, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import Modal from "@/components/Modal";
import ViewToggle from "@/components/ViewToggle";
import LiveBadge from "@/components/LiveBadge";
import { FetchFailedState, EmptyState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { authFetch } from "@/lib/firebase/authFetch";
import type { Project } from "@/lib/types";

type Status = Project["status"];

const STATUSES: Status[] = ["To Do", "In Progress", "Paused", "Done"];

const STATUS_COLUMN_CLASS: Record<Status, string> = {
  "To Do": "kanban-col-todo",
  "In Progress": "kanban-col-in-progress",
  Paused: "kanban-col-paused",
  Done: "kanban-col-done",
};

const emptyForm: Pick<Project, "title" | "priority" | "field" | "status" | "progress"> = {
  title: "",
  priority: "Medium",
  field: "",
  status: "To Do",
  progress: 0,
};

export default function ProjectsPage() {
  const { data, error, loading, lastUpdated } = useFirestoreCollection<Project>("projects", {
    orderByField: "createdAt",
    orderByDirection: "desc",
  });
  const docs = data ?? [];

  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [fieldFilter, setFieldFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [content, setContent] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);

  const fields = useMemo(() => Array.from(new Set(docs.map((d) => d.field))), [docs]);

  const filtered = useMemo(
    () => docs.filter((d) => fieldFilter === "all" || d.field === fieldFilter),
    [docs, fieldFilter]
  );

  const sortedByProgress = useMemo(() => [...filtered].sort((a, b) => b.progress - a.progress), [filtered]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setContent("");
    setModalOpen(true);
  }

  function openEdit(doc: Project) {
    setEditingId(doc.id);
    setForm({ title: doc.title, priority: doc.priority, field: doc.field, status: doc.status, progress: doc.progress });
    setContent(doc.content);
    setModalOpen(true);
  }

  async function save() {
    const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
    const method = editingId ? "PUT" : "POST";
    await authFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frontmatter: form, content }),
    });
    setModalOpen(false);
  }

  async function remove(id: string) {
    await authFetch(`/api/projects/${id}`, { method: "DELETE" });
  }

  async function moveToStatus(doc: Project, status: Status) {
    if (doc.status === status) return;
    await authFetch(`/api/projects/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frontmatter: { title: doc.title, priority: doc.priority, field: doc.field, status, progress: doc.progress },
        content: doc.content,
      }),
    });
  }

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Projects</div>
          <div className="page-subtitle">Live project board, backed by Firestore</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New Project
        </button>
      </div>

      {error && <FetchFailedState message={error} />}

      {!error && (
        <ErrorBoundary label="the projects board">
          <LiveBadge lastUpdated={lastUpdated} loading={loading} />

          <div className="filter-bar">
            <select value={fieldFilter} onChange={(e) => setFieldFilter(e.target.value)}>
              <option value="all">All fields</option>
              {fields.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <ViewToggle
              value={view}
              onChange={setView}
              options={[
                { value: "kanban", label: "Kanban" },
                { value: "list", label: "List" },
              ]}
            />
          </div>

          {data && filtered.length === 0 && (
            <EmptyState title="No projects match" hint="Try clearing filters or add a new project." />
          )}

          {view === "kanban" && filtered.length > 0 && (
            <div className="kanban">
              {STATUSES.map((status) => (
                <div
                  key={status}
                  className={`kanban-col ${STATUS_COLUMN_CLASS[status]}${
                    dragOverStatus === status ? " kanban-col-drop-target" : ""
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverStatus(status);
                  }}
                  onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverStatus(null);
                    const id = e.dataTransfer.getData("text/plain");
                    const doc = filtered.find((d) => d.id === id);
                    if (doc) moveToStatus(doc, status);
                  }}
                >
                  <div className="kanban-col-title">{status}</div>
                  {filtered
                    .filter((d) => d.status === status)
                    .map((doc) => (
                      <div
                        key={doc.id}
                        className={`kanban-card${draggingId === doc.id ? " kanban-card-dragging" : ""}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", doc.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(doc.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => openEdit(doc)}
                      >
                        <div style={{ fontWeight: 600 }}>{doc.title}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{doc.field}</div>
                        <span className={`badge badge-${doc.priority.toLowerCase()}`}>{doc.priority}</span>
                        <div className="progress-bar">
                          <div className="progress-bar-fill" style={{ width: `${doc.progress}%` }} />
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}

          {view === "list" && filtered.length > 0 && (
            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Field</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedByProgress.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.title}</td>
                      <td>{doc.field}</td>
                      <td>
                        <span className={`badge badge-${doc.priority.toLowerCase()}`}>{doc.priority}</span>
                      </td>
                      <td>{doc.status}</td>
                      <td>{doc.progress}%</td>
                      <td>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(doc)}>
                            Edit
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => remove(doc.id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ErrorBoundary>
      )}

      {modalOpen && (
        <Modal title={editingId ? "Edit Project" : "New Project"} onClose={() => setModalOpen(false)}>
          <div className="form-row">
            <label>Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Field</label>
            <input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Priority</label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as any })}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
          <div className="form-row">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Progress (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={form.progress}
              onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Notes</label>
            <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save}>
              Save
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
