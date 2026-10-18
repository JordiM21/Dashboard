/**
 * For webhooks called directly from a browser (e.g. a static site's own fetch()), not server-to-server
 * ones like Kommo. Server-to-server callers send no Origin header, so this is a no-op for them.
 * Note: CORS only stops OTHER SITES' browser scripts from completing the request (via a failed
 * preflight) — it does nothing against someone who copies the URL and calls it with curl/a script.
 * It's hygiene, not the real defense; that's the honeypot + rate limit in the form flow itself.
 */
const strip = (s: string) => s.replace(/\/+$/, ""); // browsers never send a trailing slash in Origin; a typo shouldn't break matching

export function corsHeaders(origin: string | null, allowed: unknown): Record<string, string> {
  const list = Array.isArray(allowed) ? (allowed as unknown[]).filter((x): x is string => typeof x === "string").map(strip) : [];
  if (!origin || !list.includes(strip(origin))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
