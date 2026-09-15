"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import ParentReportDocument from "@/components/classroom/ParentReportDocument";
import { authFetch } from "@/lib/firebase/authFetch";
import { addDays, localDateIso } from "@/lib/dateUtils";
import type { CurriculumLevelDoc, GroupDocWithRecall, GroupHistoryEntry, Student } from "@/lib/types";

const ALL_TIME_SINCE = "0000-01-01";

/** Same classGroup-matching rule GroupsHub uses everywhere else — a student belongs to whichever group's name equals their `classGroup`, case/space-insensitive. */
function groupOf(student: Student, groups: GroupDocWithRecall[]): GroupDocWithRecall | undefined {
  const key = (student.classGroup ?? "").trim().toLowerCase();
  return groups.find((g) => g.name.trim().toLowerCase() === key);
}

/**
 * One PDF per family, not per student roster row — a sibling or cousin
 * picked here shares the page with the student the report was opened for
 * WHEN they're in the same group (same content, one combined report, one
 * shared payment already reflected in Finance). Picked from a different
 * group, they get their own separate page instead — the two share nothing
 * to combine (different level, different topics), so the "family" is two
 * one-page reports, not one report stretched across two classes.
 *
 * "Generate a PDF" is the browser's own print-to-PDF: no server render
 * step to keep in sync with the preview below, no new dependency.
 */
export default function ParentReportModal({
  defaultGroup,
  groups,
  levels,
  allStudents,
  onClose,
}: {
  defaultGroup: GroupDocWithRecall;
  groups: GroupDocWithRecall[];
  levels: CurriculumLevelDoc[];
  allStudents: Student[];
  onClose: () => void;
}) {
  const today = localDateIso();
  const groupRoster = useMemo(
    () => allStudents.filter((s) => (s.classGroup ?? "").trim().toLowerCase() === defaultGroup.name.trim().toLowerCase()),
    [allStudents, defaultGroup]
  );

  const [selectedIds, setSelectedIds] = useState<string[]>(groupRoster[0] ? [groupRoster[0].id] : []);
  const [siblingPickerOpen, setSiblingPickerOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState(addDays(today, -30));
  const [rangeEnd, setRangeEnd] = useState(today);
  const [notesByStudent, setNotesByStudent] = useState<Record<string, string>>({});
  const [materialByStudent, setMaterialByStudent] = useState<Record<string, string>>({});
  const [historyByGroup, setHistoryByGroup] = useState<Record<string, GroupHistoryEntry[]>>({});

  const selectedStudents = selectedIds.map((id) => allStudents.find((s) => s.id === id)).filter((s): s is Student => !!s);

  // One "page" per distinct group among the selected students — 1 combined
  // page when everyone picked is in the same group, 2 separate pages when
  // they're not.
  const pages = useMemo(() => {
    const byGroupId = new Map<string, { group: GroupDocWithRecall; students: Student[] }>();
    for (const s of selectedStudents) {
      const g = groupOf(s, groups) ?? defaultGroup;
      const entry = byGroupId.get(g.id);
      if (entry) entry.students.push(s);
      else byGroupId.set(g.id, { group: g, students: [s] });
    }
    return Array.from(byGroupId.values());
  }, [selectedStudents, groups, defaultGroup]);

  // Fetch history only for the groups actually in play, once each.
  useEffect(() => {
    for (const { group } of pages) {
      if (group.id in historyByGroup) continue;
      authFetch(`/api/board/groups/${group.id}/history?since=${ALL_TIME_SINCE}`)
        .then((res) => (res.ok ? res.json() : { entries: [] }))
        .then((body: { entries?: GroupHistoryEntry[] }) => setHistoryByGroup((prev) => ({ ...prev, [group.id]: body.entries ?? [] })))
        .catch(() => setHistoryByGroup((prev) => ({ ...prev, [group.id]: [] })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  function toggleStudent(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev));
  }

  function setThisMonth() {
    setRangeStart(today.slice(0, 8) + "01");
    setRangeEnd(today);
  }

  function setLast30() {
    setRangeStart(addDays(today, -30));
    setRangeEnd(today);
  }

  if (groupRoster.length === 0) {
    return (
      <Modal title="Parent report" onClose={onClose}>
        <div className="hub-empty">No students in {defaultGroup.name} yet — add one before generating a report.</div>
      </Modal>
    );
  }

  return (
    <Modal title={`Parent report — ${defaultGroup.name}`} onClose={onClose} maxWidth={pages.length > 1 ? 1180 : 960}>
      <div className="report-modal-body">
        <div>
          <div className="form-row">
            <span className="report-field-label">Students on this report</span>
            <div className="report-student-picker">
              {groupRoster.map((s) => (
                <label key={s.id} className="report-student-check">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggleStudent(s.id)}
                    disabled={!selectedIds.includes(s.id) && selectedIds.length >= 2}
                  />
                  {s.name}
                </label>
              ))}
            </div>
            {selectedIds.length < 2 && (
              <button type="button" className="hub-inline-btn" style={{ marginTop: 6 }} onClick={() => setSiblingPickerOpen(true)}>
                + Add a sibling or cousin from another class
              </button>
            )}
            {selectedIds.length === 2 && pages.length === 1 && (
              <p className="report-field-label" style={{ marginTop: 6, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                Same group — one combined report for both.
              </p>
            )}
            {pages.length > 1 && (
              <p className="report-field-label" style={{ marginTop: 6, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                Different groups — two separate pages, one per class.
              </p>
            )}
          </div>

          <div className="form-row">
            <span className="report-field-label">Date range</span>
            <div className="report-range-row">
              <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
              <span>–</span>
              <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
            </div>
            <div className="report-quick-ranges">
              <button type="button" className="chip chip-button" onClick={setLast30}>
                Last 30 days
              </button>
              <button type="button" className="chip chip-button" onClick={setThisMonth}>
                This month
              </button>
            </div>
          </div>

          {pages.map(({ group, students }) => {
            const key = students[0]?.id ?? "";
            return (
              <div key={group.id}>
                <div className="form-row">
                  <label>
                    Teacher&apos;s note{pages.length > 1 ? ` — ${group.name}` : ""} (optional, in Spanish)
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Cualquier cosa que quieras que sepan — el esfuerzo, un logro, algo que observar."
                    value={notesByStudent[key] ?? ""}
                    onChange={(e) => setNotesByStudent((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>

                <div className="form-row">
                  <label>
                    Practice at home{pages.length > 1 ? ` — ${group.name}` : ""} (optional, in Spanish)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Material de estudio, un enlace, o qué repasar antes de la próxima clase."
                    value={materialByStudent[key] ?? ""}
                    onChange={(e) => setMaterialByStudent((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              </div>
            );
          })}

          <button type="button" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => window.print()}>
            🖨️ Download PDF
          </button>
          <p className="report-field-label" style={{ marginTop: 8, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
            Opens your browser's print dialog — choose "Save as PDF" as the destination.
          </p>
        </div>

        <div>
          <span className="report-field-label">Preview — exactly what prints</span>
          <div id="report-print-root" className="report-preview-pages">
            {pages.map(({ group, students }) => {
              const level = levels.find((l) => l.levelNumber === group.currentLevel);
              const entries = (historyByGroup[group.id] ?? []).filter((e) => e.date >= rangeStart && e.date <= rangeEnd);
              const key = students[0]?.id ?? "";
              return (
                <div key={group.id} className="report-preview-frame">
                  <div className="report-preview-scale">
                    <ParentReportDocument
                      students={students}
                      group={group}
                      level={level}
                      entries={entries}
                      rangeStart={rangeStart}
                      rangeEnd={rangeEnd}
                      teacherNote={notesByStudent[key] ?? ""}
                      studyMaterial={materialByStudent[key] ?? ""}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {siblingPickerOpen && (
        <Modal title="Add a sibling or cousin" onClose={() => setSiblingPickerOpen(false)}>
          <input
            type="text"
            placeholder="Search every student…"
            autoFocus
            onChange={(e) => {
              const q = e.target.value.trim().toLowerCase();
              (e.target as HTMLInputElement).dataset.q = q;
              const list = document.getElementById("sibling-pick-list");
              if (!list) return;
              for (const row of Array.from(list.children)) {
                const el = row as HTMLElement;
                el.hidden = q.length > 0 && !(el.dataset.name ?? "").includes(q);
              }
            }}
            style={{ marginBottom: 10 }}
          />
          <div id="sibling-pick-list" className="report-sibling-list">
            {allStudents
              .filter((s) => !selectedIds.includes(s.id))
              .map((s) => {
                const g = groupOf(s, groups);
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-name={s.name.toLowerCase()}
                    className="report-sibling-row"
                    onClick={() => {
                      setSelectedIds((prev) => (prev.length < 2 ? [...prev, s.id] : prev));
                      setSiblingPickerOpen(false);
                    }}
                  >
                    <span>{s.name}</span>
                    <span className="report-sibling-group">{g?.name ?? s.classGroup ?? "No group"}</span>
                  </button>
                );
              })}
          </div>
        </Modal>
      )}
    </Modal>
  );
}
