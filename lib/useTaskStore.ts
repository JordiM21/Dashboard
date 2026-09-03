"use client";

import { useCallback, useMemo, useState } from "react";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { authFetch } from "@/lib/firebase/authFetch";
import { localDateIso } from "@/lib/dateUtils";
import type { Project, Task } from "@/lib/types";

/**
 * Tasks + projects, read live from Firestore and written through the API
 * routes — with the writes applied locally the instant they're made.
 *
 * The optimistic layer is the whole reason this hook exists. Ticking a
 * checkbox is a round trip to a Route Handler and back out through an
 * onSnapshot listener; that's a few hundred milliseconds of a checkbox
 * that doesn't move, which is exactly the friction that stops someone
 * doing their nightly pass on a phone. So a patch is shown immediately and
 * the overlay entry is dropped once the real document catches up.
 *
 * A failed write rolls its overlay back and surfaces the message — silently
 * keeping a local-only "done" would be worse than the delay it saves.
 */
export function useTaskStore() {
  const tasksQuery = useFirestoreCollection<Task>("tasks", { orderByField: "createdAt", orderByDirection: "desc" });
  const projectsQuery = useFirestoreCollection<Project>("projects", { orderByField: "createdAt", orderByDirection: "desc" });

  const [overlay, setOverlay] = useState<Record<string, Partial<Task>>>({});
  const [deleted, setDeleted] = useState<string[]>([]);
  // Locally-created tasks, shown while their POST is in flight and dropped
  // the moment it resolves. Keeping one around until its real document
  // appeared in the snapshot would be marginally smoother, and was: a
  // placeholder that outlives its own request has no id the rest of the UI
  // can act on, so deleting the real document just brought the placeholder
  // back. The request is the slow part; the snapshot lands right behind it.
  const [creating, setCreating] = useState<Task[]>([]);
  const [writeError, setWriteError] = useState<string | null>(null);

  const serverTasks = tasksQuery.data;

  const tasks = useMemo(() => {
    const live = (serverTasks ?? [])
      .filter((t) => !deleted.includes(t.id))
      .map((t) => (overlay[t.id] ? { ...t, ...overlay[t.id] } : t));
    return [...creating, ...live];
  }, [serverTasks, overlay, deleted, creating]);

  const projects = useMemo(
    () => (projectsQuery.data ?? []).map((p) => ({ ...p, archived: p.archived ?? false })),
    [projectsQuery.data]
  );

  const patch = useCallback(async (id: string, updates: Partial<Task>) => {
    setOverlay((prev) => ({ ...prev, [id]: { ...prev[id], ...updates } }));
    setWriteError(null);
    try {
      const res = await authFetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      // The snapshot carries the truth from here — including completedAt,
      // which the server stamps and the overlay never knew about.
      setOverlay((prev) => {
        const { [id]: _applied, ...rest } = prev;
        return rest;
      });
    } catch (err) {
      setOverlay((prev) => {
        const { [id]: _rolledBack, ...rest } = prev;
        return rest;
      });
      setWriteError(err instanceof Error ? err.message : "Save failed");
    }
  }, []);

  const create = useCallback(async (fields: Partial<Task>): Promise<void> => {
    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    const temp: Task = {
      id: tempId,
      title: fields.title ?? "",
      notes: fields.notes ?? "",
      category: fields.category ?? "",
      priority: fields.priority ?? "Medium",
      size: fields.size ?? "M",
      status: fields.status ?? "todo",
      due: fields.due ?? null,
      projectId: fields.projectId ?? null,
      subtasks: fields.subtasks ?? [],
      createdAt: new Date().toISOString(),
    };
    setCreating((prev) => [...prev, temp]);
    setWriteError(null);
    try {
      const res = await authFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`Couldn't create the task (${res.status})`);
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : "Couldn't create the task");
    } finally {
      setCreating((prev) => prev.filter((c) => c.id !== tempId));
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setDeleted((prev) => [...prev, id]);
    try {
      const res = await authFetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    } catch (err) {
      setDeleted((prev) => prev.filter((d) => d !== id));
      setWriteError(err instanceof Error ? err.message : "Delete failed");
    }
  }, []);

  /** One tap, both directions — and re-opening a task clears the completion stamp server-side. */
  const toggleDone = useCallback(
    (task: Task) => patch(task.id, { status: task.status === "done" ? "todo" : "done" }),
    [patch]
  );

  /** Start / pause working on something. "doing" survives midnight on purpose — see Task.status. */
  const toggleDoing = useCallback(
    (task: Task) => patch(task.id, { status: task.status === "doing" ? "todo" : "doing", due: task.due ?? localDateIso() }),
    [patch]
  );

  const saveProject = useCallback(async (id: string | null, fields: Partial<Project>) => {
    const res = await authFetch(id ? `/api/projects/${id}` : "/api/projects", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) setWriteError(`Couldn't save the project (${res.status})`);
  }, []);

  const removeProject = useCallback(async (id: string) => {
    const res = await authFetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) setWriteError(`Couldn't delete the project (${res.status})`);
  }, []);

  return {
    tasks,
    projects,
    loading: tasksQuery.loading || projectsQuery.loading,
    error: tasksQuery.error ?? projectsQuery.error ?? writeError,
    lastUpdated: tasksQuery.lastUpdated,
    patch,
    create,
    remove,
    toggleDone,
    toggleDoing,
    saveProject,
    removeProject,
  };
}
