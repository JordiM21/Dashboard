"use client";

/**
 * Firestore sync for v2's own records (signed-in / production).
 *
 * Layout: one collection per entity (`hub_tasks/{id}`, `hub_goals/{id}`…)
 * plus three singleton docs in `hub_state` (meta, game, settings). The
 * prefix keeps v2 well away from v1's `tasks`/`projects`, which are only
 * ever read (once, for the migration).
 *
 * Local-first comes from Firestore itself: persistentLocalCache (see
 * lib/firebase/client.ts) paints from IndexedDB and queues offline writes.
 * Writes are diffed by reference against the previous state — actions are
 * immutable, so an untouched record keeps its identity — and flushed after
 * a short pause so typing doesn't write on every keystroke.
 */
import { collection, doc, onSnapshot, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { HubState } from "./types";
import { toast } from "./fx";
import { DEFAULT_SETTINGS, STATE_VERSION } from "./seed";

export const ENTITY_KEYS = ["areas", "tasks", "projects", "goals", "notes", "collections", "items", "time", "lessons", "expenses"] as const;
type EntityKey = (typeof ENTITY_KEYS)[number];

const META_KEYS = ["templates", "studentMeta", "groupMeta", "adSpend", "reviews", "monthly"] as const;

const col = (k: EntityKey) => `hub_${k}`;
/** Firestore rejects `undefined`; a JSON round-trip drops those keys. */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const pick = (s: HubState, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, (s as never)[k]]));

// ---------------------------------------------------------------- writes

const dirty = new Map<string, { path: [string, string]; data: object | null }>();
let timer: ReturnType<typeof setTimeout> | null = null;

function queue(c: string, id: string, data: object | null) {
  dirty.set(`${c}/${id}`, { path: [c, id], data });
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

/** Local edits not yet handed to Firestore — remote snapshots wait for these so typing is never reverted. */
export const hasPending = () => dirty.size > 0;

export function flush(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const jobs = [...dirty.values()];
  dirty.clear();
  for (let i = 0; i < jobs.length; i += 400) {
    const b = writeBatch(db);
    for (const j of jobs.slice(i, i + 400)) {
      const ref = doc(db, j.path[0], j.path[1]);
      if (j.data) b.set(ref, clean(j.data));
      else b.delete(ref);
    }
    b.commit().catch((e) => {
      console.error("[hub] sync failed", e);
      toast("Couldn’t save to the database — check your connection or Firestore rules", { tone: "danger" });
    });
  }
}

/** What a local change needs written: [collection, id, data | null for delete]. Pure — see check.ts. */
export function changes(prev: HubState, next: HubState): [string, string, object | null][] {
  const out: [string, string, object | null][] = [];
  for (const k of ENTITY_KEYS) {
    if (prev[k] === next[k]) continue;
    const before = new Map((prev[k] as { id: string }[]).map((x) => [x.id, x]));
    for (const item of next[k] as { id: string }[]) {
      if (before.get(item.id) !== item) out.push([col(k), item.id, item]);
      before.delete(item.id);
    }
    for (const id of before.keys()) out.push([col(k), id, null]);
  }
  if (META_KEYS.some((k) => (prev as never)[k] !== (next as never)[k])) out.push(["hub_state", "meta", { version: STATE_VERSION, ...pick(next, META_KEYS) }]);
  if (prev.game !== next.game) out.push(["hub_state", "game", next.game]);
  if (prev.settings !== next.settings) out.push(["hub_state", "settings", next.settings]);
  return out;
}

/** Called by the store after every local change. */
export function diffToCloud(prev: HubState, next: HubState): void {
  for (const [c, id, data] of changes(prev, next)) queue(c, id, data);
}

/** First run: write the whole state (the migration result) in batches. */
function pushAll(s: HubState): void {
  for (const k of ENTITY_KEYS) for (const item of s[k] as { id: string }[]) queue(col(k), item.id, item);
  queue("hub_state", "meta", { version: STATE_VERSION, ...pick(s, META_KEYS) });
  queue("hub_state", "game", s.game);
  queue("hub_state", "settings", s.settings);
  flush();
}

// ---------------------------------------------------------------- reads

/**
 * Subscribes to everything. `onState` gets a full HubState on first load
 * (from cache when offline) and again on every remote change — another
 * device, or this one's writes settling. If the cloud is empty, `seed()`
 * runs once and its result is uploaded: that's the v1 → v2 migration.
 */
export function subscribeCloud(seed: () => Promise<HubState>, ui: HubState["ui"], onState: (s: HubState) => void): () => void {
  const parts: Partial<Record<string, unknown>> = {};
  const expected = ENTITY_KEYS.length + 1;
  let seen = 0;
  let seeded = false;

  const emit = () => {
    if (seen < expected) return;
    const st = parts.state as Record<string, Record<string, unknown>> | undefined;
    if (!st?.meta) {
      if (seeded) return;
      seeded = true;
      seed().then((s) => {
        pushAll(s);
        onState(s);
      });
      return;
    }
    const s: HubState = {
      version: STATE_VERSION,
      ...(Object.fromEntries(ENTITY_KEYS.map((k) => [k, parts[k] ?? []])) as Pick<HubState, EntityKey>),
      templates: [],
      studentMeta: {},
      groupMeta: {},
      adSpend: {},
      reviews: [],
      monthly: [],
      ...(st.meta as object),
      game: { xp: [], dayPlans: {}, inboxZeroDays: [], unlocked: {}, seenActive: [], automations: {}, ...(st.game as object) },
      settings: { ...DEFAULT_SETTINGS, ...(st.settings as object) },
      ui,
    } as HubState;
    onState(s);
  };

  const unsubs = ENTITY_KEYS.map((k) => {
    let first = true;
    return onSnapshot(
      collection(db, col(k)),
      (snap) => {
        // Keep unchanged records' identity so a save doesn't re-render (and re-measure) every row in the app.
        const changed = new Set(snap.docChanges().map((c) => c.doc.id));
        if (!first && changed.size === 0) return;
        const prev = new Map(((parts[k] as { id: string }[] | undefined) ?? []).map((x) => [x.id, x]));
        parts[k] = snap.docs.map((d) => (!changed.has(d.id) && prev.get(d.id)) || { ...d.data(), id: d.id });
        if (first) (first = false), seen++;
        emit();
      },
      (e) => console.error(`[hub] ${col(k)}`, e)
    );
  });
  let firstState = true;
  unsubs.push(
    onSnapshot(
      collection(db, "hub_state"),
      (snap) => {
        parts.state = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
        if (firstState) (firstState = false), seen++;
        emit();
      },
      (e) => console.error("[hub] hub_state", e)
    )
  );
  return () => unsubs.forEach((u) => u());
}

