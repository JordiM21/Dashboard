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

  const body = await req.json();
  const { frontmatter, content } = body as { frontmatter: Partial<Project>; content: string };
  if (!frontmatter?.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const project = await createProject({
    title: frontmatter.title,
    priority: frontmatter.priority ?? "Medium",
    field: frontmatter.field ?? "",
    status: frontmatter.status ?? "To Do",
    progress: frontmatter.progress ?? 0,
    icon: frontmatter.icon ?? "",
    content: content ?? "",
  });
  return NextResponse.json(project, { status: 201 });
}
