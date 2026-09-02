/**
 * Self-check for resolveBoardKey's traversal guard — the one branch in
 * weeklyPlans.ts that stands between a hand-edited Firestore doc and reading
 * an arbitrary object out of the Storage bucket.
 *
 *   npx tsx scripts/testBoardKey.ts
 */

import assert from "assert";
import { resolveBoardKey } from "../lib/firebase/weeklyPlans";
import type { WeeklyPlanDoc } from "../lib/types";

const plan = (excalidrawPath: string) => ({ excalidrawPath } as WeeklyPlanDoc);

// Real keys pass through untouched.
assert.equal(
  resolveBoardKey(plan("lessons/group-a/2026-08-31-compare-past-present.excalidraw")),
  "lessons/group-a/2026-08-31-compare-past-present.excalidraw"
);
assert.equal(
  resolveBoardKey(plan("lessons/group-b/week-2026-08-25/monday-board.excalidraw")),
  "lessons/group-b/week-2026-08-25/monday-board.excalidraw"
);

// Anything that escapes lessons/ is refused.
for (const bad of [
  "lessons/../resources/files/secret.pdf",
  "lessons/group-a/../../data/resources/x.json",
  "../lessons/group-a/x.excalidraw",
  "resources/files/secret.pdf",
  "/etc/passwd",
  "lessonsevil/x.excalidraw",
  "",
]) {
  assert.throws(() => resolveBoardKey(plan(bad)), /Invalid excalidraw path/, `should reject ${bad}`);
}

console.log("resolveBoardKey: ok");
