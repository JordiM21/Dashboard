/**
 * Keybinds. Every quick action ("macro") has a default combo the owner can
 * rebind in Settings; overrides live in settings.keys. Navigation keys
 * (arrows, optional WASD, Enter, digits) are fixed and handled in
 * components/hub/Keys.tsx.
 */
export interface KeyAction {
  id: string;
  label: string;
  combo: string; // default
  group: "Create" | "Go" | "Do" | "View";
}

export const KEY_ACTIONS: KeyAction[] = [
  { id: "palette", label: "Search & commands", combo: "Space", group: "Go" },
  { id: "quickAdd", label: "Quick add", combo: "n", group: "Create" },
  { id: "newNote", label: "New note", combo: "shift+n", group: "Create" },
  { id: "planDay", label: "Plan my day", combo: "p", group: "Do" },
  { id: "review", label: "Weekly review", combo: "shift+r", group: "Do" },
  { id: "prevArea", label: "Previous area", combo: "[", group: "View" },
  { id: "nextArea", label: "Next area", combo: "]", group: "View" },
  { id: "allAreas", label: "Show all areas", combo: "\\", group: "View" },
  { id: "theme", label: "Toggle dark mode", combo: "shift+m", group: "View" },
  { id: "sidebar", label: "Collapse sidebar", combo: "ctrl+\\", group: "View" },
  { id: "dock", label: "Collapse dock", combo: "ctrl+.", group: "View" },
  { id: "settings", label: "Settings", combo: ",", group: "Go" },
  { id: "help", label: "Keyboard cheat sheet", combo: "?", group: "Go" },
];

/** Normalised combo for a keydown: "shift+n", "ctrl+k", "Space", "[", "?". */
export function comboOf(e: KeyboardEvent): string {
  const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const letterOrNamed = /^[a-z0-9]$/.test(key) || key.length > 1;
  return [e.ctrlKey || e.metaKey ? "ctrl" : "", e.altKey ? "alt" : "", e.shiftKey && letterOrNamed ? "shift" : "", key].filter(Boolean).join("+");
}

export function bindings(overrides: Record<string, string>): Record<string, string> {
  return Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, overrides[a.id] ?? a.combo]));
}

/** Human label: "shift+n" → "⇧ N", "ctrl+\\" → "Ctrl \\". */
export function prettyCombo(c: string): string {
  return c
    .split("+")
    .map((p) => (p === "ctrl" ? "Ctrl" : p === "shift" ? "⇧" : p === "alt" ? "Alt" : p.length === 1 ? p.toUpperCase() : p.replace("Arrow", "")))
    .join(" ");
}

export const DIRS: Record<string, "up" | "down" | "left" | "right"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
export const WASD: Record<string, "up" | "down" | "left" | "right"> = { w: "up", s: "down", a: "left", d: "right" };
