import { NextRequest, NextResponse } from "next/server";
import { getLessonFile, readLessonContent, writeLessonContent } from "@/lib/teaching";
import { requireAuth } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

/** The lesson's parsed `.excalidraw` scene — fetched by the server (not redirected to a signed URL) so the browser never has to do a cross-origin fetch just to load a whiteboard. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const lesson = await getLessonFile(params.id);
  if (!lesson) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const scene = await readLessonContent(lesson);
    return NextResponse.json({ lesson, scene });
  } catch (err) {
    return NextResponse.json(
      { error: "read_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}

/** Saves the current canvas state back to this lesson — the Teaching view's Save button. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const scene = await req.json();
  const lesson = await writeLessonContent(params.id, scene);
  if (!lesson) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(lesson);
}
