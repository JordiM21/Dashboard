"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { authFetch } from "@/lib/firebase/authFetch";
import type { FinanceEntry, Student } from "@/lib/types";

interface TransactionFormState {
  amount: string; // always USD
  date: string;
  type: "Income" | "Expense";
  category: string;
  description: string;
  studentId: string;
  payerEmail: string;
  originalAmount: string; // optional — for a payment actually collected in another currency
  originalCurrency: string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm: TransactionFormState = {
  amount: "",
  date: today(),
  type: "Income",
  category: "",
  description: "",
  studentId: "",
  payerEmail: "",
  originalAmount: "",
  originalCurrency: "",
};

function formFromEntry(entry: FinanceEntry): TransactionFormState {
  return {
    amount: String(Math.abs(entry.amount)),
    date: entry.date,
    type: entry.type,
    category: entry.category,
    description: entry.description,
    studentId: entry.studentId ?? "",
    payerEmail: entry.payerEmail ?? "",
    originalAmount: entry.originalAmount !== undefined ? String(entry.originalAmount) : "",
    originalCurrency: entry.originalCurrency ?? "",
  };
}

export default function AddTransactionModal({
  editing,
  onClose,
  onCreated,
}: {
  /** Pass an existing entry to edit it in place instead of creating a new one. */
  editing?: FinanceEntry;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<TransactionFormState>(editing ? formFromEntry(editing) : emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: students } = useFirestoreCollection<Student>("students", { orderByField: "name" });

  async function submit() {
    const amountNum = Number(form.amount);
    if (!form.amount.trim() || Number.isNaN(amountNum) || amountNum <= 0) {
      setError("Enter a positive amount in USD.");
      return;
    }
    if (!form.date) {
      setError("Date is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const signedAmount = form.type === "Expense" ? -Math.abs(amountNum) : Math.abs(amountNum);
    const payload: Record<string, unknown> = {
      amount: signedAmount,
      date: form.date,
      type: form.type,
      category: form.category.trim() || "Uncategorized",
      description: form.description.trim(),
    };
    if (form.studentId) payload.studentId = form.studentId;
    if (form.payerEmail.trim()) payload.payerEmail = form.payerEmail.trim();
    if (form.originalCurrency && form.originalAmount.trim()) {
      payload.originalAmount = Number(form.originalAmount);
      payload.originalCurrency = form.originalCurrency.toLowerCase();
    }

    try {
      const res = editing
        ? await authFetch(`/api/finance/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await authFetch("/api/finance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
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
    <Modal title={editing ? "Edit Transaction" : "Add Transaction"} onClose={onClose}>
      <div className="form-row">
        <label>Type</label>
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
          <option value="Income">Income</option>
          <option value="Expense">Expense</option>
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
          autoFocus
        />
      </div>
      <div className="form-row">
        <label>Date *</label>
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </div>
      <div className="form-row">
        <label>Category</label>
        <input
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          placeholder="Tuition, Marketing, Software…"
        />
      </div>
      <div className="form-row">
        <label>Description</label>
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="form-row">
        <label>Student (optional)</label>
        <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
          <option value="">— None —</option>
          {(students ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "4px 0 0" }}>
          Picking a student here (or filling in the parent's email below) advances that student's due date, if this
          is Income.
        </p>
      </div>
      <div className="form-row">
        <label>Payer email (optional)</label>
        <input
          type="email"
          value={form.payerEmail}
          onChange={(e) => setForm({ ...form, payerEmail: e.target.value })}
          placeholder="parent@example.com"
        />
      </div>
      <div className="form-row">
        <label>Originally collected in a different currency? (optional)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            step="0.01"
            value={form.originalAmount}
            onChange={(e) => setForm({ ...form, originalAmount: e.target.value })}
            placeholder="Original amount"
            style={{ flex: 1 }}
          />
          <select
            value={form.originalCurrency}
            onChange={(e) => setForm({ ...form, originalCurrency: e.target.value })}
            style={{ flex: 1 }}
          >
            <option value="">— Same as USD —</option>
            <option value="cop">COP</option>
            <option value="bob">BOB</option>
            <option value="eur">EUR</option>
          </select>
        </div>
      </div>

      {error && <div style={{ fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={submitting}>
          {submitting ? "Saving…" : editing ? "Save Changes" : "Add Transaction"}
        </button>
      </div>
    </Modal>
  );
}
