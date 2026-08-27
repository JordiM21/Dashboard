import { NextRequest, NextResponse } from "next/server";
import { listLessonFiles, createLessonFile, createBlankLessonFile } from "@/lib/teaching";
import { FirebaseNotConfiguredError } from "@/lib/firebase/admin";
import { requireAuth, UnauthorizedError } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const lessons = await listLessonFiles();
    return NextResponse.json({ lessons });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "unauthorized", message: err.message }, { status: 401 });
    }
    if (err instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: err.message }, { status: 501 });
    }
    return NextResponse.json(
      { error: "fetch_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}

/**
 * Two ways to create a lesson: upload an existing `.excalidraw`/`.json`
 * file (multipart `file` + `title`), or create a blank one from scratch
 * (JSON body `{ title }`, no file) — the Teaching sidebar's "New Lesson"
 * button.
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

  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      const titleRaw = formData.get("title");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "invalid_body", message: "file is required." }, { status: 400 });
      }
      const title = (typeof titleRaw === "string" && titleRaw.trim()) || file.name.replace(/\.(excalidraw|json)$/i, "");
      const buffer = Buffer.from(await file.arrayBuffer());

      // Fail fast on garbage input rather than silently storing something the canvas can't load.
      try {
        JSON.parse(buffer.toString("utf-8"));
      } catch {
        return NextResponse.json({ error: "invalid_file", message: "That file isn't valid JSON — expected a .excalidraw export." }, { status: 400 });
      }

      const lesson = await createLessonFile(buffer, title);
      return NextResponse.json(lesson, { status: 201 });
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled Lesson";
    const lesson = await createBlankLessonFile(title);
    return NextResponse.json(lesson, { status: 201 });
  } catch (err) {
    if (err instanceof FirebaseNotConfiguredError) {
      return NextResponse.json({ error: "not_configured", message: err.message }, { status: 501 });
    }
    return NextResponse.json(
      { error: "create_failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
