/** Self-check for group seat logic: npx tsx scripts/checkGroupSeats.ts */
import assert from "node:assert";
import { loadEnvConfig } from "@next/env";
import type { LiveData } from "../lib/hub/live";
import type { HubState } from "../lib/hub/types";

loadEnvConfig(process.cwd());

(async () => {
  const { classesOn, freeSeats, scheduleLabel, seatsNeeded } = await import("../lib/hub/metrics");
  const g = { id: "c", name: "Group C", currentLevel: 1, currentTopic: "" };
  const kid = (name: string, status: "active" | "inactive" = "active") => ({ id: name, name, status, classGroup: "group c " });
  const slots = [5, 1, 3].map((day) => ({ day, start: "23:00", minutes: 60 }));
  const st = { groupMeta: { c: { status: "filling", level: "Intermediate", ageBand: "11-14", slots } } } as unknown as HubState;
  const live = (students: ReturnType<typeof kid>[]) => ({ groups: [g], students }) as unknown as LiveData;

  // Seats come from active members only; name match ignores case and spaces.
  assert.equal(seatsNeeded(g, [kid("a"), kid("b", "inactive")], st), "Needs 3 Intermediate, age 11-14");
  assert.equal(seatsNeeded(g, [kid("a"), kid("b"), kid("c"), kid("d")], st), "Full");
  assert.equal(seatsNeeded(g, [], { groupMeta: {} } as unknown as HubState), "Needs 4 students");
  // Monday first, and a class ending at midnight wraps.
  assert.equal(scheduleLabel(slots), "Mon Wed Fri 23:00-00:00");
  assert.equal(scheduleLabel(), "");
  // A filling group has open seats but no classes yet; closed has neither.
  assert.equal(freeSeats(live([]), st), 4);
  assert.equal(classesOn("2026-11-02", live([]), st).length, 0);
  assert.equal(freeSeats(live([]), { groupMeta: { c: { status: "closed" } } } as unknown as HubState), 0);
  assert.equal(classesOn("2026-11-02", live([]), { groupMeta: { c: { slots } } } as unknown as HubState).length, 1);
  console.log("ok");
  process.exit(0);
})();
