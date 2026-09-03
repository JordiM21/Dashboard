import { NextRequest, NextResponse } from "next/server";
import { updateProject, deleteProject, detachTasksFromProject } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import type { Project } from "@/lib/types";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const updates = (await req.json()) as Partial<Project>;
  const project = await updateProject(params.id, updates);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(project);
}

/** Deleting a project keeps its tasks — they just become unfiled. See detachTasksFromProject. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const ok = await deleteProject(params.id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const detached = await detachTasksFromProject(params.id);
  return NextResponse.json({ ok: true, detached });
}
