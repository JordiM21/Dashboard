"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NewLessonModal from "@/components/NewLessonModal";
import PromptModal from "@/components/PromptModal";
import AddHistoryModal from "@/components/AddHistoryModal";
import TagFilterDropdown from "@/components/TagFilterDropdown";
import LoadingLabel from "@/components/LoadingLabel";
import LessonSheet from "@/components/classroom/LessonSheet";
import { StudentAvatar } from "@/components/classroom/StudentsRoster";
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

/** One row in a group's timeline: a lesson (planned or taught), or a backfilled history entry that never had a lesson behind it. */
type TimelineItem =
  | { kind: "lesson"; date: string; lesson: WeeklyPlanDoc }
  | { kind: "history"; date: string; entry: GroupHistoryEntry };

/**
 * The Classroom's home: every teaching group at a glance, and — once you
 * pick one — everything about it in one column. Where they are in the
 * syllabus, who's in the class, what's planned next, and every lesson
 * already taught with the plan, the material and the takeaways still
 * attached to it.
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
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportFlashId, setReportFlashId] = useState<string | null>(null);

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
  // is a request per group for data that's off-screen.
  useEffect(() => {
    if (selectedId) loadHistory(selectedId);
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

  /** Builds a celebratory, parent-ready summary of a group's last 30 days and copies it to the clipboard — the same output the Curriculum Board used to produce, now reading the history this view already has cached. */
  async function generateParentReport(group: GroupDocWithRecall) {
    setReportingId(group.id);
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const entries = (historyByGroup[group.id] ?? [])
        .filter((e) => e.date >= cutoff)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));

      const lines = [`🎉 Progress Update — ${group.name} 🎉`, ""];
      if (entries.length === 0) {
        lines.push("No lessons logged in the last 30 days yet — check back soon!");
      } else {
        lines.push(`Over the last 30 days, ${group.name} covered ${entries.length} topic${entries.length === 1 ? "" : "s"}:`, "");
        for (const e of entries) {
          lines.push(`${e.status === "Mastered" ? "✅" : "🔁"} ${e.topic} — ${e.status}${e.teacherNotes ? ` (${e.teacherNotes})` : ""}`);
        }
        lines.push("", "Great work this month — keep it up! 🌟");
      }

      await navigator.clipboard.writeText(lines.join("\n"));
      setReportFlashId(group.id);
      setTimeout(() => setReportFlashId((cur) => (cur === group.id ? null : cur)), 2000);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't generate the report.");
    } finally {
      setReportingId(null);
    }
  }

  const currentLevel = (levels ?? []).find((l) => l.levelNumber === selected?.currentLevel);
  const roster = selected ? studentsIn(selected.name) : [];
  const lastTaught = timeline[0]; // timeline is sorted newest-first

  return (
    <div className="hub">
      {groupsError && <FetchFailedState message={groupsError} />}
      {lessonsError && <FetchFailedState message={lessonsError} />}

      <div ref={railRef} className="group-rail" role="tablist" aria-label="Teaching groups">
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

      {selected && (
        <div key={selected.id} className="hub-panel">
          <section className="card card-pad hub-summary">
            <div className="hub-summary-head">
              <div>
                <div className="hub-summary-name">{selected.name}</div>
                <div className="hub-summary-place">
                  Level {selected.currentLevel}
                  {currentLevel ? ` · ${currentLevel.emoji} ${currentLevel.title}` : ""}
                  {selected.currentTopic ? ` · ${selected.currentTopic}` : ""}
                </div>
              </div>
              {selected.reviewSuggested && <span className="badge badge-warning">🔁 Review suggested</span>}
            </div>

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

            {roster.length > 0 && (
              <div className="hub-roster">
                {roster.map((s) => (
                  <span key={s.id} className="hub-roster-item" title={s.name}>
                    <StudentAvatar student={s} size={26} />
                    {s.name.split(" ")[0]}
                  </span>
                ))}
              </div>
            )}

            <div className="hub-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setNewLessonFor({ groupId: selected.id, topic: selected.currentTopic || undefined })}
              >
                + Plan a lesson
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => generateParentReport(selected)} disabled={reportingId === selected.id}>
                <LoadingLabel loading={reportingId === selected.id}>
                  {reportFlashId === selected.id ? "Copied! 📋" : "📋 Parent report"}
                </LoadingLabel>
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
