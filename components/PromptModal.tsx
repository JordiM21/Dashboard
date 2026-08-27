"use client";

import { useState } from "react";
import Modal from "@/components/Modal";

/** Single-field text prompt — replaces window.prompt() with the app's own modal styling. Pass `onDelete` to also offer a destructive action (e.g. clearing a topic). */
export default function PromptModal({
  title,
  label,
  initialValue = "",
  placeholder,
  confirmLabel = "Save",
  onCancel,
  onSubmit,
  onDelete,
}: {
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSubmit(value.trim());
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <div className="form-row">
        <label>{label}</label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <div className="modal-actions" style={{ justifyContent: onDelete ? "space-between" : "flex-end" }}>
        {onDelete && (
          <button className="btn btn-danger" onClick={remove} disabled={saving}>
            Delete
          </button>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !value.trim()}>
            {saving ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
