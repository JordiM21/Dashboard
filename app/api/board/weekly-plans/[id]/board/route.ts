import { NextRequest, NextResponse } from "next/server";
import { getWeeklyPlan, readWeeklyPlanBoard, writeWeeklyPlanBoard } from "@/lib/firebase/weeklyPlans";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

function unauthorized(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
  return NextResponse.json({ error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
}

/** Reads a weekly plan's `.excalidraw` scene off disk — the Teaching view's board loader for a manually-created lesson. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const plan = await getWeeklyPlan(params.id);
    if (!plan) return NextResponse.json({ error: "not_found", message: `Unknown plan "${params.id}".` }, { status: 404 });
    const scene = await readWeeklyPlanBoard(plan);
    return NextResponse.json({ scene, plan });
  } catch (err) {
    return NextResponse.json({ error: "read_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}

/** Overwrites a weekly plan's `.excalidraw` scene on disk — the Teaching view's Save button and autosave. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return unauthorized(err);
  }

  try {
    const plan = await getWeeklyPlan(params.id);
    if (!plan) return NextResponse.json({ error: "not_found", message: `Unknown plan "${params.id}".` }, { status: 404 });
    const scene = await req.json();
    await writeWeeklyPlanBoard(plan, scene);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "write_failed", message: err instanceof Error ? err.message : "Unknown error" }, { status: 502 });
  }
}
