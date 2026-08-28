import { NextRequest, NextResponse } from "next/server";
import { reorderCurriculumLevels } from "@/lib/firebase/curriculumBoard";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

/** Dragging a level card — body is `{ order: [{ id, stageName }] }`, every level id in its new visual sequence (same stage for a within-stage reorder, a different one for a drag across a stage boundary). Renumbers the whole syllabus 1..N to match. */
export async function PATCH(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { order?: unknown } | null;
  const order = Array.isArray(body?.order)
    ? body.order.filter(
        (o): o is { id: string; stageName: string } =>
          typeof o === "object" && o !== null && typeof (o as any).id === "string" && typeof (o as any).stageName === "string"
      )
    : [];
  if (order.length === 0 || order.length !== (body?.order as unknown[])?.length) {
    return NextResponse.json({ error: "invalid_request", message: "order must be a non-empty array of { id, stageName }." }, { status: 400 });
  }

  try {
    const ok = await reorderCurriculumLevels(order);
    if (!ok) return NextResponse.json({ error: "conflict", message: "order didn't match the current levels — reload and try again." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
