import { NextRequest, NextResponse } from "next/server";
import { listTransactions, createTransaction, applyPaymentToStudent } from "@/lib/firebase/db";
import { summarizeFinance } from "@/lib/finance";
import { FirebaseNotConfiguredError } from "@/lib/firebase/admin";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const entries = await listTransactions();
    const summary = summarizeFinance(entries);
    return NextResponse.json({ entries, summary, fetchedAt: new Date().toISOString() });
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
  if (!body?.date || Number.isNaN(amount) || amount === 0) {
    return NextResponse.json(
      { error: "invalid_body", message: "date and a non-zero amount are required." },
      { status: 400 }
    );
  }

  try {
    const originalAmount = Number(body?.originalAmount);
    const hasOriginal = typeof body.originalCurrency === "string" && body.originalCurrency.trim() && !Number.isNaN(originalAmount);

    const type = body.type === "Expense" || amount < 0 ? "Expense" : "Income";
    const payerEmail = typeof body.payerEmail === "string" ? body.payerEmail.trim().toLowerCase() : "";

    const entry = await createTransaction({
      amount, // always USD
      date: body.date,
      type,
      category: body.category?.trim() || "Uncategorized",
      description: body.description?.trim() ?? "",
      // Always "manual" here, regardless of what the client sends — this is
      // the only writer that should ever produce a manual entry. "stripe"
      // entries only ever come from functions/src/paymentReceiver.ts.
      source: "manual",
      ...(body.studentId ? { studentId: body.studentId } : {}),
      ...(payerEmail ? { payerEmail } : {}),
      ...(hasOriginal
        ? { originalAmount, originalCurrency: body.originalCurrency.trim().toLowerCase() }
        : {}),
    });

    // A tuition payment (Income, tied to a student directly or by the
    // parent's email) advances that student's due date — see
    // lib/studentStatus.ts for how this becomes "Up to Date".
    if (type === "Income" && (body.studentId || payerEmail)) {
      await applyPaymentToStudent({ studentId: body.studentId || null, payerEmail: payerEmail || null });
    }

    return NextResponse.json(entry, { status: 201 });
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
