import { addDays, localDateIso } from "./dateUtils";

export type PaymentStatus = "up_to_date" | "pending" | "late" | "no_due_date";

export const PAYMENT_STATUS_GRACE_DAYS = 5;

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  up_to_date: "Up to Date",
  pending: "Pending",
  late: "Late",
  no_due_date: "No Due Date",
};

/** Maps to existing badge-* classes in globals.css — no new CSS needed. */
export const PAYMENT_STATUS_BADGE_CLASS: Record<PaymentStatus, string> = {
  up_to_date: "badge-active",
  pending: "badge-warning",
  late: "badge-critical",
  no_due_date: "badge-inactive",
};

/**
 * Derived, never stored: a student's payment status is always computed from
 * `nextPayment` (their due date) vs today, with a grace window before
 * "late". This is self-correcting by construction — when a payment comes in
 * for a student (see applyPaymentToStudent in lib/firebase/db.ts),
 * `nextPayment` advances to next month, which alone makes the status
 * recompute to "up_to_date" (today <= the new, future due date). No
 * separate status field to keep in sync.
 */
export function studentPaymentStatus(nextPayment: string | undefined | null, today: string = localDateIso()): PaymentStatus {
  if (!nextPayment) return "no_due_date";
  if (today <= nextPayment) return "up_to_date";
  const graceEnd = addDays(nextPayment, PAYMENT_STATUS_GRACE_DAYS);
  if (today <= graceEnd) return "pending";
  return "late";
}
