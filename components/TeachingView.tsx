"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ExcalidrawBoard, { type ExcalidrawImperativeAPI } from "@/components/ExcalidrawBoard";
import GamificationBar from "@/components/GamificationBar";
import ErrorBoundary from "@/components/ErrorBoundary";
import NewLessonModal from "@/components/NewLessonModal";
import PromptModal from "@/components/PromptModal";
import FolderEditModal from "@/components/FolderEditModal";
import ConfirmModal from "@/components/ConfirmModal";
import TagPicker from "@/components/TagPicker";
import TagFilterDropdown from "@/components/TagFilterDropdown";
import ResourcesBrowser from "@/components/ResourcesBrowser";
import LoadingLabel from "@/components/LoadingLabel";
import Spinner from "@/components/Spinner";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import { authFetch } from "@/lib/firebase/authFetch";
import { closeAudioContext } from "@/lib/soundEffects";
import { localDateIso } from "@/lib/dateUtils";
import type { GroupDoc, WeeklyPlanDoc, WeeklyPlanFolderDoc, WeeklyPlanTagDoc } from "@/lib/types";

type Mode = "standard" | "present";
type SidebarTab = "resources" | "weekly";

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
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [folders, setFolders] = useState<WeeklyPlanFolderDoc[] | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  // `undefined` = modal closed; `null` = creating a root folder; a folder id
  // = creating a subfolder under that folder ("+" on its header).
  const [addFolderParent, setAddFolderParent] = useState<string | null | undefined>(undefined);
  const [editingFolder, setEditingFolder] = useState<WeeklyPlanFolderDoc | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WeeklyPlanDoc | null>(null);
  const [editTarget, setEditTarget] = useState<WeeklyPlanDoc | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [tags, setTags] = useState<WeeklyPlanTagDoc[]>([]);
  const [tagFilter, setTagFilter] = useState<string>("all");

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
  const [dirty, setDirty] = useState(false);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // The scene as of the last onChange — kept up to date synchronously from
  // onChange's own callback arguments, not read lazily from apiRef.current
  // at save time. This is what fixes content vanishing on navigating away
  // to a different top-nav tab: performSave() used to call
  // apiRef.current.getSceneElements()/getAppState()/getFiles() at the
  // moment of TeachingView's unmount, but those are methods bound to
  // Excalidraw's own internal component instance — and React unmounts a
  // subtree bottom-up, so Excalidraw (a child) had already torn itself
  // down by the time TeachingView's own cleanup ran, making those calls
  // return stale/blank data instead of throwing. A plain lesson-to-lesson
  // switch never hit this because nothing there ever unmounts — only
  // leaving the /teaching route entirely did. Every save now reads from
  // this ref instead, which is safe to read at any point in the unmount
  // sequence since it doesn't touch Excalidraw's internals at all.
  const latestSceneRef = useRef<{ elements: readonly unknown[]; appState: unknown; files: unknown } | null>(null);

  // Mirror of state, read from callbacks (autosave debounce, the unmount
  // flush) that must always see the *current* plan/dirty flag rather than
  // whatever was captured in a stale closure when they were first created.
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

  // Single-flight lock for performSave(). Its save URL and the canvas's
  // `getSceneElements()` are both read fresh after an `await import(...)`
  // — if a second performSave() (e.g. flushBeforeSwitch reacting to the
  // debounced autosave still being mid-flight) started concurrently, both
  // calls share the one live Excalidraw instance, so the slower call could
  // end up serializing the *other* plan's already-loaded content and PUTing
  // it to the URL it captured before any of this happened — the outgoing
  // plan's file, now overwritten with the incoming plan's board. Routing
  // every call through this ref means a concurrent caller always awaits the
  // one save actually in flight instead of racing a second one.
  const saveInFlightRef = useRef<Promise<void> | null>(null);

  // True only while openWeeklyPlan is programmatically replacing the scene
  // (resetScene + updateScene) to load a different lesson. Excalidraw's
  // onChange fires for that exactly like a real user edit — without this
  // guard, loading a lesson marks the board "dirty" and schedules an
  // autosave of content nobody actually drew, which is how a lesson switch
  // could silently overwrite a real board with a blank/mid-transition one.
  const loadingSceneRef = useRef(false);

  // Bumped at the start of every openWeeklyPlan call; each call captures
  // its own snapshot and checks it after every await. If a newer switch
  // started in the meantime (e.g. an impatient double-click on another
  // lesson while "Loading lesson…" is still showing), the stale call's
  // fetch result is discarded instead of racing the newer one to apply its
  // resetScene/updateScene/setCurrentWeeklyPlan — that race was the other
  // way a wrong (or blank) board could end up saved over a real one.
  const switchTokenRef = useRef(0);

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
  // the "Resources" tab) afterward.
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

  const loadTags = useCallback(() => {
    authFetch("/api/board/weekly-plan-tags")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);
        return body as { tags: WeeklyPlanTagDoc[] };
      })
      .then((body) => setTags(body.tags))
      .catch(() => {});
  }, []);

  useEffect(loadTags, [loadTags]);

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

  /** Which URL a save should PUT to right now — the current weekly plan's on-disk `.excalidraw` file. Null when nothing loaded can be saved to. */
  function currentSaveUrl(): string | null {
    const plan = currentWeeklyPlanRef.current;
    if (plan) return `/api/board/weekly-plans/${plan.id}/board`;
    return null;
  }

  /** The one place that actually writes back to storage — the debounced autosave, the blur handler, flushBeforeSwitch, and the unmount flush all funnel through here. Cancels any pending autosave timer first so the two never race each other. Unconditional: doesn't check `dirty` itself, so callers are responsible for only invoking this when there's something worth saving (see loadingSceneRef above for why a *programmatic* scene load must never be allowed to look dirty). Single-flight via saveInFlightRef — see that ref's comment. */
  const performSave = useCallback((): Promise<void> => {
    if (saveInFlightRef.current) return saveInFlightRef.current;

    const run = async () => {
      const url = currentSaveUrl();
      const scene = latestSceneRef.current;
      if (!url || !scene) return;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      setSaving(true);
      setSaveError(null);
      try {
        const { serializeAsJSON } = await import("@excalidraw/excalidraw");
        const json = serializeAsJSON(scene.elements as any, scene.appState as any, scene.files as any, "local");
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
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    };

    const promise = run().finally(() => {
      saveInFlightRef.current = null;
    });
    saveInFlightRef.current = promise;
    return promise;
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
  // leaving /teaching entirely (e.g. clicking a different top-nav tab) —
  // otherwise a debounced save could still be sitting on the timer, and
  // the AudioContext would stay open for the rest of the SPA session even
  // though nothing on other routes uses it. Reads from latestSceneRef, not
  // apiRef.current.getSceneElements() — see that ref's comment for why
  // pulling straight from Excalidraw's imperative API is unsafe by the
  // time this specific cleanup runs (this was the actual cause of a
  // drawing silently vanishing on navigating away instead of switching
  // lessons first).
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const url = currentSaveUrl();
      const scene = latestSceneRef.current;
      if (dirtyRef.current && url && scene) {
        // Fire-and-forget — the component is unmounting, so no setState
        // calls here, just get the bytes to the server. Doesn't touch
        // Excalidraw's API at all, so it's unaffected by whatever order
        // React tears down this subtree in.
        import("@excalidraw/excalidraw")
          .then(({ serializeAsJSON }) => {
            const json = serializeAsJSON(scene.elements as any, scene.appState as any, scene.files as any, "local");
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
    api.onChange((elements, appState, files) => {
      // Cache unconditionally — even during a programmatic load, this is
      // still the correct "last known good scene," it's just not a
      // user edit worth marking dirty/autosaving (see loadingSceneRef).
      latestSceneRef.current = { elements, appState, files };
      if (loadingSceneRef.current) return;
      setDirty(true);
      scheduleAutosave();
    });
  }

  /** Autosaves the outgoing plan (if dirty) before loading a new one — no more "discard changes?" prompt needed. */
  async function flushBeforeSwitch() {
    if (dirtyRef.current) await performSave();
  }

  /**
   * Loads a weekly plan's board off disk — autosave/Save write back to the
   * same on-disk `.excalidraw` file via the weekly-plan board route (see
   * currentSaveUrl). Guarded against overlapping calls (switchTokenRef) and
   * against its own resetScene/updateScene being mistaken for a user edit
   * (loadingSceneRef) — see those refs' comments for the data-loss bug this
   * closes: an impatient double-click while a lesson was still loading
   * could otherwise autosave a blank/mid-transition canvas over a real one.
   */
  async function openWeeklyPlan(plan: WeeklyPlanDoc) {
    const token = ++switchTokenRef.current;

    await flushBeforeSwitch();
    if (token !== switchTokenRef.current) return; // superseded while flushing the outgoing plan

    setLoadingLesson(true);
    setLoadError(null);
    try {
      const res = await authFetch(`/api/board/weekly-plans/${plan.id}/board`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `Request failed with ${res.status}`);
      if (token !== switchTokenRef.current) return; // superseded while fetching

      // `files` was missing here entirely — serializeAsJSON (see performSave)
      // has always written a `files` map alongside elements/appState for
      // any image dropped onto the canvas, but this load path never read
      // it back or called addFiles(), so an image element loaded with no
      // backing file data and rendered broken — independent of, and in
      // addition to, the unmount/navigation bug below.
      const scene = body.scene as { elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> };
      loadingSceneRef.current = true;
      try {
        apiRef.current?.resetScene();
        apiRef.current?.updateScene({
          elements: (scene.elements ?? []) as any,
          appState: (scene.appState ?? {}) as any,
        });
        const files = Object.values(scene.files ?? {});
        if (files.length) apiRef.current?.addFiles(files as any);
        apiRef.current?.scrollToContent();
      } finally {
        loadingSceneRef.current = false;
      }

      // Seed latestSceneRef directly from what was just loaded, rather
      // than waiting for onChange to (maybe) fire from the programmatic
      // resetScene/updateScene above — that's not guaranteed the way a
      // real user edit firing onChange is, so relying on it here would
      // leave latestSceneRef stale until the next real edit. It's still
      // correct even then (dirty stays false right after a load, so
      // nothing tries to save this exact snapshot), but there's no reason
      // to depend on unconfirmed behavior when seeding it directly costs
      // nothing.
      latestSceneRef.current = { elements: scene.elements ?? [], appState: scene.appState ?? {}, files: scene.files ?? {} };

      setCurrentWeeklyPlan(plan);
      setTeacherNotes(plan.teacherNotes);
      setNotesDirty(false);
      setDirty(false);
    } catch (err) {
      if (token === switchTokenRef.current) setLoadError(err instanceof Error ? err.message : "Failed to load lesson board");
    } finally {
      if (token === switchTokenRef.current) setLoadingLesson(false);
    }
  }

  /** "+ New Lesson" modal's onCreated — refreshes the sidebar queue and immediately opens the freshly-created (blank) board. */
  async function onLessonCreated(plan: WeeklyPlanDoc) {
    setNewLessonOpen(false);
    loadWeeklyPlans();
    setSidebarTab("weekly");
    await openWeeklyPlan(plan);
  }

  /** Edit Lesson modal's onCreated — patches the sidebar entry in place. Only reloads the canvas if the plan being edited is the one currently open (editing a different lesson's metadata shouldn't disturb the board you're looking at). */
  function onLessonSaved(plan: WeeklyPlanDoc) {
    setEditTarget(null);
    setWeeklyPlans((prev) => prev?.map((p) => (p.id === plan.id ? plan : p)) ?? prev);
    if (currentWeeklyPlanRef.current?.id === plan.id) {
      setCurrentWeeklyPlan(plan);
      setTeacherNotes(plan.teacherNotes);
    }
  }

  // Closes the sidebar card's "⋯" options menu on any click outside it.
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [menuOpenId]);

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
      await authFetch(`/api/board/groups/${plan.groupId}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: localDateIso(), topic: plan.topic, status, teacherNotes }),
      });
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

  /** The sidebar card's delete button, confirmed via ConfirmModal (see deleteTarget) — deletes the plan from Firestore and its on-disk .excalidraw file. If it's the one currently open, clears the canvas so nothing tries to autosave into a file that no longer exists. */
  async function deleteLesson(plan: WeeklyPlanDoc) {
    const res = await authFetch(`/api/board/weekly-plans/${plan.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    if (!res.ok) {
      setLoadError("Couldn't delete that lesson.");
      return;
    }

    setWeeklyPlans((prev) => prev?.filter((p) => p.id !== plan.id) ?? prev);

    if (currentWeeklyPlanRef.current?.id === plan.id) {
      loadingSceneRef.current = true;
      try {
        apiRef.current?.resetScene();
      } finally {
        loadingSceneRef.current = false;
      }
      latestSceneRef.current = null;
      setCurrentWeeklyPlan(null);
      setTeacherNotes("");
      setNotesDirty(false);
      setDirty(false);
    }
  }

  /** Creates a folder — `parentId` null for a root folder, a folder id for a subfolder ("+" on that folder's header). */
  async function createFolder(name: string) {
    const res = await authFetch("/api/board/weekly-plan-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: addFolderParent ?? null }),
    });
    if (res.ok) {
      loadFolders();
      setAddFolderParent(undefined);
    }
  }

  async function saveFolder(id: string, updates: { name: string; color: string | null }) {
    const res = await authFetch(`/api/board/weekly-plan-folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      loadFolders();
      setEditingFolder(null);
    }
  }

  async function deleteFolder(id: string) {
    await authFetch(`/api/board/weekly-plan-folders/${id}`, { method: "DELETE" });
    loadFolders();
    loadWeeklyPlans();
    setEditingFolder(null);
  }

  /** Drags a folder header onto another folder header (or the free/root area) — nests it there. */
  async function moveFolderToFolder(folderId: string, parentId: string | null) {
    if (folderId === parentId) return;
    setFolders((prev) => prev?.map((f) => (f.id === folderId ? { ...f, parentId } : f)) ?? prev);
    await authFetch(`/api/board/weekly-plan-folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId }),
    }).catch(() => {});
  }

  /** One draggable card in the "Weekly Plans" sidebar — shared by the folder tree and the free/unfiled list so the drag/drop wiring only lives in one place. Topic is the headline (what you're teaching); group is the gray subtitle underneath. */
  function renderPlanCard(plan: WeeklyPlanDoc) {
    const isActive = currentWeeklyPlan?.id === plan.id;
    const group = (groups ?? []).find((g) => g.id === plan.groupId);
    const planTags = tags.filter((t) => plan.tagIds.includes(t.id));
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
          setDropTargetId(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (dragPlanId && dragPlanId !== plan.id) setDropTargetId(plan.id);
        }}
        onDragLeave={() => setDropTargetId((cur) => (cur === plan.id ? null : cur))}
        onDrop={(e) => {
          e.preventDefault();
          if (dragPlanId) reorderWeeklyPlans(dragPlanId, plan.id);
          setDragPlanId(null);
          setDropTargetId(null);
        }}
        onClick={() => openWeeklyPlan(plan)}
        className="card plan-card"
        style={{
          position: "relative",
          padding: "10px 26px 10px 12px",
          cursor: "grab",
          background: isActive ? "var(--cake)" : "var(--white)",
          borderColor: dropTargetId === plan.id ? "var(--accent)" : isActive ? "var(--accent)" : undefined,
          borderWidth: isActive ? 2 : 1,
          borderStyle: dropTargetId === plan.id ? "dashed" : "solid",
          opacity: dragPlanId === plan.id ? 0.5 : 1,
        }}
      >
        <button
          type="button"
          className="plan-card-delete"
          title="Lesson options"
          aria-label={`Options for ${plan.topic}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpenId((cur) => (cur === plan.id ? null : plan.id));
          }}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            color: "var(--ink-soft)",
            padding: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
        {menuOpenId === plan.id && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 30,
              right: 6,
              zIndex: 20,
              background: "var(--white)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "var(--shadow-hover)",
              overflow: "hidden",
              minWidth: 100,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpenId(null);
                setEditTarget(plan);
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12.5 }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpenId(null);
                setDeleteTarget(plan);
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: "var(--danger)" }}
            >
              Delete
            </button>
          </div>
        )}
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {plan.emojis.join(" ")} {plan.topic}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>{group?.name ?? plan.groupId}</div>
        {planTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
            {planTags.map((t) => (
              <span key={t.id} style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: t.color, color: "#fff" }}>
                {t.name}
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4 }}>{plan.date}</div>
      </div>
    );
  }

  /** Every plan matching the active tag filter — feeds both the folder tree and the free/unfiled list below it. */
  const visiblePlans = useMemo(
    () => (tagFilter === "all" ? (weeklyPlans ?? []) : (weeklyPlans ?? []).filter((p) => p.tagIds.includes(tagFilter))),
    [weeklyPlans, tagFilter]
  );

  /** True if the active plan lives directly in this folder, or in any of its (nested) subfolders — drives the collapsed-folder "active inside" dot. */
  function folderHasActive(folderId: string): boolean {
    if ((weeklyPlans ?? []).some((p) => p.folderId === folderId && p.id === currentWeeklyPlan?.id)) return true;
    return (folders ?? []).some((f) => f.parentId === folderId && folderHasActive(f.id));
  }

  const iconBtnStyle: CSSProperties = {
    background: "rgba(255,255,255,0.22)",
    border: "none",
    borderRadius: 5,
    color: "#fff",
    fontSize: 11,
    lineHeight: 1,
    padding: "3px 6px",
    cursor: "pointer",
    flexShrink: 0,
  };

  /**
   * One folder in the Obsidian-vault-style tree — bigger, colored (preset
   * or custom), editable (rename/recolor/delete via the ✎ icon), and
   * nestable to any depth via drag-and-drop (drag a folder header onto
   * another to reparent it) or the "+" subfolder button. Recurses into its
   * own children, then lists its plans (already tag-filtered).
   */
  function renderFolderNode(folder: WeeklyPlanFolderDoc, depth: number) {
    const children = (folders ?? []).filter((f) => f.parentId === folder.id).sort((a, b) => a.order - b.order);
    const plansInFolder = visiblePlans.filter((p) => p.folderId === folder.id);
    const collapsed = collapsedFolders.has(folder.id);
    const hasActiveInside = folderHasActive(folder.id);
    const isDropTarget = dropTargetId === `folder:${folder.id}`;

    return (
      <div key={folder.id} style={{ display: "flex", flexDirection: "column", gap: 6, marginLeft: depth * 14 }}>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            setDragFolderId(folder.id);
          }}
          onDragEnd={() => {
            setDragFolderId(null);
            setDropTargetId(null);
          }}
          onClick={() =>
            setCollapsedFolders((prev) => {
              const next = new Set(prev);
              if (next.has(folder.id)) next.delete(folder.id);
              else next.add(folder.id);
              return next;
            })
          }
          onDragOver={(e) => {
            e.preventDefault();
            if (dragPlanId || (dragFolderId && dragFolderId !== folder.id)) setDropTargetId(`folder:${folder.id}`);
          }}
          onDragLeave={() => setDropTargetId((cur) => (cur === `folder:${folder.id}` ? null : cur))}
          onDrop={(e) => {
            e.preventDefault();
            if (dragPlanId) moveToFolder(dragPlanId, folder.id);
            else if (dragFolderId && dragFolderId !== folder.id) moveFolderToFolder(dragFolderId, folder.id);
            setDragPlanId(null);
            setDragFolderId(null);
            setDropTargetId(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            fontWeight: 700,
            color: "#fff",
            padding: "9px 12px",
            borderRadius: "var(--radius-sm)",
            cursor: "grab",
            background: folder.color ?? "var(--cake-dark)",
            boxShadow: isDropTarget || (collapsed && hasActiveInside) ? "0 0 0 2px var(--accent)" : "none",
            opacity: dragFolderId === folder.id ? 0.5 : 1,
          }}
        >
          <span style={{ display: "inline-block", transition: "transform 0.15s ease", transform: collapsed ? "rotate(-90deg)" : "none" }}>
            ▾
          </span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            📁 {folder.name.toUpperCase()}
          </span>
          {hasActiveInside && <span title="Active file is inside this folder">●</span>}
          <button
            type="button"
            title="New subfolder"
            style={iconBtnStyle}
            onClick={(e) => {
              e.stopPropagation();
              setAddFolderParent(folder.id);
            }}
          >
            +
          </button>
          <button
            type="button"
            title="Edit folder"
            style={iconBtnStyle}
            onClick={(e) => {
              e.stopPropagation();
              setEditingFolder(folder);
            }}
          >
            ✎
          </button>
        </div>
        {!collapsed && (children.length > 0 || plansInFolder.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 8 }}>
            {children.map((c) => renderFolderNode(c, depth + 1))}
            {plansInFolder.map(renderPlanCard)}
          </div>
        )}
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
                {currentWeeklyPlan
                  ? `${(groups ?? []).find((g) => g.id === currentWeeklyPlan.groupId)?.name ?? currentWeeklyPlan.groupId} · ${currentWeeklyPlan.topic} · ${currentWeeklyPlan.date}`
                  : "Pick a lesson, or start a new whiteboard"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Autosave already covers every edit (debounced + on blur) —
                  no manual Save button, and no permanent "unsaved
                  changes"/"Saved" text either, both used to change on every
                  keystroke and read as flickery. This is the only save
                  feedback left: a faint spinner, present only for the
                  moment a save is actually in flight. */}
              {saving && <Spinner size={18} style={{ opacity: 0.4 }} />}
              {sidebarTab === "weekly" && (
                <button className="btn btn-secondary" onClick={() => setSidebarOpen((o) => !o)}>
                  {sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setMode("present")}>
                🖥️ Screen Share Mode
              </button>
            </div>
          </div>

          {saveError && <FetchFailedState message={saveError} />}
          {loadError && <FetchFailedState message={loadError} />}

          {/* Segmented control — a recessed track (--cake) with a raised, shadowed pill for the active tab, same pattern as an iOS/macOS segmented toggle. Lives above the sidebar/canvas split (not inside the 260px sidebar) so it stays reachable even when the "Resources" tab takes over the full width below. */}
          <div
            style={{
              display: "inline-flex",
              gap: 2,
              padding: 3,
              marginBottom: 12,
              background: "var(--cake)",
              borderRadius: "var(--radius-sm)",
              width: 260,
            }}
          >
            {(
              [
                { key: "weekly", label: "Weekly Plans" },
                { key: "resources", label: "Resources" },
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
        </>
      )}

      <div
        style={
          presenting
            ? { position: "fixed", inset: 0, zIndex: 10000, background: "#fff", overflow: "hidden" }
            : { display: "flex", flex: 1, gap: 14, minHeight: 0, minWidth: 0, overflow: "hidden", position: "relative" }
        }
      >
        {!presenting && sidebarTab === "resources" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 6,
              background: "var(--cream)",
              overflowY: "auto",
              padding: "2px 2px 16px",
            }}
          >
            <ErrorBoundary label="Resources">
              <ResourcesBrowser />
            </ErrorBoundary>
          </div>
        )}

        {!presenting && sidebarTab === "weekly" && sidebarOpen && (
          <ErrorBoundary label="the Weekly Plans sidebar">
            <div
              className="card card-pad"
              style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setNewLessonOpen(true)}>
                  + New Lesson
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddFolderParent(null)} title="Add Folder">
                  + 📁
                </button>
              </div>

              {tags.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <TagFilterDropdown tags={tags} value={tagFilter} onChange={setTagFilter} />
                </div>
              )}

              {weeklyError && <FetchFailedState message={weeklyError} />}
              {!weeklyError && weeklyPlans && weeklyPlans.length === 0 && (
                <EmptyState title="No lesson plans yet" hint='Click "+ New Lesson" above to create one.' />
              )}
              <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {(folders ?? [])
                  .filter((f) => f.parentId === null)
                  .sort((a, b) => a.order - b.order)
                  .map((folder) => renderFolderNode(folder, 0))}

                {/* Plans not filed in any folder — no header, just the free-standing cards (also a drop target: dragging a plan or folder here unfiles/un-nests it). */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragPlanId || dragFolderId) setDropTargetId("root");
                  }}
                  onDragLeave={() => setDropTargetId((cur) => (cur === "root" ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragPlanId) moveToFolder(dragPlanId, "");
                    else if (dragFolderId) moveFolderToFolder(dragFolderId, null);
                    setDragPlanId(null);
                    setDragFolderId(null);
                    setDropTargetId(null);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    borderRadius: "var(--radius-sm)",
                    outline: dropTargetId === "root" ? "1px dashed var(--accent)" : "none",
                    outlineOffset: 2,
                  }}
                >
                  {visiblePlans.filter((p) => !(folders ?? []).some((f) => f.id === p.folderId)).map(renderPlanCard)}
                </div>
              </div>
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
                      <span style={{ fontSize: 11.5, color: "var(--ink-soft)", position: "relative", minWidth: 16 }}>
                        <LoadingLabel loading={savingNotes}>{notesDirty ? "Unsaved changes" : "Saved"}</LoadingLabel>
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={saveNotes} disabled={!notesDirty || savingNotes}>
                        Save
                      </button>
                    </div>

                    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-soft)", letterSpacing: "0.03em" }}>TAGS</div>
                      <TagPicker
                        tags={tags}
                        selectedIds={currentWeeklyPlan.tagIds}
                        onTagCreated={(tag) => setTags((prev) => [...prev, tag])}
                        onChange={(tagIds) => {
                          const plan = currentWeeklyPlan;
                          setCurrentWeeklyPlan({ ...plan, tagIds });
                          setWeeklyPlans((prev) => prev?.map((p) => (p.id === plan.id ? { ...p, tagIds } : p)) ?? prev);
                          authFetch(`/api/board/weekly-plans/${plan.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ tagIds }),
                          }).catch(() => {});
                        }}
                      />
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
                          <LoadingLabel loading={loggingStatus === "Mastered"}>✅ Mastered</LoadingLabel>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1, justifyContent: "center" }}
                          onClick={() => logCompletion("Review Pending")}
                          disabled={loggingStatus !== null}
                        >
                          <LoadingLabel loading={loggingStatus === "Review Pending"}>🔁 Needs Review</LoadingLabel>
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
        <NewLessonModal
          groups={groups ?? []}
          tags={tags}
          onTagCreated={(tag) => setTags((prev) => [...prev, tag])}
          onClose={() => setNewLessonOpen(false)}
          onCreated={onLessonCreated}
        />
      )}
      {editTarget && (
        <NewLessonModal
          groups={groups ?? []}
          tags={tags}
          editPlan={editTarget}
          onTagCreated={(tag) => setTags((prev) => [...prev, tag])}
          onClose={() => setEditTarget(null)}
          onCreated={onLessonSaved}
        />
      )}
      {addFolderParent !== undefined && (
        <PromptModal
          title={addFolderParent ? "New Subfolder" : "New Folder"}
          label="Folder name"
          placeholder="e.g. Term 1"
          confirmLabel="Create"
          onCancel={() => setAddFolderParent(undefined)}
          onSubmit={createFolder}
        />
      )}
      {editingFolder && (
        <FolderEditModal
          folder={editingFolder}
          onClose={() => setEditingFolder(null)}
          onSave={(updates) => saveFolder(editingFolder.id, updates)}
          onDelete={() => deleteFolder(editingFolder.id)}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Delete lesson?"
          message={`This permanently deletes "${deleteTarget.topic}" and its whiteboard. This can't be undone.`}
          onConfirm={() => deleteLesson(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </main>
  );
}
