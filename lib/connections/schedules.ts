import { flowByType } from "./flows/registry";
import { syncSchedules } from "./jobs";
import type { Integration } from "./types";

/** Keeps QStash schedules in line with a saved integration. Returns a warning instead of throwing. */
export async function applySchedules(i: Integration) {
  const specs = flowByType(i.type)?.schedules?.(i);
  if (!specs) return undefined;
  try {
    await syncSchedules(i.id, specs);
  } catch (e) {
    return `Saved, but the schedule could not be updated: ${e instanceof Error ? e.message : "unknown error"}`;
  }
}
