import { NextRequest, NextResponse } from "next/server";
import { listContent, createContent } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import type { ContentItem } from "@/lib/types";

export async function GET() {
  const content = await listContent();
  return NextResponse.json(content);
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
  const { frontmatter, content } = body as { frontmatter: Partial<ContentItem>; content: string };
  if (!frontmatter?.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const item = await createContent({
    title: frontmatter.title,
    cover: frontmatter.cover || "/covers/placeholder.svg",
    tags: frontmatter.tags ?? [],
    ...(frontmatter.publishedAt ? { publishedAt: frontmatter.publishedAt } : {}),
    content: content ?? "",
  });
  return NextResponse.json(item, { status: 201 });
}
