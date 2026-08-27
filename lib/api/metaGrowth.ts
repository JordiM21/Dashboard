/**
 * Period-over-period growth math for the Meta view's Overview — follower
 * deltas, post counts, and interaction totals for "this month vs last
 * month" style comparisons.
 *
 * The one genuinely hard part is followers: Facebook's `page_follows`
 * insight is a live cumulative day-series that goes back ~90 days, but
 * Instagram's `follower_count` insight is hard-capped by the platform at a
 * trailing 30-day window — confirmed live, every request further back
 * fails with "(#100) metric only supports querying data for the last 30
 * days", regardless of permissions. There's no way to ask Meta for
 * Instagram follower history older than that.
 *
 * So: for whatever portion of a requested period falls inside each
 * platform's live window, this uses Meta's real data. For the rest (only
 * relevant for Instagram, once a period reaches more than 30 days back),
 * it falls back to lib/firebase/db.ts's `metaAudienceSnapshots` — daily
 * captures started by app/api/cron/meta-audience-snapshot. Since that
 * collection only starts recording from whenever it's first deployed, a
 * comparison reaching further back than the stored history is reported as
 * `partial: true` rather than silently wrong — see PeriodComparison in
 * lib/types.ts.
 */
import { graphGet, resolveMetaAssets } from "./metaCore";
import { fetchFacebookPosts, fetchInstagramPosts } from "./metaContent";
import { findMetaAudienceSnapshotOnOrBefore } from "@/lib/firebase/db";
import { addDays, localDateIso } from "@/lib/dateUtils";
import type { PeriodComparison, PlatformGrowth, MetaPost } from "@/lib/types";

export interface Period {
  start: string; // "YYYY-MM-DD", inclusive
  end: string; // "YYYY-MM-DD", inclusive
}

/** Calendar-month period definitions — "this month" reads as month-to-date, same convention as any business's month-to-date reporting. */
export function currentMonthPeriod(today = new Date()): Period {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start: localDateIso(start), end: localDateIso(today) };
}

export function previousMonthPeriod(today = new Date()): Period {
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  return { start: localDateIso(start), end: localDateIso(end) };
}

export function last3MonthsPeriod(today = new Date()): Period {
  const start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  return { start: localDateIso(start), end: localDateIso(today) };
}

/** The period immediately preceding `period`, same length — what "current" is compared against. */
export function precedingPeriod(period: Period): Period {
  const startEpoch = new Date(period.start).getTime();
  const endEpoch = new Date(period.end).getTime();
  const lengthDays = Math.round((endEpoch - startEpoch) / 86400000) + 1;
  return {
    start: addDays(period.start, -lengthDays),
    end: addDays(period.start, -1),
  };
}

interface FbDayValue {
  value: number;
  end_time: string;
}

async function fetchFacebookFollowerTotalSeries(pageId: string, pageAccessToken: string, since: string, until: string) {
  const body = await graphGet<{ data?: { values?: FbDayValue[] }[] }>(
    `/${pageId}/insights`,
    {
      metric: "page_follows",
      period: "day",
      since: String(Math.floor(new Date(since).getTime() / 1000)),
      until: String(Math.floor((new Date(until).getTime() + 86400000) / 1000)), // Graph API's `until` is exclusive-ish at the second; push a day so `until`'s own date is included
    },
    pageAccessToken
  );
  return (body.data?.[0]?.values ?? []).map((v) => ({ date: v.end_time.slice(0, 10), total: v.value }));
}

async function fetchInstagramFollowerDeltaSeries(igId: string, pageAccessToken: string, since: string, until: string) {
  const body = await graphGet<{ data?: { values?: FbDayValue[] }[] }>(
    `/${igId}/insights`,
    {
      metric: "follower_count",
      period: "day",
      since: String(Math.floor(new Date(since).getTime() / 1000)),
      until: String(Math.floor((new Date(until).getTime() + 86400000) / 1000)),
    },
    pageAccessToken
  );
  return (body.data?.[0]?.values ?? []).map((v) => ({ date: v.end_time.slice(0, 10), delta: v.value }));
}

async function facebookFollowerGrowth(period: Period): Promise<{ delta: number; partial: boolean }> {
  const assets = await resolveMetaAssets();
  const dayBefore = addDays(period.start, -1);
  // A few days of buffer before dayBefore: Meta's day-bucket `end_time` is
  // stamped at a fixed UTC hour (not local midnight), so the point that
  // actually represents "as of dayBefore" can carry a date label a day or
  // two off from `dayBefore` itself depending on timezone — look for the
  // closest available point on/before the boundary rather than requiring
  // an exact string match, which was undercounting real live data as
  // "partial" when it wasn't.
  const bufferedSince = addDays(dayBefore, -3);
  try {
    const series = await fetchFacebookFollowerTotalSeries(assets.pageId, assets.pageAccessToken, bufferedSince, period.end);
    if (series.length === 0) return { delta: 0, partial: true };
    const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
    const startPoint = [...sorted].reverse().find((s) => s.date <= dayBefore);
    const endPoint = [...sorted].reverse().find((s) => s.date <= period.end) ?? sorted[sorted.length - 1]!;
    if (!startPoint) return { delta: 0, partial: true }; // live history genuinely doesn't reach back this far
    return { delta: endPoint.total - startPoint.total, partial: false };
  } catch {
    return { delta: 0, partial: true };
  }
}

async function instagramFollowerGrowth(period: Period): Promise<{ delta: number; partial: boolean }> {
  const assets = await resolveMetaAssets();
  if (!assets.instagramAccountId) return { delta: 0, partial: true };

  const today = localDateIso();
  const liveFloor = addDays(today, -29); // Instagram's hard 30-day cap
  let delta = 0;
  let partial = false;

  const liveStart = period.start < liveFloor ? liveFloor : period.start;
  if (liveStart <= period.end) {
    try {
      const series = await fetchInstagramFollowerDeltaSeries(assets.instagramAccountId, assets.pageAccessToken, liveStart, period.end);
      delta += series.reduce((sum, v) => sum + v.delta, 0);
    } catch {
      partial = true;
    }
  }

  if (period.start < liveFloor) {
    // The rest of the period is older than Instagram's live window — only
    // our own stored snapshots (started once this feature shipped) can
    // cover it. Nothing stored yet for that range simply means "unknown",
    // not zero.
    const [atStart, atFloor] = await Promise.all([
      findMetaAudienceSnapshotOnOrBefore(addDays(period.start, -1)),
      findMetaAudienceSnapshotOnOrBefore(addDays(liveFloor, -1)),
    ]);
    if (atStart?.instagramFollowers != null && atFloor?.instagramFollowers != null) {
      delta += atFloor.instagramFollowers - atStart.instagramFollowers;
    } else {
      partial = true;
    }
  }

  return { delta, partial };
}

/** Follower growth (net new, not a running total) for one platform over `period`. */
export async function fetchFollowerGrowth(platform: "facebook" | "instagram", period: Period): Promise<{ delta: number; partial: boolean }> {
  return platform === "facebook" ? facebookFollowerGrowth(period) : instagramFollowerGrowth(period);
}

function toComparison(current: { delta: number; partial: boolean }, previous: { delta: number; partial: boolean }): PeriodComparison {
  return { current: current.delta, previous: previous.delta, partial: current.partial || previous.partial };
}

/** Posts published + raw interactions (likes+comments, +shares for Facebook) within `period`, for one platform. */
async function postsAndInteractions(platform: "facebook" | "instagram", period: Period) {
  const fetcher = platform === "facebook" ? fetchFacebookPosts : fetchInstagramPosts;
  const posts = await fetcher({ limit: 100, since: period.start, until: addDays(period.end, 1) });
  const interactions = posts.reduce((sum, p) => sum + p.likeCount + p.commentCount + p.shareCount, 0);
  return { count: posts.length, interactions };
}

/** Full growth summary for one platform: current period vs the preceding period of the same length. */
export async function fetchPlatformGrowth(platform: "facebook" | "instagram", period: Period): Promise<PlatformGrowth> {
  const previous = precedingPeriod(period);

  const [currentStats, previousStats, currentFollowers, previousFollowers] = await Promise.all([
    postsAndInteractions(platform, period),
    postsAndInteractions(platform, previous),
    fetchFollowerGrowth(platform, period),
    fetchFollowerGrowth(platform, previous),
  ]);

  return {
    platform,
    posts: { current: currentStats.count, previous: previousStats.count, partial: false },
    interactions: { current: currentStats.interactions, previous: previousStats.interactions, partial: false },
    followers: toComparison(currentFollowers, previousFollowers),
  };
}

// ---------------------------------------------------------------------------
// Best post of the period
// ---------------------------------------------------------------------------

export interface BestPost {
  post: MetaPost;
  /** 0-100. Instagram only — see rankScore()'s comment for why Facebook doesn't get one. */
  score: number | null;
}

/**
 * Rank-based score (a simple Borda count) across reach, engagement rate,
 * and likes: each post gets a rank 1..N on each metric, ranks are averaged,
 * and the average is inverted onto a 0-100 scale. This avoids having to
 * invent arbitrary weights to blend metrics on wildly different scales
 * (reach in the hundreds, engagement rate a small percentage, likes a raw
 * count) — a post only scores well here by doing well across all three at
 * once, not by having one huge number drown out the others.
 */
function rankScore(posts: MetaPost[]): Map<string, number> {
  const scores = new Map<string, number>();
  if (posts.length === 0) return scores;

  const metrics: (keyof Pick<MetaPost, "reach" | "engagementRate" | "likeCount">)[] = ["reach", "engagementRate", "likeCount"];
  const ranksById = new Map<string, number[]>();
  for (const p of posts) ranksById.set(p.id, []);

  for (const metric of metrics) {
    const sorted = [...posts].sort((a, b) => b[metric] - a[metric]);
    sorted.forEach((p, i) => ranksById.get(p.id)!.push(i + 1)); // 1 = best
  }

  for (const p of posts) {
    const ranks = ranksById.get(p.id)!;
    const avgRank = ranks.reduce((s, r) => s + r, 0) / ranks.length;
    // avgRank of 1 (best possible, every metric) -> 100; avgRank of N (worst) -> ~0.
    const score = Math.round(((posts.length - avgRank) / Math.max(1, posts.length - 1)) * 100);
    scores.set(p.id, score);
  }
  return scores;
}

/** The single best-performing post per platform within `period` — Instagram ranked by reach/engagement/likes (a 0-100 score), Facebook simply by total likes+comments+shares (no composite score, since it has no reach to weight by). */
export async function fetchBestPosts(period: Period): Promise<{ facebook: BestPost | null; instagram: BestPost | null }> {
  const [fbPosts, igPosts] = await Promise.all([
    fetchFacebookPosts({ limit: 100, since: period.start, until: addDays(period.end, 1) }),
    fetchInstagramPosts({ limit: 100, since: period.start, until: addDays(period.end, 1) }),
  ]);

  const bestFacebook = fbPosts.length
    ? fbPosts.reduce((best, p) =>
        p.likeCount + p.commentCount + p.shareCount > best.likeCount + best.commentCount + best.shareCount ? p : best
      )
    : null;

  let bestInstagram: BestPost | null = null;
  if (igPosts.length) {
    const scores = rankScore(igPosts);
    const top = [...igPosts].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))[0]!;
    bestInstagram = { post: top, score: scores.get(top.id) ?? null };
  }

  return {
    facebook: bestFacebook ? { post: bestFacebook, score: null } : null,
    instagram: bestInstagram,
  };
}
