import { NextRequest, NextResponse } from "next/server";
import {
  listRecurringTransactions,
  createRecurringTransaction,
  createTransaction,
  applyPaymentToStudent,
} from "@/lib/firebase/db";
import { FirebaseNotConfiguredError } from "@/lib/firebase/admin";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";
import { addMonths } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const recurring = await listRecurringTransactions();
    return NextResponse.json(recurring);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    }
    if (err instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: err.message }, { status: 501 });
    }
    return NextResponse.json(
      { error: "fetch_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const amount = Number(body?.amount);
  // Either a plain nextPayment (a subscription starting now/in the future),
  // or paidOn (this was already paid once — see below) — one of the two is
  // required, not both.
  const paidOn: string | null = body?.paidOn?.trim() || null;
  if (!body?.description?.trim() || (!body?.nextPayment && !paidOn) || Number.isNaN(amount) || amount <= 0) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: "description, a positive amount, and either nextPayment or paidOn are required.",
      },
      { status: 400 }
    );
  }

  const frequencyMonths = Number(body.frequencyMonths) > 0 ? Math.round(Number(body.frequencyMonths)) : 1;
  const type = body.type === "Income" ? "Income" : "Expense";
  const category = body.category?.trim() || "Uncategorized";
  const description = body.description.trim();

  try {
    // "Already paid" path: 19 Aug, every 6 months -> this logs the real
    // transaction dated 19 Aug (so it shows in Finance like any other
    // payment) AND sets lastPayment=19 Aug, nextPayment=19 Feb directly,
    // instead of waiting for the cron to "discover" a payment that already
    // happened.
    const recurring = await createRecurringTransaction({
      description,
      category,
      type,
      amount,
      active: true,
      lastPayment: paidOn,
      nextPayment: paidOn ? addMonths(paidOn, frequencyMonths) : body.nextPayment,
      frequencyMonths,
      ...(body.studentId ? { studentId: body.studentId } : {}),
    });

    if (paidOn) {
      await createTransaction({
        amount: type === "Income" ? amount : -amount,
        date: paidOn,
        type,
        category,
        description: `${description} (recurring)`,
        source: "recurring",
        recurringTransactionId: recurring.id,
        ...(body.studentId ? { studentId: body.studentId } : {}),
      });

      if (type === "Income" && body.studentId) {
        await applyPaymentToStudent({ studentId: body.studentId });
      }
    }

    return NextResponse.json(recurring, { status: 201 });
  } catch (err) {
    if (err instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: err.message }, { status: 501 });
    }
    return NextResponse.json(
      { error: "create_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
