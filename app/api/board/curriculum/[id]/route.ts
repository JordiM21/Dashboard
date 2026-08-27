import { NextRequest, NextResponse } from "next/server";
import { updateCurriculumLevel } from "@/lib/firebase/curriculumBoard";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

/** Edit Syllabus mode's add/rename/delete-topic actions — body is `{ title? , subtopics? }`. The client sends the whole updated `subtopics` array; this just overwrites it. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { title?: unknown; subtopics?: unknown } | null;
  const updates: { title?: string; subtopics?: string[] } = {};
  if (typeof body?.title === "string") updates.title = body.title;
  if (Array.isArray(body?.subtopics) && body.subtopics.every((s) => typeof s === "string")) {
    updates.subtopics = body.subtopics as string[];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "invalid_request", message: "Provide title and/or subtopics." }, { status: 400 });
  }

  try {
    const level = await updateCurriculumLevel(params.id, updates);
    if (!level) return NextResponse.json({ error: "not_found", message: `Unknown level "${params.id}".` }, { status: 404 });
    return NextResponse.json(level);
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
