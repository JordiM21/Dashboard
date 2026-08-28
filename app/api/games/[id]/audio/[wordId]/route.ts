import { NextRequest, NextResponse } from "next/server";
import { getAdminStorage } from "@/lib/firebase/admin";
import { requireAuth } from "@/lib/firebase/verifyAuth";

/**
 * Per-word audio clips for Spelling Bee — either recorded in-browser
 * (MediaRecorder, typically audio/webm) or uploaded as an existing file
 * (mp3, wav, m4a, whatever the browser's <audio> can play). Same
 * upload-to-Storage-then-serve-via-signed-URL pattern as student profile
 * photos (app/api/students/[id]/photo/route.ts) — one object per word,
 * no extension (Storage tracks contentType itself), so re-recording just
 * overwrites the previous clip.
 *
 * This route only touches Storage and hands back a URL — it does NOT write
 * to the game's Firestore doc. The editor is responsible for setting that
 * URL on the word in its own local state and persisting it through the
 * normal "Save" button, same as every other field on the game.
 */
function audioPath(gameId: string, wordId: string): string {
  return `gameAudio/${gameId}/${wordId}`;
}

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/** Loaded directly by <audio> tags, which can't attach an Authorization header — same trust boundary as student photos. */
export async function GET(_req: NextRequest, { params }: { params: { id: string; wordId: string } }) {
  const file = getAdminStorage().bucket().file(audioPath(params.id, params.wordId));
  const [exists] = await file.exists();
  if (!exists) return new NextResponse("Not found", { status: 404 });

  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_TTL_MS });
  return NextResponse.redirect(url);
}

export async function POST(req: NextRequest, { params }: { params: { id: string; wordId: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid_body", message: "file is required." }, { status: 400 });
  }
  if (!file.type.startsWith("audio/")) {
    return NextResponse.json({ error: "invalid_body", message: "Only audio files are supported." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await getAdminStorage().bucket().file(audioPath(params.id, params.wordId)).save(buffer, { contentType: file.type });

  // Cache-busted so the browser doesn't keep playing a previous recording.
  const audioUrl = `/api/games/${params.id}/audio/${params.wordId}?v=${Date.now()}`;
  return NextResponse.json({ audioUrl });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; wordId: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  await getAdminStorage().bucket().file(audioPath(params.id, params.wordId)).delete({ ignoreNotFound: true });
  return NextResponse.json({ ok: true });
}
