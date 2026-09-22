"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "@/lib/firebase/authFetch";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { FetchFailedState, EmptyState } from "@/components/StateBox";
import PromptModal from "@/components/PromptModal";
import LevelEditModal from "@/components/LevelEditModal";
import NewLessonModal from "@/components/NewLessonModal";
import LoadingLabel from "@/components/LoadingLabel";
import TopicSheet from "@/components/classroom/TopicSheet";
import type { CurriculumLevelDoc, GroupDocWithRecall, GroupHistoryEntry, WeeklyPlanTagDoc } from "@/lib/types";

/** Cycled by a group's position — same four colours a group wears everywhere else in the Classroom. */
const GROUP_COLORS = ["var(--accent)", "var(--success)", "var(--warning)", "var(--danger)"];

/** One fixed colour per stage, cycled by position — a fifth stage wouldn't break it. */
const STAGE_COLORS = ["#e07a5f", "#5b9bd1", "#8a63d2", "#3aa679"];

const ALL_TIME_SINCE = "0000-01-01";

/** Which of the text-entry / detail modals is up. One shared PromptModal covers the three text ones. */
type ActiveModal =
  | { kind: "newStage" }
  | { kind: "levelEdit"; level: CurriculumLevelDoc }
  | { kind: "planLesson"; topic: string };

type TopicLens = "all" | "todo" | "mastered";

/**
 * The Curriculum — the whole path from Level 1 to the last level in one
 * scrollable grid, which is the thing a teacher actually wants to look at
 * when deciding what to teach next. It replaces the old inline dropdown
 * (level by level, no search, no context) and the separate drag-and-drop
 * Curriculum Board that lived behind a modal.
 *
 * The flow it's built around: pick the class you're teaching, search or
 * scan for a topic, tap it, get the activity bank with that topic already
 * written into the steps, then either send the class there or open the
 * lesson planner — without leaving the page.
 *
 * Editing the syllabus itself (titles, icons, colours, topics, order,
 * adding levels and stages) is the same structural job it always was, so
 * it sits behind an Edit toggle rather than cluttering the daily path.
 */
export default function CurriculumView() {
  const { data: levels, loading: levelsLoading, error: levelsError } = useFirestoreCollection<CurriculumLevelDoc>("curriculum", {
    orderByField: "levelNumber",
  });

  const [groups, setGroups] = useState<GroupDocWithRecall[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [historyByGroup, setHistoryByGroup] = useState<Record<string, GroupHistoryEntry[]>>({});
  const [tags, setTags] = useState<WeeklyPlanTagDoc[]>([]);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [lens, setLens] = useState<TopicLens>("all");
  const [editMode, setEditMode] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [addingLevelToStage, setAddingLevelToStage] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [openTopic, setOpenTopic] = useState<{ topic: string; level: CurriculumLevelDoc } | null>(null);

  // Drag-reorder (Edit mode only). `dropTarget` is another level's id ("drop
  // before this one") or `stage-end:<name>` — only for the hover highlight;
  // the real move happens in reorderTo() on drop.
  const [dragLevelId, setDragLevelId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const loadHistory = useCallback((groupId: string) => {
    authFetch(`/api/board/groups/${groupId}/history?since=${ALL_TIME_SINCE}`)
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((body: { entries?: GroupHistoryEntry[] }) => setHistoryByGroup((prev) => ({ ...prev, [groupId]: body.entries ?? [] })))
      .catch(() => {});
  }, []);

  const loadGroups = useCallback(() => {
    authFetch("/api/board/groups")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);
        return body as { groups: GroupDocWithRecall[] };
      })
      .then((body) => {
        setGroups(body.groups);
        setGroupsError(null);
      })
      .catch((err) => setGroupsError(err.message));
  }, []);

  useEffect(loadGroups, [loadGroups]);

  useEffect(() => {
    authFetch("/api/board/weekly-plan-tags")
      .then((res) => (res.ok ? res.json() : { tags: [] }))
      .then((body: { tags?: WeeklyPlanTagDoc[] }) => setTags(body.tags ?? []))
      .catch(() => {});
  }, []);

  // Only the class in context — the grid's badges and the progress ring
  // never show anyone else's history, so fetching every group's is waste.
  useEffect(() => {
    if (activeGroupId) loadHistory(activeGroupId);
  }, [activeGroupId, loadHistory]);

  // Land on the first class rather than a context-free grid: "where is my
  // class and what's next" is the reason this page gets opened.
  useEffect(() => {
    setActiveGroupId((cur) => cur ?? groups?.[0]?.id ?? null);
  }, [groups]);

  const activeGroup = (groups ?? []).find((g) => g.id === activeGroupId) ?? null;

  const mastered = useMemo(
    () => new Set((historyByGroup[activeGroupId ?? ""] ?? []).filter((e) => e.status === "Mastered").map((e) => e.topic)),
    [historyByGroup, activeGroupId]
  );

  function groupColor(id: string): string {
    const i = (groups ?? []).findIndex((g) => g.id === id);
    return GROUP_COLORS[(i < 0 ? 0 : i) % GROUP_COLORS.length];
  }

  /** A topic survives the search box and the lens chips, or it isn't drawn. */
  const matchesTopic = useCallback(
    (topic: string, lvl: CurriculumLevelDoc) => {
      const q = search.trim().toLowerCase();
      if (q && !topic.toLowerCase().includes(q) && !lvl.title.toLowerCase().includes(q) && !lvl.stageName.toLowerCase().includes(q)) {
        return false;
      }
      if (!activeGroup || lens === "all") return true;
      const isMastered = mastered.has(topic);
      return lens === "mastered" ? isMastered : !isMastered;
    },
    [search, activeGroup, lens, mastered]
  );

  /** Levels grouped into their stages, each level carrying only the topics that survived the filters. Levels with nothing left drop out while searching. */
  const stages = useMemo(() => {
    const searching = search.trim().length > 0 || (activeGroup !== null && lens !== "all");
    const order: string[] = [];
    const byStage = new Map<string, { level: CurriculumLevelDoc; topics: string[] }[]>();
    for (const lvl of levels ?? []) {
      const topics = lvl.subtopics.filter((t) => matchesTopic(t, lvl));
      // While editing, an empty level still has to be visible — that's the
      // only way to add its first topic.
      if (searching && topics.length === 0 && !editMode) continue;
      if (!byStage.has(lvl.stageName)) {
        byStage.set(lvl.stageName, []);
        order.push(lvl.stageName);
      }
      byStage.get(lvl.stageName)!.push({ level: lvl, topics });
    }
    return order.map((name) => ({ name, levels: byStage.get(name)! }));
  }, [levels, matchesTopic, search, activeGroup, lens, editMode]);

  const matchCount = useMemo(() => stages.reduce((n, s) => n + s.levels.reduce((m, l) => m + l.topics.length, 0), 0), [stages]);
  const totalTopics = useMemo(() => (levels ?? []).reduce((n, l) => n + l.subtopics.length, 0), [levels]);

  // Stage colours are keyed off the *unfiltered* stage order, so a stage
  // doesn't change colour just because a search hid the one before it.
  const stageIndexByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const lvl of levels ?? []) if (!map.has(lvl.stageName)) map.set(lvl.stageName, map.size);
    return map;
  }, [levels]);

  function levelColor(lvl: CurriculumLevelDoc): string {
    return lvl.color ?? STAGE_COLORS[(stageIndexByName.get(lvl.stageName) ?? 0) % STAGE_COLORS.length];
  }

  // Jump straight to where the class is sitting — the "I opened this to see
  // what's next" move, one tap instead of a scroll through twenty levels.
  const currentCardRef = useRef<HTMLDivElement>(null);
  function scrollToCurrent() {
    currentCardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function assignTopic(levelNumber: number, topic: string) {
    if (!activeGroupId) return;
    setAssigning(true);
    setGroups((prev) => prev?.map((g) => (g.id === activeGroupId ? { ...g, currentLevel: levelNumber, currentTopic: topic } : g)) ?? prev);
    try {
      const res = await authFetch(`/api/board/groups/${activeGroupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentLevel: levelNumber, currentTopic: topic }),
      });
      if (!res.ok) throw new Error(`Assign failed with ${res.status}`);
    } catch {
      loadGroups(); // revert the optimistic update by re-reading the real state
    } finally {
      setAssigning(false);
    }
  }

  async function saveLevel(level: CurriculumLevelDoc, updates: { title: string; emoji: string; color: string | null; subtopics: string[] }) {
    const res = await authFetch(`/api/board/curriculum/${level.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) setActiveModal(null);
    else window.alert("Couldn't save that level.");
  }

  async function deleteLevel(level: CurriculumLevelDoc) {
    const res = await authFetch(`/api/board/curriculum/${level.id}`, { method: "DELETE" });
    if (res.ok) setActiveModal(null);
    else window.alert("Couldn't delete that level.");
  }

  /** Adds a blank level at the end of `stageName`. A name that doesn't exist yet creates the stage with this level as its first. */
  async function addLevel(stageName: string) {
    setAddingLevelToStage(stageName);
    try {
      const res = await authFetch("/api/board/curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageName }),
      });
      if (!res.ok) window.alert("Couldn't add a new level.");
    } finally {
      setAddingLevelToStage(null);
    }
  }

  /**
   * Removes `draggedId` from the flat list and reinserts it before
   * `insertBeforeId` (or at the end of `targetStageName` when null),
   * restaging it, then PATCHes the whole new order at once — the server
   * renumbers every level to match array position.
   */
  async function reorderTo(draggedId: string, targetStageName: string, insertBeforeId: string | null) {
    const current = levels ?? [];
    const dragged = current.find((l) => l.id === draggedId);
    if (!dragged) return;

    const rest = current.filter((l) => l.id !== draggedId);
    let insertIndex = insertBeforeId ? rest.findIndex((l) => l.id === insertBeforeId) : -1;
    if (insertIndex === -1) {
      let lastInStage = -1;
      rest.forEach((l, i) => {
        if (l.stageName === targetStageName) lastInStage = i;
      });
      insertIndex = lastInStage === -1 ? rest.length : lastInStage + 1;
    }
    const reordered = [...rest.slice(0, insertIndex), dragged, ...rest.slice(insertIndex)];
    const order = reordered.map((l) => ({ id: l.id, stageName: l.id === draggedId ? targetStageName : l.stageName }));

    await authFetch("/api/board/curriculum/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    }).catch(() => {});
  }

  return (
    <div className="curric">
      {levelsError && <FetchFailedState message={levelsError} />}
      {groupsError && <FetchFailedState message={groupsError} />}

      <div className="curric-bar">
        <div className="curric-search">
          <span className="curric-search-icon" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search every topic — “past”, “food”, “directions”…"
            aria-label="Search the curriculum"
          />
          {search && (
            <button type="button" className="curric-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
              ×
            </button>
          )}
        </div>

        <div className="curric-bar-row">
          <div className="curric-classes" role="tablist" aria-label="Class in context">
            {(groups ?? []).map((g) => {
              const on = g.id === activeGroupId;
              return (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={on}
                  className={`curric-class${on ? " on" : ""}`}
                  style={{ ["--chip" as string]: groupColor(g.id) }}
                  onClick={() => setActiveGroupId(on ? null : g.id)}
                  title={on ? "Tap again to browse without a class in context" : `Show the curriculum through ${g.name}'s eyes`}
                >
                  <span className="curric-class-dot" />
                  {g.name}
                </button>
              );
            })}
          </div>

          <div className="curric-bar-tools">
            {activeGroup && (
              <button type="button" className="curric-jump" onClick={scrollToCurrent}>
                📍 Jump to Level {activeGroup.currentLevel}
              </button>
            )}
            <button
              type="button"
              className={`chip${editMode ? " chip-on" : ""}`}
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editMode}
            >
              {editMode ? "✓ Done editing" : "✏️ Edit syllabus"}
            </button>
          </div>
        </div>

        {activeGroup && (
          <div className="curric-lens" role="group" aria-label="Filter topics">
            {(
              [
                { value: "all", label: "Every topic" },
                { value: "todo", label: "Not taught yet" },
                { value: "mastered", label: `Mastered (${mastered.size})` },
              ] as { value: TopicLens; label: string }[]
            ).map((l) => (
              <button
                key={l.value}
                type="button"
                className={`chip${lens === l.value ? " chip-on" : ""}`}
                onClick={() => setLens(l.value)}
                aria-pressed={lens === l.value}
              >
                {l.label}
              </button>
            ))}
            <span className="curric-count">
              {matchCount} of {totalTopics} topics
            </span>
          </div>
        )}

        {assigning && <div className="hub-saving">Saving…</div>}
      </div>

      {!levelsLoading && (levels ?? []).length === 0 && (
        <EmptyState title="No curriculum yet" hint='Turn on "Edit syllabus", then add your first stage below.' />
      )}

      {!levelsLoading && (levels ?? []).length > 0 && matchCount === 0 && (
        <EmptyState
          title={search ? `Nothing matches “${search.trim()}”` : "Nothing in this filter"}
          hint={search ? "Try a shorter word — the search looks at topics, level titles and stage names." : "Switch back to “Every topic”."}
        />
      )}

      {stages.map((stage) => {
        const color = STAGE_COLORS[(stageIndexByName.get(stage.name) ?? 0) % STAGE_COLORS.length];
        const stageDropActive = dragLevelId !== null && dropTarget === `stage-end:${stage.name}`;
        return (
          <section key={stage.name} className="curric-stage">
            <div className="curric-stage-head">
              <span className="curric-stage-dot" style={{ background: color }} />
              <h2 className="curric-stage-name">{stage.name}</h2>
              <span className="curric-stage-count">{stage.levels.length} levels</span>
            </div>

            <div className="curric-grid">
              {stage.levels.map(({ level: lvl, topics }, i) => {
                const isHere = activeGroup?.currentLevel === lvl.levelNumber;
                const masteredHere = lvl.subtopics.filter((t) => mastered.has(t)).length;
                const isDropTarget = dragLevelId !== null && dragLevelId !== lvl.id && dropTarget === lvl.id;
                return (
                  <article
                    key={lvl.id}
                    ref={isHere ? currentCardRef : undefined}
                    className={`curric-card${isHere ? " here" : ""}${isDropTarget ? " drop" : ""}${dragLevelId === lvl.id ? " dragging" : ""}`}
                    style={{ ["--lvl" as string]: levelColor(lvl), ["--i" as string]: i }}
                    draggable={editMode}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDragLevelId(lvl.id);
                    }}
                    onDragEnd={() => {
                      setDragLevelId(null);
                      setDropTarget(null);
                    }}
                    onDragOver={(e) => {
                      if (!editMode || !dragLevelId || dragLevelId === lvl.id) return;
                      e.preventDefault();
                      setDropTarget(lvl.id);
                    }}
                    onDragLeave={() => setDropTarget((cur) => (cur === lvl.id ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragLevelId && dragLevelId !== lvl.id) void reorderTo(dragLevelId, stage.name, lvl.id);
                      setDragLevelId(null);
                      setDropTarget(null);
                    }}
                  >
                    <header className="curric-card-head">
                      <span className="curric-card-emoji" aria-hidden>
                        {lvl.emoji}
                      </span>
                      <div className="curric-card-titles">
                        <span className="curric-card-level">Level {lvl.levelNumber}</span>
                        <span className="curric-card-title">{lvl.title}</span>
                      </div>
                      {editMode ? (
                        <button
                          type="button"
                          className="curric-card-edit"
                          onClick={() => setActiveModal({ kind: "levelEdit", level: lvl })}
                          title="Edit this level — icon, colour, title, topics"
                        >
                          ✎
                        </button>
                      ) : (
                        activeGroup && (
                          <span className="curric-card-progress" title={`${masteredHere} of ${lvl.subtopics.length} mastered`}>
                            {masteredHere}/{lvl.subtopics.length}
                          </span>
                        )
                      )}
                    </header>

                    {isHere && activeGroup && (
                      <div className="curric-card-here" style={{ background: groupColor(activeGroup.id) }}>
                        📍 {activeGroup.name} is here
                      </div>
                    )}

                    <div className="curric-topics">
                      {topics.map((topic) => {
                        const isCurrent = isHere && topic === activeGroup?.currentTopic;
                        const done = mastered.has(topic);
                        return (
                          <button
                            key={topic}
                            type="button"
                            className={`curric-topic${isCurrent ? " current" : ""}${done ? " done" : ""}`}
                            onClick={() => setOpenTopic({ topic, level: lvl })}
                          >
                            <span className="curric-topic-mark" aria-hidden>
                              {isCurrent ? "📍" : done ? "✓" : ""}
                            </span>
                            <span className="curric-topic-text">{topic}</span>
                          </button>
                        );
                      })}
                      {topics.length === 0 && <div className="curric-topics-empty">No topics yet</div>}
                    </div>
                  </article>
                );
              })}
            </div>

            {editMode && (
              <button
                type="button"
                className={`curric-add-level${stageDropActive ? " drop" : ""}`}
                onClick={() => addLevel(stage.name)}
                disabled={addingLevelToStage !== null}
                onDragOver={(e) => {
                  if (!dragLevelId) return;
                  e.preventDefault();
                  setDropTarget(`stage-end:${stage.name}`);
                }}
                onDragLeave={() => setDropTarget((cur) => (cur === `stage-end:${stage.name}` ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragLevelId) void reorderTo(dragLevelId, stage.name, null);
                  setDragLevelId(null);
                  setDropTarget(null);
                }}
              >
                <LoadingLabel loading={addingLevelToStage === stage.name}>+ Add a level to {stage.name}</LoadingLabel>
              </button>
            )}
          </section>
        );
      })}

      {editMode && (
        <button type="button" className="btn btn-secondary curric-add-stage" onClick={() => setActiveModal({ kind: "newStage" })}>
          + Add a new stage
        </button>
      )}

      {openTopic && (
        <TopicSheet
          topic={openTopic.topic}
          level={openTopic.level}
          group={activeGroup}
          isCurrent={activeGroup?.currentLevel === openTopic.level.levelNumber && activeGroup?.currentTopic === openTopic.topic}
          mastered={mastered.has(openTopic.topic)}
          onAssign={() => {
            void assignTopic(openTopic.level.levelNumber, openTopic.topic);
            setOpenTopic(null);
          }}
          onPlanLesson={() => {
            setActiveModal({ kind: "planLesson", topic: openTopic.topic });
            setOpenTopic(null);
          }}
          onClose={() => setOpenTopic(null)}
        />
      )}

      {activeModal?.kind === "newStage" && (
        <PromptModal
          title="New stage"
          label="Stage name"
          placeholder="e.g. Mastery Stage: Expression & Storytelling"
          confirmLabel="Create"
          onCancel={() => setActiveModal(null)}
          onSubmit={async (name) => {
            await addLevel(name);
            setActiveModal(null);
          }}
        />
      )}

      {activeModal?.kind === "levelEdit" && (
        <LevelEditModal
          level={activeModal.level}
          onClose={() => setActiveModal(null)}
          onSave={(updates) => saveLevel(activeModal.level, updates)}
          onDelete={() => deleteLevel(activeModal.level)}
        />
      )}

      {activeModal?.kind === "planLesson" && (
        <NewLessonModal
          groups={groups ?? []}
          tags={tags}
          defaultGroupId={activeGroupId ?? undefined}
          defaultTopic={activeModal.topic}
          onTagCreated={(t) => setTags((prev) => [...prev, t])}
          onClose={() => setActiveModal(null)}
          onCreated={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}
