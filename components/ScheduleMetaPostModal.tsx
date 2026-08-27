"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { authFetch } from "@/lib/firebase/authFetch";
import type { ScheduledMetaPost } from "@/lib/types";

type Platform = ScheduledMetaPost["platform"];

interface FormState {
  platform: Platform;
  caption: string;
  mediaUrl: string;
  linkUrl: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

function splitScheduledFor(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

function emptyForm(defaultIso: string): FormState {
  const { date, time } = splitScheduledFor(defaultIso);
  return { platform: "facebook", caption: "", mediaUrl: "", linkUrl: "", date, time };
}

function formFromPost(post: ScheduledMetaPost): FormState {
  const { date, time } = splitScheduledFor(post.scheduledFor);
  return {
    platform: post.platform,
    caption: post.caption,
    mediaUrl: post.mediaUrl ?? "",
    linkUrl: post.linkUrl ?? "",
    date,
    time,
  };
}

export default function ScheduleMetaPostModal({
  editing,
  defaultDateIso,
  onClose,
  onSaved,
}: {
  /** Pass an existing scheduled post to edit/manage it instead of creating a new one. */
  editing?: ScheduledMetaPost;
  /** Pre-fills the date when creating from a Calendar day click. */
  defaultDateIso?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    editing ? formFromPost(editing) : emptyForm(defaultDateIso ? `${defaultDateIso}T09:00` : new Date().toISOString())
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsMedia = form.platform === "instagram" || form.platform === "both";
  const editable = !editing || editing.status === "scheduled" || editing.status === "failed";

  function scheduledForIso(): string {
    return new Date(`${form.date}T${form.time}`).toISOString();
  }

  async function save() {
    if (!form.caption.trim()) {
      setError("Caption is required.");
      return;
    }
    if (needsMedia && !form.mediaUrl.trim()) {
      setError("Instagram needs a public image URL — it doesn't support text-only posts.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const payload = {
      platform: form.platform,
      caption: form.caption.trim(),
      mediaUrl: form.mediaUrl.trim(),
      linkUrl: form.linkUrl.trim(),
      scheduledFor: scheduledForIso(),
    };

    try {
      const res = editing
        ? await authFetch(`/api/meta/schedule/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await authFetch("/api/meta/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Request failed with ${res.status}`);
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function publishNow() {
    if (!editing) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch(`/api/meta/schedule/${editing.id}/publish`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Request failed with ${res.status}`);
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch(`/api/meta/schedule/${editing.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Request failed with ${res.status}`);
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  const isPastOrNow = new Date(`${form.date}T${form.time}`).getTime() <= Date.now();

  return (
    <Modal title={editing ? "Scheduled Post" : "New Post"} onClose={onClose}>
      {editing && (
        <div style={{ marginBottom: 12 }}>
          <span className={`badge ${editing.status === "failed" ? "badge-error" : editing.status === "published" ? "badge-active" : "badge-info"}`}>
            {editing.status}
          </span>
          {editing.errorMessage && (
            <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>{editing.errorMessage}</p>
          )}
        </div>
      )}

      <div className="form-row">
        <label>Platform</label>
        <select
          value={form.platform}
          onChange={(e) => setForm({ ...form, platform: e.target.value as Platform })}
          disabled={!editable}
        >
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
          <option value="both">Both</option>
        </select>
      </div>
      <div className="form-row">
        <label>Caption *</label>
        <textarea
          value={form.caption}
          onChange={(e) => setForm({ ...form, caption: e.target.value })}
          rows={4}
          disabled={!editable}
          placeholder="What's the post about?"
        />
      </div>
      <div className="form-row">
        <label>Image URL{needsMedia ? " *" : " (optional)"}</label>
        <input
          type="url"
          value={form.mediaUrl}
          onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })}
          placeholder="https://…"
          disabled={!editable}
        />
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0 0" }}>
          Must be a public URL Meta's servers can fetch — Instagram has no text-only post type.
        </p>
      </div>
      {form.platform !== "instagram" && (
        <div className="form-row">
          <label>Link (Facebook only, optional)</label>
          <input
            type="url"
            value={form.linkUrl}
            onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
            placeholder="https://…"
            disabled={!editable}
          />
        </div>
      )}
      <div className="form-row">
        <label>Date *</label>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} disabled={!editable} />
      </div>
      <div className="form-row">
        <label>Time *</label>
        <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} disabled={!editable} />
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0 0" }}>
          {isPastOrNow ? "This time has passed — saving posts immediately." : "Posts automatically once this time arrives (cron) or via \"Publish now\" below."}
        </p>
      </div>

      {error && <div style={{ fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      <div className="modal-actions" style={{ justifyContent: "space-between" }}>
        <div>
          {editing && (
            <button className="btn btn-danger" onClick={remove} disabled={submitting}>
              Delete
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          {editable && editing && (
            <button className="btn btn-secondary" onClick={publishNow} disabled={submitting}>
              Publish Now
            </button>
          )}
          {editable && (
            <button className="btn btn-primary" onClick={save} disabled={submitting}>
              {submitting ? "Saving…" : isPastOrNow && !editing ? "Post Now" : editing ? "Save Changes" : "Schedule"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
