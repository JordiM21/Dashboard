import { NextRequest, NextResponse } from "next/server";
import { listGroupHistorySince, addGroupHistoryEntry } from "@/lib/firebase/curriculumBoard";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** History entries for one group since `?since=YYYY-MM-DD` (defaults to 30 days ago) — the "Generate Parent Report" button's data source. */
export async function GET(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  const sinceParam = new URL(req.url).searchParams.get("since");
  const since = sinceParam ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const entries = await listGroupHistorySince(params.groupId, since);
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: "read_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}

/** Logs one completed-lesson entry — the Teaching view's "Mark as Mastered" / "Needs Review" buttons. Body: `{ date, topic, status, teacherNotes }`. */
export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  const body = (await req.json().catch(() => null)) as
    | { date?: unknown; topic?: unknown; status?: unknown; teacherNotes?: unknown }
    | null;
  const date = typeof body?.date === "string" ? body.date : "";
  const topic = typeof body?.topic === "string" ? body.topic : "";
  const status = body?.status === "Mastered" || body?.status === "Review Pending" ? body.status : null;
  if (!date || !topic || !status) {
    return NextResponse.json({ error: "invalid_request", message: "date, topic, and status are required." }, { status: 400 });
  }
  const teacherNotes = typeof body?.teacherNotes === "string" ? body.teacherNotes : "";

  try {
    const entry = await addGroupHistoryEntry(params.groupId, { date, topic, status, teacherNotes });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
