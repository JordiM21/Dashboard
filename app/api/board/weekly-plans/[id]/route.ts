import { NextRequest, NextResponse } from "next/server";
import { updateWeeklyPlan, deleteWeeklyPlan, type WeeklyPlanUpdates } from "@/lib/firebase/weeklyPlans";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";
import type { LessonLink } from "@/lib/types";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** Server-side re-validation of the links array — a link is a URL plus a label, nothing else, and only http(s) or a same-origin path is storable (so a saved link can never become a `javascript:` payload when the lesson sheet renders it as an anchor). */
function sanitizeLinks(value: unknown): LessonLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): LessonLink[] => {
    if (!raw || typeof raw !== "object") return [];
    const l = raw as Record<string, unknown>;
    if (typeof l.url !== "string") return [];
    const url = l.url.trim();
    if (!/^(https?:\/\/|\/)/i.test(url)) return [];
    return [
      {
        id: typeof l.id === "string" && l.id ? l.id : url,
        url,
        title: typeof l.title === "string" ? l.title.slice(0, 200) : "",
      },
    ];
  });
}

/** Patches one lesson — the plan/takeaways text, its links, its tags, its scheduling (group/date/topic/emojis), or `historyEntryId` when it's marked taught. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const updates: WeeklyPlanUpdates = {};
  if (typeof body?.order === "number" && Number.isFinite(body.order)) updates.order = body.order;
  if (typeof body?.teacherNotes === "string") updates.teacherNotes = body.teacherNotes;
  if (typeof body?.takeaways === "string") updates.takeaways = body.takeaways;
  if (Array.isArray(body?.links)) updates.links = sanitizeLinks(body.links);
  if (typeof body?.historyEntryId === "string") updates.historyEntryId = body.historyEntryId;
  if (Array.isArray(body?.tagIds)) updates.tagIds = body.tagIds.filter((t): t is string => typeof t === "string");
  if (typeof body?.groupId === "string" && body.groupId) updates.groupId = body.groupId;
  if (typeof body?.date === "string" && body.date) updates.date = body.date;
  if (typeof body?.topic === "string" && body.topic.trim()) updates.topic = body.topic.trim();
  if (Array.isArray(body?.emojis)) updates.emojis = body.emojis.filter((e): e is string => typeof e === "string");
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "invalid_request", message: "Nothing to update." }, { status: 400 });
  }

  try {
    const plan = await updateWeeklyPlan(params.id, updates);
    if (!plan) return NextResponse.json({ error: "not_found", message: `Unknown lesson "${params.id}".` }, { status: 404 });
    return NextResponse.json(plan);
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const ok = await deleteWeeklyPlan(params.id);
    if (!ok) return NextResponse.json({ error: "not_found", message: `Unknown lesson "${params.id}".` }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
