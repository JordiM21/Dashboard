import { NextRequest, NextResponse } from "next/server";
import { getFileRecord, readFileText, writeFileContent } from "@/lib/resources";
import { requireAuth } from "@/lib/firebase/verifyAuth";

/** The visualizer's editor (markdown/text/excalidraw) — server-side read/write of a resource file's raw text content, avoiding any cross-origin fetch of the signed Storage URL. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const record = await getFileRecord(params.id);
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const content = await readFileText(record);
  return NextResponse.json({ content });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => null)) as { content?: unknown } | null;
  if (typeof body?.content !== "string") {
    return NextResponse.json({ error: "invalid_request", message: "content is required." }, { status: 400 });
  }

  const file = await writeFileContent(params.id, body.content);
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(file);
}
