/**
 * The written conversation between Jordi and Claude (`hub_brain_messages`). Jordi writes from the
 * Brain page; Claude writes through brain:do; the export mirrors it into MESSAGES.md so Claude reads
 * it on every run. No browser imports: scripts/exportBrain.ts uses these too.
 */
export type BrainMessage = {
  id: string;
  from: "claude" | "jordi";
  text: string;
  at: string;
  /** Claude is waiting for an answer. */
  ask?: boolean;
  /** Short topic shown on the card, e.g. "Jeanpaul · payment". */
  about?: string;
  /** Student id; the exchange then shows up in that student's Brain file. */
  student?: string;
  /** One-tap answers for a question. */
  options?: string[];
  replyTo?: string;
  /** The scheduled task that wrote it. */
  source?: string;
  seenAt?: string;
  /** Claude has processed this message of Jordi's. */
  readAt?: string;
  /** What Claude saved from it, so it never has to ask again. */
  learned?: string;
  /** Claude withdrew the question (no longer needed). */
  closedAt?: string;
};

export const MESSAGES = "hub_brain_messages";

export const byTime = (a: BrainMessage, b: BrainMessage) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

/** Claude's questions still waiting for an answer, oldest first. */
export function waitingOnJordi(ms: BrainMessage[]): BrainMessage[] {
  const answered = new Set(ms.map((m) => m.replyTo));
  return ms.filter((m) => m.from === "claude" && m.ask && !m.closedAt && !answered.has(m.id)).sort(byTime);
}

/** Jordi's messages Claude hasn't processed yet, oldest first. */
export const unprocessed = (ms: BrainMessage[]) => ms.filter((m) => m.from === "jordi" && !m.readAt).sort(byTime);
