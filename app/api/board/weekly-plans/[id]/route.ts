import { NextRequest, NextResponse } from "next/server";
import { updateWeeklyPlan, deleteWeeklyPlan } from "@/lib/firebase/weeklyPlans";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** Patches `order` (sidebar drag-reorder), `teacherNotes` (the Teacher Notes panel's save), `folderId` (drag-to-folder; "" files it back to Unfiled), `tagIds`, and/or `groupId`/`date`/`topic`/`emojis` (the Edit Lesson modal) on one plan. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  const body = (await req.json().catch(() => null)) as
    | { order?: unknown; teacherNotes?: unknown; folderId?: unknown; tagIds?: unknown; groupId?: unknown; date?: unknown; topic?: unknown; emojis?: unknown }
    | null;
  const updates: {
    order?: number;
    teacherNotes?: string;
    folderId?: string;
    tagIds?: string[];
    groupId?: string;
    date?: string;
    topic?: string;
    emojis?: string[];
  } = {};
  if (typeof body?.order === "number" && Number.isFinite(body.order)) updates.order = body.order;
  if (typeof body?.teacherNotes === "string") updates.teacherNotes = body.teacherNotes;
  if (typeof body?.folderId === "string") updates.folderId = body.folderId;
  if (Array.isArray(body?.tagIds)) updates.tagIds = body.tagIds.filter((t): t is string => typeof t === "string");
  if (typeof body?.groupId === "string" && body.groupId) updates.groupId = body.groupId;
  if (typeof body?.date === "string" && body.date) updates.date = body.date;
  if (typeof body?.topic === "string" && body.topic.trim()) updates.topic = body.topic.trim();
  if (Array.isArray(body?.emojis)) updates.emojis = body.emojis.filter((e): e is string => typeof e === "string");
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "invalid_request", message: "Provide order, teacherNotes, folderId, tagIds, groupId, date, topic, and/or emojis." }, { status: 400 });
  }

  try {
    const plan = await updateWeeklyPlan(params.id, updates);
    if (!plan) return NextResponse.json({ error: "not_found", message: `Unknown plan "${params.id}".` }, { status: 404 });
    return NextResponse.json(plan);
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}

/** The sidebar's 🗑️ button — deletes the plan's Firestore doc and its on-disk `.excalidraw` file. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const ok = await deleteWeeklyPlan(params.id);
    if (!ok) return NextResponse.json({ error: "not_found", message: `Unknown plan "${params.id}".` }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
