"use client";

/**
 * Local-first store for v2's own records. One immutable state object,
 * persisted per mode ("demo" for the signed-out preview, "live" for the
 * owner's real data) so playing in the demo never touches real records.
 *
 * ponytail: localStorage, one JSON blob. Swap persist()/load() for
 * Firestore collections + IndexedDB cache when v2 is wired for deploy.
 */
import { useSyncExternalStore } from "react";
import type { HubState } from "./types";
import { DEFAULT_SETTINGS, STATE_VERSION } from "./seed";

let state: HubState | null = null;
let key = "";
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function initStore(mode: "demo" | "live", seed: () => HubState): void {
  const k = `hub-v2:${mode}`;
  if (key === k && state) return;
  key = k;
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

export const storeReady = () => state !== null;
export const storeMode = () => key.split(":")[1] as "demo" | "live";

function persist() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, 150);
}

export function getState(): HubState {
  if (!state) throw new Error("hub store not initialised");
  return state;
}

export function setState(fn: (s: HubState) => HubState): void {
  state = fn(getState());
  persist();
  emit();
}

/** Wipes this mode's local data back to its seed. */
export function resetStore(seed: () => HubState): void {
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
