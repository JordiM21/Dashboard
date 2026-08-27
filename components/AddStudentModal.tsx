"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import LoadingLabel from "@/components/LoadingLabel";
import { authFetch } from "@/lib/firebase/authFetch";
import { resizeImageFile } from "@/lib/imageResize";
import type { Student } from "@/lib/types";

interface StudentFormState {
  name: string;
  status: "active" | "inactive";
  classGroup: string;
  schedule: string;
  parentConnected: boolean;
  tuition: string;
  nextPayment: string;
  parentEmail: string;
  plan: "" | "Main Course" | "Initial Demo";
  photoUrl: string;
  notes: string;
  tags: string[];
}

const emptyForm: StudentFormState = {
  name: "",
  status: "active",
  classGroup: "",
  schedule: "",
  parentConnected: false,
  tuition: "",
  nextPayment: "",
  parentEmail: "",
  plan: "",
  photoUrl: "",
  notes: "",
  tags: [],
};

function formFromStudent(s: Student): StudentFormState {
  return {
    name: s.name,
    status: s.status,
    classGroup: s.classGroup ?? "",
    schedule: s.schedule ?? "",
    parentConnected: s.parentConnected ?? false,
    tuition: s.tuition !== undefined ? String(s.tuition) : "",
    nextPayment: s.nextPayment ?? "",
    parentEmail: s.parentEmail ?? "",
    plan: s.plan ?? "",
    photoUrl: s.photoUrl ?? "",
    notes: s.notes ?? "",
    tags: s.tags ?? [],
  };
}

export default function AddStudentModal({
  editing,
  onClose,
  onCreated,
}: {
  /** Pass an existing student to edit them in place instead of creating a new one. */
  editing?: Student;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<StudentFormState>(editing ? formFromStudent(editing) : emptyForm);
  const [tagInput, setTagInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(editing?.photoUrl ?? null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [optimizingPhoto, setOptimizingPhoto] = useState(false);

  // Downscaled/compressed in the browser before it ever touches the
  // network — an avatar only ever renders at ~44px, so there's no reason
  // to upload (or later, download) the original multi-megabyte photo.
  async function pickPhoto(file: File | null) {
    setRemovePhoto(false);
    if (!file) {
      setPhotoFile(null);
      return;
    }
    setOptimizingPhoto(true);
    try {
      const resized = await resizeImageFile(file);
      setPhotoFile(resized);
      setPhotoPreview(URL.createObjectURL(resized));
    } finally {
      setOptimizingPhoto(false);
    }
  }

  async function uploadPhoto(studentId: string) {
    const body = new FormData();
    body.append("file", photoFile!);
    const res = await authFetch(`/api/students/${studentId}/photo`, { method: "POST", body });
    if (!res.ok) {
      const body2 = await res.json().catch(() => ({}));
      throw new Error(body2.message ?? `Photo upload failed with ${res.status}`);
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] });
    setTagInput("");
  }

  function removeTag(t: string) {
    setForm({ ...form, tags: form.tags.filter((tag) => tag !== t) });
  }

  async function submit() {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      status: form.status,
      parentConnected: form.parentConnected,
      classGroup: form.classGroup.trim(),
      schedule: form.schedule.trim(),
      tuition: form.tuition.trim(),
      nextPayment: form.nextPayment.trim(),
      parentEmail: form.parentEmail.trim(),
      plan: form.plan,
      photoUrl: form.photoUrl.trim(),
      notes: form.notes.trim(),
      tags: form.tags,
    };

    try {
      const res = editing
        ? await authFetch(`/api/students/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await authFetch("/api/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Request failed with ${res.status}`);
        return;
      }

      if (photoFile) {
        const saved = (await res.json()) as { id: string };
        await uploadPhoto(saved.id);
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? "Edit Student" : "Add Student"} onClose={onClose}>
      <div className="form-row">
        <label>Name *</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      </div>
      <div className="form-row">
        <label>Plan</label>
        <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as any })}>
          <option value="">— Not set —</option>
          <option value="Main Course">Main Course</option>
          <option value="Initial Demo">Initial Demo</option>
        </select>
      </div>
      <div className="form-row">
        <label>Status</label>
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div className="form-row">
        <label>Class Group</label>
        <input value={form.classGroup} onChange={(e) => setForm({ ...form, classGroup: e.target.value })} />
      </div>
      <div className="form-row">
        <label>Schedule</label>
        <input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} />
      </div>
      <div className="form-row">
        <label>Tuition</label>
        <input
          type="number"
          value={form.tuition}
          onChange={(e) => setForm({ ...form, tuition: e.target.value })}
        />
      </div>
      <div className="form-row">
        <label>Due Date</label>
        <input
          type="date"
          value={form.nextPayment}
          onChange={(e) => setForm({ ...form, nextPayment: e.target.value })}
        />
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0 0" }}>
          Fixed monthly schedule — a payment doesn't reset this to the payment date, it always advances exactly one
          month from here.
        </p>
      </div>
      <div className="form-row">
        <label>Parent's email</label>
        <input
          type="email"
          value={form.parentEmail}
          onChange={(e) => setForm({ ...form, parentEmail: e.target.value })}
          placeholder="parent@example.com"
        />
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0 0" }}>
          When a transaction's payer email matches this, the due date above advances automatically — no manual entry
          needed.
        </p>
      </div>
      <div className="form-row">
        <label>Profile picture</label>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {photoPreview && !removePhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreview}
              alt=""
              width={48}
              height={48}
              decoding="async"
              style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
            disabled={optimizingPhoto}
            style={{ flex: 1 }}
          />
          {optimizingPhoto && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Optimizing…</span>}
          {(photoPreview || form.photoUrl) && !removePhoto && !optimizingPhoto && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPhotoFile(null);
                setPhotoPreview(null);
                setForm({ ...form, photoUrl: "" });
                setRemovePhoto(true);
              }}
            >
              Remove
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0 0" }}>
          Uploads directly — a Google Drive "share" link won't display here, since Drive serves a viewer page, not
          the raw image, when linked from outside Drive.
        </p>
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 12, color: "var(--ink-soft)", cursor: "pointer" }}>
            Use a direct image URL instead
          </summary>
          <input
            style={{ marginTop: 6 }}
            value={form.photoUrl}
            onChange={(e) => {
              setForm({ ...form, photoUrl: e.target.value });
              setRemovePhoto(false);
              if (!photoFile) setPhotoPreview(e.target.value || null);
            }}
            placeholder="https://…"
          />
        </details>
      </div>
      <div className="form-row">
        <label>Notes</label>
        <textarea
          rows={3}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Anything worth remembering about this student or their parent…"
        />
      </div>
      <div className="form-row">
        <label>Tags</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {form.tags.map((t) => (
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
      <div className="form-row checkbox">
        <input
          type="checkbox"
          id="parentConnected"
          checked={form.parentConnected}
          onChange={(e) => setForm({ ...form, parentConnected: e.target.checked })}
        />
        <label htmlFor="parentConnected">Parent connected</label>
      </div>

      {error && <div style={{ fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={submitting || optimizingPhoto}>
          <LoadingLabel loading={submitting}>{editing ? "Save Changes" : "Add Student"}</LoadingLabel>
        </button>
      </div>
    </Modal>
  );
}
