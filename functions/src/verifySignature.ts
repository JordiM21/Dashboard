import * as crypto from "crypto";

/** Timing-safe HMAC-SHA256 hex comparison, shared by both webhook signature schemes. */
export function timingSafeHmacEquals(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  if (expected.length !== actual.length) return false;
  try {
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}
