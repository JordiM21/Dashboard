"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import LoadingLabel from "@/components/LoadingLabel";
import { authFetch } from "@/lib/firebase/authFetch";

interface FormState {
  description: string;
  category: string;
  type: "Income" | "Expense";
  amount: string;
  frequencyMonths: string;
  alreadyPaid: boolean;
  paidOn: string; // used when alreadyPaid
  nextPayment: string; // used when !alreadyPaid — first date this recurring bill should generate a transaction
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm: FormState = {
  description: "",
  category: "",
  type: "Expense",
  amount: "",
  frequencyMonths: "1",
  alreadyPaid: false,
  paidOn: today(),
  nextPayment: today(),
};

export default function AddRecurringModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const amountNum = Number(form.amount);
    const frequencyNum = Number(form.frequencyMonths);
    if (!form.description.trim() || Number.isNaN(amountNum) || amountNum <= 0) {
      setError("Description and a positive amount are required.");
      return;
    }
    if (!Number.isInteger(frequencyNum) || frequencyNum < 1) {
      setError("Frequency must be a whole number of months, 1 or more.");
      return;
    }
    if (form.alreadyPaid && !form.paidOn) {
      setError("Enter the date it was already paid on.");
      return;
    }
    if (!form.alreadyPaid && !form.nextPayment) {
      setError("Enter the next payment date.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch("/api/finance/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description.trim(),
          category: form.category.trim() || "Uncategorized",
          type: form.type,
          amount: amountNum,
          frequencyMonths: frequencyNum,
          ...(form.alreadyPaid ? { paidOn: form.paidOn } : { nextPayment: form.nextPayment }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Request failed with ${res.status}`);
        return;
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
    <Modal title="Add Recurring Payment" onClose={onClose}>
      <div className="form-row">
        <label>Description *</label>
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="e.g. Notion subscription, Kommo CRM Plan"
          autoFocus
        />
      </div>
      <div className="form-row">
        <label>Type</label>
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
          <option value="Expense">Expense (SaaS, ad spend, bills…)</option>
          <option value="Income">Income (recurring revenue)</option>
        </select>
      </div>
      <div className="form-row">
        <label>Amount (USD) *</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="0.00"
        />
      </div>
      <div className="form-row">
        <label>Category</label>
        <input
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          placeholder="Software, Marketing…"
        />
      </div>
      <div className="form-row">
        <label>Repeats every</label>
        <select value={form.frequencyMonths} onChange={(e) => setForm({ ...form, frequencyMonths: e.target.value })}>
          <option value="1">1 month</option>
          <option value="2">2 months</option>
          <option value="3">3 months</option>
          <option value="6">6 months</option>
          <option value="12">12 months</option>
        </select>
      </div>

      <div className="form-row checkbox">
        <input
          type="checkbox"
          id="alreadyPaid"
          checked={form.alreadyPaid}
          onChange={(e) => setForm({ ...form, alreadyPaid: e.target.checked })}
        />
        <label htmlFor="alreadyPaid">Already paid once</label>
      </div>

      {form.alreadyPaid ? (
        <div className="form-row">
          <label>Paid on *</label>
          <input type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} />
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0 0" }}>
            Logs a transaction dated this day (like a normal payment) and sets the next one to{" "}
            {form.frequencyMonths} month{form.frequencyMonths === "1" ? "" : "s"} after it.
          </p>
        </div>
      ) : (
        <div className="form-row">
          <label>Next payment date *</label>
          <input
            type="date"
            value={form.nextPayment}
            onChange={(e) => setForm({ ...form, nextPayment: e.target.value })}
          />
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0 0" }}>
            A transaction is auto-generated on this date, then again every {form.frequencyMonths} month
            {form.frequencyMonths === "1" ? "" : "s"} after that.
          </p>
        </div>
      )}

      {error && <div style={{ fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={submitting}>
          <LoadingLabel loading={submitting}>Add Recurring Payment</LoadingLabel>
        </button>
      </div>
    </Modal>
  );
}
