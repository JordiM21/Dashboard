"use client";

import { useMemo, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import LiveBadge from "@/components/LiveBadge";
import ViewToggle from "@/components/ViewToggle";
import AddStudentModal from "@/components/AddStudentModal";
import ConfirmModal from "@/components/ConfirmModal";
import CurriculumBoard from "@/components/CurriculumBoard";
import { FetchFailedState, EmptyState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { authFetch } from "@/lib/firebase/authFetch";
import { studentPaymentStatus, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_BADGE_CLASS } from "@/lib/studentStatus";
import { formatDateDMY } from "@/lib/dateUtils";
import type { Student } from "@/lib/types";

const PLANS = ["Main Course", "Initial Demo"] as const;

function Avatar({ student, size = 44 }: { student: Student; size?: number }) {
  const initial = student.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--cake)",
        color: "var(--ink-soft)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.4,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {student.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={student.photoUrl}
          alt={student.name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initial
      )}
    </div>
  );
}

function StatusBadge({ nextPayment }: { nextPayment: string | undefined }) {
  const status = studentPaymentStatus(nextPayment);
  return <span className={`badge ${PAYMENT_STATUS_BADGE_CLASS[status]}`}>{PAYMENT_STATUS_LABEL[status]}</span>;
}

export default function StudentsPage() {
  const { data, error, loading, lastUpdated } = useFirestoreCollection<Student>("students", {
    orderByField: "name",
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [planFilter, setPlanFilter] = useState<"all" | (typeof PLANS)[number]>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [section, setSection] = useState<"roster" | "curriculum">("roster");
  const [addOpen, setAddOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((s) => {
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      const matchesPlan = planFilter === "all" || s.plan === planFilter;
      const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesPlan && matchesSearch;
    });
  }, [data, search, statusFilter, planFilter]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    await authFetch(`/api/students/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
  }

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Students</div>
          <div className="page-subtitle">Live roster, backed by Firestore</div>
        </div>
        {/* ViewToggle is always the last child here (not first) so it's
            always the rightmost element hugging page-header's right edge —
            with Add Student first, the toggle's own right edge never moves
            when that button appears/disappears between tabs; only the space
            to its *left* changes. */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {section === "roster" && (
            <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
              + Add Student
            </button>
          )}
          <ViewToggle
            value={section}
            onChange={setSection}
            options={[
              { value: "roster", label: "Roster" },
              { value: "curriculum", label: "Curriculum & Progress" },
            ]}
          />
        </div>
      </div>

      {section === "curriculum" && (
        <ErrorBoundary label="the curriculum board">
          <CurriculumBoard />
        </ErrorBoundary>
      )}

      {section === "roster" && error && <FetchFailedState message={error} />}

      {section === "roster" && !error && (
        <ErrorBoundary label="the students list">
          <LiveBadge lastUpdated={lastUpdated} loading={loading} />

          <div className="filter-bar">
            <input
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value as any)}>
              <option value="all">All plans</option>
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <ViewToggle
              value={view}
              onChange={setView}
              options={[
                { value: "grid", label: "Grid" },
                { value: "list", label: "List" },
              ]}
            />
          </div>

          {data && filtered.length === 0 && (
            <EmptyState title="No students match" hint="Try clearing filters, or add a new student." />
          )}

          {view === "grid" && filtered.length > 0 && (
            <div className="grid grid-cards">
              {filtered.map((s) => (
                <div key={s.id} className="card card-pad student-card">
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <Avatar student={s} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div className="student-card-name" style={{ fontWeight: 700 }} title={s.name}>
                          {s.name}
                        </div>
                        <span className={`badge badge-${s.status}`} style={{ flexShrink: 0 }}>
                          {s.status}
                        </span>
                      </div>
                      {s.parentEmail && (
                        <div
                          className="student-card-name"
                          style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}
                          title={s.parentEmail}
                        >
                          {s.parentEmail}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {s.plan && <span className="tag">{s.plan}</span>}
                    <StatusBadge nextPayment={s.nextPayment} />
                  </div>

                  {(s.classGroup || s.schedule) && (
                    <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 8 }}>
                      {[s.classGroup, s.schedule].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {(s.tuition !== undefined || s.nextPayment) && (
                    <div style={{ fontSize: 13, marginTop: 8 }}>
                      {s.tuition !== undefined && `Tuition $${s.tuition}`}
                      {s.tuition !== undefined && s.nextPayment && " · "}
                      {s.nextPayment && `Due ${formatDateDMY(s.nextPayment)}`}
                    </div>
                  )}
                  {s.notes && (
                    <div
                      className="student-card-notes"
                      title={s.notes}
                      style={{
                        fontSize: 12,
                        marginTop: 8,
                        padding: "8px 10px",
                        background: "var(--cream)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--ink-soft)",
                        fontStyle: "italic",
                      }}
                    >
                      {s.notes}
                    </div>
                  )}
                  {s.tags && s.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                      {s.tags.map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="modal-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingStudent(s)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(s)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === "list" && filtered.length > 0 && (
            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Due Date</th>
                    <th>Parent Email</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Avatar student={s} size={32} />
                      </td>
                      <td>{s.name}</td>
                      <td>{s.plan ?? "—"}</td>
                      <td>
                        <span className={`badge badge-${s.status}`}>{s.status}</span>
                      </td>
                      <td>
                        <StatusBadge nextPayment={s.nextPayment} />
                      </td>
                      <td>{formatDateDMY(s.nextPayment)}</td>
                      <td style={{ color: "var(--ink-soft)", fontSize: 13 }}>{s.parentEmail ?? "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingStudent(s)}>
                            Edit
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(s)}>
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

      {addOpen && <AddStudentModal onClose={() => setAddOpen(false)} onCreated={() => {}} />}
      {editingStudent && (
        <AddStudentModal editing={editingStudent} onClose={() => setEditingStudent(null)} onCreated={() => {}} />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Delete student?"
          message={`This permanently deletes "${deleteTarget.name}" and their record. Transactions already linked to them stay in Finance, just no longer attached to a student. This can't be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </main>
  );
}
