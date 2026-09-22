import { formatDateDMY } from "./dateUtils";

/**
 * Tuition alerts to the LET Junior Hub, which turns each one into a
 * Telegram message.
 *
 * The Hub's contract, and why this module looks the way it does:
 * - Every field is a plain display string. `amount` carries its own
 *   currency symbol; the Hub doesn't parse or format anything.
 * - It always answers 200 "ok", even when something downstream failed, so
 *   a non-200 means the request never landed — and it is NOT retryable.
 * - There is no dedupe on its side yet: two POSTs are two Telegram
 *   messages. So every caller here must fire on a condition that is true
 *   on exactly one day, never on a "still true" state that a daily cron
 *   would re-send. See app/api/cron/payment-reminders.
 */

/** Free text on the Hub's side — these are the three labels this app uses. */
export type TuitionStatus = "due" | "overdue" | "paid";

/** Exactly the body the Hub accepts: `studentName`, `amount` and `dueDate` required, `status` optional free text. */
export interface HubTuitionPayload {
  studentName: string;
  amount: string;
  dueDate: string;
  status: TuitionStatus;
}

export function buildTuitionAlert(
  student: { name: string; tuition?: number },
  dueDate: string,
  status: TuitionStatus
): HubTuitionPayload {
  return {
    studentName: student.name,
    // Always USD — this dashboard stores every amount in dollars (see
    // FinanceEntry.amount). The Hub just prints whatever string it gets,
    // so the symbol has to come from here.
    amount: typeof student.tuition === "number" ? `$${student.tuition}` : "tuition not set",
    // Displayed straight into a Telegram message, so it follows this app's
    // one date format rather than the ISO the rest of the code passes
    // around. Flip this to `dueDate` if the Hub ever starts parsing it.
    dueDate: formatDateDMY(dueDate),
    status,
  };
}

/**
 * One POST, no retries, never throws.
 *
 * Both of those are deliberate. No retries because the Hub says a non-200
 * isn't retryable and a second POST is a second Telegram message. Never
 * throws because this gets called from inside payment recording — a
 * notification failing must not roll back a payment that really happened.
 */
export async function sendTuitionAlert(payload: HubTuitionPayload): Promise<{ sent: boolean; status: number; error?: string }> {
  const url = process.env.LET_HUB_TUITION_WEBHOOK_URL;
  if (!url) return { sent: false, status: 0, error: "LET_HUB_TUITION_WEBHOOK_URL is not set" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // This runs inside payment recording. Without a bound, a Hub that
      // accepts the connection and never answers would stall the request
      // that's writing the payment — the notification is the least
      // important thing in that call stack, so it gets a short leash.
      signal: AbortSignal.timeout(5000),
    });
    return { sent: res.ok, status: res.status, ...(res.ok ? {} : { error: `Hub answered ${res.status}` }) };
  } catch (err) {
    return { sent: false, status: 0, error: err instanceof Error ? err.message : "Request failed" };
  }
}
