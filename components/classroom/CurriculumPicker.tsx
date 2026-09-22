"use client";

import type { CurriculumLevelDoc, GroupDocWithRecall } from "@/lib/types";

/**
 * Where a group sits in the syllabus — a status strip inside the group's
 * own panel, not a picker any more.
 *
 * It used to expand into the whole twenty-level list as a dropdown, which
 * was a bad place to choose from: no search, no sense of the path, and a
 * scroll inside a scroll. Choosing a topic is now the Curriculum tab's
 * job, so this shows the two facts worth showing here — which level, which
 * topic — and hands off.
 */
export default function CurriculumPicker({
  levels,
  group,
  onPlanLesson,
  onOpenCurriculum,
}: {
  levels: CurriculumLevelDoc[];
  group: GroupDocWithRecall;
  onPlanLesson: () => void;
  onOpenCurriculum: () => void;
}) {
  const currentLevel = levels.find((l) => l.levelNumber === group.currentLevel);

  return (
    <div className="curric-now">
      <span className="curric-now-icon" aria-hidden>
        {currentLevel?.emoji ?? "📍"}
      </span>
      <span className="curric-now-body">
        <span className="curric-now-level">
          Level {group.currentLevel}
          {currentLevel ? ` · ${currentLevel.title}` : ""}
        </span>
        <span className="curric-now-topic">{group.currentTopic || "No topic set yet"}</span>
      </span>
      <span className="curric-now-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onPlanLesson}>
          ✏️ Plan this
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenCurriculum}>
          Browse curriculum →
        </button>
      </span>
    </div>
  );
}
