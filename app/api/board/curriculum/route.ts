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

/** The Curriculum Board's "+ Add New Level" button — no body, just appends a blank level after the highest levelNumber. */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const level = await createCurriculumLevel();
    return NextResponse.json(level, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
