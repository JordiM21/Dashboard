import { NextRequest, NextResponse } from "next/server";
import { updateGroupHistoryEntry, deleteGroupHistoryEntry } from "@/lib/firebase/curriculumBoard";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** Edits one history entry — Students view's Edit Syllabus mode, editing a "RECENT HISTORY" row. Body is any of `{ date, topic, status, teacherNotes }`. */
export async function PATCH(req: NextRequest, { params }: { params: { groupId: string; entryId: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  const body = (await req.json().catch(() => null)) as
    | { date?: unknown; topic?: unknown; status?: unknown; teacherNotes?: unknown }
    | null;
  const updates: { date?: string; topic?: string; status?: "Mastered" | "Review Pending"; teacherNotes?: string } = {};
  if (typeof body?.date === "string") updates.date = body.date;
  if (typeof body?.topic === "string") updates.topic = body.topic;
  if (body?.status === "Mastered" || body?.status === "Review Pending") updates.status = body.status;
  if (typeof body?.teacherNotes === "string") updates.teacherNotes = body.teacherNotes;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "invalid_request", message: "Provide at least one field to update." }, { status: 400 });
  }

  try {
    const entry = await updateGroupHistoryEntry(params.groupId, params.entryId, updates);
    if (!entry) return NextResponse.json({ error: "not_found", message: `Unknown history entry "${params.entryId}".` }, { status: 404 });
    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}

/** Deletes one history entry. */
export async function DELETE(req: NextRequest, { params }: { params: { groupId: string; entryId: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const ok = await deleteGroupHistoryEntry(params.groupId, params.entryId);
    if (!ok) return NextResponse.json({ error: "not_found", message: `Unknown history entry "${params.entryId}".` }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
