import { NextRequest, NextResponse } from "next/server";
import { createBlankFile } from "@/lib/resources";
import { requireAuth } from "@/lib/firebase/verifyAuth";

/** The Resources "+ Create" menu — body is `{ kind: "markdown"|"text", title, folderId }`. Creates a blank file ready to open in the visualizer, same shape a normal upload produces. */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => null)) as { kind?: unknown; title?: unknown; folderId?: unknown } | null;
  const kind = body?.kind;
  if (kind !== "markdown" && kind !== "text") {
    return NextResponse.json({ error: "invalid_request", message: "kind must be markdown or text." }, { status: 400 });
  }
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "invalid_request", message: "title is required." }, { status: 400 });
  const folderId = typeof body?.folderId === "string" ? body.folderId : null;

  const file = await createBlankFile(kind, title, folderId);
  return NextResponse.json(file, { status: 201 });
}
