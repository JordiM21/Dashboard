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

export async function requireAuth(req: NextRequest): Promise<DecodedIdToken> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) throw new UnauthorizedError();

  try {
    return await getAdminAuth().verifyIdToken(token);
  } catch {
    throw new UnauthorizedError("Invalid or expired session — please sign in again.");
  }
}
