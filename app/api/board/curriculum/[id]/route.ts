import { NextRequest, NextResponse } from "next/server";
import { updateCurriculumLevel, deleteCurriculumLevel } from "@/lib/firebase/curriculumBoard";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** Edit Syllabus mode's add/rename/delete-topic actions and the level detail modal — body is `{ title?, subtopics?, emoji?, color? }`. The client sends the whole updated `subtopics` array; this just overwrites it. Reordering/restaging a level goes through POST .../reorder instead. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  const body = (await req.json().catch(() => null)) as
    | { title?: unknown; subtopics?: unknown; emoji?: unknown; color?: unknown }
    | null;
  const updates: { title?: string; subtopics?: string[]; emoji?: string; color?: string | null } = {};
  if (typeof body?.title === "string") updates.title = body.title;
  if (Array.isArray(body?.subtopics) && body.subtopics.every((s) => typeof s === "string")) {
    updates.subtopics = body.subtopics as string[];
  }
  if (typeof body?.emoji === "string") updates.emoji = body.emoji;
  if (body?.color === null || typeof body?.color === "string") updates.color = body.color;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "invalid_request", message: "Provide title, subtopics, emoji, and/or color." }, { status: 400 });
  }

  try {
    const level = await updateCurriculumLevel(params.id, updates);
    if (!level) return NextResponse.json({ error: "not_found", message: `Unknown level "${params.id}".` }, { status: 404 });
    return NextResponse.json(level);
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}

/** The level detail modal's Delete button — closes the level-number gap it leaves behind. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const ok = await deleteCurriculumLevel(params.id);
    if (!ok) return NextResponse.json({ error: "not_found", message: `Unknown level "${params.id}".` }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
