import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import type { Project } from "@/lib/types";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = (await req.json()) as Partial<Project>;
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const project = await createProject({
    title,
    icon: body.icon ?? "",
    field: body.field ?? "",
    archived: body.archived ?? false,
    content: body.content ?? "",
  });
  return NextResponse.json(project, { status: 201 });
}
