"use client";

/**
 * Ephemeral UI events: toasts (with Undo) and game-layer celebrations.
 * Nothing here is persisted.
 */
import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  text: string;
  undo?: () => void;
  tone?: "default" | "danger";
}

let toasts: Toast[] = [];
let n = 0;
const tl = new Set<() => void>();

export function toast(text: string, opts: { undo?: () => void; tone?: Toast["tone"] } = {}): void {
  const t = { id: ++n, text, ...opts };
  toasts = [...toasts.slice(-2), t];
  tl.forEach((l) => l());
  setTimeout(() => dismiss(t.id), 4000);
}

export function dismiss(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  tl.forEach((l) => l());
}

export const useToasts = () =>
  useSyncExternalStore(
    (l) => (tl.add(l), () => tl.delete(l)),
    () => toasts,
    () => toasts
  );

export type FxEvent =
  | { type: "xp"; amount: number; from?: { x: number; y: number }; label: string }
  | { type: "levelup"; level: number }
  | { type: "achievement"; id: string }
  | { type: "boss-defeated"; goalId: string }
  | { type: "boss-damage"; amount: number };

const fl = new Set<(e: FxEvent) => void>();
export const onFx = (l: (e: FxEvent) => void) => (fl.add(l), () => void fl.delete(l));
export const fx = (e: FxEvent) => fl.forEach((l) => l(e));

/** Screen-reader announcement for game feedback ("Task complete, plus 25 XP"). */
export function announce(text: string): void {
  const el = document.getElementById("hub-live");
  if (el) el.textContent = text;
}
