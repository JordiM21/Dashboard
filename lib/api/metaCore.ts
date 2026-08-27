/**
 * Shared plumbing for every Meta (Facebook/Instagram) integration in this
 * app — lib/api/meta.ts (ads), lib/api/metaContent.ts (posts/comments),
 * lib/api/metaLeads.ts (Lead Ads). One place for the Graph API version,
 * error shape, and the Page/Instagram token resolution every content
 * endpoint needs but the ad-insights endpoint doesn't.
 */

export const META_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export function metaConfigured(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN);
}

/** Accepts the ad account ID with or without the "act_" prefix Graph API requires. */
export function metaAdAccountId(): string {
  const raw = process.env.META_AD_ACCOUNT_ID ?? "";
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

export class MetaApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "MetaApiError";
  }
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number };
}

/** Thin fetch wrapper for Graph API GETs — appends access_token, throws MetaApiError with Meta's own message on failure. */
export async function graphGet<T>(
  path: string,
  params: Record<string, string>,
  accessToken = process.env.META_ACCESS_TOKEN ?? ""
): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(`${GRAPH_BASE}${path}?${qs}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body as GraphErrorBody;
    throw new MetaApiError(err.error?.message ?? res.statusText, res.status);
  }
  return body as T;
}

/** Thin fetch wrapper for Graph API POSTs (publish, reply, moderate) — form-encoded body, same error shape as graphGet. */
export async function graphPost<T>(
  path: string,
  params: Record<string, string>,
  accessToken = process.env.META_ACCESS_TOKEN ?? ""
): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: accessToken }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body as GraphErrorBody;
    throw new MetaApiError(err.error?.message ?? res.statusText, res.status);
  }
  return body as T;
}

/** Graph API DELETE — used for removing a comment. */
export async function graphDelete(
  path: string,
  params: Record<string, string> = {},
  accessToken = process.env.META_ACCESS_TOKEN ?? ""
): Promise<void> {
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(`${GRAPH_BASE}${path}?${qs}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body as GraphErrorBody;
    throw new MetaApiError(err.error?.message ?? res.statusText, res.status);
  }
}

interface PageAccount {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

export interface ResolvedMetaAssets {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramAccountId: string | null;
}

// Page/IG identity rarely changes — cached per server process (not
// persisted; a cold serverless start just re-resolves it once) so every
// content/comments/publish call in a request burst doesn't re-hit
// /me/accounts.
let cachedAssets: ResolvedMetaAssets | null = null;

/**
 * Resolves which Facebook Page (and its connected Instagram Business
 * Account, if any) this app manages, plus that Page's own access token —
 * required for posting/moderating content even when META_ACCESS_TOKEN is a
 * System User token with the Page asset assigned in Business Manager.
 *
 * If META_PAGE_ID is set, that Page is used; otherwise the first Page
 * /me/accounts returns is used (fine for a single-Page business like this
 * one — set META_PAGE_ID explicitly if the token ever has access to more
 * than one Page).
 */
export async function resolveMetaAssets(): Promise<ResolvedMetaAssets> {
  if (cachedAssets) return cachedAssets;
  if (!process.env.META_ACCESS_TOKEN) {
    throw new MetaApiError("META_ACCESS_TOKEN is not set.", 401);
  }

  const body = await graphGet<{ data?: PageAccount[] }>("/me/accounts", {
    fields: "id,name,access_token,instagram_business_account",
  });
  const pages = body.data ?? [];
  if (pages.length === 0) {
    throw new MetaApiError(
      "The Meta token has no Pages assigned to it. In Business Manager, assign this app's System User (or your account) the Page as an asset with at least Content permission.",
      404
    );
  }

  const page = process.env.META_PAGE_ID
    ? pages.find((p) => p.id === process.env.META_PAGE_ID) ?? pages[0]!
    : pages[0]!;

  cachedAssets = {
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
    instagramAccountId: process.env.META_IG_BUSINESS_ACCOUNT_ID || page.instagram_business_account?.id || null,
  };
  return cachedAssets;
}
