"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NewLessonModal from "@/components/NewLessonModal";
import PromptModal from "@/components/PromptModal";
import AddHistoryModal from "@/components/AddHistoryModal";
import TagFilterDropdown from "@/components/TagFilterDropdown";
import LessonSheet from "@/components/classroom/LessonSheet";
import StudentsRoster, { StudentCard } from "@/components/classroom/StudentsRoster";
import CurriculumPicker from "@/components/classroom/CurriculumPicker";
import CurriculumBoard from "@/components/CurriculumBoard";
import ParentReportModal from "@/components/classroom/ParentReportModal";
import Modal from "@/components/Modal";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { authFetch } from "@/lib/firebase/authFetch";
import { formatDateDMY, localDateIso } from "@/lib/dateUtils";
import { LINK_ICON, linkKind } from "@/lib/lessonLinks";
import type {
  CurriculumLevelDoc,
  GroupDocWithRecall,
  GroupHistoryEntry,
  Student,
  WeeklyPlanDoc,
  WeeklyPlanTagDoc,
} from "@/lib/types";

// Cycled by a group's position in the list — the same four colours the
// Curriculum Board paints its pills with, so a group is the same colour
// wherever you meet it.
const GROUP_COLORS = ["var(--accent)", "var(--success)", "var(--warning)", "var(--danger)"];

const ALL_TIME_SINCE = "0000-01-01";

/** Rail selection sentinel for "every student, every group" — same rail,
    same rest-of-page structure as picking one group, just a different
    panel. Folds what used to be the Classroom's separate Students tab in
    here, since both were really "who's in this program", one view deep. */
const ALL_STUDENTS_ID = "__all_students__";

/** One row in a group's timeline: a lesson (planned or taught), or a backfilled history entry that never had a lesson behind it. */
type TimelineItem =
  | { kind: "lesson"; date: string; lesson: WeeklyPlanDoc }
  | { kind: "history"; date: string; entry: GroupHistoryEntry };

/**
 * The Classroom's home: every teaching group at a glance, plus an "All
 * Students" entry in the same rail for the full roster — one place to pick
 * who you want to see, a class or everyone, instead of a separate top-level
 * tab for each. Once you pick a group: where it is in the syllabus, who's
 * in it (as real roster cards, not name chips), what's planned next, and
 * every lesson already taught with the plan, the material and the
 * takeaways still attached to it.
 *
 * This replaces the old split where lessons lived in a whiteboard sidebar
 * on one tab and group progress lived on another.
 */
export default function GroupsHub() {
  const { data: levels } = useFirestoreCollection<CurriculumLevelDoc>("curriculum", { orderByField: "levelNumber" });
  const { data: students } = useFirestoreCollection<Student>("students", { orderByField: "name" });

  const [groups, setGroups] = useState<GroupDocWithRecall[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [lessons, setLessons] = useState<WeeklyPlanDoc[] | null>(null);
  const [lessonsError, setLessonsError] = useState<string | null>(null);
  const [tags, setTags] = useState<WeeklyPlanTagDoc[]>([]);
  const [historyByGroup, setHistoryByGroup] = useState<Record<string, GroupHistoryEntry[]>>({});

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("all");
  const [showAllTaught, setShowAllTaught] = useState(false);
  const [openLesson, setOpenLesson] = useState<WeeklyPlanDoc | null>(null);
  const [newLessonFor, setNewLessonFor] = useState<{ groupId: string; topic?: string } | null>(null);
  const [editLesson, setEditLesson] = useState<WeeklyPlanDoc | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [historyModal, setHistoryModal] = useState<{ group: GroupDocWithRecall; entry?: GroupHistoryEntry } | null>(null);
  const [reportOpenFor, setReportOpenFor] = useState<GroupDocWithRecall | null>(null);
  const [fullBoardOpen, setFullBoardOpen] = useState(false);
  const [assigningTopic, setAssigningTopic] = useState(false);

  const loadGroups = useCallback(() => {
    setGroupsError(null);
    authFetch("/api/board/groups")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);
        return body as { groups: GroupDocWithRecall[] };
      })
      .then((body) => setGroups(body.groups))
      .catch((err) => setGroupsError(err.message));
  }, []);

  const loadLessons = useCallback(() => {
    setLessonsError(null);
    authFetch("/api/board/weekly-plans")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);
        return body as { plans: WeeklyPlanDoc[] };
      })
      .then((body) => setLessons(body.plans))
      .catch((err) => setLessonsError(err.message));
  }, []);

  useEffect(loadGroups, [loadGroups]);
  useEffect(loadLessons, [loadLessons]);

  useEffect(() => {
    authFetch("/api/board/weekly-plan-tags")
      .then((res) => (res.ok ? res.json() : { tags: [] }))
      .then((body: { tags?: WeeklyPlanTagDoc[] }) => setTags(body.tags ?? []))
      .catch(() => {});
  }, []);

  const loadHistory = useCallback((groupId: string) => {
    authFetch(`/api/board/groups/${groupId}/history?since=${ALL_TIME_SINCE}`)
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((body: { entries?: GroupHistoryEntry[] }) => setHistoryByGroup((prev) => ({ ...prev, [groupId]: body.entries ?? [] })))
      .catch(() => {});
  }, []);

  // Only the group you're looking at — every group's whole history at once
  // is a request per group for data that's off-screen. ALL_STUDENTS_ID isn't
  // a real group, so there's no history to fetch for it.
  useEffect(() => {
    if (selectedId && selectedId !== ALL_STUDENTS_ID) loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  // Land on the first group rather than an empty shell, but never fight a
  // deliberate choice afterwards.
  useEffect(() => {
    setSelectedId((cur) => cur ?? groups?.[0]?.id ?? null);
  }, [groups]);

  const selected = (groups ?? []).find((g) => g.id === selectedId) ?? null;

  // The rail scrolls sideways on a phone, so the chip whose panel is showing
  // can easily sit off-screen — the panel changes under you with no visible
  // cause. Keep the active chip in view whenever the selection changes.
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chip = railRef.current?.querySelector<HTMLElement>(".group-chip.active");
    // block:"nearest" so bringing a chip into horizontal view never yanks the
    // page vertically as a side effect.
    chip?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [selectedId, groups]);

  function groupColor(id: string): string {
    const i = (groups ?? []).findIndex((g) => g.id === id);
    return GROUP_COLORS[(i < 0 ? 0 : i) % GROUP_COLORS.length];
  }

  /** Students are linked to a group by the free-text `classGroup` field they already carry — matched on the group's name, case- and space-insensitively. */
  function studentsIn(groupName: string): Student[] {
    const key = groupName.trim().toLowerCase();
    return (students ?? []).filter((s) => (s.classGroup ?? "").trim().toLowerCase() === key);
  }

  const groupLessons = useMemo(() => {
    const byTag = (l: WeeklyPlanDoc) => tagFilter === "all" || l.tagIds.includes(tagFilter);
    return (lessons ?? []).filter((l) => l.groupId === selectedId && byTag(l));
  }, [lessons, selectedId, tagFilter]);

  const planned = useMemo(
    () => groupLessons.filter((l) => !l.historyEntryId).sort((a, b) => a.date.localeCompare(b.date)),
    [groupLessons]
  );

  /** Taught lessons, plus every backfilled history entry with no lesson behind it — one chronological record of what this group has actually done. */
  const timeline = useMemo<TimelineItem[]>(() => {
    const taughtLessons = groupLessons.filter((l) => l.historyEntryId);
    const linkedEntryIds = new Set(taughtLessons.map((l) => l.historyEntryId));
    const orphanHistory = (historyByGroup[selectedId ?? ""] ?? []).filter((e) => !linkedEntryIds.has(e.id));
    return [
      ...taughtLessons.map((lesson): TimelineItem => ({ kind: "lesson", date: lesson.date, lesson })),
      // A backfilled entry only shows when no tag filter is on — it carries
      // no tags of its own, so leaving it in would look like a filter that
      // silently doesn't apply.
      ...(tagFilter === "all" ? orphanHistory.map((entry): TimelineItem => ({ kind: "history", date: entry.date, entry })) : []),
    ].sort((a, b) => b.date.localeCompare(a.date));
  }, [groupLessons, historyByGroup, selectedId, tagFilter]);

  const visibleTimeline = showAllTaught ? timeline : timeline.slice(0, 8);

  function upsertLesson(lesson: WeeklyPlanDoc) {
    setLessons((prev) => {
      const list = prev ?? [];
      return list.some((l) => l.id === lesson.id) ? list.map((l) => (l.id === lesson.id ? lesson : l)) : [lesson, ...list];
    });
    setOpenLesson((cur) => (cur?.id === lesson.id ? lesson : cur));
  }

  /** Moves a group's curriculum position — same PATCH the full syllabus board's "paintbrush" makes, just triggered from the CurriculumPicker inline in this group's own panel instead of a separate tab. Optimistic, with a revert-by-refetch on failure. */
  async function assignCurrentTopic(groupId: string, levelNumber: number, topic: string) {
    setAssigningTopic(true);
    setGroups((prev) => prev?.map((g) => (g.id === groupId ? { ...g, currentLevel: levelNumber, currentTopic: topic } : g)) ?? prev);
    try {
      const res = await authFetch(`/api/board/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentLevel: levelNumber, currentTopic: topic }),
      });
      if (!res.ok) throw new Error(`Assign failed with ${res.status}`);
    } catch {
      loadGroups();
    } finally {
      setAssigningTopic(false);
    }
  }

  async function createGroup(name: string) {
    const res = await authFetch("/api/board/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const group = (await res.json()) as GroupDocWithRecall;
      setNewGroupOpen(false);
      loadGroups();
      setSelectedId(group.id);
    }
  }

  const currentLevel = (levels ?? []).find((l) => l.levelNumber === selected?.currentLevel);
  const roster = selected ? studentsIn(selected.name) : [];
  const lastTaught = timeline[0]; // timeline is sorted newest-first
  const masteredTopics = useMemo(
    () => new Set((historyByGroup[selectedId ?? ""] ?? []).filter((e) => e.status === "Mastered").map((e) => e.topic)),
    [historyByGroup, selectedId]
  );

  return (
    <div className="hub">
      {groupsError && <FetchFailedState message={groupsError} />}
      {lessonsError && <FetchFailedState message={lessonsError} />}

      <div ref={railRef} className="group-rail" role="tablist" aria-label="Teaching groups">
        <button
          role="tab"
          aria-selected={selectedId === ALL_STUDENTS_ID}
          className={`group-chip${selectedId === ALL_STUDENTS_ID ? " active" : ""}`}
          style={{ ["--chip" as string]: "var(--sky)" }}
          onClick={() => setSelectedId(ALL_STUDENTS_ID)}
        >
          <span className="group-chip-dot" />
          <span className="group-chip-body">
            <span className="group-chip-name">All Students</span>
            <span className="group-chip-meta">{(students ?? []).length} total, every group</span>
          </span>
        </button>
        {(groups ?? []).map((g) => {
          const active = g.id === selectedId;
          const count = (lessons ?? []).filter((l) => l.groupId === g.id).length;
          return (
            <button
              key={g.id}
              role="tab"
              aria-selected={active}
              className={`group-chip${active ? " active" : ""}`}
              style={{ ["--chip" as string]: groupColor(g.id) }}
              onClick={() => {
                setSelectedId(g.id);
                setShowAllTaught(false);
              }}
            >
              <span className="group-chip-dot" />
              <span className="group-chip-body">
                <span className="group-chip-name">
                  {g.name}
                  {g.reviewSuggested && <span title="Review suggested — mastered 90+ days ago"> 🔁</span>}
                </span>
                <span className="group-chip-meta">
                  Level {g.currentLevel} · {count} {count === 1 ? "lesson" : "lessons"}
                </span>
              </span>
            </button>
          );
        })}
        <button className="group-chip group-chip-add" onClick={() => setNewGroupOpen(true)}>
          + New group
        </button>
      </div>

      {groups && groups.length === 0 && (
        <EmptyState title="No groups yet" hint='Create one above — a group is what lessons, students and progress all hang off.' />
      )}

      {selectedId === ALL_STUDENTS_ID && (
        <div className="hub-panel">
          <StudentsRoster />
        </div>
      )}

      {selected && (
        <div key={selected.id} className="hub-panel">
          <section className="card card-pad hub-summary">
            <div className="hub-summary-head">
              <div className="hub-summary-name">{selected.name}</div>
              {selected.reviewSuggested && <span className="badge badge-warning">🔁 Review suggested</span>}
            </div>

            <CurriculumPicker
              levels={levels ?? []}
              group={selected}
              masteredTopics={masteredTopics}
              onAssign={(levelNumber, topic) => assignCurrentTopic(selected.id, levelNumber, topic)}
              onPlanLesson={(topic) => setNewLessonFor({ groupId: selected.id, topic })}
              onOpenFullBoard={() => setFullBoardOpen(true)}
            />
            {assigningTopic && <div className="hub-saving">Saving…</div>}

            <div className="hub-stats">
              <div className="hub-stat">
                <span className="hub-stat-value">{roster.length}</span>
                <span className="hub-stat-label">students</span>
              </div>
              <div className="hub-stat">
                <span className="hub-stat-value">{timeline.length}</span>
                <span className="hub-stat-label">taught</span>
              </div>
              <div className="hub-stat">
                <span className="hub-stat-value">{planned.length}</span>
                <span className="hub-stat-label">planned</span>
              </div>
              <div className="hub-stat">
                <span className="hub-stat-value">{lastTaught ? formatDateDMY(lastTaught.date) : "—"}</span>
                <span className="hub-stat-label">last lesson</span>
              </div>
            </div>

            <div className="hub-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setNewLessonFor({ groupId: selected.id, topic: selected.currentTopic || undefined })}
              >
                + Plan a lesson
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setReportOpenFor(selected)}>
                📋 Parent report
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setHistoryModal({ group: selected })}>
                + Log a past lesson
              </button>
              {tags.length > 0 && (
                <div style={{ marginLeft: "auto" }}>
                  <TagFilterDropdown tags={tags} value={tagFilter} onChange={setTagFilter} />
                </div>
              )}
            </div>
          </section>

          <section className="hub-section">
            <div className="hub-section-head">
              <h2 className="hub-section-title">Students</h2>
              <span className="hub-section-count">{roster.length}</span>
            </div>
            {roster.length === 0 ? (
              <div className="hub-empty">
                Nobody's in this group yet — add a student on{" "}
                <button className="hub-inline-btn" onClick={() => setSelectedId(ALL_STUDENTS_ID)}>
                  All Students
                </button>{" "}
                and set their class to "{selected.name}".
              </div>
            ) : (
              <div className="grid grid-cards">
                {roster.map((s) => (
                  <StudentCard key={s.id} student={s} showGroupLine={false} />
                ))}
              </div>
            )}
          </section>

          <section className="hub-section">
            <div className="hub-section-head">
              <h2 className="hub-section-title">Coming up</h2>
              <span className="hub-section-count">{planned.length}</span>
            </div>
            {planned.length === 0 ? (
              <div className="hub-empty">
                Nothing planned yet — <button className="hub-inline-btn" onClick={() => setNewLessonFor({ groupId: selected.id, topic: selected.currentTopic || undefined })}>plan the next one</button>.
              </div>
            ) : (
              <div className="lesson-grid">
                {planned.map((l) => (
                  <LessonCard key={l.id} lesson={l} tags={tags} onOpen={() => setOpenLesson(l)} />
                ))}
              </div>
            )}
          </section>

          <section className="hub-section">
            <div className="hub-section-head">
              <h2 className="hub-section-title">Already taught</h2>
              <span className="hub-section-count">{timeline.length}</span>
            </div>
            {timeline.length === 0 ? (
              <div className="hub-empty">No lessons logged for this group yet.</div>
            ) : (
              <>
                <div className="lesson-grid">
                  {visibleTimeline.map((item) =>
                    item.kind === "lesson" ? (
                      <LessonCard
                        key={item.lesson.id}
                        lesson={item.lesson}
                        tags={tags}
                        taught
                        onOpen={() => setOpenLesson(item.lesson)}
                      />
                    ) : (
                      <button
                        key={item.entry.id}
                        className="lesson-card lesson-card-plain"
                        onClick={() => setHistoryModal({ group: selected, entry: item.entry })}
                      >
                        <span className="lesson-card-date">{formatDateDMY(item.entry.date)}</span>
                        <span className="lesson-card-title">{item.entry.topic}</span>
                        <span className="lesson-card-foot">
                          <span className="lesson-card-status">{item.entry.status === "Mastered" ? "✅ Mastered" : "🔁 Review"}</span>
                          <span className="lesson-card-note">logged, no lesson notes</span>
                        </span>
                      </button>
                    )
                  )}
                </div>
                {timeline.length > visibleTimeline.length && (
                  <button className="hub-more" onClick={() => setShowAllTaught(true)}>
                    Show all {timeline.length}
                  </button>
                )}
                {showAllTaught && timeline.length > 8 && (
                  <button className="hub-more" onClick={() => setShowAllTaught(false)}>
                    Show less
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {openLesson && (
        <LessonSheet
          lesson={openLesson}
          group={selected ?? undefined}
          levels={levels ?? []}
          tags={tags}
          onTagCreated={(t) => setTags((prev) => [...prev, t])}
          onChanged={upsertLesson}
          onDeleted={(id) => setLessons((prev) => prev?.filter((l) => l.id !== id) ?? prev)}
          onEdit={() => {
            setEditLesson(openLesson);
            setOpenLesson(null);
          }}
          onClose={() => {
            setOpenLesson(null);
            if (selectedId) loadHistory(selectedId);
            loadGroups();
          }}
        />
      )}

      {(newLessonFor || editLesson) && (
        <NewLessonModal
          groups={groups ?? []}
          tags={tags}
          editPlan={editLesson ?? undefined}
          defaultGroupId={newLessonFor?.groupId}
          defaultTopic={newLessonFor?.topic}
          onTagCreated={(t) => setTags((prev) => [...prev, t])}
          onClose={() => {
            setNewLessonFor(null);
            setEditLesson(null);
          }}
          onCreated={(lesson) => {
            upsertLesson(lesson);
            setNewLessonFor(null);
            setEditLesson(null);
            setSelectedId(lesson.groupId);
            setOpenLesson(lesson);
          }}
        />
      )}

      {newGroupOpen && (
        <PromptModal
          title="New group"
          label="Group name"
          placeholder="e.g. Group C"
          confirmLabel="Create"
          onCancel={() => setNewGroupOpen(false)}
          onSubmit={createGroup}
        />
      )}

      {historyModal && (
        <AddHistoryModal
          group={historyModal.group}
          entry={historyModal.entry}
          onClose={() => setHistoryModal(null)}
          onSaved={() => {
            setHistoryModal(null);
            loadHistory(historyModal.group.id);
            loadGroups();
          }}
          onDeleted={() => {
            setHistoryModal(null);
            loadHistory(historyModal.group.id);
          }}
        />
      )}

      {fullBoardOpen && (
        <Modal title="Full syllabus board" onClose={() => setFullBoardOpen(false)} maxWidth={1040}>
          <CurriculumBoard />
        </Modal>
      )}

      {reportOpenFor && (
        <ParentReportModal
          defaultGroup={reportOpenFor}
          groups={groups ?? []}
          levels={levels ?? []}
          allStudents={students ?? []}
          onClose={() => setReportOpenFor(null)}
        />
      )}
    </div>
  );
}

/** One lesson in a group's grid — enough to recognise it without opening it: when, what, what's attached, and how it went. */
function LessonCard({
  lesson,
  tags,
  taught,
  onOpen,
}: {
  lesson: WeeklyPlanDoc;
  tags: WeeklyPlanTagDoc[];
  taught?: boolean;
  onOpen: () => void;
}) {
  const lessonTags = tags.filter((t) => lesson.tagIds.includes(t.id));
  const today = localDateIso();
  const isToday = lesson.date === today;
  const kinds = Array.from(new Set(lesson.links.map((l) => linkKind(l.url)))).slice(0, 4);

  return (
    <button className={`lesson-card${taught ? " lesson-card-taught" : ""}${isToday ? " lesson-card-today" : ""}`} onClick={onOpen}>
      <span className="lesson-card-date">
        {isToday ? "Today" : formatDateDMY(lesson.date)}
        {lesson.emojis.length > 0 && <span className="lesson-card-emojis">{lesson.emojis.join(" ")}</span>}
      </span>
      <span className="lesson-card-title">{lesson.topic}</span>

      {lessonTags.length > 0 && (
        <span className="lesson-card-tags">
          {lessonTags.map((t) => (
            <span key={t.id} className="lesson-card-tag" style={{ background: t.color }}>
              {t.name}
            </span>
          ))}
        </span>
      )}

      {lesson.takeaways && <span className="lesson-card-takeaway">{lesson.takeaways}</span>}

      <span className="lesson-card-foot">
        {kinds.length > 0 && (
          <span className="lesson-card-links" title={`${lesson.links.length} linked item${lesson.links.length === 1 ? "" : "s"}`}>
            {kinds.map((k) => (
              <span key={k} aria-hidden>
                {LINK_ICON[k]}
              </span>
            ))}
            {lesson.links.length}
          </span>
        )}
        {lesson.teacherNotes && <span className="lesson-card-note">📝 plan</span>}
        {taught && <span className="lesson-card-status">✅ taught</span>}
      </span>
    </button>
  );
}
