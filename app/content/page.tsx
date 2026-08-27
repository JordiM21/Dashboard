"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ErrorBoundary from "@/components/ErrorBoundary";
import Modal from "@/components/Modal";
import LiveBadge from "@/components/LiveBadge";
import { FetchFailedState, EmptyState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { authFetch } from "@/lib/firebase/authFetch";
import type { ContentItem } from "@/lib/types";

const emptyForm: Pick<ContentItem, "title" | "cover" | "tags"> = {
  title: "",
  cover: "/covers/placeholder.svg",
  tags: [],
};

export default function ContentPage() {
  const { data, error, loading, lastUpdated } = useFirestoreCollection<ContentItem>("content", {
    orderByField: "createdAt",
    orderByDirection: "desc",
  });
  const docs = data ?? [];

  const [search, setSearch] = useState("");
  const [viewingDoc, setViewingDoc] = useState<ContentItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [content, setContent] = useState("");

  const filtered = useMemo(() => {
    return docs.filter(
      (d) =>
        !search ||
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        (d.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
    );
  }, [docs, search]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setContent("");
    setEditModalOpen(true);
  }

  function openEdit(doc: ContentItem) {
    setViewingDoc(null);
    setEditingId(doc.id);
    setForm({ title: doc.title, cover: doc.cover, tags: doc.tags });
    setContent(doc.content);
    setEditModalOpen(true);
  }

  async function save() {
    const url = editingId ? `/api/content/${editingId}` : "/api/content";
    const method = editingId ? "PUT" : "POST";
    await authFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frontmatter: form, content }),
    });
    setEditModalOpen(false);
  }

  async function remove(id: string) {
    await authFetch(`/api/content/${id}`, { method: "DELETE" });
    setViewingDoc(null);
  }

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Content Library</div>
          <div className="page-subtitle">Live content library, backed by Firestore</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New Content
        </button>
      </div>

      {error && <FetchFailedState message={error} />}

      {!error && (
        <ErrorBoundary label="the content library">
          <LiveBadge lastUpdated={lastUpdated} loading={loading} />

          <div className="filter-bar">
            <input
              type="text"
              placeholder="Search by title or tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {data && filtered.length === 0 && (
            <EmptyState title="No content matches" hint="Try clearing filters or add new content." />
          )}

          <div className="grid grid-content">
            {filtered.map((doc) => (
              <div key={doc.id} className="card content-card" onClick={() => setViewingDoc(doc)}>
                <img src={doc.cover} alt={doc.title} className="content-cover" />
                <div className="card-pad" style={{ paddingTop: 14 }}>
                  <div style={{ fontWeight: 600 }}>{doc.title}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {(doc.tags ?? []).map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ErrorBoundary>
      )}

      {viewingDoc && (
        <Modal title={viewingDoc.title} onClose={() => setViewingDoc(null)}>
          <img src={viewingDoc.cover} alt={viewingDoc.title} style={{ width: "100%", borderRadius: 12, marginBottom: 16 }} />
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{viewingDoc.content}</ReactMarkdown>
          <div className="modal-actions">
            <button className="btn btn-danger" onClick={() => remove(viewingDoc.id)}>
              Delete
            </button>
            <button className="btn btn-secondary" onClick={() => openEdit(viewingDoc)}>
              Edit
            </button>
          </div>
        </Modal>
      )}

      {editModalOpen && (
        <Modal title={editingId ? "Edit Content" : "New Content"} onClose={() => setEditModalOpen(false)}>
          <div className="form-row">
            <label>Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Cover image path or URL</label>
            <input value={form.cover} onChange={(e) => setForm({ ...form, cover: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Tags (comma separated)</label>
            <input
              value={(form.tags ?? []).join(", ")}
              onChange={(e) =>
                setForm({ ...form, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })
              }
            />
          </div>
          <div className="form-row">
            <label>Body (markdown)</label>
            <textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setEditModalOpen(false)}>
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
