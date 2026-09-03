"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import TagPicker from "@/components/TagPicker";
import LoadingLabel from "@/components/LoadingLabel";
import ConfirmModal from "@/components/ConfirmModal";
import { authFetch } from "@/lib/firebase/authFetch";
import { formatDateDMY, localDateIso } from "@/lib/dateUtils";
import { LINK_ICON, guessLinkTitle, isStorableUrl, linkKind, linkSource, linkThumb } from "@/lib/lessonLinks";
import type { CurriculumLevelDoc, GroupDoc, LessonLink, WeeklyPlanDoc, WeeklyPlanTagDoc } from "@/lib/types";

/** How long after the last keystroke the plan/takeaways text is PATCHed. Long enough that typing a paragraph is one request, short enough that closing the sheet almost never has anything left to flush. */
const AUTOSAVE_MS = 700;

type Verdict = "Mastered" | "Review Pending";

/**
 * One lesson, open: the plan you wrote, the material you linked, and — once
 * it's been taught — the takeaways and the verdict that logs it into the
 * group's history and moves them along the curriculum.
 *
 * Every field autosaves; there is no Save button and no dirty state to
 * reason about, which is the whole reason this replaced a canvas you had to
 * remember to leave cleanly.
 */
export default function LessonSheet({
  lesson,
  group,
  levels,
  tags,
  onTagCreated,
  onChanged,
  onDeleted,
  onEdit,
  onClose,
}: {
  lesson: WeeklyPlanDoc;
  group: GroupDoc | undefined;
  levels: CurriculumLevelDoc[];
  tags: WeeklyPlanTagDoc[];
  onTagCreated: (tag: WeeklyPlanTagDoc) => void;
  onChanged: (lesson: WeeklyPlanDoc) => void;
  onDeleted: (id: string) => void;
  /** Opens the scheduling modal (group / date / topic / emojis) for this lesson. */
  onEdit: () => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(lesson.teacherNotes);
  const [takeaways, setTakeaways] = useState(lesson.takeaways);
  const [links, setLinks] = useState<LessonLink[]>(lesson.links);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logging, setLogging] = useState<Verdict | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const taught = lesson.historyEntryId !== "";

  // One PATCH per changed field set, debounced. `pending` accumulates what
  // changed since the last flush so a burst of typing across two textareas
  // still lands as a single write.
  const pendingRef = useRef<Record<string, unknown>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useRef(async () => {});
  flush.current = async () => {
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/board/weekly-plans/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) onChanged((await res.json()) as WeeklyPlanDoc);
    } finally {
      setSaving(false);
    }
  };

  function queue(patch: Record<string, unknown>) {
    pendingRef.current = { ...pendingRef.current, ...patch };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush.current(), AUTOSAVE_MS);
  }

  // Closing (or navigating away from) the sheet writes whatever the debounce
  // window still holds — the one case where waiting it out would lose text.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void flush.current();
    };
  }, []);

  function addLink() {
    const url = newUrl.trim();
    if (!url) return;
    if (!isStorableUrl(url)) {
      setUrlError("Paste a full https:// link (or a /path from this dashboard).");
      return;
    }
    const link: LessonLink = { id: crypto.randomUUID(), url, title: newTitle.trim() || guessLinkTitle(url) };
    const next = [...links, link];
    setLinks(next);
    setNewUrl("");
    setNewTitle("");
    setUrlError(null);
    queue({ links: next });
  }

  function removeLink(id: string) {
    const next = links.filter((l) => l.id !== id);
    setLinks(next);
    queue({ links: next });
  }

  /**
   * Closes the lesson out: logs one `groups/{id}/history` entry (what the
   * parent report and the 90-day recall badge read), stamps its id on the
   * lesson so the timeline knows this one is taught, and moves the group's
   * placement onto this topic — teaching a topic IS the group being there,
   * so there's no separate step to remember on the curriculum board.
   */
  async function markTaught(status: Verdict) {
    setLogging(status);
    try {
      if (timerRef.current) clearTimeout(timerRef.current);
      await flush.current();

      const res = await authFetch(`/api/board/groups/${lesson.groupId}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: lesson.date || localDateIso(),
          topic: lesson.topic,
          status,
          teacherNotes: [notes, takeaways && `Takeaways: ${takeaways}`].filter(Boolean).join("\n\n"),
        }),
      });
      if (!res.ok) return;
      const entry = (await res.json()) as { id: string };

      const level = levels.find((l) => l.subtopics.includes(lesson.topic));
      if (level && group) {
        await authFetch(`/api/board/groups/${lesson.groupId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentLevel: level.levelNumber, currentTopic: lesson.topic }),
        }).catch(() => {});
      }

      const patch = await authFetch(`/api/board/weekly-plans/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyEntryId: entry.id }),
      });
      if (patch.ok) onChanged((await patch.json()) as WeeklyPlanDoc);
      onClose();
    } finally {
      setLogging(null);
    }
  }

  async function deleteLesson() {
    if (timerRef.current) clearTimeout(timerRef.current);
    pendingRef.current = {};
    await authFetch(`/api/board/weekly-plans/${lesson.id}`, { method: "DELETE" });
    onDeleted(lesson.id);
    onClose();
  }

  const level = levels.find((l) => l.subtopics.includes(lesson.topic));

  return (
    <Modal title={`${lesson.emojis.join(" ")} ${lesson.topic}`.trim()} onClose={onClose} maxWidth={720}>
      <div className="lesson-sheet-meta">
        <span className="tag">{group?.name ?? lesson.groupId}</span>
        <span className="tag">{formatDateDMY(lesson.date)}</span>
        {level && <span className="tag">Level {level.levelNumber} · {level.title}</span>}
        <span className={`badge ${taught ? "badge-done" : "badge-info"}`}>{taught ? "Taught" : "Planned"}</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={onEdit}>
          Reschedule
        </button>
        <span className="lesson-sheet-saving" data-on={saving}>
          Saving…
        </span>
      </div>

      <section className="lesson-sheet-section">
        <div className="lesson-sheet-label">The plan</div>
        <textarea
          className="lesson-sheet-text"
          rows={6}
          value={notes}
          placeholder="Warm-up, the hook, the activity, the wrap-up — whatever you want in front of you while you teach."
          onChange={(e) => {
            setNotes(e.target.value);
            queue({ teacherNotes: e.target.value });
          }}
        />
      </section>

      <section className="lesson-sheet-section">
        <div className="lesson-sheet-label">
          Material <span className="lesson-sheet-count">{links.length}</span>
        </div>

        {links.length > 0 && (
          <div className="link-list">
            {links.map((l) => {
              const thumb = linkThumb(l.url);
              return (
                <div key={l.id} className="link-row">
                  <a className="link-row-main" href={l.url} target="_blank" rel="noreferrer noopener">
                    <span className="link-row-thumb">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span aria-hidden>{LINK_ICON[linkKind(l.url)]}</span>
                      )}
                    </span>
                    <span className="link-row-text">
                      <span className="link-row-title">{l.title}</span>
                      <span className="link-row-source">{linkSource(l.url)}</span>
                    </span>
                  </a>
                  <button className="link-row-remove" onClick={() => removeLink(l.id)} title="Remove link" aria-label={`Remove ${l.title}`}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="link-add">
          <input
            type="url"
            placeholder="Paste a link — YouTube, an image, your .excalidraw file, anything"
            value={newUrl}
            onChange={(e) => {
              setNewUrl(e.target.value);
              setUrlError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && addLink()}
          />
          <input
            type="text"
            placeholder="Label (optional)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLink()}
          />
          <button className="btn btn-secondary btn-sm" onClick={addLink} disabled={!newUrl.trim()}>
            Add
          </button>
        </div>
        {urlError && <div className="lesson-sheet-error">{urlError}</div>}
      </section>

      <section className="lesson-sheet-section">
        <div className="lesson-sheet-label">Takeaways</div>
        <textarea
          className="lesson-sheet-text"
          rows={4}
          value={takeaways}
          placeholder="What actually landed, who struggled, what to pick up next time."
          onChange={(e) => {
            setTakeaways(e.target.value);
            queue({ takeaways: e.target.value });
          }}
        />
      </section>

      <section className="lesson-sheet-section">
        <div className="lesson-sheet-label">Tags</div>
        <TagPicker
          tags={tags}
          selectedIds={lesson.tagIds}
          onTagCreated={onTagCreated}
          onChange={(tagIds) => {
            onChanged({ ...lesson, tagIds });
            queue({ tagIds });
          }}
        />
      </section>

      <div className="lesson-sheet-actions">
        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
          Delete
        </button>
        <div style={{ flex: 1 }} />
        {taught ? (
          <span className="lesson-sheet-taught">Logged to {group?.name ?? "the group"}&apos;s history ✅</span>
        ) : (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => markTaught("Review Pending")} disabled={logging !== null}>
              <LoadingLabel loading={logging === "Review Pending"}>🔁 Needs review</LoadingLabel>
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => markTaught("Mastered")} disabled={logging !== null}>
              <LoadingLabel loading={logging === "Mastered"}>✅ Mastered</LoadingLabel>
            </button>
          </>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete lesson?"
          message={`This permanently deletes "${lesson.topic}", its plan, links and takeaways. This can't be undone.`}
          onConfirm={deleteLesson}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Modal>
  );
}
