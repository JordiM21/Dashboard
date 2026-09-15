"use client";

import { useEffect, useRef, useState } from "react";
import type { CurriculumLevelDoc, GroupDocWithRecall } from "@/lib/types";

/**
 * Where a group sits in the syllabus, and where to send them next — inline,
 * inside Groups, instead of a trip to a separate Curriculum tab. Collapsed,
 * it's just the current level/topic; opened, it's the same "click a
 * subtopic to move them there" assign that used to live only on the full
 * Curriculum Board, scoped to the one group you're already looking at, plus
 * a "+" per topic to plan a lesson on it without leaving this panel.
 *
 * The full board (multi-group assignment, add/rename/reorder levels) is
 * still one click away via `onOpenFullBoard` — this view is the fast path
 * for the thing a teacher actually does every day: check where a group is,
 * decide where they go next, plan that lesson.
 */
export default function CurriculumPicker({
  levels,
  group,
  masteredTopics,
  onAssign,
  onPlanLesson,
  onOpenFullBoard,
}: {
  levels: CurriculumLevelDoc[];
  group: GroupDocWithRecall;
  masteredTopics: Set<string>;
  onAssign: (levelNumber: number, topic: string) => void;
  onPlanLesson: (topic: string) => void;
  onOpenFullBoard: () => void;
}) {
  const [open, setOpen] = useState(false);
  const currentRef = useRef<HTMLDivElement>(null);
  const currentLevel = levels.find((l) => l.levelNumber === group.currentLevel);

  // Land on the group's actual position, not the top of a 20-level list —
  // the whole point of opening this is "where am I, what's next".
  useEffect(() => {
    if (open) requestAnimationFrame(() => currentRef.current?.scrollIntoView({ block: "center" }));
  }, [open]);

  return (
    <div className="curric-picker">
      <button type="button" className="curric-picker-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="curric-picker-trigger-icon">{currentLevel?.emoji ?? "📍"}</span>
        <span className="curric-picker-trigger-body">
          <span className="curric-picker-trigger-level">
            Level {group.currentLevel}
            {currentLevel ? ` · ${currentLevel.title}` : ""}
          </span>
          <span className="curric-picker-trigger-topic">{group.currentTopic || "No topic set — pick one"}</span>
        </span>
        <span className={`curric-picker-chevron${open ? " open" : ""}`} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="curric-picker-panel">
          {levels.length === 0 && <div className="hub-empty">No syllabus levels yet — build it on the full board.</div>}
          {levels.map((lvl) => (
            <div key={lvl.id} className="curric-picker-level">
              <div className="curric-picker-level-head">
                <span aria-hidden>{lvl.emoji}</span>
                <span>
                  Level {lvl.levelNumber} · {lvl.title}
                </span>
              </div>
              <div className="curric-picker-topics">
                {lvl.subtopics.map((topic) => {
                  const isCurrent = lvl.levelNumber === group.currentLevel && topic === group.currentTopic;
                  const mastered = masteredTopics.has(topic);
                  return (
                    <div key={topic} ref={isCurrent ? currentRef : undefined} className={`curric-picker-topic${isCurrent ? " current" : ""}`}>
                      <button
                        type="button"
                        className="curric-picker-topic-btn"
                        onClick={() => {
                          onAssign(lvl.levelNumber, topic);
                          setOpen(false);
                        }}
                      >
                        {isCurrent && (
                          <span className="curric-picker-here" title={`${group.name} is here`}>
                            📍
                          </span>
                        )}
                        {mastered && !isCurrent && (
                          <span className="curric-picker-mastered" title="Already mastered">
                            ✓
                          </span>
                        )}
                        {topic}
                      </button>
                      <button
                        type="button"
                        className="curric-picker-plan"
                        title={`Plan a lesson on "${topic}"`}
                        onClick={() => {
                          onPlanLesson(topic);
                          setOpen(false);
                        }}
                      >
                        +
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="hub-inline-btn curric-picker-full"
            onClick={() => {
              onOpenFullBoard();
              setOpen(false);
            }}
          >
            🗺️ Open the full syllabus board — edit levels, or move another group
          </button>
        </div>
      )}
    </div>
  );
}
