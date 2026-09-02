/**
 * One-time cleanup: collapses duplicate `transactions` docs that record the
 * same Stripe payment.
 *
 * The webhook used to write each payment to a random doc id, so nothing
 * enforced one-row-per-payment and a single payment could land up to three
 * times (checkout.session.completed + payment_intent.succeeded both fire for
 * one checkout, Stripe redelivers on any non-2xx, and the backfill script
 * wrote the same payments too). That's fixed at the source in
 * functions/src/paymentReceiver.ts, which now uses the Stripe payment id as
 * the document id. This script cleans up the rows written before that.
 *
 * For each stripePaymentId it keeps ONE row — preferring the one that
 * identifies a student, then the earliest recorded date (the webhook stamped
 * `date` with its own run date, so a redelivery days later shows a later,
 * wrong date) — re-keys it to the payment id, and deletes the rest.
 *
 * Dry run by default. Run from the project root:
 *   npx tsx scripts/dedupeStripeTransactions.ts           # show the plan
 *   npx tsx scripts/dedupeStripeTransactions.ts --apply   # do it
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { getAdminDb } from "../lib/firebase/admin";

const APPLY = process.argv.includes("--apply");

export interface Row {
  id: string;
  stripePaymentId: string;
  date: string;
  amount: number;
  studentId: string | null;
  description: string;
  data: Record<string, unknown>;
}

/**
 * Best row for a payment, in order: the one that knows its student (that link
 * is real information no other row has), then the earliest date (a redelivered
 * webhook stamped `date` with the day it re-ran, not the day the money moved),
 * then the Checkout row over the PaymentIntent row — the same preference the
 * fixed webhook encodes as `rank`, since Checkout carries the payer and
 * student and PaymentIntent doesn't.
 */
export function pickKeeper(rows: Row[]): Row {
  const rank = (r: Row) => (r.description.startsWith("Stripe checkout") ? 2 : 1);
  return [...rows].sort((a, b) => {
    if (!!a.studentId !== !!b.studentId) return a.studentId ? -1 : 1;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return rank(b) - rank(a);
  })[0]!;
}

async function main() {
  const db = getAdminDb();
  const snap = await db.collection("transactions").get();

  const byPayment = new Map<string, Row[]>();
  for (const doc of snap.docs) {
    const data = doc.data();
    const stripePaymentId = typeof data.stripePaymentId === "string" ? data.stripePaymentId : "";
    if (!stripePaymentId) continue; // manual/recurring entries have no Stripe id — never touch them
    const row: Row = {
      id: doc.id,
      stripePaymentId,
      date: typeof data.date === "string" ? data.date : "",
      amount: typeof data.amount === "number" ? data.amount : 0,
      studentId: typeof data.studentId === "string" && data.studentId ? data.studentId : null,
      description: typeof data.description === "string" ? data.description : "",
      data,
    };
    byPayment.set(stripePaymentId, [...(byPayment.get(stripePaymentId) ?? []), row]);
  }

  let dupeGroups = 0;
  let toDelete = 0;
  let toRekey = 0;
  const writes: Array<() => Promise<void>> = [];

  for (const [paymentId, rows] of byPayment) {
    const keeper = pickKeeper(rows);
    const losers = rows.filter((r) => r.id !== keeper.id);

    if (losers.length > 0) {
      dupeGroups++;
      console.log(`\n${paymentId} — ${rows.length} rows, $${keeper.amount}`);
      console.log(`  KEEP   ${keeper.id}  ${keeper.date}  student=${keeper.studentId ?? "-"}  | ${keeper.description}`);
      for (const l of losers) {
        console.log(`  DELETE ${l.id}  ${l.date}  student=${l.studentId ?? "-"}  | ${l.description}`);
      }
    }

    // Re-key onto the payment id so Firestore enforces uniqueness from here on.
    const needsRekey = keeper.id !== paymentId;
    if (needsRekey) toRekey++;
    toDelete += losers.length;

    writes.push(async () => {
      if (needsRekey) {
        await db.collection("transactions").doc(paymentId).set(keeper.data);
        await db.collection("transactions").doc(keeper.id).delete();
      }
      for (const l of losers) await db.collection("transactions").doc(l.id).delete();
    });
  }

  console.log(
    `\n${byPayment.size} Stripe payment(s) across ${snap.size} docs — ` +
      `${dupeGroups} with duplicates, ${toDelete} row(s) to delete, ${toRekey} to re-key onto the payment id.`
  );

  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to make these changes.");
    return;
  }

  for (const write of writes) await write();
  console.log(`\nApplied. transactions now holds one row per Stripe payment.`);
}

// Guarded so scripts/testDedupeKeeper.ts can import pickKeeper without this
// script connecting to Firestore and deleting anything as a side effect.
if (process.argv[1]?.includes("dedupeStripeTransactions")) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
