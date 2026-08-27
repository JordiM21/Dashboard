import { NextResponse } from "next/server";
import { getFileRecord, getSignedFileUrl } from "@/lib/resources";

/**
 * No requireAuth() here on purpose: this URL is loaded directly by <img>/
 * <video> tags, which can't attach an Authorization header. The app's login
 * gate keeps a logged-out visitor from ever seeing a file id to request in
 * the first place; the signed Storage URL this redirects to is itself
 * short-lived (see SIGNED_URL_TTL_MS in lib/resources.ts). Same trust
 * boundary as the local-disk version this replaced.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const record = await getFileRecord(params.id);
  if (!record) return new Response("Not found", { status: 404 });

  const url = await getSignedFileUrl(record);
  return NextResponse.redirect(url);
}
