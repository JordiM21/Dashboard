/**
 * Server side of the Social calendar: Firestore storage (hub_social_posts), QStash scheduling and the
 * actual Graph API publishing for Facebook (Page) and Instagram (Business account linked to the Page).
 * Media lives in Firebase Storage; Meta fetches it through short-lived signed URLs at publish time.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorage } from "@/lib/firebase/admin";
import { graphGet, graphPost, resolveMetaAssets, type ResolvedMetaAssets } from "@/lib/api/metaCore";
import { qstash } from "@/lib/connections/jobs";
import type { Platform, PlatformResult, SocialPost } from "./rules";

const col = () => getAdminDb().collection("hub_social_posts");

export async function getPost(id: string): Promise<SocialPost | null> {
  const s = await col().doc(id).get();
  return s.exists ? ({ ...s.data(), id } as SocialPost) : null;
}

export async function listPosts(): Promise<SocialPost[]> {
  // ponytail: reads every post; filter by month range once this reaches thousands.
  const s = await col().get();
  return s.docs.map((d) => ({ ...d.data(), id: d.id }) as SocialPost);
}

export const savePost = (p: SocialPost) => col().doc(p.id).set(p);
export const deletePost = (id: string) => col().doc(id).delete();

export const signedUrl = async (path: string, ms = 60 * 60 * 1000) =>
  (await getAdminStorage().bucket().file(path).getSignedUrl({ action: "read", expires: Date.now() + ms }))[0];

export const deleteMedia = (paths: string[]) =>
  Promise.all(paths.map((p) => getAdminStorage().bucket().file(p).delete({ ignoreNotFound: true }).catch(() => {})));

/** Only one caller wins the scheduled → publishing flip, so a duplicate QStash delivery can't double-post. */
export async function claim(id: string, from: SocialPost["status"][]): Promise<SocialPost | null> {
  const ref = col().doc(id);
  return getAdminDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const p = s.data() as SocialPost | undefined;
    if (!p || !from.includes(p.status)) return null;
    tx.update(ref, { status: "publishing", updatedAt: new Date().toISOString() });
    return { ...p, id };
  });
}

// QStash's free plan caps a delay at 7 days, so far-off posts hop: the job re-enqueues itself until due.
const MAX_DELAY = 6 * 86400;

/** Queue the publish job. `at` lets the job ignore stale messages after a reschedule. */
export async function enqueue(p: SocialPost, retryInSeconds?: number) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!host) throw new Error("VERCEL_PROJECT_PRODUCTION_URL is not set, so the post can't be queued from here. It will publish once saved from the live dashboard.");
  const secs = retryInSeconds ?? Math.max(0, Math.ceil((Date.parse(p.scheduledAt!) - Date.now()) / 1000));
  await qstash().publishJSON({
    url: `https://${host}/api/social/publish/${p.id}`,
    body: { at: p.scheduledAt, retry: retryInSeconds !== undefined },
    delay: Math.min(secs, MAX_DELAY),
  });
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Facebook objects expose permalink_url (videos give a relative path), Instagram media expose permalink. */
const permalink = (id: string, token: string, field: "permalink_url" | "permalink" = "permalink_url") =>
  graphGet<Record<string, string | undefined>>(`/${id}`, { fields: field }, token)
    .then((r) => { const u = r[field]; return u?.startsWith("/") ? `https://www.facebook.com${u}` : u; })
    .catch(() => undefined);

async function publishFacebook(p: SocialPost, urls: string[], a: ResolvedMetaAssets): Promise<PlatformResult> {
  const t = a.pageAccessToken;
  const page = `/${a.pageId}`;
  let id: string;
  if (!p.media.length) {
    id = (await graphPost<{ id: string }>(`${page}/feed`, { message: p.caption }, t)).id;
  } else if (p.media.length === 1 && p.media[0].type === "video") {
    id = (await graphPost<{ id: string }>(`${page}/videos`, { file_url: urls[0], description: p.caption }, t)).id;
  } else if (p.media.length === 1) {
    const r = await graphPost<{ id: string; post_id?: string }>(`${page}/photos`, { url: urls[0], caption: p.caption }, t);
    id = r.post_id ?? r.id;
  } else {
    const ids = await Promise.all(urls.map((url) => graphPost<{ id: string }>(`${page}/photos`, { url, published: "false" }, t).then((r) => r.id)));
    const attached_media = JSON.stringify(ids.map((media_fbid) => ({ media_fbid })));
    id = (await graphPost<{ id: string }>(`${page}/feed`, { message: p.caption, attached_media }, t)).id;
  }
  return { id, url: await permalink(id, t) };
}

type IgStatus = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED";
const igStatus = (id: string, t: string) => graphGet<{ status_code: IgStatus }>(`/${id}`, { fields: "status_code" }, t).then((r) => r.status_code);

/** Polls a container until Meta has fetched/transcoded the media, or the budget runs out (IN_PROGRESS). */
async function waitReady(id: string, t: string, budgetMs: number): Promise<IgStatus> {
  const end = Date.now() + budgetMs;
  for (;;) {
    const s = await igStatus(id, t);
    if (s !== "IN_PROGRESS" || Date.now() > end) return s;
    await new Promise((r) => setTimeout(r, 4000));
  }
}

async function igContainer(p: SocialPost, urls: string[], ig: string, t: string): Promise<string> {
  type Params = Record<string, string>;
  const media = (i: number): Params => (p.media[i].type === "video" ? { video_url: urls[i] } : { image_url: urls[i] });
  const caption: Params = p.kind === "story" ? {} : { caption: p.caption };
  if (p.media.length > 1) {
    const children: string[] = [];
    for (let i = 0; i < p.media.length; i++) {
      const c = (await graphPost<{ id: string }>(`/${ig}/media`, { ...media(i), ...(p.media[i].type === "video" ? { media_type: "VIDEO" } : {}), is_carousel_item: "true" }, t)).id;
      // ponytail: carousel video children wait inline; a long video can blow the 60s budget. Fine for photos.
      if (p.media[i].type === "video" && (await waitReady(c, t, 20_000)) !== "FINISHED") throw new Error("Instagram is still processing a carousel video. Try again in a minute.");
      children.push(c);
    }
    return (await graphPost<{ id: string }>(`/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), ...caption }, t)).id;
  }
  const type = p.kind === "story" ? "STORIES" : p.media[0].type === "video" ? "REELS" : undefined;
  return (await graphPost<{ id: string }>(`/${ig}/media`, { ...media(0), ...(type ? { media_type: type } : {}), ...caption }, t)).id;
}

const MAX_ATTEMPTS = 20; // × 30s ≈ 10 min for Instagram to finish a video

/** Publishes to every platform that hasn't succeeded yet. Expects the post already claimed (status publishing). */
export async function publishPost(p: SocialPost): Promise<SocialPost> {
  // Signed-in local dev uses the real Meta token, so it only posts for real when SOCIAL_LIVE=1 opts in.
  if (process.env.NODE_ENV !== "production" && process.env.SOCIAL_LIVE !== "1") {
    const results = Object.fromEntries(p.platforms.map((pl) => [pl, { id: "dry-run" }]));
    const next: SocialPost = { ...p, scheduledAt: p.scheduledAt ?? new Date().toISOString(), results, status: "published", updatedAt: new Date().toISOString() };
    await savePost(next);
    return next;
  }
  const a = await resolveMetaAssets();
  const t = a.pageAccessToken;
  const urls = await Promise.all(p.media.map((m) => signedUrl(m.path)));
  const results = { ...p.results };
  let container = p.igContainer;
  let pending = false;

  for (const platform of p.platforms as Platform[]) {
    if (results[platform]?.id) continue; // already out (a retry after a partial failure)
    try {
      if (platform === "facebook") {
        results.facebook = await publishFacebook(p, urls, a);
        continue;
      }
      const ig = a.instagramAccountId;
      if (!ig) throw new Error("No Instagram business account is linked to the Facebook Page.");
      container ??= await igContainer(p, urls, ig, t);
      const s = await waitReady(container, t, 35_000);
      if (s === "IN_PROGRESS" && (p.attempts ?? 0) < MAX_ATTEMPTS) {
        pending = true;
        continue;
      }
      if (s !== "FINISHED") throw new Error(s === "IN_PROGRESS" ? "Instagram took too long to process the video." : `Instagram couldn't process the media (${s}).`);
      const id = (await graphPost<{ id: string }>(`/${ig}/media_publish`, { creation_id: container }, t)).id;
      results.instagram = { id, url: await permalink(id, t, "permalink") };
      container = undefined;
    } catch (e) {
      results[platform] = { error: message(e) };
      if (platform === "instagram") container = undefined;
    }
  }

  const next: SocialPost = {
    ...p,
    scheduledAt: p.scheduledAt ?? new Date().toISOString(), // "publish now" lands on the calendar at today
    results,
    status: pending ? "publishing" : Object.values(results).some((r) => r?.error) ? "failed" : "published",
    attempts: pending ? (p.attempts ?? 0) + 1 : 0,
    updatedAt: new Date().toISOString(),
  };
  if (container && pending) next.igContainer = container;
  else delete next.igContainer;
  await col().doc(p.id).set({ ...next, igContainer: next.igContainer ?? FieldValue.delete() }, { merge: true });

  if (pending) {
    await enqueue(next, 30).catch(async (e) => {
      const failed = { ...next, status: "failed" as const, results: { ...results, instagram: { error: `Instagram is still processing the video and no retry could be queued: ${message(e)}` } } };
      await savePost(failed);
      Object.assign(next, failed);
    });
  }
  return next;
}
