import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import Stripe from "stripe";

/**
 * Real Stripe webhook receiver — uses the official `stripe` package for
 * both the client and signature verification (Stripe's own
 * `stripe.webhooks.constructEvent`, not a hand-rolled HMAC check), so it
 * gets Stripe's replay-tolerance window and multi-secret rotation support
 * for free.
 *
 * Only two event types produce a `transactions` document, and only when
 * the payment actually succeeded:
 *   - checkout.session.completed  (session.payment_status === "paid")
 *   - payment_intent.succeeded
 * Every other event type is acknowledged with 200 but not recorded — Stripe
 * sends many event types a given integration doesn't care about, and Stripe
 * will retry (and eventually disable) an endpoint that doesn't return 2xx.
 *
 * Currency: this account bills in usd/cop/bob, but its Stripe balance
 * settles in usd (account default_currency). `amount` stored here is
 * ALWAYS that settled USD figure, taken from the charge's own
 * balance_transaction — i.e. Stripe's real conversion, not a rate we
 * compute ourselves. `originalAmount`/`originalCurrency`/`exchangeRate`
 * preserve what was actually charged, for the Finance table's "original"
 * column. An earlier version of this function stored the raw charge amount
 * as if it were always USD, which was wrong for non-USD charges — see
 * README.md "Multi-currency" for the incident.
 */

// https://docs.stripe.com/currencies#zero-decimal
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** iso "YYYY-MM-DD" + 1 calendar month, clamped to the target month's last day. Duplicated from lib/dateUtils.ts (this is a separate deployable package, not sharing imports with the Next.js app) — keep in sync if that one changes. */
function addOneMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m, 1);
  const lastDayOfTargetMonth = new Date(y, m + 1, 0).getDate();
  target.setDate(Math.min(d, lastDayOfTargetMonth));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

/**
 * Advances a student's due date by one month once a real payment for them
 * lands — matched directly by studentId if known (client_reference_id /
 * metadata.studentId), otherwise by the payer's email against that
 * student's parentEmail. No-ops silently if neither matches anyone — most
 * transactions aren't tuition.
 */
/** Returns true only if a student was actually found and rolled forward — the caller uses that to record the payment as applied exactly once. */
async function applyPaymentToStudent(opts: { studentId: string | null; payerEmail: string | null }): Promise<boolean> {
  const db = getFirestore();
  let ref;

  if (opts.studentId) {
    ref = db.collection("students").doc(opts.studentId);
  } else if (opts.payerEmail) {
    const snap = await db
      .collection("students")
      .where("parentEmail", "==", opts.payerEmail.trim().toLowerCase())
      .limit(1)
      .get();
    if (snap.empty) return false;
    ref = snap.docs[0].ref;
  } else {
    return false;
  }

  const doc = await ref.get();
  if (!doc.exists) return false;
  const nextPayment = addOneMonth((doc.data()?.nextPayment as string | undefined) ?? new Date().toISOString().slice(0, 10));
  await ref.update({ nextPayment, updatedAt: FieldValue.serverTimestamp() });
  return true;
}

function stripeAmountToDecimal(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? amount : amount / 100;
}

interface ConvertedAmount {
  amountUsd: number;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
}

/** Looks up the real settled USD amount via the charge's balance_transaction, falling back to a naive same-currency-assumed conversion if no PaymentIntent/charge/balance_transaction can be found. */
async function resolveConvertedAmount(
  stripe: Stripe,
  paymentIntentId: string | null,
  fallbackAmountMinor: number,
  fallbackCurrency: string
): Promise<ConvertedAmount> {
  if (!paymentIntentId) {
    return { amountUsd: stripeAmountToDecimal(fallbackAmountMinor, fallbackCurrency) };
  }

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"],
  });

  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const balanceTransaction =
    charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;

  if (!balanceTransaction) {
    return { amountUsd: stripeAmountToDecimal(intent.amount, intent.currency) };
  }

  const amountUsd = stripeAmountToDecimal(balanceTransaction.amount, balanceTransaction.currency);

  if (intent.currency === balanceTransaction.currency) {
    // No conversion happened — already in the settlement currency.
    return { amountUsd };
  }

  return {
    amountUsd,
    originalAmount: stripeAmountToDecimal(intent.amount, intent.currency),
    originalCurrency: intent.currency,
    exchangeRate: balanceTransaction.exchange_rate ?? undefined,
  };
}

export const paymentReceiver = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    logger.error("paymentReceiver: STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET is not configured.");
    res.status(500).json({ error: "not_configured" });
    return;
  }

  const stripe = new Stripe(secretKey);

  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    res.status(400).json({ error: "missing_signature" });
    return;
  }

  let event: Stripe.Event;
  try {
    // req.rawBody is populated automatically by Firebase Functions for
    // HTTPS-triggered requests — required here since constructEvent needs
    // the exact bytes Stripe signed, not the parsed/re-serialized body.
    event = stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
  } catch (err) {
    logger.warn("paymentReceiver: signature verification failed", err);
    res.status(400).json({ error: "invalid_signature" });
    return;
  }

  const interpretation = interpretStripeEvent(event);
  if (!interpretation) {
    res.status(200).json({ ok: true, recorded: false, reason: "payment not successful, or unrecognized event type" });
    return;
  }

  try {
    const converted = await resolveConvertedAmount(
      stripe,
      interpretation.paymentIntentId,
      interpretation.fallbackAmountMinor,
      interpretation.fallbackCurrency
    );

    // The Stripe payment id IS the document id, so Firestore itself enforces
    // "one transaction per payment". A random doc() id made uniqueness
    // nobody's job, and one payment could land three times: Stripe fires BOTH
    // checkout.session.completed and payment_intent.succeeded for a single
    // checkout, it redelivers on any non-2xx, and the backfill script writes
    // the same payments too. All three now collide on this id instead.
    const ref = getFirestore().collection("transactions").doc(interpretation.stripePaymentId);

    let alreadyApplied = false;
    const outcome = await getFirestore().runTransaction(async (tx): Promise<"created" | "upgraded" | "duplicate"> => {
      const existing = await tx.get(ref);
      const prev = existing.data();
      alreadyApplied = prev?.studentApplied === true;

      // A duplicate is only worth rewriting when it carries better data — the
      // checkout event knows the student and payer, the payment_intent event
      // doesn't. Whichever arrives second must not blank out the first.
      if (prev && (prev.rank ?? 0) >= interpretation.rank) return "duplicate";

      tx.set(
        ref,
        {
          amount: converted.amountUsd,
          ...(converted.originalAmount !== undefined ? { originalAmount: converted.originalAmount } : {}),
          ...(converted.originalCurrency ? { originalCurrency: converted.originalCurrency } : {}),
          ...(converted.exchangeRate !== undefined ? { exchangeRate: converted.exchangeRate } : {}),
          date: new Date(interpretation.createdUnix * 1000).toISOString().slice(0, 10),
          type: "Income",
          category: "Tuition",
          description: interpretation.description,
          source: "stripe",
          stripePaymentId: interpretation.stripePaymentId,
          rank: interpretation.rank,
          // On a first write these land as-is (null included, so the field
          // exists). On an upgrade they're omitted when this event doesn't
          // know them, so the better event's values are never blanked out.
          ...(prev && !interpretation.studentId ? {} : { studentId: interpretation.studentId }),
          ...(prev && !interpretation.payerEmail ? {} : { payerEmail: interpretation.payerEmail }),
          ...(prev ? {} : { createdAt: FieldValue.serverTimestamp() }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return prev ? "upgraded" : "created";
    });

    if (outcome === "duplicate") {
      logger.info(`paymentReceiver: ${interpretation.stripePaymentId} already recorded — event ${event.id} ignored`);
      res.status(200).json({ ok: true, recorded: false, reason: "duplicate", transactionId: ref.id });
      return;
    }

    // Exactly once per payment, tracked on the document rather than inferred
    // from "created": applyPaymentToStudent rolls nextPayment forward a month,
    // so a second event for the same payment would bill the student a month
    // into the future. Flagging it only on success also means a payment_intent
    // event that couldn't identify the student still gets applied later, when
    // the checkout event arrives carrying client_reference_id.
    if (!alreadyApplied) {
      const applied = await applyPaymentToStudent({
        studentId: interpretation.studentId,
        payerEmail: interpretation.payerEmail,
      });
      if (applied) await ref.update({ studentApplied: true });
    }

    logger.info(`paymentReceiver: ${outcome} transaction ${ref.id} for Stripe event ${event.id}`);
    res.status(200).json({ ok: true, recorded: true, outcome, transactionId: ref.id });
  } catch (err) {
    logger.error("paymentReceiver: Firestore write failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

interface Interpretation {
  paymentIntentId: string | null;
  fallbackAmountMinor: number; // raw Stripe integer amount, used only if we can't resolve a real PaymentIntent
  fallbackCurrency: string;
  description: string;
  studentId: string | null;
  payerEmail: string | null;
  stripePaymentId: string;
  /** When Stripe says the money moved, not when this webhook happened to run — a retry a day later must not redate the payment. */
  createdUnix: number;
  /**
   * checkout.session.completed carries client_reference_id and
   * customer_details; payment_intent.succeeded carries neither. Both fire for
   * the same payment, so when they race, the richer one has to win regardless
   * of arrival order — see the merge in the handler above.
   */
  rank: number;
}

function interpretStripeEvent(event: Stripe.Event): Interpretation | null {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") return null;
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
    const payerEmail = session.customer_details?.email ?? null;
    return {
      paymentIntentId,
      fallbackAmountMinor: session.amount_total ?? 0,
      fallbackCurrency: session.currency ?? "usd",
      description: `Stripe checkout — ${payerEmail ?? session.customer ?? session.id}`,
      studentId: session.client_reference_id ?? (session.metadata?.studentId as string | undefined) ?? null,
      payerEmail,
      stripePaymentId: paymentIntentId ?? session.id,
      createdUnix: session.created,
      rank: 2,
    };
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    return {
      paymentIntentId: intent.id,
      fallbackAmountMinor: intent.amount,
      fallbackCurrency: intent.currency ?? "usd",
      description: `Stripe payment — ${intent.receipt_email ?? intent.id}`,
      studentId: (intent.metadata?.studentId as string | undefined) ?? null,
      payerEmail: intent.receipt_email ?? null,
      stripePaymentId: intent.id,
      createdUnix: intent.created,
      rank: 1,
    };
  }

  return null;
}
