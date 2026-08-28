import { NextRequest, NextResponse } from "next/server";
import { listCurriculumLevels, createCurriculumLevel } from "@/lib/firebase/curriculumBoard";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** The 20-level syllabus, now read straight from Firestore's `curriculum` collection — the Curriculum Board's static columns. */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const levels = await listCurriculumLevels();
    return NextResponse.json({ levels });
  } catch (err) {
    return NextResponse.json(
      { error: "read_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}

/** The Curriculum Board's per-stage "+ Add Level" button (and the "+ Add New Stage" bar, which just passes a stage name that doesn't exist yet) — body is `{ stageName }`. Inserts at the end of that stage, cascading every later level's number up by one. */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  const body = (await req.json().catch(() => null)) as { stageName?: unknown } | null;
  const stageName = typeof body?.stageName === "string" ? body.stageName.trim() : "";
  if (!stageName) return NextResponse.json({ error: "invalid_request", message: "stageName is required." }, { status: 400 });

  try {
    const level = await createCurriculumLevel(stageName);
    return NextResponse.json(level, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
