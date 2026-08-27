import { NextRequest, NextResponse } from "next/server";
import { updateWeeklyPlan } from "@/lib/firebase/weeklyPlans";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

/** Patches `order` (sidebar drag-reorder), `teacherNotes` (the Teacher Notes panel's save), and/or `folderId` (drag-to-folder; "" files it back to Unfiled) on one plan. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { order?: unknown; teacherNotes?: unknown; folderId?: unknown; tagIds?: unknown }
    | null;
  const updates: { order?: number; teacherNotes?: string; folderId?: string; tagIds?: string[] } = {};
  if (typeof body?.order === "number" && Number.isFinite(body.order)) updates.order = body.order;
  if (typeof body?.teacherNotes === "string") updates.teacherNotes = body.teacherNotes;
  if (typeof body?.folderId === "string") updates.folderId = body.folderId;
  if (Array.isArray(body?.tagIds)) updates.tagIds = body.tagIds.filter((t): t is string => typeof t === "string");
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "invalid_request", message: "Provide order, teacherNotes, folderId, and/or tagIds." }, { status: 400 });
  }

  try {
    const plan = await updateWeeklyPlan(params.id, updates);
    if (!plan) return NextResponse.json({ error: "not_found", message: `Unknown plan "${params.id}".` }, { status: 404 });
    return NextResponse.json(plan);
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
