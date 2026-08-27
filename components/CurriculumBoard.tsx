"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/firebase/authFetch";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { FetchFailedState, EmptyState } from "@/components/StateBox";
import PromptModal from "@/components/PromptModal";
import AddHistoryModal from "@/components/AddHistoryModal";
import LoadingLabel from "@/components/LoadingLabel";
import type { CurriculumLevelDoc, GroupDocWithRecall, GroupHistoryEntry } from "@/lib/types";

/** Which prompt-style modal (if any) is currently open — one shared PromptModal instance covers all three, plus AddHistoryModal for backfilling a group's past topics. */
type ActiveModal =
  | { kind: "newGroup" }
  | { kind: "addTopic"; level: CurriculumLevelDoc }
  | { kind: "editTopic"; level: CurriculumLevelDoc; topic: string }
  | { kind: "addHistory"; group: GroupDocWithRecall; entry?: GroupHistoryEntry };

// Cycled by a group's position in the list — plenty of visual distinction for the
// handful of groups this school actually runs, without hardcoding names.
const GROUP_COLORS = ["var(--accent)", "var(--success)", "var(--warning)", "var(--danger)"];

// One fixed color per stage, cycled by the stage's position in the level
// list (same approach as GROUP_COLORS) — a 5th stage wouldn't break either.
const STAGE_COLORS = ["#e07a5f", "#5b9bd1", "#8a63d2", "#3aa679"];

// Every history entry ever — fetched once per group so both the grey
// mastery badges and the "recent history" card can read from one cache
// instead of each firing their own request.
const ALL_TIME_SINCE = "0000-01-01";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Compact Apple-style pill switch — replaces the raw checkbox for "Edit Syllabus". */
function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          background: checked ? "var(--accent)" : "var(--line)",
          position: "relative",
          transition: "background 0.2s ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "var(--shadow)",
            transition: "left 0.2s ease",
          }}
        />
      </span>
    </button>
  );
}

/**
 * The Curriculum Board — click-based (Apple HIG style), not drag-and-drop:
 * click a group pill to make it the active "paintbrush" (a glowing ring
 * shows it's active), then click any subtopic to instantly assign it as
 * that group's current topic — zero modals. The same active group also
 * surfaces small grey badges on every subtopic they've ever mastered.
 * Toggle "Edit Syllabus" to add/rename/delete topics and levels inline.
 * Reads `curriculum` and `groups` directly from Firestore — see
 * lib/firebase/curriculumBoard.ts and app/api/board/**.
 */
export default function CurriculumBoard() {
  const { data: levels, loading: levelsLoading, error: levelsSubError } = useFirestoreCollection<CurriculumLevelDoc>(
    "curriculum",
    { orderByField: "levelNumber" }
  );

  const [groups, setGroups] = useState<GroupDocWithRecall[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [reportingGroupId, setReportingGroupId] = useState<string | null>(null);
  const [reportFlashGroupId, setReportFlashGroupId] = useState<string | null>(null);
  const [historyByGroup, setHistoryByGroup] = useState<Record<string, GroupHistoryEntry[]>>({});

  const [editMode, setEditMode] = useState(false);
  const [addingLevel, setAddingLevel] = useState(false);

  // The active "paintbrush" — set by clicking a group pill. While set,
  // clicking any subtopic instantly assigns it to this group. Grey mastery
  // badges (below) are always on for every group, not tied to this.
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);

  const loadGroupHistory = useCallback((groupId: string) => {
    authFetch(`/api/board/groups/${groupId}/history?since=${ALL_TIME_SINCE}`)
      .then((res) => res.json())
      .then((h: { entries: GroupHistoryEntry[] }) =>
        setHistoryByGroup((prev) => ({ ...prev, [groupId]: h.entries.slice().sort((a, b) => b.date.localeCompare(a.date)) }))
      )
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
        // Full history, once per group — the grey mastery badges and the
        // "recent history" card both read from this same cache.
        for (const g of body.groups) loadGroupHistory(g.id);
      })
      .catch((err) => setGroupsError(err.message));
  }, [loadGroupHistory]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  /** Group id -> set of topics they've ever mastered — the board's grey badges. Derived from historyByGroup, not a separate fetch. */
  const masteredTopicsByGroup = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const [groupId, entries] of Object.entries(historyByGroup)) {
      map[groupId] = new Set(entries.filter((e) => e.status === "Mastered").map((e) => e.topic));
    }
    return map;
  }, [historyByGroup]);

  /** A group's history entries from the last 30 days, newest first — sliced client-side from the cached all-time list. */
  function recentHistory(groupId: string): GroupHistoryEntry[] | undefined {
    const all = historyByGroup[groupId];
    if (!all) return undefined;
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString().slice(0, 10);
    return all.filter((e) => e.date >= cutoff);
  }

  const stages = useMemo(() => {
    if (!levels) return [];
    const order: string[] = [];
    const byStage = new Map<string, CurriculumLevelDoc[]>();
    for (const lvl of levels) {
      if (!byStage.has(lvl.stageName)) {
        byStage.set(lvl.stageName, []);
        order.push(lvl.stageName);
      }
      byStage.get(lvl.stageName)!.push(lvl);
    }
    return order.map((name) => ({ name, levels: byStage.get(name)! }));
  }, [levels]);

  function groupColor(groupId: string): string {
    const idx = (groups ?? []).findIndex((g) => g.id === groupId);
    return GROUP_COLORS[idx % GROUP_COLORS.length] ?? GROUP_COLORS[0];
  }

  function stageColor(stageIndex: number): string {
    return STAGE_COLORS[stageIndex % STAGE_COLORS.length];
  }

  function groupsAt(levelNumber: number, topic: string): GroupDocWithRecall[] {
    return (groups ?? []).filter((g) => g.currentLevel === levelNumber && g.currentTopic === topic);
  }

  async function assignTopic(groupId: string, currentLevel: number, currentTopic: string) {
    setAssigning(true);
    setGroups((prev) => prev?.map((g) => (g.id === groupId ? { ...g, currentLevel, currentTopic } : g)) ?? prev);
    try {
      const res = await authFetch(`/api/board/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentLevel, currentTopic }),
      });
      if (!res.ok) throw new Error(`Assign failed with ${res.status}`);
    } catch {
      loadGroups(); // revert the optimistic update by re-fetching the real state
    } finally {
      setAssigning(false);
    }
  }

  async function createGroup(name: string) {
    const res = await authFetch("/api/board/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      loadGroups();
      setActiveModal(null);
    } else {
      window.alert("Couldn't create that group.");
    }
  }

  /** Toggles the paintbrush — click a pill to make it active (one-click assign), click again to put the brush down. */
  function toggleActiveGroup(groupId: string) {
    setActiveGroup((cur) => (cur === groupId ? null : groupId));
  }

  /** Paintbrush click on a subtopic — instantly assigns it to whichever group is active. No-op if edit mode is on or no brush is picked up. */
  function paintTopic(levelNumber: number, topic: string) {
    if (!activeGroup) return;
    assignTopic(activeGroup, levelNumber, topic);
  }

  async function submitNewTopic(level: CurriculumLevelDoc, topic: string) {
    await authFetch(`/api/board/curriculum/${level.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtopics: [...level.subtopics, topic] }),
    });
    setActiveModal(null);
  }

  async function submitTopicRename(level: CurriculumLevelDoc, oldTopic: string, newTopic: string) {
    await authFetch(`/api/board/curriculum/${level.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtopics: level.subtopics.map((t) => (t === oldTopic ? newTopic : t)) }),
    });
    setActiveModal(null);
  }

  async function deleteTopic(level: CurriculumLevelDoc, topic: string) {
    await authFetch(`/api/board/curriculum/${level.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtopics: level.subtopics.filter((t) => t !== topic) }),
    });
    setActiveModal(null);
  }

  async function addLevel() {
    setAddingLevel(true);
    try {
      const res = await authFetch("/api/board/curriculum", { method: "POST" });
      if (!res.ok) window.alert("Couldn't add a new level.");
    } finally {
      setAddingLevel(false);
    }
  }

  /** Builds a celebratory summary of a group's last 30 days from the cached history and copies it to the clipboard — the "Generate Parent Report" button. */
  async function generateParentReport(group: GroupDocWithRecall) {
    setReportingGroupId(group.id);
    try {
      const entries = (recentHistory(group.id) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));

      const lines = [`🎉 Progress Update — ${group.name} 🎉`, ""];
      if (entries.length === 0) {
        lines.push("No lessons logged in the last 30 days yet — check back soon!");
      } else {
        lines.push(`Over the last 30 days, ${group.name} covered ${entries.length} topic${entries.length === 1 ? "" : "s"}:`, "");
        for (const e of entries) {
          const icon = e.status === "Mastered" ? "✅" : "🔁";
          lines.push(`${icon} ${e.topic} — ${e.status}${e.teacherNotes ? ` (${e.teacherNotes})` : ""}`);
        }
        lines.push("", "Great work this month — keep it up! 🌟");
      }

      await navigator.clipboard.writeText(lines.join("\n"));
      setReportFlashGroupId(group.id);
      setTimeout(() => setReportFlashGroupId((cur) => (cur === group.id ? null : cur)), 2000);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't generate the report.");
    } finally {
      setReportingGroupId(null);
    }
  }

  return (
    <div>
      <section
        style={{
          position: "sticky",
          // Below #floating-nav's own sticky top:16px + its pill height, so
          // the two stack instead of overlapping — see app/globals.css.
          top: 72,
          zIndex: 40,
          background: "var(--cream)",
          paddingTop: 12,
          paddingBottom: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Groups</div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              Click a group to pick up the brush, then click any subtopic to assign it there.
            </div>
          </div>
          <ToggleSwitch checked={editMode} onChange={setEditMode} label="Edit Syllabus" />
        </div>

        {groupsError && <FetchFailedState message={groupsError} />}
        {!groupsError && groups && groups.length === 0 && (
          <EmptyState title="No groups yet" hint='Click "+ New Group" below to add one.' />
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          {(groups ?? []).map((g) => {
            const active = activeGroup === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleActiveGroup(g.id)}
                title={g.currentTopic ? `${g.name} — Level ${g.currentLevel}, ${g.currentTopic}` : `${g.name} — Level ${g.currentLevel}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: groupColor(g.id),
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  border: "2px solid transparent",
                  boxShadow: active ? "0 0 0 3px var(--white), 0 0 0 5px var(--accent)" : "none",
                  transform: active ? "scale(1.06)" : "scale(1)",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  cursor: "pointer",
                }}
              >
                {g.name}
                <span style={{ fontWeight: 400, opacity: 0.85 }}>· Lvl {g.currentLevel}</span>
                {g.reviewSuggested && (
                  <span title="Review suggested — mastered 90+ days ago" style={{ fontSize: 13 }}>
                    🔁
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setActiveModal({ kind: "newGroup" })}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: "transparent",
              border: "2px dashed var(--line)",
              color: "var(--ink-soft)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            + New Group
          </button>
        </div>
        {assigning && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>Saving…</div>}
      </section>

      <section style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Group Progress</div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 14 }}>
          Copy a celebratory parent-ready summary of the last 30 days straight to your clipboard.
        </div>
        {groups && groups.length > 0 && (
          <div className="grid grid-cards">
            {groups.map((g) => {
              const level = (levels ?? []).find((l) => l.levelNumber === g.currentLevel);
              const recent = recentHistory(g.id);
              return (
                <div key={g.id} className="card card-pad">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{g.name}</div>
                    <span className="tag" style={{ background: groupColor(g.id), color: "#fff", flexShrink: 0 }}>
                      Level {g.currentLevel}/20
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 10 }}>{level?.title ?? `Level ${g.currentLevel}`}</div>
                  {g.currentTopic && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>{g.currentTopic}</div>}
                  {g.reviewSuggested && (
                    <div style={{ fontSize: 12, marginTop: 8, color: "var(--warning)", fontWeight: 600 }}>
                      🔁 Review suggested — mastered 90+ days ago
                    </div>
                  )}
                  <div className="modal-actions" style={{ justifyContent: "flex-start", marginTop: 12, paddingTop: 0, flexWrap: "wrap" }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => generateParentReport(g)}
                      disabled={reportingGroupId === g.id}
                    >
                      <LoadingLabel loading={reportingGroupId === g.id}>
                        {reportFlashGroupId === g.id ? "Copied! 📋" : "📋 Generate Parent Report"}
                      </LoadingLabel>
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setActiveModal({ kind: "addHistory", group: g })}>
                      + Add Past Topic
                    </button>
                  </div>

                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 6 }}>
                      RECENT HISTORY (LAST 30 DAYS)
                    </div>
                    {recent === undefined ? (
                      <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Loading…</div>
                    ) : recent.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--ink-soft)", fontStyle: "italic" }}>Nothing logged yet.</div>
                    ) : (
                      <div style={{ maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                        {recent.map((entry) => {
                          const row = (
                            <>
                              <span style={{ color: "var(--ink-soft)", flexShrink: 0 }}>{entry.date}</span>
                              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {entry.topic}
                              </span>
                              <span style={{ flexShrink: 0 }}>{entry.status === "Mastered" ? "✅" : "🔁"}</span>
                            </>
                          );
                          return editMode ? (
                            <button
                              key={entry.id}
                              type="button"
                              className="subtopic-chip interactive"
                              onClick={() => setActiveModal({ kind: "addHistory", group: g, entry })}
                              style={{
                                fontSize: 12,
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 8,
                                width: "100%",
                                padding: "3px 6px",
                                borderRadius: "var(--radius-sm)",
                                background: "transparent",
                                border: "1px solid transparent",
                                textAlign: "left",
                                font: "inherit",
                                cursor: "pointer",
                              }}
                            >
                              {row}
                            </button>
                          ) : (
                            <div key={entry.id} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", gap: 8 }}>
                              {row}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Curriculum Board</div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 14 }}>
          {editMode
            ? "Edit mode — click a subtopic to rename or delete it, or add new topics/levels below."
            : activeGroup
              ? `🖌️ ${(groups ?? []).find((g) => g.id === activeGroup)?.name ?? "This group"}'s brush is active — click any subtopic to assign it.`
              : "The 20-level syllabus, live from Firestore. Pick up a group's brush above, then click a subtopic to assign it."}
          {" "}Grey badges show every topic a group has already mastered.
        </div>

        {levelsSubError && <FetchFailedState message={levelsSubError} />}
        {!levelsSubError && !levelsLoading && levels && levels.length === 0 && (
          <EmptyState title="No curriculum levels yet" hint='Click "+ Add New Level" below to get started.' />
        )}

        {stages.map((stage, stageIndex) => {
          const color = stageColor(stageIndex);
          return (
            <div key={stage.name} style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>{stage.name}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                {stage.levels.map((lvl) => {
                  const hereNoTopic = groupsAt(lvl.levelNumber, "");
                  return (
                    <div key={lvl.id} className="card" style={{ padding: 14, borderColor: color }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            background: color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 15,
                            flexShrink: 0,
                          }}
                        >
                          {lvl.emoji}
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)" }}>LEVEL {lvl.levelNumber}</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{lvl.title}</div>
                        </div>
                      </div>

                      {hereNoTopic.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
                          {hereNoTopic.map((g) => (
                            <span
                              key={g.id}
                              style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: groupColor(g.id), color: "#fff" }}
                            >
                              {g.name.replace("Group ", "")}
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                        {lvl.subtopics.map((topic) => {
                          const here = groupsAt(lvl.levelNumber, topic);
                          // Every group that's mastered this topic but isn't currently sitting on it (that's what the bright "here" badge already covers).
                          const masteredBy = (groups ?? []).filter(
                            (g) => masteredTopicsByGroup[g.id]?.has(topic) && !here.some((h) => h.id === g.id)
                          );
                          return (
                            <button
                              key={topic}
                              type="button"
                              className={`subtopic-chip${editMode || activeGroup ? " interactive" : ""}`}
                              onClick={() =>
                                editMode ? setActiveModal({ kind: "editTopic", level: lvl, topic }) : paintTopic(lvl.levelNumber, topic)
                              }
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 6,
                                fontSize: 12,
                                padding: "5px 8px",
                                borderRadius: "var(--radius-sm)",
                                background: "var(--cream)",
                                border: "1px solid transparent",
                                cursor: editMode || activeGroup ? "pointer" : "default",
                                textAlign: "left",
                                font: "inherit",
                                transition: "background 0.15s ease",
                              }}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topic}</span>
                              {(here.length > 0 || masteredBy.length > 0) && (
                                <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                                  {here.map((g) => (
                                    <span
                                      key={g.id}
                                      title={g.name}
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        padding: "2px 6px",
                                        borderRadius: 999,
                                        background: groupColor(g.id),
                                        color: "#fff",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {g.name.replace("Group ", "")}
                                    </span>
                                  ))}
                                  {masteredBy.map((g) => (
                                    <span
                                      key={g.id}
                                      title={`Mastered by ${g.name}`}
                                      style={{
                                        width: 16,
                                        height: 16,
                                        borderRadius: "50%",
                                        background: "var(--ink-soft)",
                                        color: "#fff",
                                        fontSize: 9,
                                        fontWeight: 700,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        flexShrink: 0,
                                      }}
                                    >
                                      {g.name.replace("Group ", "").charAt(0)}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </button>
                          );
                        })}

                        {editMode && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setActiveModal({ kind: "addTopic", level: lvl })}
                            style={{ justifyContent: "flex-start", marginTop: 4 }}
                          >
                            + Add Topic
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {editMode && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={addLevel}
            disabled={addingLevel}
            style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
          >
            <LoadingLabel loading={addingLevel}>+ Add New Level</LoadingLabel>
          </button>
        )}
      </section>

      {activeModal?.kind === "newGroup" && (
        <PromptModal
          title="New Group"
          label="Group name"
          placeholder="e.g. Group C"
          confirmLabel="Create"
          onCancel={() => setActiveModal(null)}
          onSubmit={createGroup}
        />
      )}
      {activeModal?.kind === "addTopic" && (
        <PromptModal
          title={`Add Topic — Level ${activeModal.level.levelNumber}`}
          label={activeModal.level.title}
          placeholder="e.g. Present Continuous"
          confirmLabel="Add"
          onCancel={() => setActiveModal(null)}
          onSubmit={(topic) => submitNewTopic(activeModal.level, topic)}
        />
      )}
      {activeModal?.kind === "editTopic" && (
        <PromptModal
          title={`Edit Topic — Level ${activeModal.level.levelNumber}`}
          label={activeModal.level.title}
          initialValue={activeModal.topic}
          confirmLabel="Save"
          onCancel={() => setActiveModal(null)}
          onSubmit={(topic) => submitTopicRename(activeModal.level, activeModal.topic, topic)}
          onDelete={() => deleteTopic(activeModal.level, activeModal.topic)}
        />
      )}
      {activeModal?.kind === "addHistory" && (
        <AddHistoryModal
          group={activeModal.group}
          entry={activeModal.entry}
          onClose={() => setActiveModal(null)}
          onSaved={() => {
            loadGroupHistory(activeModal.group.id);
            setActiveModal(null);
          }}
          onDeleted={
            activeModal.entry
              ? () => {
                  loadGroupHistory(activeModal.group.id);
                  setActiveModal(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
