import { NextRequest, NextResponse } from "next/server";
import { updateGroupPlacement } from "@/lib/firebase/curriculumBoard";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

/** Drops a group onto a level/subtopic — body is `{ currentLevel, currentTopic }`. This is what the Curriculum Board's onDrop handler calls. */
export async function PATCH(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => null)) as { currentLevel?: unknown; currentTopic?: unknown } | null;
  const currentLevel = Number(body?.currentLevel);
  if (!Number.isInteger(currentLevel) || currentLevel < 1 || currentLevel > 20) {
    return NextResponse.json({ error: "invalid_request", message: "currentLevel must be 1-20." }, { status: 400 });
  }
  const currentTopic = typeof body?.currentTopic === "string" ? body.currentTopic : "";

  try {
    const group = await updateGroupPlacement(params.groupId, { currentLevel, currentTopic });
    if (!group) {
      return NextResponse.json({ error: "not_found", message: `Unknown group "${params.groupId}".` }, { status: 404 });
    }
    return NextResponse.json({ group });
  } catch (err) {
    return NextResponse.json(
      { error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
