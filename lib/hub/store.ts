"use client";

/**
 * The store for v2's own records: one immutable state object.
 *
 * - "live" (signed in): synced to Firestore through lib/hub/cloud.ts —
 *   Firestore's IndexedDB cache is the local copy, so it opens instantly
 *   and works offline. Only `ui` (filters, current view) stays per-device.
 * - "demo" (local preview, signed out): localStorage only, never touches
 *   the database.
 */
import { useSyncExternalStore } from "react";
import type { HubState } from "./types";
import { DEFAULT_SETTINGS, STATE_VERSION } from "./seed";
import { diffToCloud, flush, hasPending, subscribeCloud } from "./cloud";

let state: HubState | null = null;
let key = "";
let cloud = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const UI_KEY = "hub-v2:ui";

export function initStore(mode: "demo", seed: () => HubState): void {
  const k = `hub-v2:${mode}`;
  if (key === k && state) return;
  key = k;
  cloud = false;
  let loaded: HubState | null = null;
  try {
    const raw = localStorage.getItem(k);
    if (raw) loaded = JSON.parse(raw);
  } catch {}
  // Settings added after a device first saved get their defaults.
  state = loaded && loaded.version === STATE_VERSION ? { ...loaded, settings: { ...DEFAULT_SETTINGS, ...loaded.settings } } : seed();
  if (!loaded) persist();
  emit();
}

/** Signed-in mode. `onReady` fires once the first full state has arrived (cache or network). */
export function initCloud(seed: () => Promise<HubState>, onReady: () => void): () => void {
  key = "hub-v2:live";
  cloud = true;
  let ui: HubState["ui"] | null = null;
  try {
    ui = JSON.parse(localStorage.getItem(UI_KEY) ?? "null");
  } catch {}
  let ready = false;
  const unsub = subscribeCloud(
    () => {
      // A device that already used v2 locally before deploy keeps that work; otherwise migrate v1.
      try {
        const local = JSON.parse(localStorage.getItem("hub-v2:live") ?? "null") as HubState | null;
        if (local?.version === STATE_VERSION) return Promise.resolve({ ...local, settings: { ...DEFAULT_SETTINGS, ...local.settings } });
      } catch {}
      return seed();
    },
    ui ?? { area: "all", taskView: "list", listGroup: "area", finScope: "business" },
    (s) => {
      if (hasPending()) return; // our own edit is on its way; the snapshot after the flush carries it
      state = { ...s, ui: state?.ui ?? s.ui };
      emit();
      if (!ready) (ready = true), onReady();
    }
  );
  const beforeUnload = () => flush();
  addEventListener("pagehide", beforeUnload);
  return () => {
    removeEventListener("pagehide", beforeUnload);
    flush();
    unsub();
  };
}

export const storeReady = () => state !== null;
export const storeMode = () => key.split(":")[1] as "demo" | "live";

function persist() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      if (cloud) localStorage.setItem(UI_KEY, JSON.stringify(state?.ui));
      else localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, 150);
}

export function getState(): HubState {
  if (!state) throw new Error("hub store not initialised");
  return state;
}

export function setState(fn: (s: HubState) => HubState): void {
  const prev = getState();
  state = fn(prev);
  if (cloud) diffToCloud(prev, state);
  persist();
  emit();
}

/** Wipes the demo back to its seed (the live store is never reset from the UI). */
export function resetStore(seed: () => HubState): void {
  if (cloud) return;
  state = seed();
  persist();
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useHub(): HubState {
  return useSyncExternalStore(subscribe, getState, getState);
}
