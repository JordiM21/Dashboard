"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import ErrorBoundary from "@/components/ErrorBoundary";
import KpiCard from "@/components/KpiCard";
import ViewToggle from "@/components/ViewToggle";
import Modal from "@/components/Modal";
import MetaCalendar from "@/components/MetaCalendar";
import ScheduleMetaPostModal from "@/components/ScheduleMetaPostModal";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import { authFetch } from "@/lib/firebase/authFetch";
import { formatDateDMY } from "@/lib/dateUtils";
import type { MetaCampaign, MetaPost, MetaComment, MetaLeadgenLead, ScheduledMetaPost, PlatformGrowth, PeriodComparison } from "@/lib/types";
import type { MetaAdsSummary } from "@/lib/api/meta";

type MetaTab = "overview" | "posts" | "comments" | "leads" | "calendar";

const TABS: { value: MetaTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "posts", label: "Posts" },
  { value: "comments", label: "Comments" },
  { value: "leads", label: "Leads" },
  { value: "calendar", label: "Calendar" },
];

const RANGE_OPTIONS = [7, 30, 90] as const;
type RangeOption = (typeof RANGE_OPTIONS)[number];

/** Generic { data, loading, error } fetch-on-mount-or-dep-change helper, reused by every tab in this page so each one loads independently and lazily (no point hammering every Meta endpoint before the tab is even opened). */
function useLazyFetch<T>(path: string | null, deps: unknown[]): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    setLoading(true);
    setError(null);
    authFetch(path)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? body.error ?? `Request failed with ${res.status}`);
        return body as T;
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

export default function MetaPage() {
  const [tab, setTab] = useState<MetaTab>("overview");

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Meta</div>
          <div className="page-subtitle">Ads, Page &amp; Instagram content, comments, leads, and a posting calendar — all in one place</div>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 20 }}>
        <ViewToggle value={tab} onChange={setTab} options={TABS} />
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "posts" && <PostsTab />}
      {tab === "comments" && <CommentsTab />}
      {tab === "leads" && <LeadsTab />}
      {tab === "calendar" && <CalendarTab />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Overview — growth dashboard
// ---------------------------------------------------------------------------

type PeriodKey = "this-month" | "last-month" | "last-3-months";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "last-3-months", label: "Last 3 Months" },
];

/** Rough day-count per period, only used to size the Ad Spend window (/api/kpis?days=N) to roughly match the selected period. */
function approxPeriodDays(key: PeriodKey): number {
  const today = new Date();
  if (key === "this-month") return today.getDate();
  if (key === "last-month") return new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  return 90;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

interface GrowthResponse {
  period: { start: string; end: string };
  facebook: PlatformGrowth;
  instagram: PlatformGrowth;
  bestPosts: { facebook: { post: MetaPost; score: number | null } | null; instagram: { post: MetaPost; score: number | null } | null };
}

function ComparisonKpi({ label, comparison, suffix = "" }: { label: string; comparison: PeriodComparison | undefined; suffix?: string }) {
  if (!comparison) return <KpiCard label={label} value="…" />;
  return (
    <KpiCard
      label={comparison.partial ? `${label} (partial)` : label}
      value={`${comparison.current.toLocaleString()}${suffix}`}
      delta={{ pct: pctChange(comparison.current, comparison.previous), label: "vs previous period" }}
    />
  );
}

function OverviewTab() {
  const [period, setPeriod] = useState<PeriodKey>("this-month");

  const growth = useLazyFetch<GrowthResponse>(`/api/meta/growth?period=${period}`, [period]);
  const ads = useLazyFetch<{ ads: MetaAdsSummary[]; sources: { ads: "live" | "demo" } }>(
    `/api/kpis?days=${approxPeriodDays(period)}`,
    [period]
  );

  const adSpend = useMemo(() => (ads.data?.ads ?? []).reduce((sum, a) => sum + a.spend, 0), [ads.data]);
  const adLeads = useMemo(() => (ads.data?.ads ?? []).reduce((sum, a) => sum + a.leads, 0), [ads.data]);

  const combinedInteractions = growth.data
    ? { current: growth.data.facebook.interactions.current + growth.data.instagram.interactions.current, previous: growth.data.facebook.interactions.previous + growth.data.instagram.interactions.previous, partial: false }
    : undefined;
  const combinedPosts = growth.data
    ? { current: growth.data.facebook.posts.current + growth.data.instagram.posts.current, previous: growth.data.facebook.posts.previous + growth.data.instagram.posts.previous, partial: false }
    : undefined;

  // Two angles on "Interactions by Platform": follower growth answers
  // "am I growing", interactions-per-post answers "is the content working"
  // — a raw interaction total would just reward posting more often, so
  // dividing by post count is the fairer content-optimization signal.
  const followerGrowthChart = useMemo(() => {
    if (!growth.data) return [];
    return [
      { platform: "Facebook", current: growth.data.facebook.followers.current, previous: growth.data.facebook.followers.previous },
      { platform: "Instagram", current: growth.data.instagram.followers.current, previous: growth.data.instagram.followers.previous },
    ];
  }, [growth.data]);

  const interactionsPerPostChart = useMemo(() => {
    if (!growth.data) return [];
    const perPost = (interactions: number, posts: number) => (posts > 0 ? Math.round((interactions / posts) * 10) / 10 : 0);
    return [
      {
        platform: "Facebook",
        current: perPost(growth.data.facebook.interactions.current, growth.data.facebook.posts.current),
        previous: perPost(growth.data.facebook.interactions.previous, growth.data.facebook.posts.previous),
      },
      {
        platform: "Instagram",
        current: perPost(growth.data.instagram.interactions.current, growth.data.instagram.posts.current),
        previous: perPost(growth.data.instagram.interactions.previous, growth.data.instagram.posts.previous),
      },
    ];
  }, [growth.data]);

  const anyFollowersPartial = Boolean(growth.data?.facebook.followers.partial || growth.data?.instagram.followers.partial);

  if (growth.error) return <FetchFailedState message={growth.error} />;

  return (
    <ErrorBoundary label="the Meta overview">
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 600 }}>Period</span>
        <ViewToggle value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
      </div>

      <div className="grid grid-kpis" style={{ marginBottom: 8 }}>
        <ComparisonKpi label="Facebook Followers" comparison={growth.data?.facebook.followers} />
        <ComparisonKpi label="Instagram Followers" comparison={growth.data?.instagram.followers} />
        <ComparisonKpi label="Posts Published" comparison={combinedPosts} />
        <ComparisonKpi label="Total Interactions" comparison={combinedInteractions} />
        <KpiCard label="Ad Spend" value={ads.loading ? "…" : `$${adSpend.toFixed(2)}`} demo={ads.data?.sources?.ads === "demo"} />
        <KpiCard label="Ad Leads" value={ads.loading ? "…" : String(adLeads)} demo={ads.data?.sources?.ads === "demo"} />
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 20px" }}>
        Every card compares the selected period against the immediately preceding period of the same length (e.g.
        "This Month" vs the same number of days last month). <strong>Followers</strong> is net new for the period,
        not a running total. A "(partial)" label means Instagram's follower history for part of that comparison is
        older than the 30 days Meta's API allows — it fills in automatically as{" "}
        <code>metaAudienceSnapshots</code> (captured daily) accumulates more history; Facebook doesn't have this
        limitation (its own history goes back ~90 days live).
      </p>

      {growth.data && (
        <>
          <h2 className="section-title">Interactions by Platform</h2>
          <div className="grid grid-cards" style={{ marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Follower Growth — the growth signal</div>
              <div className="card card-pad">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={followerGrowthChart}>
                    <CartesianGrid stroke="#e9ddce" vertical={false} />
                    <XAxis dataKey="platform" stroke="#7a6a5e" fontSize={12} />
                    <YAxis stroke="#7a6a5e" fontSize={12} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #e9ddce" }}
                      formatter={(value: number) => `${value >= 0 ? "+" : ""}${value} followers`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="previous" name="Previous period" fill="#c9bfae" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="current" name="This period" fill="#d98c5f" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Interactions per Post — the content signal</div>
              <div className="card card-pad">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={interactionsPerPostChart}>
                    <CartesianGrid stroke="#e9ddce" vertical={false} />
                    <XAxis dataKey="platform" stroke="#7a6a5e" fontSize={12} />
                    <YAxis stroke="#7a6a5e" fontSize={12} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e9ddce" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="previous" name="Previous period" fill="#c9bfae" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="current" name="This period" fill="#6fae7c" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 20px" }}>
            <strong>Follower Growth</strong> is net new followers for the period (can go negative — unfollows count).{" "}
            <strong>Interactions per Post</strong> divides total likes/comments/shares by how many posts went out,
            since a raw total just rewards posting more often — this is closer to "is the content itself working."
            {anyFollowersPartial && (
              <> One platform's follower bars are based on partial history — see the note above.</>
            )}
          </p>

          <h2 className="section-title">Best Post This Period</h2>
          <div className="grid grid-cards" style={{ marginBottom: 20 }}>
            <BestPostCard
              platform="facebook"
              best={growth.data.bestPosts.facebook}
              hint="Ranked by total likes + comments + shares."
            />
            <BestPostCard
              platform="instagram"
              best={growth.data.bestPosts.instagram}
              hint="Winning Score ranks reach, engagement rate, and likes together (0-100) — see the tooltip on the score."
            />
          </div>
        </>
      )}

      <h2 className="section-title">Ad Campaigns</h2>
      <CampaignsSection />
    </ErrorBoundary>
  );
}

function BestPostCard({
  platform,
  best,
  hint,
}: {
  platform: "facebook" | "instagram";
  best: { post: MetaPost; score: number | null } | null;
  hint: string;
}) {
  if (!best) {
    return (
      <div className="card card-pad">
        <span className={`badge ${platform === "facebook" ? "badge-info" : "badge-warning"}`}>{platform}</span>
        <EmptyState title="No posts in this period" />
      </div>
    );
  }

  const { post, score } = best;
  return (
    <div className="card card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className={`badge ${platform === "facebook" ? "badge-info" : "badge-warning"}`}>{platform}</span>
        {score !== null && (
          <span className="badge badge-active" title={hint}>
            Winning Score {score}
          </span>
        )}
      </div>
      {post.mediaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.mediaUrl}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: "100%", borderRadius: 10, margin: "10px 0", maxHeight: 160, objectFit: "cover" }}
        />
      )}
      <p style={{ fontSize: 13, margin: "0 0 8px", maxHeight: 54, overflow: "hidden", textOverflow: "ellipsis" }}>{post.message}</p>
      <div style={{ fontSize: 12, color: "var(--ink-soft)", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>👍 {post.likeCount}</span>
        <span>💬 {post.commentCount}</span>
        {platform === "facebook" && <span>↗ {post.shareCount}</span>}
        {platform === "instagram" && (
          <>
            <span>Reach {post.reach.toLocaleString()}</span>
            <span>Eng. {post.engagementRate}%</span>
          </>
        )}
      </div>
      {post.permalink && (
        <a href={post.permalink} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }}>
          View post ↗
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaigns (moved into Overview as a section — no longer a standalone tab)
// ---------------------------------------------------------------------------

type CampaignSort = "spend" | "ctr" | "name";

function CampaignsSection() {
  const [range, setRange] = useState<RangeOption>(30);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<CampaignSort>("spend");
  const [search, setSearch] = useState("");

  const { data, loading, error } = useLazyFetch<{ campaigns: MetaCampaign[] }>(`/api/meta/campaigns?days=${range}`, [range]);

  const statuses = useMemo(() => Array.from(new Set((data?.campaigns ?? []).map((c) => c.status))), [data]);

  const filtered = useMemo(() => {
    let list = (data?.campaigns ?? []).filter((c) => {
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
    list = [...list].sort((a, b) => {
      if (sort === "ctr") return b.ctr - a.ctr;
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.spend - a.spend;
    });
    return list;
  }, [data, statusFilter, search, sort]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, c) => ({
          spend: acc.spend + c.spend,
          impressions: acc.impressions + c.impressions,
          clicks: acc.clicks + c.clicks,
          leads: acc.leads + c.leads,
        }),
        { spend: 0, impressions: 0, clicks: 0, leads: 0 }
      ),
    [filtered]
  );

  if (error) return <FetchFailedState message={error} />;

  return (
    <ErrorBoundary label="the Ad Campaigns section">
      <div className="grid grid-kpis" style={{ marginBottom: 16 }}>
        <KpiCard label="Spend" value={`$${totals.spend.toFixed(2)}`} />
        <KpiCard label="Impressions" value={totals.impressions.toLocaleString()} />
        <KpiCard label="Clicks" value={totals.clicks.toLocaleString()} />
        <KpiCard label="Leads" value={String(totals.leads)} />
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search campaigns…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as CampaignSort)}>
          <option value="spend">Sort: Spend</option>
          <option value="ctr">Sort: CTR</option>
          <option value="name">Sort: Name</option>
        </select>
        <select value={range} onChange={(e) => setRange(Number(e.target.value) as RangeOption)}>
          {RANGE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              Last {r} days
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="state-box">Loading campaigns…</div>}
      {!loading && filtered.length === 0 && <EmptyState title="No campaigns match" hint="Try clearing filters, or check the date range." />}

      {filtered.length > 0 && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th>Objective</th>
                <th>Budget</th>
                <th>Spend</th>
                <th>Impressions</th>
                <th>Clicks</th>
                <th>CTR</th>
                <th>CPC</th>
                <th>Reach</th>
                <th>Leads</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <span className={`badge ${c.status === "ACTIVE" ? "badge-active" : "badge-inactive"}`}>{c.status}</span>
                  </td>
                  <td>{c.objective}</td>
                  <td>
                    {c.dailyBudgetUsd ? `$${c.dailyBudgetUsd}/day` : c.lifetimeBudgetUsd ? `$${c.lifetimeBudgetUsd} lifetime` : "—"}
                  </td>
                  <td>${c.spend.toFixed(2)}</td>
                  <td>{c.impressions.toLocaleString()}</td>
                  <td>{c.clicks.toLocaleString()}</td>
                  <td>{c.ctr}%</td>
                  <td>${c.cpc.toFixed(2)}</td>
                  <td>{c.reach.toLocaleString()}</td>
                  <td>{c.leads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

type PostSort = "newest" | "reach" | "engagement";

interface PostGroup {
  key: string;
  createdAt: string;
  message: string;
  mediaUrl?: string;
  facebook?: MetaPost;
  instagram?: MetaPost;
}

// Meta's "share to other platforms" toggle publishes to Facebook and
// Instagram within seconds of each other — an hour of slack comfortably
// covers that while still requiring an (almost) exact caption match, so two
// genuinely different posts published close together don't get merged.
const CROSS_POST_WINDOW_MS = 60 * 60 * 1000;

function normalizeCaption(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Merges a Facebook + Instagram post into one card when they're clearly the same cross-posted content (matching caption, published within an hour of each other) — everything else stays its own card. */
function groupCrossPosts(posts: MetaPost[]): PostGroup[] {
  const used = new Set<string>();
  const groups: PostGroup[] = [];

  for (const p of posts) {
    if (used.has(p.id)) continue;
    const normalized = normalizeCaption(p.message);
    const canMatch = normalized.length > 0 && normalized !== "(no caption)";

    const match = canMatch
      ? posts.find(
          (other) =>
            other.id !== p.id &&
            !used.has(other.id) &&
            other.platform !== p.platform &&
            normalizeCaption(other.message) === normalized &&
            Math.abs(new Date(other.createdAt).getTime() - new Date(p.createdAt).getTime()) <= CROSS_POST_WINDOW_MS
        )
      : undefined;

    used.add(p.id);
    if (match) used.add(match.id);

    const facebook = p.platform === "facebook" ? p : match?.platform === "facebook" ? match : undefined;
    const instagram = p.platform === "instagram" ? p : match?.platform === "instagram" ? match : undefined;

    groups.push({
      key: p.id,
      createdAt: p.createdAt,
      message: p.message,
      // Prefer Instagram's media — it correctly falls back to thumbnail_url
      // for video, whereas Facebook's full_picture is sometimes a generic
      // placeholder for a video post.
      mediaUrl: instagram?.mediaUrl ?? facebook?.mediaUrl,
      facebook,
      instagram,
    });
  }

  return groups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function PostsTab() {
  const [platform, setPlatform] = useState<"all" | "facebook" | "instagram">("all");
  const [sort, setSort] = useState<PostSort>("newest");
  const [expanded, setExpanded] = useState<PostGroup | null>(null);

  const { data, loading, error } = useLazyFetch<{ posts: MetaPost[] }>("/api/meta/posts?limit=20", []);

  const groups = useMemo(() => groupCrossPosts(data?.posts ?? []), [data]);

  const filtered = useMemo(() => {
    let list = groups.filter((g) => platform === "all" || g[platform]);
    list = [...list].sort((a, b) => {
      if (sort === "reach") return (b.instagram?.reach ?? 0) - (a.instagram?.reach ?? 0);
      if (sort === "engagement") return (b.instagram?.engagementRate ?? 0) - (a.instagram?.engagementRate ?? 0);
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  }, [groups, platform, sort]);

  if (error) return <FetchFailedState message={error} />;

  return (
    <ErrorBoundary label="the Posts tab">
      <div className="filter-bar">
        <select value={platform} onChange={(e) => setPlatform(e.target.value as any)}>
          <option value="all">All platforms</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as PostSort)}>
          <option value="newest">Sort: Newest</option>
          <option value="reach">Sort: Reach (Instagram)</option>
          <option value="engagement">Sort: Engagement (Instagram)</option>
        </select>
      </div>

      {loading && <div className="state-box">Loading posts…</div>}
      {!loading && filtered.length === 0 && <EmptyState title="No posts yet" hint="Published Facebook/Instagram posts will show up here." />}

      {filtered.length > 0 && (
        <div className="grid grid-cards">
          {filtered.map((g) => (
            <div key={g.key} className="card card-pad" style={{ cursor: "pointer" }} onClick={() => setExpanded(g)}>
              {g.mediaUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.mediaUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ width: "100%", borderRadius: 10, marginBottom: 10, maxHeight: 180, objectFit: "cover" }}
                />
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {g.facebook && <span className="badge badge-info">facebook</span>}
                  {g.instagram && <span className="badge badge-warning">instagram</span>}
                </div>
                <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{formatDateDMY(g.createdAt)}</span>
              </div>
              <p style={{ fontSize: 13, margin: "8px 0", maxHeight: 60, overflow: "hidden", textOverflow: "ellipsis" }}>
                {g.message}
              </p>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>
                  👍 {(g.facebook?.likeCount ?? 0) + (g.instagram?.likeCount ?? 0)}
                </span>
                <span>
                  💬 {(g.facebook?.commentCount ?? 0) + (g.instagram?.commentCount ?? 0)}
                </span>
                <span title={g.instagram ? undefined : "Only Instagram exposes per-post reach"}>
                  Reach {g.instagram ? g.instagram.reach.toLocaleString() : "—"}
                </span>
                {g.facebook && g.instagram && <span style={{ fontStyle: "italic" }}>cross-posted</span>}
              </div>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={(e) => { e.stopPropagation(); setExpanded(g); }}>
                View breakdown
              </button>
            </div>
          ))}
        </div>
      )}

      {expanded && <PostBreakdownModal group={expanded} onClose={() => setExpanded(null)} />}
    </ErrorBoundary>
  );
}

/** Per-platform metrics for one post (or cross-posted pair) — the detail view PostsTab opens on click. */
function PostBreakdownModal({ group, onClose }: { group: PostGroup; onClose: () => void }) {
  return (
    <Modal title="Post Breakdown" onClose={onClose}>
      <p style={{ marginTop: 0, fontSize: 13 }}>{group.message}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {group.facebook && (
          <div className="card card-pad">
            <span className="badge badge-info">facebook</span>
            <table className="data-table" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>Likes</td>
                  <td>{group.facebook.likeCount}</td>
                </tr>
                <tr>
                  <td>Comments</td>
                  <td>{group.facebook.commentCount}</td>
                </tr>
                <tr>
                  <td>Shares</td>
                  <td>{group.facebook.shareCount}</td>
                </tr>
                <tr>
                  <td>Reach</td>
                  <td title="Meta removed per-post reach from the Graph API for Facebook Page posts">not available</td>
                </tr>
              </tbody>
            </table>
            {group.facebook.permalink && (
              <a href={group.facebook.permalink} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>
                View on Facebook ↗
              </a>
            )}
          </div>
        )}
        {group.instagram && (
          <div className="card card-pad">
            <span className="badge badge-warning">instagram</span>
            <table className="data-table" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>Likes</td>
                  <td>{group.instagram.likeCount}</td>
                </tr>
                <tr>
                  <td>Comments</td>
                  <td>{group.instagram.commentCount}</td>
                </tr>
                <tr>
                  <td>Reach</td>
                  <td>{group.instagram.reach.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Engagement Rate</td>
                  <td>{group.instagram.engagementRate}%</td>
                </tr>
              </tbody>
            </table>
            {group.instagram.permalink && (
              <a href={group.instagram.permalink} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>
                View on Instagram ↗
              </a>
            )}
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

function CommentsTab() {
  const [platform, setPlatform] = useState<"all" | "facebook" | "instagram">("all");
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, loading, error, reload } = useLazyFetch<{ comments: MetaComment[] }>("/api/meta/comments", []);

  const filtered = useMemo(() => {
    return (data?.comments ?? []).filter((c) => {
      const matchesPlatform = platform === "all" || c.platform === platform;
      const matchesHidden = !hiddenOnly || c.hidden;
      const matchesSearch = !search || c.message.toLowerCase().includes(search.toLowerCase()) || c.from.toLowerCase().includes(search.toLowerCase());
      return matchesPlatform && matchesHidden && matchesSearch;
    });
  }, [data, platform, hiddenOnly, search]);

  async function act(commentId: string, platform: "facebook" | "instagram", action: string, message?: string) {
    setBusyId(commentId);
    try {
      const res = await authFetch("/api/meta/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, platform, action, ...(message ? { message } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.message ?? `Request failed with ${res.status}`);
        return;
      }
      setReplyingId(null);
      setReplyText("");
      reload();
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <FetchFailedState message={error} />;

  return (
    <ErrorBoundary label="the Comments tab">
      <div className="filter-bar">
        <input type="text" placeholder="Search comments or names…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={platform} onChange={(e) => setPlatform(e.target.value as any)}>
          <option value="all">All platforms</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={hiddenOnly} onChange={(e) => setHiddenOnly(e.target.checked)} />
          Hidden only
        </label>
        <button className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {loading && <div className="state-box">Loading comments…</div>}
      {!loading && filtered.length === 0 && <EmptyState title="No comments match" hint="Comments across your recent posts will show up here." />}

      {filtered.length > 0 && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>From</th>
                <th>Comment</th>
                <th>Platform</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <Fragment key={c.id}>
                  <tr>
                    <td>{c.from}</td>
                    <td style={{ maxWidth: 320 }}>{c.message}</td>
                    <td>
                      <span className={`badge ${c.platform === "facebook" ? "badge-info" : "badge-warning"}`}>{c.platform}</span>
                    </td>
                    <td>{formatDateDMY(c.createdAt)}</td>
                    <td>{c.hidden ? <span className="badge badge-inactive">Hidden</span> : <span className="badge badge-active">Visible</span>}</td>
                    <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === c.id}
                        onClick={() => setReplyingId(replyingId === c.id ? null : c.id)}
                      >
                        Reply
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === c.id}
                        onClick={() => act(c.id, c.platform, c.hidden ? "unhide" : "hide")}
                      >
                        {c.hidden ? "Unhide" : "Hide"}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={busyId === c.id}
                        onClick={() => {
                          if (confirm("Delete this comment permanently?")) act(c.id, c.platform, "delete");
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {replyingId === c.id && (
                    <tr>
                      <td colSpan={6}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            style={{ flex: 1 }}
                            placeholder="Write a reply…"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            autoFocus
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={busyId === c.id || !replyText.trim()}
                            onClick={() => act(c.id, c.platform, "reply", replyText.trim())}
                          >
                            Send
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

function LeadsTab() {
  const { data, loading, error } = useLazyFetch<{ leads: MetaLeadgenLead[] }>("/api/meta/leads", []);

  if (error) {
    return (
      <FetchFailedState
        message={`${error} — this usually means the "leads_retrieval" permission hasn't been approved for this app yet in Meta App Review.`}
      />
    );
  }

  return (
    <ErrorBoundary label="the Leads tab">
      {loading && <div className="state-box">Loading leads…</div>}
      {!loading && (data?.leads.length ?? 0) === 0 && (
        <EmptyState title="No Lead Ads submissions yet" hint="Native Lead Ads form submissions will show up here." />
      )}
      {(data?.leads.length ?? 0) > 0 && (
        <div className="grid grid-cards">
          {data!.leads.map((lead) => (
            <div key={lead.id} className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600 }}>{lead.formName}</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{formatDateDMY(lead.createdAt)}</div>
              </div>
              <div style={{ marginTop: 8 }}>
                {lead.fields.map((f) => (
                  <div key={f.name} style={{ fontSize: 13, marginTop: 2 }}>
                    <span style={{ color: "var(--ink-soft)" }}>{f.name}:</span> {f.value}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function CalendarTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<ScheduledMetaPost | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);

  const { data: posts } = useFirestoreCollection<ScheduledMetaPost>("scheduledMetaPosts", { orderByField: "scheduledFor" });

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  async function publishDuePosts() {
    setPublishingAll(true);
    try {
      const res = await authFetch("/api/cron/meta-publish", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body.message ?? `Request failed with ${res.status}`);
        return;
      }
      alert(`Published ${body.triggered} post${body.triggered === 1 ? "" : "s"}.`);
    } finally {
      setPublishingAll(false);
    }
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <ErrorBoundary label="the Meta calendar">
      <div className="meta-calendar-nav">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => shiftMonth(-1)}>
            ← Prev
          </button>
          <div className="meta-calendar-nav-title">{monthLabel}</div>
          <button className="btn btn-secondary btn-sm" onClick={() => shiftMonth(1)}>
            Next →
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={publishDuePosts} disabled={publishingAll}>
            {publishingAll ? "Publishing…" : "Publish due posts"}
          </button>
          <button className="btn btn-primary" onClick={() => setModalDate(new Date().toISOString().slice(0, 10))}>
            + New Post
          </button>
        </div>
      </div>

      <MetaCalendar
        year={year}
        month={month}
        posts={posts ?? []}
        onDayClick={(iso) => setModalDate(iso)}
        onPostClick={(post) => setEditingPost(post)}
      />

      <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 12, color: "var(--ink-soft)", flexWrap: "wrap" }}>
        <span>🔵 Facebook</span>
        <span>🟣 Instagram</span>
        <span>🔴 Failed</span>
        <span>Faded = already published</span>
      </div>

      {modalDate && (
        <ScheduleMetaPostModal defaultDateIso={modalDate} onClose={() => setModalDate(null)} onSaved={() => setModalDate(null)} />
      )}
      {editingPost && (
        <ScheduleMetaPostModal editing={editingPost} onClose={() => setEditingPost(null)} onSaved={() => setEditingPost(null)} />
      )}
    </ErrorBoundary>
  );
}
