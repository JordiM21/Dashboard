import { NextRequest, NextResponse } from "next/server";
import { listWeeklyPlans, createWeeklyPlan } from "@/lib/firebase/weeklyPlans";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** Every lesson plan — the Teaching view sidebar's "Weekly Plans" queue. */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const plans = await listWeeklyPlans();
    return NextResponse.json({ plans });
  } catch (err) {
    return NextResponse.json({ error: "read_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}

/** The "+ New Lesson" modal's Save action — body is `{ groupId, date, topic, teacherNotes, emojis }`. Creates the Firestore doc and a blank .excalidraw file on disk. */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  const body = (await req.json().catch(() => null)) as
    | { groupId?: unknown; date?: unknown; topic?: unknown; teacherNotes?: unknown; emojis?: unknown; tagIds?: unknown }
    | null;

  const groupId = typeof body?.groupId === "string" ? body.groupId.trim() : "";
  const date = typeof body?.date === "string" ? body.date.trim() : "";
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  if (!groupId || !date || !topic) {
    return NextResponse.json({ error: "invalid_request", message: "groupId, date, and topic are required." }, { status: 400 });
  }
  const teacherNotes = typeof body?.teacherNotes === "string" ? body.teacherNotes : "";
  const emojis = Array.isArray(body?.emojis) ? body.emojis.filter((e): e is string => typeof e === "string") : [];
  const tagIds = Array.isArray(body?.tagIds) ? body.tagIds.filter((t): t is string => typeof t === "string") : [];

  try {
    const plan = await createWeeklyPlan({ groupId, date, topic, teacherNotes, emojis, tagIds });
    return NextResponse.json(plan, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
