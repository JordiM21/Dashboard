"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { ACTIVITIES, ACTIVITY_KIND_LABEL, filterActivities, type ActivityKind } from "@/lib/activityBank";
import type { CurriculumLevelDoc, GroupDocWithRecall } from "@/lib/types";

const KIND_FILTERS: { value: ActivityKind | "all"; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "warmup", label: ACTIVITY_KIND_LABEL.warmup },
  { value: "game", label: ACTIVITY_KIND_LABEL.game },
  { value: "speaking", label: ACTIVITY_KIND_LABEL.speaking },
  { value: "drill", label: ACTIVITY_KIND_LABEL.drill },
  { value: "creative", label: ACTIVITY_KIND_LABEL.creative },
];

/**
 * One topic, opened from the curriculum grid — the answer to "it's twenty
 * minutes to class, what am I actually going to do with this?".
 *
 * The two decisions a teacher makes here are both one tap: send a class to
 * this topic, or start planning the lesson on it. Everything below that is
 * the activity bank — concrete formats with the topic already dropped into
 * the steps, so the sheet is a runnable plan rather than a prompt to go
 * think of one.
 */
export default function TopicSheet({
  topic,
  level,
  group,
  isCurrent,
  mastered,
  onAssign,
  onPlanLesson,
  onClose,
}: {
  topic: string;
  level: CurriculumLevelDoc;
  /** The class in context, if one is picked — drives the assign button and the status line. */
  group: GroupDocWithRecall | null;
  isCurrent: boolean;
  mastered: boolean;
  onAssign: () => void;
  onPlanLesson: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const [noPrepOnly, setNoPrepOnly] = useState(false);
  const [openActivity, setOpenActivity] = useState<string | null>(ACTIVITIES[0]?.id ?? null);

  const activities = filterActivities(kind, noPrepOnly);
  const accent = level.color ?? "var(--mango)";

  return (
    <Modal title={topic} onClose={onClose} maxWidth={720}>
      <div className="topic-sheet" style={{ ["--topic-accent" as string]: accent }}>
        <div className="topic-sheet-head">
          <span className="topic-sheet-emoji" aria-hidden>
            {level.emoji}
          </span>
          <div className="topic-sheet-place">
            <span className="topic-sheet-level">
              Level {level.levelNumber} · {level.title}
            </span>
            <span className="topic-sheet-stage">{level.stageName}</span>
          </div>
          {group && (
            <span className={`topic-sheet-status${isCurrent ? " current" : mastered ? " mastered" : ""}`}>
              {isCurrent ? `📍 ${group.name} is here` : mastered ? `✅ ${group.name} mastered this` : `${group.name} hasn't done this`}
            </span>
          )}
        </div>

        <div className="topic-sheet-actions">
          <button className="btn btn-primary" onClick={onPlanLesson}>
            ✏️ Plan a lesson on this
          </button>
          {group && !isCurrent && (
            <button className="btn btn-secondary" onClick={onAssign}>
              📍 Teach this next with {group.name}
            </button>
          )}
        </div>

        <div className="topic-sheet-section">
          <div className="topic-sheet-section-head">
            <h3 className="topic-sheet-section-title">How to run it</h3>
            <span className="topic-sheet-section-count">{activities.length}</span>
          </div>
          <p className="topic-sheet-hint">
            Formats that work with any topic — the steps below already have &ldquo;{topic}&rdquo; dropped into them. Pick one, read the four
            lines, go.
          </p>

          <div className="topic-sheet-filters">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`chip${kind === f.value ? " chip-on" : ""}`}
                onClick={() => setKind(f.value)}
                aria-pressed={kind === f.value}
              >
                {f.label}
              </button>
            ))}
            <button
              type="button"
              className={`chip${noPrepOnly ? " chip-on" : ""}`}
              onClick={() => setNoPrepOnly((v) => !v)}
              aria-pressed={noPrepOnly}
              title="Only activities you can start with nothing prepared"
            >
              ⚡ No prep
            </button>
          </div>

          <div className="activity-list">
            {activities.length === 0 && <div className="hub-empty">Nothing matches those filters — try &ldquo;Everything&rdquo;.</div>}
            {activities.map((a, i) => {
              const open = openActivity === a.id;
              return (
                <div key={a.id} className={`activity${open ? " open" : ""}`} style={{ ["--i" as string]: i }}>
                  <button
                    type="button"
                    className="activity-head"
                    onClick={() => setOpenActivity((cur) => (cur === a.id ? null : a.id))}
                    aria-expanded={open}
                  >
                    <span className="activity-emoji" aria-hidden>
                      {a.emoji}
                    </span>
                    <span className="activity-head-body">
                      <span className="activity-name">{a.name}</span>
                      <span className="activity-blurb">{a.blurb}</span>
                    </span>
                    <span className="activity-meta">
                      <span className="activity-badge">{a.minutes} min</span>
                      <span className="activity-badge">{a.ages === "all" ? "Any age" : a.ages}</span>
                      {a.prep === "none" && <span className="activity-badge badge-noprep">⚡ No prep</span>}
                    </span>
                    <span className={`activity-chevron${open ? " open" : ""}`} aria-hidden>
                      ▾
                    </span>
                  </button>

                  {open && (
                    <div className="activity-body">
                      <ol className="activity-steps">
                        {a.steps(topic).map((s, si) => (
                          <li key={si}>{s}</li>
                        ))}
                      </ol>
                      <p className="activity-tip">
                        <strong>Why it works:</strong> {a.tip}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
