"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import ExcalidrawBoard, { type ExcalidrawImperativeAPI } from "@/components/ExcalidrawBoard";
import GamificationBar from "@/components/GamificationBar";
import ErrorBoundary from "@/components/ErrorBoundary";
import NewLessonModal from "@/components/NewLessonModal";
import PromptModal from "@/components/PromptModal";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import { authFetch } from "@/lib/firebase/authFetch";
import { closeAudioContext } from "@/lib/soundEffects";
import { localDateIso } from "@/lib/dateUtils";
import type { GroupDoc, LessonFile, WeeklyPlanDoc, WeeklyPlanFolderDoc } from "@/lib/types";

type Mode = "standard" | "present";
type SidebarTab = "saved" | "weekly";

/** How long to wait after the last edit before autosaving — long enough that continuous dragging doesn't fire a PUT on every frame, short enough that switching lessons or closing the tab rarely loses more than a moment's work. */
const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * The whole Teaching view, rendered only via app/teaching/page.tsx's
 * ssr:false dynamic import — everything here (including this file's own
 * type-only `@excalidraw/excalidraw/types` import) must never be evaluated
 * during Next's server render pass. A previously-plain
 * `import { serializeAsJSON } from "@excalidraw/excalidraw"` at this file's
 * top level broke that: even though the *component* was already
 * dynamically imported inside ExcalidrawBoard, this static import forced
 * the whole Excalidraw package to load during SSR, and it touches `window`
 * at module scope — "ReferenceError: window is not defined", confirmed via
 * the dev server's own stack trace. serializeAsJSON is now imported
 * dynamically inside performSave() instead, right where it's used.
 */
export default function TeachingView() {
  // The floating nav (#floating-nav, globals.css) is `position: sticky`,
  // not `fixed` — it occupies real space in #app-shell's flex column, and
  // its rendered height varies (desktop pill vs. the mobile sheet variant).
  // A guessed magic-number offset here previously let this view's content
  // grow taller than the viewport (the whole page — and the Excalidraw
  // canvas with it — scrolled past the visible frame). Measuring the nav's
  // actual bottom edge is what makes this exact regardless of viewport
  // size or which nav variant is showing.
  const [navBottom, setNavBottom] = useState(96);
  useEffect(() => {
    const navEl = document.getElementById("floating-nav");
    if (!navEl) return;
    const update = () => setNavBottom(navEl.getBoundingClientRect().bottom);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(navEl);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const [lessons, setLessons] = useState<LessonFile[] | null>(null);
  const [lessonsError, setLessonsError] = useState<string | null>(null);
  const [currentLesson, setCurrentLesson] = useState<LessonFile | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("standard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("weekly");

  // Esc exits Screen Share Mode — only listens while actually presenting,
  // so it never fights with Excalidraw's own Escape handling (deselect/tool
  // reset) the rest of the time.
  useEffect(() => {
    if (mode !== "present") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMode("standard");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyPlanDoc[] | null>(null);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupDoc[] | null>(null);
  const [currentWeeklyPlan, setCurrentWeeklyPlan] = useState<WeeklyPlanDoc | null>(null);
  const [teacherNotes, setTeacherNotes] = useState<string>("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [loggingStatus, setLoggingStatus] = useState<"Mastered" | "Review Pending" | null>(null);
  const [hudOpen, setHudOpen] = useState(true);
  const [newLessonOpen, setNewLessonOpen] = useState(false);
  const [dragPlanId, setDragPlanId] = useState<string | null>(null);
  const [dropPlanId, setDropPlanId] = useState<string | null>(null);
  const [folders, setFolders] = useState<WeeklyPlanFolderDoc[] | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [addFolderOpen, setAddFolderOpen] = useState(false);

  // Tab toggles the Teacher Notes panel — only while there's a panel to
  // toggle, and only when focus isn't already in a form control (so normal
  // Tab-to-next-field navigation in the sidebar's rename/search inputs
  // keeps working; this is purely a canvas-area shortcut).
  useEffect(() => {
    if (!currentWeeklyPlan) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      e.preventDefault();
      setHudOpen((o) => !o);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentWeeklyPlan]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mirrors of state, read from callbacks (autosave debounce, the unmount
  // flush) that must always see the *current* lesson/dirty flag rather than
  // whatever was captured in a stale closure when they were first created.
  const currentLessonRef = useRef<LessonFile | null>(null);
  useEffect(() => {
    currentLessonRef.current = currentLesson;
  }, [currentLesson]);
  const currentWeeklyPlanRef = useRef<WeeklyPlanDoc | null>(null);
  useEffect(() => {
    currentWeeklyPlanRef.current = currentWeeklyPlan;
  }, [currentWeeklyPlan]);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoOpenedRef = useRef(false);

  const loadLessons = useCallback(() => {
    setLessonsError(null);
    authFetch("/api/teaching/lessons")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);
        return body as { lessons: LessonFile[] };
      })
      .then((body) => setLessons(body.lessons))
      .catch((err) => setLessonsError(err.message));
  }, []);

  useEffect(loadLessons, [loadLessons]);

  const loadWeeklyPlans = useCallback(() => {
    setWeeklyError(null);
    authFetch("/api/board/weekly-plans")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);
        return body as { plans: WeeklyPlanDoc[] };
      })
      .then((body) => setWeeklyPlans(body.plans))
      .catch((err) => setWeeklyError(err.message));
  }, []);

  useEffect(loadWeeklyPlans, [loadWeeklyPlans]);

  // Open the first available Weekly Plan automatically on arrival — once
  // only, so it doesn't fight with you switching to a different file (or to
  // the "Saved" tab) afterward.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!weeklyPlans || weeklyPlans.length === 0) return;
    autoOpenedRef.current = true;
    void openWeeklyPlan(weeklyPlans[0]);
  }, [weeklyPlans]);

  const loadFolders = useCallback(() => {
    authFetch("/api/board/weekly-plan-folders")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);
        return body as { folders: WeeklyPlanFolderDoc[] };
      })
      .then((body) => setFolders(body.folders))
      .catch(() => {});
  }, []);

  useEffect(loadFolders, [loadFolders]);

  // Group placements — the same `groups` collection the Students > Curriculum
  // Board reads, just surfaced here too so "+ New Lesson" and each sidebar
  // card's current-level line don't need their own copy of that data.
  useEffect(() => {
    authFetch("/api/board/groups")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);
        return body as { groups: GroupDoc[] };
      })
      .then((body) => setGroups(body.groups))
      .catch(() => {});
  }, []);

  /** Which URL a save should PUT to right now — a Firestore lesson, or (for a manually-created weekly plan) the on-disk file it was loaded from. Null when nothing loaded can be saved to. */
  function currentSaveUrl(): string | null {
    const lesson = currentLessonRef.current;
    if (lesson) return `/api/teaching/lessons/${lesson.id}/content`;
    const plan = currentWeeklyPlanRef.current;
    if (plan) return `/api/board/weekly-plans/${plan.id}/board`;
    return null;
  }

  /** The one place that actually writes back to storage — used by the manual Save button and by the debounced autosave alike. Cancels any pending autosave timer first so the two never race each other. Works for both Firestore-backed lessons and generated weekly boards (which save straight back to the `.excalidraw` file they were loaded from). */
  const performSave = useCallback(async () => {
    const url = currentSaveUrl();
    const api = apiRef.current;
    if (!url || !api) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const { serializeAsJSON } = await import("@excalidraw/excalidraw");
      const json = serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local");
      const res = await authFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: json,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Request failed with ${res.status}`);
      }
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void performSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [performSave]);

  // Belt-and-suspenders on top of autosave: if a save is genuinely still in
  // flight (or somehow failed) when the tab closes, this is the last line
  // of defense against losing the debounce window's worth of edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Immediate save the moment the window loses focus (switching tabs/apps,
  // clicking outside the canvas) — don't wait out the debounce window.
  useEffect(() => {
    function onBlur() {
      if (dirtyRef.current) void performSave();
    }
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [performSave]);

  // Flush any pending autosave and release the shared AudioContext when
  // leaving /teaching entirely — otherwise a debounced save could still be
  // sitting on the timer, and the AudioContext would stay open for the rest
  // of the SPA session even though nothing on other routes uses it.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const url = currentSaveUrl();
      const api = apiRef.current;
      if (dirtyRef.current && url && api) {
        // Fire-and-forget — the component is unmounting, so no setState
        // calls here, just get the bytes to the server.
        import("@excalidraw/excalidraw")
          .then(({ serializeAsJSON }) => {
            const json = serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local");
            return authFetch(url, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: json,
            });
          })
          .catch(() => {});
      }
      closeAudioContext();
    };
  }, []);

  function handleApiReady(api: ExcalidrawImperativeAPI) {
    apiRef.current = api;
    api.onChange(() => {
      setDirty(true);
      scheduleAutosave();
    });
  }

  /** Autosaves the outgoing lesson (if dirty) before loading a new one — no more "discard changes?" prompt needed. */
  async function flushBeforeSwitch() {
    if (dirtyRef.current) await performSave();
  }

  async function openLesson(lesson: LessonFile) {
    await flushBeforeSwitch();

    setLoadingLesson(true);
    setLoadError(null);
    try {
      const res = await authFetch(`/api/teaching/lessons/${lesson.id}/content`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);

      const scene = body.scene as { elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, BinaryFileData> };
      // resetScene first — updateScene's appState param only *patches* the
      // fields you pass (Pick<AppState, K>), it doesn't clear everything
      // else. Without this, stray leftover state (scroll position, a
      // half-drawn selection, etc.) from whatever was open before could
      // carry over and make the switch look like it did nothing, especially
      // between two boards that already look visually similar.
      apiRef.current?.resetScene();
      apiRef.current?.updateScene({
        elements: (scene.elements ?? []) as any,
        appState: (scene.appState ?? {}) as any,
      });
      const files = Object.values(scene.files ?? {});
      if (files.length) apiRef.current?.addFiles(files);
      apiRef.current?.scrollToContent();

      setCurrentLesson(lesson);
      setCurrentWeeklyPlan(null);
      setTeacherNotes("");
      setNotesDirty(false);
      setDirty(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load lesson");
    } finally {
      setLoadingLesson(false);
    }
  }

  /** Loads a manually-created weekly plan's board off disk. No Firestore LessonFile id (currentLesson stays null), but autosave/Save still work — they write back to the same on-disk `.excalidraw` file via the weekly-plan board route (see currentSaveUrl). */
  async function openWeeklyPlan(plan: WeeklyPlanDoc) {
    await flushBeforeSwitch();

    setLoadingLesson(true);
    setLoadError(null);
    try {
      const res = await authFetch(`/api/board/weekly-plans/${plan.id}/board`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);

      const scene = body.scene as { elements?: unknown[]; appState?: Record<string, unknown> };
      apiRef.current?.resetScene();
      apiRef.current?.updateScene({
        elements: (scene.elements ?? []) as any,
        appState: (scene.appState ?? {}) as any,
      });
      apiRef.current?.scrollToContent();

      setCurrentLesson(null);
      setCurrentWeeklyPlan(plan);
      setTeacherNotes(plan.teacherNotes);
      setNotesDirty(false);
      setDirty(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load lesson board");
    } finally {
      setLoadingLesson(false);
    }
  }

  /** "+ New Lesson" modal's onCreated — refreshes the sidebar queue and immediately opens the freshly-created (blank) board. */
  async function onLessonCreated(plan: WeeklyPlanDoc) {
    setNewLessonOpen(false);
    loadWeeklyPlans();
    setSidebarTab("weekly");
    await openWeeklyPlan(plan);
  }

  /** Saves the Teacher Notes panel's text back to the current weekly plan's Firestore doc. */
  async function saveNotes() {
    const plan = currentWeeklyPlanRef.current;
    if (!plan) return;
    setSavingNotes(true);
    try {
      const res = await authFetch(`/api/board/weekly-plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherNotes }),
      });
      if (res.ok) {
        const updated = (await res.json()) as WeeklyPlanDoc;
        setCurrentWeeklyPlan(updated);
        setWeeklyPlans((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? prev);
        setNotesDirty(false);
      }
    } finally {
      setSavingNotes(false);
    }
  }

  /** "Mark as Mastered" / "Needs Review" — logs one groups/{groupId}/history entry for the current plan's group and topic. */
  async function logCompletion(status: "Mastered" | "Review Pending") {
    const plan = currentWeeklyPlanRef.current;
    if (!plan) return;
    setLoggingStatus(status);
    try {
      const res = await authFetch(`/api/board/groups/${plan.groupId}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: localDateIso(), topic: plan.topic, status, teacherNotes }),
      });
      if (res.ok) {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      }
    } finally {
      setLoggingStatus(null);
    }
  }

  /** Reorders the sidebar's Weekly Plans queue — drops `draggedId` right before `targetId`, then persists every plan's new `order` (index) so the sort survives a reload. Optimistic: the local list reorders immediately, PATCHes fire in the background. */
  async function reorderWeeklyPlans(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const current = weeklyPlans ?? [];
    const draggedIndex = current.findIndex((p) => p.id === draggedId);
    const targetIndex = current.findIndex((p) => p.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = current.slice();
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const withOrder = reordered.map((p, i) => ({ ...p, order: i }));
    setWeeklyPlans(withOrder);

    await Promise.all(
      withOrder
        .filter((p, i) => current.find((c) => c.id === p.id)?.order !== i)
        .map((p) =>
          authFetch(`/api/board/weekly-plans/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: p.order }),
          }).catch(() => {})
        )
    );
  }

  /** Drops a plan onto a folder header (or "Unfiled") — files it there. Optimistic, same pattern as reorderWeeklyPlans. */
  async function moveToFolder(planId: string, folderId: string) {
    setWeeklyPlans((prev) => prev?.map((p) => (p.id === planId ? { ...p, folderId } : p)) ?? prev);
    await authFetch(`/api/board/weekly-plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    }).catch(() => {});
  }

  async function createFolder(name: string) {
    const res = await authFetch("/api/board/weekly-plan-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      loadFolders();
      setAddFolderOpen(false);
    }
  }

  async function createBlankLesson() {
    const title = window.prompt("Name this lesson:", "New Lesson");
    if (!title?.trim()) return;
    await flushBeforeSwitch();

    const res = await authFetch("/api/teaching/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (!res.ok) return;
    const lesson = (await res.json()) as LessonFile;
    loadLessons();
    apiRef.current?.resetScene();
    setTeacherNotes("");
    setNotesDirty(false);
    setCurrentLesson(lesson);
    setCurrentWeeklyPlan(null);
    setDirty(false);
  }

  async function importFile(file: File) {
    await flushBeforeSwitch();
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.(excalidraw|json)$/i, ""));
      const res = await authFetch("/api/teaching/lessons", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `Import failed with ${res.status}`);
      loadLessons();
      await openLesson(body as LessonFile);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function renameLesson(id: string) {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    await authFetch(`/api/teaching/lessons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameValue.trim() }),
    });
    setRenamingId(null);
    loadLessons();
    if (currentLesson?.id === id) setCurrentLesson({ ...currentLesson, title: renameValue.trim() });
  }

  async function deleteLesson(lesson: LessonFile) {
    if (!window.confirm(`Delete "${lesson.title}"? This can't be undone.`)) return;
    await authFetch(`/api/teaching/lessons/${lesson.id}`, { method: "DELETE" });
    if (currentLesson?.id === lesson.id) setCurrentLesson(null);
    loadLessons();
  }

  /** One draggable card in the "Weekly Plans" sidebar — shared by every folder section and "Unfiled" so the drag/drop wiring only lives in one place. */
  function renderPlanCard(plan: WeeklyPlanDoc) {
    const isActive = currentWeeklyPlan?.id === plan.id;
    const group = (groups ?? []).find((g) => g.id === plan.groupId);
    return (
      <div
        key={plan.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          setDragPlanId(plan.id);
        }}
        onDragEnd={() => {
          setDragPlanId(null);
          setDropPlanId(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (dragPlanId && dragPlanId !== plan.id) setDropPlanId(plan.id);
        }}
        onDragLeave={() => setDropPlanId((cur) => (cur === plan.id ? null : cur))}
        onDrop={(e) => {
          e.preventDefault();
          if (dragPlanId) reorderWeeklyPlans(dragPlanId, plan.id);
          setDragPlanId(null);
          setDropPlanId(null);
        }}
        onClick={() => openWeeklyPlan(plan)}
        className="card plan-card"
        style={{
          padding: "10px 12px",
          cursor: "grab",
          background: isActive ? "var(--cake)" : "var(--white)",
          borderColor: dropPlanId === plan.id ? "var(--accent)" : isActive ? "var(--accent)" : undefined,
          borderWidth: isActive ? 2 : 1,
          borderStyle: dropPlanId === plan.id ? "dashed" : "solid",
          opacity: dragPlanId === plan.id ? 0.5 : 1,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {plan.emojis.join(" ")} {group?.name ?? plan.groupId}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>{plan.topic}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>{plan.date}</div>
      </div>
    );
  }

  /**
   * A folder (or "Unfiled", folderId "") section header in the sidebar —
   * also a drop target: dragging a plan card onto it files/unfiles the
   * plan. Clicking it (a plain click, not a drag) toggles the section
   * collapsed. When collapsed and the active plan lives inside, the header
   * gets an outline so it's still obvious where the open file is.
   */
  function renderFolderHeader(folderId: string, label: string, collapsed: boolean, hasActiveInside: boolean) {
    const isDropTarget = dragPlanId !== null && dropPlanId === `folder:${folderId}`;
    return (
      <div
        onClick={() =>
          setCollapsedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
          })
        }
        onDragOver={(e) => {
          e.preventDefault();
          if (dragPlanId) setDropPlanId(`folder:${folderId}`);
        }}
        onDragLeave={() => setDropPlanId((cur) => (cur === `folder:${folderId}` ? null : cur))}
        onDrop={(e) => {
          e.preventDefault();
          if (dragPlanId) moveToFolder(dragPlanId, folderId);
          setDragPlanId(null);
          setDropPlanId(null);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          fontWeight: 700,
          color: "var(--ink-soft)",
          padding: "4px 6px",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          background: isDropTarget ? "var(--cake)" : "transparent",
          border: isDropTarget
            ? "1px dashed var(--accent)"
            : collapsed && hasActiveInside
              ? "1px solid var(--accent)"
              : "1px solid transparent",
        }}
      >
        <span style={{ display: "inline-block", transition: "transform 0.15s ease", transform: collapsed ? "rotate(-90deg)" : "none" }}>
          ▾
        </span>
        📁 {label.toUpperCase()}
        {collapsed && hasActiveInside && <span title="Active file is inside this collapsed folder">●</span>}
      </div>
    );
  }

  const presenting = mode === "present";

  // Deliberately ONE render tree for both modes — ExcalidrawBoard must stay
  // mounted continuously across the mode toggle (only its container's
  // layout changes below). Two separate `return`s per mode would give
  // ExcalidrawBoard a different position in the tree each time, so React
  // would unmount/remount it on every toggle — silently wiping whatever
  // was loaded/drawn, since a fresh mount has no way to know what was on
  // the canvas a moment ago.
  return (
    <main
      className={presenting ? undefined : "page"}
      style={
        presenting
          ? undefined
          : {
              display: "flex",
              flexDirection: "column",
              // Sized against the *measured* nav bottom edge (see
              // navBottom above), not a guessed offset — #app-shell only
              // has min-height:100vh (it can grow to fit its content), so
              // an explicit, accurately-measured height here is what
              // actually keeps this view within the viewport instead of
              // pushing the whole page taller and scrolling with the
              // canvas partly cut off.
              height: `calc(100vh - ${navBottom}px - 16px)`,
              // .page's default 80px bottom padding is sized for a normal
              // scrolling content page — here it just eats into the
              // canvas's share of a tightly-fit viewport for no benefit.
              padding: "16px 24px",
              // Belt-and-suspenders: Excalidraw's own internal panels
              // (library, stats, color picker) size themselves against
              // whatever they consider their containing block, and a
              // library-internal miscalculation there showed up as the
              // *page* gaining a horizontal scrollbar, not just the
              // canvas overflowing its own box. Clipping at every level
              // of this container chain (see the row/card divs below too)
              // means an internal Excalidraw sizing quirk can no longer
              // escape into document-level scroll, regardless of its root
              // cause inside a library we don't control the internals of.
              overflow: "hidden",
              maxWidth: "100%",
            }
      }
    >
      {!presenting && (
        <>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <div>
              <div className="page-title">Teaching</div>
              <div className="page-subtitle">
                {currentLesson
                  ? currentLesson.title
                  : currentWeeklyPlan
                    ? `${(groups ?? []).find((g) => g.id === currentWeeklyPlan.groupId)?.name ?? currentWeeklyPlan.groupId} · ${currentWeeklyPlan.topic} · ${currentWeeklyPlan.date}`
                    : "Pick a lesson, or start a new whiteboard"}
                {dirty && <span style={{ color: "var(--warning)" }}> · unsaved changes</span>}
                {savedFlash && <span style={{ color: "var(--success)" }}> · Saved</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setSidebarOpen((o) => !o)}>
                {sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
              </button>
              <button className="btn btn-secondary" onClick={performSave} disabled={(!currentLesson && !currentWeeklyPlan) || saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="btn btn-primary" onClick={() => setMode("present")}>
                🖥️ Screen Share Mode
              </button>
            </div>
          </div>

          {saveError && <FetchFailedState message={saveError} />}
          {loadError && <FetchFailedState message={loadError} />}
        </>
      )}

      <div
        style={
          presenting
            ? { position: "fixed", inset: 0, zIndex: 10000, background: "#fff", overflow: "hidden" }
            : { display: "flex", flex: 1, gap: 14, minHeight: 0, minWidth: 0, overflow: "hidden" }
        }
      >
        {!presenting && sidebarOpen && (
          <ErrorBoundary label="the lessons sidebar">
            <div
              className="card card-pad"
              style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              {/* Segmented control — a recessed track (--cake) with a raised, shadowed pill for the active tab, same pattern as an iOS/macOS segmented toggle. Built from this app's own theme tokens (not literal grays) so it stays correct in dark mode automatically. */}
              <div
                style={{
                  display: "flex",
                  gap: 2,
                  padding: 3,
                  marginBottom: 12,
                  background: "var(--cake)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {(
                  [
                    { key: "weekly", label: "Weekly Plans" },
                    { key: "saved", label: "Saved" },
                  ] as const
                ).map(({ key, label }) => {
                  const active = sidebarTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSidebarTab(key)}
                      style={{
                        flex: 1,
                        border: "none",
                        borderRadius: "calc(var(--radius-sm) - 3px)",
                        padding: "6px 8px",
                        fontSize: 13,
                        cursor: "pointer",
                        transition: "background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
                        background: active ? "var(--white)" : "transparent",
                        boxShadow: active ? "var(--shadow)" : "none",
                        color: active ? "var(--ink)" : "var(--ink-soft)",
                        fontWeight: active ? 600 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.color = "var(--ink)";
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.color = "var(--ink-soft)";
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {sidebarTab === "weekly" ? (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setNewLessonOpen(true)}>
                      + New Lesson
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setAddFolderOpen(true)} title="Add Folder">
                      + 📁
                    </button>
                  </div>

                  {weeklyError && <FetchFailedState message={weeklyError} />}
                  {!weeklyError && weeklyPlans && weeklyPlans.length === 0 && (
                    <EmptyState title="No lesson plans yet" hint='Click "+ New Lesson" above to create one.' />
                  )}
                  <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
                    {(folders ?? []).map((folder) => {
                      const plansInFolder = (weeklyPlans ?? []).filter((p) => p.folderId === folder.id);
                      const collapsed = collapsedFolders.has(folder.id);
                      const hasActiveInside = plansInFolder.some((p) => p.id === currentWeeklyPlan?.id);
                      return (
                        <div key={folder.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {renderFolderHeader(folder.id, folder.name, collapsed, hasActiveInside)}
                          {!collapsed && plansInFolder.map(renderPlanCard)}
                        </div>
                      );
                    })}

                    {/* "Unfiled" only shows as a labeled section once folders exist — with none yet, a bare list is plenty. */}
                    {folders && folders.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(() => {
                          const unfiled = (weeklyPlans ?? []).filter((p) => !folders.some((f) => f.id === p.folderId));
                          const collapsed = collapsedFolders.has("");
                          const hasActiveInside = unfiled.some((p) => p.id === currentWeeklyPlan?.id);
                          return (
                            <>
                              {renderFolderHeader("", "Unfiled", collapsed, hasActiveInside)}
                              {!collapsed && unfiled.map(renderPlanCard)}
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      (weeklyPlans ?? []).map(renderPlanCard)
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={createBlankLesson}>
                      + New
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? "Importing…" : "Import"}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".excalidraw,.json,application/json"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) importFile(file);
                      }}
                    />
                  </div>

                  {lessonsError && <FetchFailedState message={lessonsError} />}
                  {!lessonsError && lessons && lessons.length === 0 && (
                    <EmptyState title="No lessons yet" hint="Import a .excalidraw file or start a new one." />
                  )}

                  <div style={{ overflowY: "auto", flex: 1 }}>
                {(lessons ?? []).map((lesson) => (
                  <div
                    key={lesson.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      background: currentLesson?.id === lesson.id ? "var(--cake)" : "transparent",
                      cursor: "pointer",
                      marginBottom: 4,
                    }}
                  >
                    {renamingId === lesson.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => renameLesson(lesson.id)}
                        onKeyDown={(e) => e.key === "Enter" && renameLesson(lesson.id)}
                        style={{ width: "100%", fontSize: 13 }}
                      />
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                        <span
                          onClick={() => openLesson(lesson)}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: 13,
                            fontWeight: currentLesson?.id === lesson.id ? 700 : 400,
                          }}
                          title={lesson.title}
                        >
                          {lesson.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(lesson.id);
                            setRenameValue(lesson.title);
                          }}
                          title="Rename"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)", padding: 2 }}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteLesson(lesson)}
                          title="Delete"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: 2 }}
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                  </div>
                </>
              )}
            </div>
          </ErrorBoundary>
        )}

        <div
          className={presenting ? undefined : "card"}
          style={
            presenting
              ? { width: "100%", height: "100%", position: "relative", overflow: "hidden" }
              : { flex: 1, minWidth: 0, maxWidth: "100%", overflow: "hidden", position: "relative" }
          }
        >
          {loadingLesson && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.6)",
              }}
            >
              Loading lesson…
            </div>
          )}
          <ExcalidrawBoard onApiReady={handleApiReady} zenMode={presenting} />

          {currentWeeklyPlan && (
            <div
              style={{
                position: "absolute",
                // In Screen Share mode, "Exit Screen Share" sits fixed at
                // top:16/right:16 (~36px tall) — push the HUD below it so
                // the two never overlap.
                top: presenting ? 66 : 12,
                // Right, not left — Excalidraw's own properties panel
                // (Stroke/Background/Opacity/Layers) docks to the top-left
                // of the canvas whenever a tool or element is selected, and
                // directly overlapped this HUD there. Nothing docks to the
                // top-right by default, so this is the one corner Excalidraw
                // itself never claims.
                right: 12,
                zIndex: 4,
                // A fixed pixel width for the collapsed state, not "auto" —
                // with the always-mounted grid-accordion child below (added
                // for the smooth open/close animation), this flex column's
                // shrink-to-fit sizing stopped resolving to the button's own
                // content width and instead grabbed the full available
                // canvas width instead, even with that child pinned to
                // width:0. 190px comfortably fits the collapsed "▸ Teacher
                // Notes" button with no ambiguous auto-sizing involved.
                width: hudOpen ? 340 : 190,
                maxHeight: "70%",
                display: "flex",
                flexDirection: "column",
                background: "var(--white)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-hover)",
                overflow: "hidden",
                transition: "width 0.25s ease",
              }}
            >
              <button
                type="button"
                onClick={() => setHudOpen((o) => !o)}
                title="Toggle Teacher Notes (Tab)"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  borderBottom: hudOpen ? "1px solid var(--line)" : "none",
                  cursor: "pointer",
                  padding: "14px 20px",
                  fontSize: 13,
                  fontWeight: 700,
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 11, color: "var(--ink-soft)", transition: "transform 0.2s ease", transform: hudOpen ? "rotate(90deg)" : "none" }}>
                  ▸
                </span>
                Teacher Notes
              </button>
              {/* Grid-row accordion trick: animating `grid-template-rows`
                  between 0fr/1fr gives a smooth height transition without
                  ever knowing the content's real height up front (unlike
                  `max-height`, which needs a guessed ceiling) — content stays
                  mounted throughout so ReactMarkdown doesn't re-parse on
                  every toggle. */}
              <div
                style={{
                  display: "grid",
                  gridTemplateRows: hudOpen ? "1fr" : "0fr",
                  // Width has to collapse right alongside height — the grid
                  // row height going to 0fr only clips vertically; with no
                  // width constraint, this wrapper still reports its full
                  // content's intrinsic width (all the markdown text) to
                  // the outer flex container's width:"auto" when collapsed,
                  // which is exactly what stretched the closed "▸ Teacher
                  // Notes" pill across the whole canvas.
                  width: hudOpen ? "100%" : 0,
                  transition: "grid-template-rows 0.3s ease, width 0.25s ease",
                  overflow: "hidden",
                  minHeight: 0,
                  // Flex children default to min-width:auto (their
                  // content's min-content size), which silently floors an
                  // explicit smaller `width` right back up — exactly what
                  // kept this at ~944px instead of 0 a moment ago.
                  minWidth: 0,
                }}
              >
                <div style={{ overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
                    <textarea
                      value={teacherNotes}
                      onChange={(e) => {
                        setTeacherNotes(e.target.value);
                        setNotesDirty(true);
                      }}
                      placeholder="Lesson plan, hook/discovery/sandbox notes, anything you want next to the canvas…"
                      rows={9}
                      style={{
                        fontSize: 13.5,
                        lineHeight: 1.6,
                        resize: "vertical",
                        maxHeight: "calc(70vh - 200px)",
                        fontFamily: "inherit",
                        border: "1px solid var(--line)",
                        borderRadius: "var(--radius-sm)",
                        padding: "10px 12px",
                        background: "var(--cream)",
                      }}
                    />

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                        {savingNotes ? "Saving…" : notesDirty ? "Unsaved changes" : "Saved"}
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={saveNotes} disabled={!notesDirty || savingNotes}>
                        Save
                      </button>
                    </div>

                    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-soft)", letterSpacing: "0.03em" }}>
                        MARK THIS LESSON
                      </div>
                      <div style={{ display: "flex", gap: 6, paddingBottom: 4 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ flex: 1, justifyContent: "center" }}
                          onClick={() => logCompletion("Mastered")}
                          disabled={loggingStatus !== null}
                        >
                          {loggingStatus === "Mastered" ? "Logging…" : "✅ Mastered"}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1, justifyContent: "center" }}
                          onClick={() => logCompletion("Review Pending")}
                          disabled={loggingStatus !== null}
                        >
                          {loggingStatus === "Review Pending" ? "Logging…" : "🔁 Needs Review"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {presenting && (
          <>
            <button
              type="button"
              onClick={() => setMode("standard")}
              title="Exit Screen Share (Esc)"
              style={{
                position: "fixed",
                top: 16,
                right: 16,
                zIndex: 10001,
                background: "rgba(58,46,40,0.85)",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Exit Screen Share (Esc) ✕
            </button>
            <GamificationBar />
          </>
        )}
      </div>

      {newLessonOpen && (
        <NewLessonModal groups={groups ?? []} onClose={() => setNewLessonOpen(false)} onCreated={onLessonCreated} />
      )}
      {addFolderOpen && (
        <PromptModal
          title="New Folder"
          label="Folder name"
          placeholder="e.g. Term 1"
          confirmLabel="Create"
          onCancel={() => setAddFolderOpen(false)}
          onSubmit={createFolder}
        />
      )}
    </main>
  );
}
