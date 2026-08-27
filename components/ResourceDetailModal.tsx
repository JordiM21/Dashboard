"use client";

import { useEffect, useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Modal from "@/components/Modal";
import LoadingLabel from "@/components/LoadingLabel";
import { authFetch } from "@/lib/firebase/authFetch";
import type { ResourceFile } from "@/lib/types";
import { fileCategory, fileIcon, formatBytes } from "@/lib/resourceUtils";
import { formatDateDMY } from "@/lib/dateUtils";

/** Obsidian-reading-view-style typography for the markdown preview — headings sized/weighted per level (no raw "#" ever shown, ReactMarkdown already parses those into real heading elements), comfortable body spacing, styled code/quotes/links. Built once and reused for every element type ReactMarkdown can produce. */
const MARKDOWN_COMPONENTS: ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: ({ ...props }) => <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)", margin: "18px 0 8px" }} {...props} />,
  h2: ({ ...props }) => <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--accent-dark)", margin: "16px 0 6px" }} {...props} />,
  h3: ({ ...props }) => <h3 style={{ fontSize: 16.5, fontWeight: 700, color: "var(--ink)", margin: "14px 0 6px" }} {...props} />,
  h4: ({ ...props }) => <h4 style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)", margin: "12px 0 4px" }} {...props} />,
  p: ({ ...props }) => <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink)", margin: "0 0 10px" }} {...props} />,
  ul: ({ ...props }) => <ul style={{ paddingLeft: 22, margin: "0 0 10px" }} {...props} />,
  ol: ({ ...props }) => <ol style={{ paddingLeft: 22, margin: "0 0 10px" }} {...props} />,
  li: ({ ...props }) => <li style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 4 }} {...props} />,
  a: ({ ...props }) => <a style={{ color: "var(--accent-dark)" }} {...props} />,
  strong: ({ ...props }) => <strong style={{ fontWeight: 700 }} {...props} />,
  blockquote: ({ ...props }) => (
    <blockquote
      style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 12, margin: "0 0 10px", color: "var(--ink-soft)", fontStyle: "italic" }}
      {...props}
    />
  ),
  code: ({ ...props }) => (
    <code style={{ background: "var(--cake)", padding: "1px 5px", borderRadius: 4, fontSize: 12.5, fontFamily: "monospace" }} {...props} />
  ),
  pre: ({ ...props }) => (
    <pre style={{ background: "var(--cake)", padding: "10px 12px", borderRadius: 8, overflowX: "auto", margin: "0 0 10px" }} {...props} />
  ),
  hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "16px 0" }} />,
  table: ({ ...props }) => <table style={{ borderCollapse: "collapse", marginBottom: 10 }} {...props} />,
  th: ({ ...props }) => <th style={{ border: "1px solid var(--line)", padding: "5px 8px", textAlign: "left", fontSize: 13 }} {...props} />,
  td: ({ ...props }) => <td style={{ border: "1px solid var(--line)", padding: "5px 8px", fontSize: 13 }} {...props} />,
};

/** Loads/saves a text-backed resource (markdown or plain text) via the text route. */
function useFileText(fileId: string) {
  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setContent(null);
    authFetch(`/api/resources/files/${fileId}/text`)
      .then((res) => res.json())
      .then((body: { content: string }) => setContent(body.content));
  }, [fileId]);

  async function save() {
    if (content === null) return;
    setSaving(true);
    try {
      await authFetch(`/api/resources/files/${fileId}/text`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  return { content, setContent: (v: string) => { setContent(v); setDirty(true); }, saving, dirty, save };
}

/** Markdown viewer/editor — opens on a clean, styled read-only preview (no raw "#") with "✎ Edit" as the prominent primary action, matching Copy-for-images and Open-for-PDF. Editing switches to a raw textarea; saving returns to the preview. */
function MarkdownViewer({ fileId }: { fileId: string }) {
  const { content, setContent, saving, dirty, save } = useFileText(fileId);
  const [editing, setEditing] = useState(false);

  if (content === null) return <div style={{ padding: 20, textAlign: "center", color: "var(--ink-soft)" }}>Loading…</div>;

  return (
    <div>
      {editing ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={16}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 13, resize: "vertical", marginBottom: 10 }}
        />
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto", padding: "0 2px", marginBottom: 10 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {content}
          </ReactMarkdown>
        </div>
      )}
      <div className="modal-actions" style={{ justifyContent: "center", marginTop: 0, marginBottom: 12 }}>
        {editing ? (
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>
              Preview
            </button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                await save();
                setEditing(false);
              }}
              disabled={saving || !dirty}
            >
              <LoadingLabel loading={saving}>Save</LoadingLabel>
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => setEditing(true)}>
            ✎ Edit
          </button>
        )}
      </div>
    </div>
  );
}

function TextViewer({ fileId }: { fileId: string }) {
  const { content, setContent, saving, dirty, save } = useFileText(fileId);
  if (content === null) return <div style={{ padding: 20, textAlign: "center", color: "var(--ink-soft)" }}>Loading…</div>;
  return (
    <div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={16}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 13, resize: "vertical", marginBottom: 10 }}
      />
      <div className="modal-actions" style={{ justifyContent: "center", marginTop: 0, marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
          <LoadingLabel loading={saving}>Save</LoadingLabel>
        </button>
      </div>
    </div>
  );
}

/** Fetches the image same-origin (avoids a canvas-tainting cross-origin redirect to the signed Storage URL), converts to PNG for broad clipboard-format support, and writes it to the system clipboard — paste straight into Excalidraw or any other tool. */
async function copyImageToClipboard(fileId: string): Promise<void> {
  const res = await authFetch(`/api/resources/files/${fileId}/raw`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Couldn't decode image"));
      img.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const pngBlob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode image"))), "image/png")
    );
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

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
  const [copyState, setCopyState] = useState<"idle" | "copying" | "done" | "error">("idle");

  const category = fileCategory(file.mimeType, file.originalName);
  const contentUrl = `/api/resources/files/${file.id}/content`;

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  function removeTag(t: string) {
    setTags(tags.filter((tag) => tag !== t));
  }

  async function handleCopy() {
    setCopyState("copying");
    try {
      await copyImageToClipboard(file.id);
      setCopyState("done");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  return (
    <Modal title={file.title} onClose={onClose} maxWidth={category === "markdown" || category === "text" ? 700 : 560}>
      <div style={{ marginBottom: 12 }}>
        {category === "image" && (
          <img src={contentUrl} alt={file.title} style={{ width: "100%", borderRadius: 12, maxHeight: 320, objectFit: "contain", background: "var(--cake)" }} />
        )}
        {category === "video" && (
          <video src={contentUrl} controls style={{ width: "100%", borderRadius: 12, maxHeight: 320, background: "#000" }} />
        )}
        {category === "pdf" && (
          <iframe src={contentUrl} title={file.title} style={{ width: "100%", height: 420, border: "1px solid var(--line)", borderRadius: 12 }} />
        )}
        {category === "markdown" && <MarkdownViewer fileId={file.id} />}
        {category === "text" && <TextViewer fileId={file.id} />}
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

      {category === "image" && (
        <div className="modal-actions" style={{ justifyContent: "center", marginTop: 0, marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={handleCopy} disabled={copyState === "copying"}>
            <LoadingLabel loading={copyState === "copying"}>
              {copyState === "done" ? "Copied!" : copyState === "error" ? "Couldn't copy" : "📋 Copy Image"}
            </LoadingLabel>
          </button>
        </div>
      )}

      {(category === "video" || category === "pdf" || category === "document" || category === "other") && (
        <div className="modal-actions" style={{ justifyContent: "center", marginTop: 0, marginBottom: 12 }}>
          <a className="btn btn-secondary" href={contentUrl} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        </div>
      )}

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
