/**
 * One runnable check for the Hub tuition alerts — `npm run check:reminders`.
 *
 * Covers the two things with a real failure mode and no other guard:
 * the payload matching the Hub's contract exactly, and the cron's two
 * trigger dates each being true on EXACTLY ONE day. The second one matters
 * more than it looks: the Hub has no dedupe, so a trigger that stays true
 * would re-send the same Telegram message every morning.
 *
 * Hitting the route with ?dryRun=1 is the end-to-end check; this is the
 * part that doesn't need Firestore.
 */
import assert from "node:assert/strict";
import { buildTuitionAlert } from "../lib/paymentReminders";
import { addDays, localDateIso } from "../lib/dateUtils";
import { PAYMENT_STATUS_GRACE_DAYS, studentPaymentStatus } from "../lib/studentStatus";

// ---- the payload is exactly what the Hub accepts ----

const alert = buildTuitionAlert({ name: "Mila Mejía", tuition: 50 }, "2026-10-15", "due");
assert.deepEqual(Object.keys(alert).sort(), ["amount", "dueDate", "status", "studentName"]);
assert.equal(alert.studentName, "Mila Mejía");
assert.equal(alert.amount, "$50", "the symbol comes from here — the Hub just prints the string");
assert.equal(alert.dueDate, "15-10-2026", "displayed straight into Telegram, so DD-MM-YYYY like the rest of the app");
assert.equal(alert.status, "due");
for (const v of Object.values(alert)) assert.equal(typeof v, "string", "every field the Hub takes is a string");

// A student with no tuition on file still sends a usable string rather than
// "$undefined" or a silently dropped field the Hub would reject.
assert.equal(buildTuitionAlert({ name: "Daniel Cristancho" }, "2026-10-15", "overdue").amount, "tuition not set");

// ---- each cron trigger is true on exactly one day ----

const due = "2026-10-15";

/** Re-implements the route's two windows: which `nextPayment` values it picks up on a given day. */
function firesOn(today: string): ("due" | "overdue")[] {
  const out: ("due" | "overdue")[] = [];
  if (addDays(today, 1) === due) out.push("due");
  if (addDays(today, -(PAYMENT_STATUS_GRACE_DAYS + 1)) === due) out.push("overdue");
  return out;
}

// Walk a month around the due date and count how often each trigger fires.
const fired: Record<string, string[]> = { due: [], overdue: [] };
for (let offset = -5; offset <= 25; offset++) {
  const today = addDays(due, offset);
  for (const kind of firesOn(today)) fired[kind].push(today);
}

assert.deepEqual(fired.due, ["2026-10-14"], "the due ping fires once, the day before");
assert.deepEqual(fired.overdue, ["2026-10-21"], "the overdue ping fires once, and never again");

// The overdue ping has to land on the first day the UI itself calls them
// Late — otherwise the Telegram message and the dashboard disagree.
assert.equal(studentPaymentStatus(due, "2026-10-20"), "pending");
assert.equal(studentPaymentStatus(due, fired.overdue[0]), "late");

// Month/year rollover in the underlying date maths.
assert.equal(addDays("2026-02-28", 1), "2026-03-01");
assert.equal(addDays(localDateIso(new Date(2026, 11, 31)), 1), "2027-01-01");

console.log("hub tuition alerts: ok");
