import { NextRequest, NextResponse } from "next/server";
import { updateWeeklyPlanFolder, deleteWeeklyPlanFolder } from "@/lib/firebase/weeklyPlans";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** Renames, recolors, and/or reparents (nests) one folder — body is `{ name?, parentId?, color? }`. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  const body = (await req.json().catch(() => null)) as { name?: unknown; parentId?: unknown; color?: unknown } | null;
  const updates: { name?: string; parentId?: string | null; color?: string | null } = {};
  if (typeof body?.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (body?.parentId === null || typeof body?.parentId === "string") updates.parentId = body.parentId;
  if (body?.color === null || typeof body?.color === "string") updates.color = body.color;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "invalid_request", message: "Provide name, parentId, and/or color." }, { status: 400 });
  }

  try {
    const ok = await updateWeeklyPlanFolder(params.id, updates);
    if (!ok) return NextResponse.json({ error: "not_found_or_invalid_move" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}

/** Deletes a folder and its subfolders — plans inside are unfiled, never deleted. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const ok = await deleteWeeklyPlanFolder(params.id);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
