"use client";

import Modal from "@/components/Modal";

/** Generic "are you sure" gate for destructive actions — delete a transaction, a student, etc. Never delete on a single click; this is the one extra step in between. */
export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p style={{ marginTop: 0 }}>{message}</p>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
