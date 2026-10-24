import { z } from "zod";
import { problems, type PostInput, type SocialPost } from "@/lib/social/rules";
import { enqueue, signedUrl } from "@/lib/social/publish";

const Input = z.object({
  caption: z.string().max(63206),
  platforms: z.array(z.enum(["facebook", "instagram"])).max(2),
  kind: z.enum(["post", "reel", "story"]),
  // Only our own upload folder — this path is signed and handed to Meta.
  media: z.array(z.object({ path: z.string().regex(/^social\/[\w.-]+$/), type: z.enum(["image", "video"]) })).max(10),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
});

/** Parsed + rule-checked input, or a 400 Response. */
export function parseInput(body: unknown, opts?: { publishing?: boolean }): PostInput | Response {
  const r = Input.safeParse(body);
  if (!r.success) return Response.json({ error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ") }, { status: 400 });
  const issues = problems(r.data, opts);
  if (issues.length) return Response.json({ error: issues.join(" ") }, { status: 400 });
  return r.data;
}

/** Queue a scheduled post; returns a warning instead of failing the save (e.g. in local dev without QStash). */
export const schedule = (p: SocialPost) => (p.status === "scheduled" ? enqueue(p).then(() => undefined, (e: Error) => e.message) : Promise.resolve(undefined));

/** Adds short-lived preview URLs for the screen. */
export const withUrls = async (p: SocialPost): Promise<SocialPost> => ({
  ...p,
  media: await Promise.all(p.media.map(async (m) => ({ ...m, url: await signedUrl(m.path, 6 * 60 * 60 * 1000).catch(() => undefined) }))),
});
