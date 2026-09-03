import { NextRequest, NextResponse } from "next/server";
import { updateTask, deleteTask } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import type { Task } from "@/lib/types";

/**
 * A PATCH-shaped PUT: only the keys sent are written, because almost every
 * write from the UI is a single-field flick (tick a checkbox, push to
 * tomorrow, bump priority) and round-tripping the whole document for those
 * is how two quick taps on the same card end up clobbering each other.
 *
 * `completedAt` is set here rather than by the client so "what did I finish
 * today" can't be rewritten by a stale browser clock.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const updates = (await req.json()) as Partial<Task>;
  if (updates.status !== undefined) {
    updates.completedAt = updates.status === "done" ? new Date().toISOString() : null;
  }

  const task = await updateTask(params.id, updates);
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(task);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const ok = await deleteTask(params.id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
