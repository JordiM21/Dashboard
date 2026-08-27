import { NextRequest, NextResponse } from "next/server";
import { updateTransaction, deleteTransaction } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.date !== undefined) updates.date = body.date;
  if (body.description !== undefined) updates.description = body.description;
  if (body.category !== undefined) updates.category = body.category || "Uncategorized";
  if (body.type !== undefined) updates.type = body.type;
  if (body.amount !== undefined) updates.amount = Number(body.amount);
  if (body.studentId !== undefined) updates.studentId = body.studentId || null;

  const entry = await updateTransaction(params.id, updates);
  if (!entry) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(entry);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const ok = await deleteTransaction(params.id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
