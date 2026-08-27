import { NextRequest, NextResponse } from "next/server";
import {
  listDueRecurringTransactions,
  updateRecurringTransaction,
  createTransaction,
  applyPaymentToStudent,
} from "@/lib/firebase/db";
import { FirebaseNotConfiguredError } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import { addMonths, localDateIso } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

/**
 * Auto-triggers due recurring transactions (subscriptions, ad spend, etc):
 * for every active RecurringTransaction whose nextPayment has arrived, this
 * creates a real `transactions` entry and advances lastPayment/nextPayment
 * by one calendar month.
 *
 * Two ways in:
 * - Vercel Cron (see vercel.json) hits this daily with a
 *   `Authorization: Bearer $CRON_SECRET` header — set CRON_SECRET in Vercel
 *   env vars to match. Cron only runs once deployed; there's no local
 *   equivalent, which is why the signed-in-admin path below exists.
 * - The "Run now" button on /finance calls this via authFetch (Firebase ID
 *   token), so it can be tested locally without waiting for a deploy.
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const header = req.headers.get("authorization");
  if (process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}`) return true;
  try {
    await requireAuth(req);
    return true;
  } catch {
    return false;
  }
}

async function run(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const todayIso = localDateIso();
    const due = await listDueRecurringTransactions(todayIso);

    const results: { id: string; description: string; generatedDate: string; newNextPayment: string }[] = [];
    for (const r of due) {
      await createTransaction({
        amount: r.type === "Income" ? r.amount : -r.amount,
        date: r.nextPayment,
        type: r.type,
        category: r.category,
        description: `${r.description} (recurring)`,
        source: "recurring",
        recurringTransactionId: r.id,
        ...(r.studentId ? { studentId: r.studentId } : {}),
      });

      // Only a recurring INCOME tied to a student is a real tuition
      // payment — a recurring expense (ad spend, a SaaS subscription) must
      // never advance a student's due date.
      if (r.type === "Income" && r.studentId) {
        await applyPaymentToStudent({ studentId: r.studentId });
      }

      const nextPayment = addMonths(r.nextPayment, r.frequencyMonths ?? 1);
      await updateRecurringTransaction(r.id, { lastPayment: r.nextPayment, nextPayment });
      results.push({ id: r.id, description: r.description, generatedDate: r.nextPayment, newNextPayment: nextPayment });
    }

    return NextResponse.json({ triggered: results.length, results });
  } catch (err) {
    if (err instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: err.message }, { status: 501 });
    }
    // Most likely cause: the `active == true AND nextPayment <= today` query
    // needs a Firestore composite index (see firestore.indexes.json) that
    // hasn't been deployed yet — `npx firebase-tools deploy --only
    // firestore:indexes` (or click the link Firestore prints in its own
    // error message, in the Firebase console > Firestore > Indexes).
    const message = err instanceof Error ? err.message : "Unknown error";
    const hint = /index/i.test(message)
      ? " This looks like a missing Firestore index — run `npx firebase-tools deploy --only firestore:indexes`."
      : "";
    return NextResponse.json({ error: "run_failed", message: message + hint }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
