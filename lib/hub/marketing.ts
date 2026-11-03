/**
 * The Marketing playbook (`hub_scripts`): what Jordi says at each point from first contact to the first
 * classes, kept in one place so the answer never changes. No browser imports: scripts/exportBrain.ts uses
 * these too.
 */
import type { Script, ScriptStage } from "./types";
import { uid } from "./util";

export const STAGES: { id: ScriptStage; label: string; empty: string }[] = [
  { id: "first", label: "First messages", empty: "The very first thing you send" },
  { id: "answers", label: "Answers", empty: "Questions parents ask" },
  { id: "objections", label: "Objections", empty: "Why they hesitate" },
  { id: "after-payment", label: "After payment", empty: "What you send once they pay" },
  { id: "first-days", label: "First days of class", empty: "Plans, linked to Library folders" },
];

export const stageLabel = (id: ScriptStage) => STAGES.find((x) => x.id === id)?.label ?? id;
export const isPlan = (s: Pick<Script, "stage">) => s.stage === "first-days";

/** What one click puts on the clipboard: only Jordi's side of a conversation, or a plan's steps in order. */
export function copyText(s: Script): string {
  return isPlan(s)
    ? s.steps.map((x) => [x.title, x.text].map((t) => t.trim()).filter(Boolean).join("\n")).filter(Boolean).join("\n\n")
    : s.messages.filter((m) => m.from === "me").map((m) => m.text).join("\n\n");
}

export const searchText = (s: Script) => [s.title, ...s.messages.map((m) => m.text), ...s.steps.flatMap((x) => [x.title, x.text])].join(" ");

/** The sales script's outline, empty on Jordi's side: titles and the parent's question only, never made-up prices or links. */
export function starterScripts(): (Pick<Script, "title" | "stage"> & Partial<Script>)[] {
  const chat = (stage: ScriptStage, title: string, them?: string) => ({ stage, title, messages: them ? [{ id: uid(), from: "them" as const, text: them }] : [] });
  return [
    chat("first", "Opener"),
    chat("first", "Two questions"),
    chat("answers", "Price", "¿Cuánto cuesta?"),
    chat("answers", "Available slots", "¿Qué horarios tienen?"),
    chat("answers", "Payment link", "¿Cómo puedo pagar?"),
    chat("objections", "Too expensive", "Está un poco caro"),
    chat("objections", "No card", "No tengo tarjeta"),
    chat("objections", "Schedule doesn't fit", "Ese horario no me funciona"),
    chat("after-payment", "First message after payment", "Listo, ya pagué"),
    { stage: "first-days", title: "First days of class", steps: ["Day 1", "Day 2", "Day 3"].map((title) => ({ id: uid(), title, text: "" })) },
  ];
}
