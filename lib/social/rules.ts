/** Social calendar post — shared by the Social screen and the /api/social routes (no server imports here). */
export type Platform = "facebook" | "instagram";
export type PostKind = "post" | "reel" | "story";
export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";
export type Media = { path: string; type: "image" | "video"; url?: string };
export type PlatformResult = { id?: string; url?: string; error?: string };

export interface SocialPost {
  id: string;
  caption: string;
  platforms: Platform[];
  kind: PostKind;
  media: Media[];
  /** UTC ISO; null = draft with no date. */
  scheduledAt: string | null;
  status: PostStatus;
  results: Partial<Record<Platform, PlatformResult>>;
  /** Instagram container still processing (videos); the publish job polls it. */
  igContainer?: string;
  attempts?: number;
  createdAt: string;
  updatedAt: string;
}

export type PostInput = Pick<SocialPost, "caption" | "platforms" | "kind" | "media" | "scheduledAt">;

export const EDITABLE: PostStatus[] = ["draft", "scheduled", "failed"];

/** Meta's own limits, checked before saving so a scheduled post doesn't fail at 3am. Empty = fine. */
export function problems(p: PostInput, { publishing = false } = {}): string[] {
  const out: string[] = [];
  const ig = p.platforms.includes("instagram");
  const fb = p.platforms.includes("facebook");
  const videos = p.media.filter((m) => m.type === "video").length;
  if (!p.platforms.length) out.push("Pick Facebook, Instagram or both.");
  if (ig && !p.media.length) out.push("Instagram needs at least one photo or video.");
  else if (!p.caption.trim() && !p.media.length) out.push("Add a caption or some media.");
  if (ig && p.caption.length > 2200) out.push("Instagram captions max out at 2,200 characters.");
  if (p.media.length > 10) out.push("10 photos or videos at most.");
  if (p.kind === "story" && fb) out.push("Stories go to Instagram only.");
  if (p.kind !== "post" && p.media.length !== 1) out.push(`A ${p.kind} takes exactly one photo or video.`);
  if (p.kind === "reel" && videos !== 1) out.push("A reel needs a video.");
  if (fb && p.media.length > 1 && videos) out.push("Facebook multi-photo posts can't include videos.");
  if (!publishing && p.scheduledAt && Date.parse(p.scheduledAt) < Date.now() + 60_000) out.push("Pick a time at least a minute from now.");
  return out;
}

// ponytail: assert-based self-check; run with `npx tsx lib/social/rules.ts`.
if (typeof process !== "undefined" && process.argv[1]?.endsWith("rules.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const base: PostInput = { caption: "hi", platforms: ["facebook"], kind: "post", media: [], scheduledAt: null };
  const img = { path: "a", type: "image" as const }, vid = { path: "b", type: "video" as const };
  assert(problems(base).length === 0, "fb text post ok");
  assert(problems({ ...base, platforms: ["instagram"] }).length === 1, "ig needs media");
  assert(problems({ ...base, kind: "story", platforms: ["facebook", "instagram"], media: [img] }).length === 1, "story is ig-only");
  assert(problems({ ...base, kind: "reel", platforms: ["instagram"], media: [img] }).length === 1, "reel needs video");
  assert(problems({ ...base, media: [img, vid] }).length === 1, "fb mixed album rejected");
  assert(problems({ ...base, scheduledAt: new Date(Date.now() - 1000).toISOString() }).length === 1, "past time rejected");
  assert(problems({ ...base, scheduledAt: new Date(Date.now() - 1000).toISOString() }, { publishing: true }).length === 0, "publish now ignores time");
  console.log("rules ok");
}
