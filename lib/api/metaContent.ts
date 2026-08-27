/**
 * Facebook Page + Instagram Business Account content — posts, their
 * engagement metrics, comment moderation, and publishing. Everything here
 * needs the Page access token lib/api/metaCore.ts's resolveMetaAssets()
 * resolves (not the raw META_ACCESS_TOKEN), since Page/IG content edges
 * require it even when the top-level token is a System User token with the
 * Page assigned as a Business Manager asset.
 *
 * SETUP (beyond what lib/api/meta.ts's ads setup already covers):
 * 1. Make sure the token's permissions include: pages_show_list,
 *    pages_read_engagement, pages_manage_posts, pages_manage_engagement,
 *    instagram_basic, instagram_manage_comments, instagram_manage_insights,
 *    instagram_content_publish.
 * 2. Optional — set META_PAGE_ID in .env.local if the token can see more
 *    than one Page (otherwise the first one found is used).
 * 3. Optional — set META_IG_BUSINESS_ACCOUNT_ID if the Instagram account
 *    isn't linked to the Page in Meta's system (normally it's auto-detected
 *    via the Page's instagram_business_account field).
 */
import { graphGet, graphPost, graphDelete, resolveMetaAssets, metaConfigured } from "./metaCore";
import type { MetaPost, MetaComment, MetaAudienceSnapshot } from "@/lib/types";

// ---------------------------------------------------------------------------
// Profile / audience
// ---------------------------------------------------------------------------

export async function fetchMetaAudienceSnapshot(): Promise<MetaAudienceSnapshot> {
  if (!metaConfigured()) return { facebookFans: null, instagramFollowers: null };

  const assets = await resolveMetaAssets();
  const [page, ig] = await Promise.all([
    graphGet<{ fan_count?: number; followers_count?: number }>(
      `/${assets.pageId}`,
      { fields: "fan_count,followers_count" },
      assets.pageAccessToken
    ),
    assets.instagramAccountId
      ? graphGet<{ followers_count?: number }>(
          `/${assets.instagramAccountId}`,
          { fields: "followers_count" },
          assets.pageAccessToken
        )
      : Promise.resolve(null),
  ]);

  return {
    facebookFans: page.followers_count ?? page.fan_count ?? null,
    instagramFollowers: ig?.followers_count ?? null,
  };
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

interface FbPostRaw {
  id: string;
  message?: string;
  permalink_url?: string;
  created_time: string;
  full_picture?: string;
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
}

interface FbInsightValue {
  name: string;
  values: { value?: number }[];
}

/**
 * Meta removed `post_impressions`/`post_impressions_unique`/`post_reach`
 * from the Graph API for regular Facebook Page posts (confirmed live
 * against this account — every one of those returns "(#100) The value
 * must be a valid insights metric", regardless of permissions). There is
 * currently no per-post reach/impressions number Facebook exposes for a
 * Page post at all — this always returns zeros, which the UI treats as
 * "not available" rather than "nobody saw it" (see MetaPost.reach's use in
 * app/meta/page.tsx's PostsTab/OverviewTab). `post_clicks` and
 * `post_video_views` are still valid if a future need comes up for those.
 */
async function fetchFacebookPostInsights(): Promise<{ impressions: number; reach: number }> {
  return { impressions: 0, reach: 0 };
}

interface IgMediaRaw {
  id: string;
  caption?: string;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string;
  media_type: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

async function fetchInstagramMediaInsights(
  mediaId: string,
  mediaType: string,
  pageAccessToken: string
): Promise<{ impressions: number; reach: number }> {
  try {
    // "impressions" isn't available for Reels — reach-only metric set for those.
    const metrics = mediaType === "VIDEO" || mediaType === "REELS" ? "reach" : "impressions,reach";
    const body = await graphGet<{ data?: FbInsightValue[] }>(
      `/${mediaId}/insights`,
      { metric: metrics },
      pageAccessToken
    );
    const byName = new Map((body.data ?? []).map((m) => [m.name, m.values?.[0]?.value ?? 0]));
    return { impressions: byName.get("impressions") ?? 0, reach: byName.get("reach") ?? 0 };
  } catch {
    return { impressions: 0, reach: 0 };
  }
}

function engagementRate(likes: number, comments: number, shares: number, reach: number): number {
  if (reach <= 0) return 0;
  return Math.round(((likes + comments + shares) / reach) * 1000) / 10; // one decimal place
}

export interface PostFetchOptions {
  limit?: number;
  /** ISO date ("YYYY-MM-DD") or datetime — filters by the post's own created_time/timestamp, inclusive. */
  since?: string;
  until?: string;
}

/** Facebook Page posts with per-post reach/impressions/engagement — powers the Meta view's Posts tab and Overview's period-filtered sections. */
export async function fetchFacebookPosts(opts: PostFetchOptions = {}): Promise<MetaPost[]> {
  const { limit = 12, since, until } = opts;
  const assets = await resolveMetaAssets();
  const body = await graphGet<{ data?: FbPostRaw[] }>(
    `/${assets.pageId}/posts`,
    {
      fields: "message,permalink_url,created_time,full_picture,likes.summary(true).limit(0),comments.summary(true).limit(0),shares",
      limit: String(limit),
      ...(since ? { since } : {}),
      ...(until ? { until } : {}),
    },
    assets.pageAccessToken
  );

  const posts = body.data ?? [];
  const withInsights = await Promise.all(
    posts.map(async (p) => {
      const { impressions, reach } = await fetchFacebookPostInsights();
      const likeCount = p.likes?.summary?.total_count ?? 0;
      const commentCount = p.comments?.summary?.total_count ?? 0;
      const shareCount = p.shares?.count ?? 0;
      const post: MetaPost = {
        id: p.id,
        platform: "facebook",
        message: p.message ?? "(no caption)",
        permalink: p.permalink_url ?? "",
        mediaUrl: p.full_picture,
        createdAt: p.created_time,
        likeCount,
        commentCount,
        shareCount,
        impressions,
        reach,
        engagementRate: engagementRate(likeCount, commentCount, shareCount, reach),
        reachAvailable: false,
      };
      return post;
    })
  );
  return withInsights;
}

/** Instagram posts/reels with per-post reach/impressions/engagement — powers the Meta view's Posts tab and Overview's period-filtered sections. */
export async function fetchInstagramPosts(opts: PostFetchOptions = {}): Promise<MetaPost[]> {
  const { limit = 12, since, until } = opts;
  const assets = await resolveMetaAssets();
  if (!assets.instagramAccountId) return [];

  const body = await graphGet<{ data?: IgMediaRaw[] }>(
    `/${assets.instagramAccountId}/media`,
    {
      fields: "caption,permalink,media_url,thumbnail_url,media_type,timestamp,like_count,comments_count",
      limit: String(limit),
      ...(since ? { since } : {}),
      ...(until ? { until } : {}),
    },
    assets.pageAccessToken
  );

  const media = body.data ?? [];
  const withInsights = await Promise.all(
    media.map(async (m) => {
      const { impressions, reach } = await fetchInstagramMediaInsights(m.id, m.media_type, assets.pageAccessToken);
      const likeCount = m.like_count ?? 0;
      const commentCount = m.comments_count ?? 0;
      const post: MetaPost = {
        id: m.id,
        platform: "instagram",
        message: m.caption ?? "(no caption)",
        permalink: m.permalink ?? "",
        // For VIDEO/REELS, media_url points at the raw video file, not
        // something an <img> can render — thumbnail_url is the actual
        // preview image for those. Photos/carousels have no thumbnail_url
        // at all, so media_url is correct there.
        mediaUrl: m.media_type === "VIDEO" || m.media_type === "REELS" ? m.thumbnail_url ?? m.media_url : m.media_url ?? m.thumbnail_url,
        createdAt: m.timestamp,
        likeCount,
        commentCount,
        shareCount: 0, // Instagram's API doesn't expose a share count
        impressions,
        reach,
        engagementRate: engagementRate(likeCount, commentCount, 0, reach),
        reachAvailable: true,
      };
      return post;
    })
  );
  return withInsights;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

interface FbCommentRaw {
  id: string;
  message: string;
  from?: { name?: string };
  created_time: string;
  like_count?: number;
  is_hidden?: boolean;
}

interface IgCommentRaw {
  id: string;
  text: string;
  username?: string;
  timestamp: string;
  like_count?: number;
  hidden?: boolean;
}

/** Comments on one post — pass the platform so the right edge/field names are used. */
export async function fetchPostComments(postId: string, platform: "facebook" | "instagram"): Promise<MetaComment[]> {
  const assets = await resolveMetaAssets();

  if (platform === "facebook") {
    const body = await graphGet<{ data?: FbCommentRaw[] }>(
      `/${postId}/comments`,
      { fields: "message,from,created_time,like_count,is_hidden", filter: "stream", limit: "50" },
      assets.pageAccessToken
    );
    return (body.data ?? []).map((c) => ({
      id: c.id,
      platform: "facebook" as const,
      postId,
      message: c.message,
      from: c.from?.name ?? "Unknown",
      createdAt: c.created_time,
      likeCount: c.like_count ?? 0,
      hidden: c.is_hidden ?? false,
    }));
  }

  const body = await graphGet<{ data?: IgCommentRaw[] }>(
    `/${postId}/comments`,
    { fields: "text,username,timestamp,like_count,hidden", limit: "50" },
    assets.pageAccessToken
  );
  return (body.data ?? []).map((c) => ({
    id: c.id,
    platform: "instagram" as const,
    postId,
    message: c.text,
    from: c.username ?? "Unknown",
    createdAt: c.timestamp,
    likeCount: c.like_count ?? 0,
    hidden: c.hidden ?? false,
  }));
}

/** Comments across the most recent N posts on both platforms — powers the Meta view's Comments tab without requiring a post to be picked first. */
export async function fetchRecentComments(postsPerPlatform = 8): Promise<MetaComment[]> {
  const assets = await resolveMetaAssets();
  const [fbPosts, igPosts] = await Promise.all([
    fetchFacebookPosts({ limit: postsPerPlatform }),
    assets.instagramAccountId ? fetchInstagramPosts({ limit: postsPerPlatform }) : Promise.resolve([]),
  ]);

  const commentLists = await Promise.all([
    ...fbPosts.map((p) => fetchPostComments(p.id, "facebook").catch(() => [] as MetaComment[])),
    ...igPosts.map((p) => fetchPostComments(p.id, "instagram").catch(() => [] as MetaComment[])),
  ]);

  const permalinkByPostId = new Map([...fbPosts, ...igPosts].map((p) => [p.id, p.permalink]));
  return commentLists
    .flat()
    .map((c) => ({ ...c, postPermalink: permalinkByPostId.get(c.postId) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function replyToComment(
  commentId: string,
  platform: "facebook" | "instagram",
  message: string
): Promise<{ id: string }> {
  const assets = await resolveMetaAssets();
  const edge = platform === "facebook" ? "comments" : "replies";
  return graphPost<{ id: string }>(`/${commentId}/${edge}`, { message }, assets.pageAccessToken);
}

export async function setCommentHidden(
  commentId: string,
  platform: "facebook" | "instagram",
  hidden: boolean
): Promise<void> {
  const assets = await resolveMetaAssets();
  const field = platform === "facebook" ? "is_hidden" : "hide";
  await graphPost(`/${commentId}`, { [field]: String(hidden) }, assets.pageAccessToken);
}

export async function deleteComment(commentId: string): Promise<void> {
  const assets = await resolveMetaAssets();
  await graphDelete(`/${commentId}`, {}, assets.pageAccessToken);
}

// ---------------------------------------------------------------------------
// Publishing — called by app/api/cron/meta-publish/route.ts when a
// ScheduledMetaPost's time arrives (or the "Publish now" button is used).
// ---------------------------------------------------------------------------

export async function publishFacebookPost(opts: {
  message: string;
  linkUrl?: string;
  mediaUrl?: string;
}): Promise<string> {
  const assets = await resolveMetaAssets();

  if (opts.mediaUrl) {
    const res = await graphPost<{ post_id?: string; id: string }>(
      `/${assets.pageId}/photos`,
      { url: opts.mediaUrl, caption: opts.message, published: "true" },
      assets.pageAccessToken
    );
    return res.post_id ?? res.id;
  }

  const res = await graphPost<{ id: string }>(
    `/${assets.pageId}/feed`,
    { message: opts.message, ...(opts.linkUrl ? { link: opts.linkUrl } : {}) },
    assets.pageAccessToken
  );
  return res.id;
}

export async function publishInstagramPost(opts: { caption: string; mediaUrl: string }): Promise<string> {
  const assets = await resolveMetaAssets();
  if (!assets.instagramAccountId) {
    throw new Error("No Instagram Business Account is linked to this Page — set META_IG_BUSINESS_ACCOUNT_ID.");
  }

  const container = await graphPost<{ id: string }>(
    `/${assets.instagramAccountId}/media`,
    { image_url: opts.mediaUrl, caption: opts.caption },
    assets.pageAccessToken
  );
  const published = await graphPost<{ id: string }>(
    `/${assets.instagramAccountId}/media_publish`,
    { creation_id: container.id },
    assets.pageAccessToken
  );
  return published.id;
}
