import type { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "./admin";

/**
 * `firestore.rules` requiring `request.auth != null` only protects direct
 * client SDK access (onSnapshot, etc). It does NOT protect these Route
 * Handlers — they use firebase-admin, which bypasses Firestore rules
 * entirely by design. Without this check, /api/students and /api/finance
 * would stay wide open to anyone who can reach the server, regardless of
 * the rules update. Call this first in any handler touching Firestore data.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Missing or invalid Authorization header.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** The only account allowed in — same UID as firestore.rules / storage.rules. */
const OWNER_UID = "Nabyq1LVHfRG8c7acQzyZZerJSB3";

export async function requireAuth(req: NextRequest): Promise<DecodedIdToken> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) throw new UnauthorizedError();

  let decoded: DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(token);
  } catch {
    throw new UnauthorizedError("Invalid or expired session — please sign in again.");
  }
  if (decoded.uid !== OWNER_UID) throw new UnauthorizedError();
  return decoded;
}

/** Route-handler shorthand: a 401 Response when the caller isn't signed in, else null. */
export async function denyUnlessAuthed(req: NextRequest): Promise<Response | null> {
  try {
    await requireAuth(req);
    return null;
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "unauthorized" }, { status: 401 });
  }
}
