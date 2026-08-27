import { NextRequest, NextResponse } from "next/server";
import { getAdminStorage } from "@/lib/firebase/admin";
import { updateStudent } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";

/**
 * Student profile pictures — uploaded straight into Firebase Storage
 * instead of accepting an arbitrary pasted URL, which is what broke for
 * Google Drive links: a Drive "share" URL serves an HTML viewer page, not
 * raw image bytes, so an <img> tag just renders nothing. Uploading here
 * sidesteps that entirely — the same short-lived-signed-URL pattern
 * app/api/resources/files/[id]/content/route.ts already uses for Resources.
 *
 * One object per student (`studentPhotos/{id}`, no extension — Storage
 * tracks contentType in its own metadata) so a re-upload just overwrites
 * the previous photo instead of accumulating orphaned files.
 */
function photoPath(studentId: string): string {
  return `studentPhotos/${studentId}`;
}

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/** Loaded directly by <img> tags, which can't attach an Authorization header — same trust boundary as the Resources content route (the login gate keeps a logged-out visitor from ever requesting a student id). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const file = getAdminStorage().bucket().file(photoPath(params.id));
  const [exists] = await file.exists();
  if (!exists) return new NextResponse("Not found", { status: 404 });

  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_TTL_MS });
  return NextResponse.redirect(url);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "invalid_body", message: "Only image files are supported." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await getAdminStorage().bucket().file(photoPath(params.id)).save(buffer, { contentType: file.type });

  // Cache-busted so the browser doesn't keep showing the previous photo
  // from before this re-upload.
  const photoUrl = `/api/students/${params.id}/photo?v=${Date.now()}`;
  const student = await updateStudent(params.id, { photoUrl });
  if (!student) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(student);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  await getAdminStorage().bucket().file(photoPath(params.id)).delete({ ignoreNotFound: true });
  const student = await updateStudent(params.id, { photoUrl: "" });
  if (!student) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(student);
}
