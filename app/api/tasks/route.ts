import { NextRequest, NextResponse } from "next/server";
import { listTasks, createTask } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import type { Task } from "@/lib/types";

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json(tasks);
}

/**
 * Every field is optional except the title — the whole point of the
 * capture box is that "call the accountant" and nothing else is a valid
 * task. Defaults are filled in here, server-side, so a task created from
 * the Overview and one created from the full modal are the same shape.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = (await req.json()) as Partial<Task>;
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const task = await createTask({
    title,
    notes: body.notes ?? "",
    tags: body.tags ?? [],
    priority: body.priority ?? "Medium",
    status: body.status ?? "todo",
    due: body.due ?? null,
    projectId: body.projectId ?? null,
    subtasks: body.subtasks ?? [],
    completedAt: body.status === "done" ? new Date().toISOString() : null,
  });
  return NextResponse.json(task, { status: 201 });
}
