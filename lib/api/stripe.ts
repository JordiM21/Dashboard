/**
 * Stripe integration — daily revenue & transactions for the Manager KPI
 * chart. Uses stripe.balanceTransactions.list(), which returns each
 * charge's already-settled amount/currency directly — no per-transaction
 * PaymentIntent lookup needed (unlike scripts/backfillStripeTransactions.ts,
 * which needs the *original* charge currency too and so has to expand the
 * PaymentIntent; this only needs the settled total per day).
 *
 * Currency: like the rest of this app's Stripe integration (see README.md
 * "Multi-currency, unified to USD"), this account's balance doesn't settle
 * purely in USD — entries not settled in USD are excluded from the sum
 * rather than mislabeled. See that section for why.
 */
import Stripe from "stripe";

export interface StripeDailyRevenue {
  date: string; // YYYY-MM-DD
  revenue: number;
  transactions: number;
  currency: string;
}

export async function fetchStripeRevenue(days = 14): Promise<StripeDailyRevenue[]> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return dummyStripeData(days);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const byDay = new Map<string, { revenue: number; transactions: number }>();
  for await (const txn of stripe.balanceTransactions.list({
    created: { gte: since },
    type: "charge",
    limit: 100,
  })) {
    if (txn.currency !== "usd") continue; // don't blend a non-USD settlement into a USD total
    const dateKey = new Date(txn.created * 1000).toISOString().slice(0, 10);
    const entry = byDay.get(dateKey) ?? { revenue: 0, transactions: 0 };
    entry.revenue += txn.amount / 100; // usd is not a zero-decimal currency
    entry.transactions += 1;
    byDay.set(dateKey, entry);
  }

  // Fill in every day in the window, including $0 days, so the chart has no gaps.
  const out: StripeDailyRevenue[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = byDay.get(key);
    out.push({
      date: key,
      revenue: Math.round((entry?.revenue ?? 0) * 100) / 100,
      transactions: entry?.transactions ?? 0,
      currency: "usd",
    });
  }
  return out;
}

function dummyStripeData(days: number): StripeDailyRevenue[] {
  const out: StripeDailyRevenue[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const base = 400 + Math.sin(i / 2) * 150;
    out.push({
      date: d.toISOString().slice(0, 10),
      revenue: Math.round(base + Math.random() * 200),
      transactions: Math.round(3 + Math.random() * 8),
      currency: "usd",
    });
  }
  return out;
}
