/**
 * One-time backfill: pulls historical Stripe Checkout Sessions into the
 * Firestore `transactions` collection, so the dashboard shows payments that
 * happened before `paymentReceiver` existed.
 *
 * Safe to run more than once — every write is preceded by a query for an
 * existing document with the same `stripePaymentId`, so nothing is ever
 * duplicated. Supports --dry-run to preview without writing anything.
 *
 * Scope: only Checkout Sessions (matches paymentReceiver's primary event,
 * checkout.session.completed). If you also take payments via bare
 * PaymentIntents/Charges with no Checkout Session involved, those won't be
 * picked up by this pass; ask for a second script if you need that too —
 * the dedup-by-stripePaymentId design means it can run safely alongside
 * this one with zero double-count risk, since a PaymentIntent's id is the
 * same id a Checkout Session's backfill entry stores as stripePaymentId.
 *
 * Run from the project root:
 *   npm run backfill:stripe -- --dry-run             # preview only, no writes
 *   npm run backfill:stripe -- --months=3             # only sessions from the last N months
 *   npm run backfill:stripe -- --months=3 --dry-run   # combine flags
 *   npm run backfill:stripe                           # everything, writes to Firestore
 *
 * Currency: `amount` stored here is ALWAYS the settled USD figure, taken
 * from each charge's own balance_transaction — Stripe's real conversion,
 * not a rate this script computes. `originalAmount`/`originalCurrency`/
 * `exchangeRate` preserve what was actually charged. This mirrors
 * functions/src/paymentReceiver.ts exactly.
 *
 * Non-USD settlement: this Stripe account's balance has, historically,
 * settled some charges in EUR instead of USD (older than ~3 months as of
 * this writing — believed to trace back to a previously-connected EUR bank
 * account). A transaction whose balance_transaction doesn't settle in USD
 * is SKIPPED with a warning rather than silently mislabeled — `amount`
 * must always genuinely be USD, never "close enough". Use --months to scope
 * a run to recent, USD-clean history; there's no built-in EUR→USD
 * conversion here since Stripe doesn't provide one beyond the original
 * charge currency's own rate into whatever it actually settled as.
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import Stripe from "stripe";
import { getAdminDb } from "../lib/firebase/admin";

const DRY_RUN = process.argv.includes("--dry-run");

const monthsArg = process.argv.find((a) => a.startsWith("--months="));
const SINCE_MONTHS = monthsArg ? Number(monthsArg.split("=")[1]) : null;
const SINCE_TIMESTAMP = SINCE_MONTHS
  ? (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - SINCE_MONTHS);
      return Math.floor(d.getTime() / 1000);
    })()
  : null;

// https://docs.stripe.com/currencies#zero-decimal — kept in sync with the
// identical list in functions/src/paymentReceiver.ts.
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

function stripeAmountToDecimal(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? amount : amount / 100;
}

interface ConvertedAmount {
  amountUsd: number;
  settledCurrency: string; // whatever it actually settled in — caller checks this is "usd"
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
}

/** Looks up the real settled amount via the charge's balance_transaction, falling back to a naive same-currency-assumed conversion if no PaymentIntent/charge/balance_transaction can be found. Caller must check settledCurrency — this does NOT force USD. */
async function resolveConvertedAmount(
  stripe: Stripe,
  paymentIntentId: string | null,
  fallbackAmountMinor: number,
  fallbackCurrency: string
): Promise<ConvertedAmount> {
  if (!paymentIntentId) {
    return {
      amountUsd: stripeAmountToDecimal(fallbackAmountMinor, fallbackCurrency),
      settledCurrency: fallbackCurrency,
    };
  }

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"],
  });

  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const balanceTransaction =
    charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;

  if (!balanceTransaction) {
    return { amountUsd: stripeAmountToDecimal(intent.amount, intent.currency), settledCurrency: intent.currency };
  }

  const amountUsd = stripeAmountToDecimal(balanceTransaction.amount, balanceTransaction.currency);

  if (intent.currency === balanceTransaction.currency) {
    return { amountUsd, settledCurrency: balanceTransaction.currency };
  }

  return {
    amountUsd,
    settledCurrency: balanceTransaction.currency,
    originalAmount: stripeAmountToDecimal(intent.amount, intent.currency),
    originalCurrency: intent.currency,
    exchangeRate: balanceTransaction.exchange_rate ?? undefined,
  };
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error("STRIPE_SECRET_KEY is not set in .env.local — nothing to do.");
    process.exit(1);
  }

  const stripe = new Stripe(secretKey);
  const db = getAdminDb();
  const transactions = db.collection("transactions");

  console.log(DRY_RUN ? "Running in --dry-run mode — no writes will happen." : "Writing to Firestore.");
  if (SINCE_TIMESTAMP) {
    console.log(`Scoped to sessions from the last ${SINCE_MONTHS} month(s).`);
  }
  console.log("");

  let seen = 0;
  let imported = 0;
  let skippedNotPaid = 0;
  let skippedDuplicate = 0;
  let skippedTooOld = 0;
  let skippedNonUsdSettlement = 0;
  let failed = 0;

  // Stripe's Node SDK auto-paginates when iterated with for-await — this
  // walks every Checkout Session ever created on the account, newest-first
  // page by page.
  for await (const session of stripe.checkout.sessions.list({ limit: 100 })) {
    seen++;

    if (SINCE_TIMESTAMP && session.created < SINCE_TIMESTAMP) {
      skippedTooOld++;
      continue;
    }

    if (session.payment_status !== "paid") {
      skippedNotPaid++;
      continue;
    }

    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
    const stripePaymentId = paymentIntentId ?? session.id;

    try {
      const existing = await transactions.where("stripePaymentId", "==", stripePaymentId).limit(1).get();
      if (!existing.empty) {
        skippedDuplicate++;
        continue;
      }

      const converted = await resolveConvertedAmount(
        stripe,
        paymentIntentId,
        session.amount_total ?? 0,
        session.currency ?? "usd"
      );

      if (converted.settledCurrency !== "usd") {
        skippedNonUsdSettlement++;
        console.warn(
          `Skipping ${stripePaymentId} — settled in ${converted.settledCurrency.toUpperCase()}, not USD. ` +
            "No EUR/other -> USD conversion is implemented; re-run with a narrower --months window or handle this batch separately."
        );
        continue;
      }

      const createdIso = new Date(session.created * 1000).toISOString();
      const description = `Stripe checkout — ${session.customer_details?.email ?? session.customer ?? session.id}`;
      const studentId = session.client_reference_id ?? (session.metadata?.studentId as string | undefined) ?? null;

      const originalNote = converted.originalCurrency
        ? ` (orig. ${converted.originalAmount?.toFixed(2)} ${converted.originalCurrency.toUpperCase()})`
        : "";
      console.log(
        `${DRY_RUN ? "[dry-run] would import" : "Importing"} ${stripePaymentId} — $${converted.amountUsd.toFixed(2)} USD${originalNote} — ${description}`
      );

      if (!DRY_RUN) {
        await transactions.add({
          amount: converted.amountUsd,
          ...(converted.originalAmount !== undefined ? { originalAmount: converted.originalAmount } : {}),
          ...(converted.originalCurrency ? { originalCurrency: converted.originalCurrency } : {}),
          ...(converted.exchangeRate !== undefined ? { exchangeRate: converted.exchangeRate } : {}),
          date: createdIso.slice(0, 10),
          type: "Income",
          category: "Tuition",
          description,
          studentId,
          source: "stripe",
          stripePaymentId,
          createdAt: createdIso,
          updatedAt: new Date().toISOString(),
        });
      }

      imported++;
    } catch (err) {
      failed++;
      console.error(`Failed on ${stripePaymentId}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\nDone. Scanned ${seen} Checkout Sessions — ${imported} ${DRY_RUN ? "would be imported" : "imported"}, ` +
      `${skippedDuplicate} already existed, ${skippedNotPaid} not paid, ${skippedTooOld} outside --months window, ` +
      `${skippedNonUsdSettlement} skipped (non-USD settlement), ${failed} failed.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
