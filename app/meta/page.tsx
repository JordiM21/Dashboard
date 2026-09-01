"use client";

import { useEffect, useMemo, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import KpiCard from "@/components/KpiCard";
import ViewToggle from "@/components/ViewToggle";
import { EmptyState, FetchFailedState } from "@/components/StateBox";
import { authFetch } from "@/lib/firebase/authFetch";
import { formatDateDMY } from "@/lib/dateUtils";
import type { MetaAdAccountInfo, MetaCampaign, MetaPost, PeriodComparison, PlatformGrowth } from "@/lib/types";

/**
 * Meta — one read-only performance view.
 *
 * There used to be five tabs here (overview, posts, comments, leads,
 * calendar) plus a publishing pipeline. Posting and moderation happen in
 * Meta's own tools; this page exists to answer "is the money and the
 * content working" without clicking through anything, so it's a single
 * scroll of numbers: audience, content, ads, and the campaigns behind them.
 */

type PeriodKey = "this-month" | "last-month" | "last-3-months";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
];

const PERIOD_LABEL: Record<PeriodKey, string> = {
  "this-month": "this month so far",
  "last-month": "last month",
  "last-3-months": "the last 3 months",
};

/** Rough day count for the selected period — sizes the ads window (/api/meta/campaigns?days=N) to roughly match it. */
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

/** { data, loading, error } fetch-on-mount-or-dep-change. */
function useLazyFetch<T>(path: string, deps: unknown[]): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch(path)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? body.error ?? `Request failed with ${res.status}`);
        return body as T;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  return { data, loading, error };
}

interface GrowthResponse {
  period: { start: string; end: string };
  facebook: PlatformGrowth;
  instagram: PlatformGrowth;
  bestPosts: {
    facebook: { post: MetaPost; score: number | null } | null;
    instagram: { post: MetaPost; score: number | null } | null;
  };
}

function addComparisons(a: PeriodComparison | undefined, b: PeriodComparison | undefined): PeriodComparison | undefined {
  if (!a || !b) return undefined;
  return { current: a.current + b.current, previous: a.previous + b.previous, partial: a.partial || b.partial };
}

function ComparisonKpi({ label, comparison, format }: { label: string; comparison: PeriodComparison | undefined; format?: (n: number) => string }) {
  if (!comparison) return <KpiCard label={label} value="…" />;
  const show = format ?? ((n: number) => n.toLocaleString());
  // Two zeros aren't a 0% change, they're an absence of data — a green
  // "▲ 0.0%" against nothing reads as a real (flat) result.
  const bothZero = comparison.current === 0 && comparison.previous === 0;
  return (
    <KpiCard
      label={comparison.partial ? `${label} (partial)` : label}
      value={show(comparison.current)}
      delta={bothZero ? undefined : { pct: pctChange(comparison.current, comparison.previous), label: "vs previous period" }}
    />
  );
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (current === 0 && previous === 0) return null;
  const pct = pctChange(current, previous);
  return (
    <span className={`inline-delta ${pct >= 0 ? "up" : "down"}`}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export default function MetaPage() {
  const [period, setPeriod] = useState<PeriodKey>("this-month");

  const growth = useLazyFetch<GrowthResponse>(`/api/meta/growth?period=${period}`, [period]);
  const campaigns = useLazyFetch<{ account: MetaAdAccountInfo; campaigns: MetaCampaign[] }>(
    `/api/meta/campaigns?days=${approxPeriodDays(period)}`,
    [period]
  );

  const ads = useMemo(() => {
    const list = campaigns.data?.campaigns ?? [];
    const totals = list.reduce(
      (acc, c) => ({
        spend: acc.spend + c.spend,
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        reach: acc.reach + c.reach,
        leads: acc.leads + c.leads,
      }),
      { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0 }
    );
    return {
      ...totals,
      costPerLead: totals.leads > 0 ? totals.spend / totals.leads : 0,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      active: list.filter((c) => c.status === "ACTIVE").length,
      list: [...list].sort((a, b) => b.spend - a.spend),
    };
  }, [campaigns.data]);

  const followers = addComparisons(growth.data?.facebook.followers, growth.data?.instagram.followers);
  const posts = addComparisons(growth.data?.facebook.posts, growth.data?.instagram.posts);
  const interactions = addComparisons(growth.data?.facebook.interactions, growth.data?.instagram.interactions);

  const platformRows = growth.data ? [growth.data.facebook, growth.data.instagram] : [];

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Meta</div>
          <div className="page-subtitle">Facebook &amp; Instagram performance — read-only</div>
        </div>
      </div>

      <div className="control-bar">
        <ViewToggle value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
      </div>

      {growth.error && <FetchFailedState message={growth.error} />}

      <ErrorBoundary label="the Meta performance view">
        <div className="grid grid-kpis grid-kpis-3">
          <ComparisonKpi label="Followers gained" comparison={followers} />
          <ComparisonKpi label="Posts published" comparison={posts} />
          <ComparisonKpi label="Interactions" comparison={interactions} />
          <KpiCard label="Ad spend" value={campaigns.loading ? "…" : `$${ads.spend.toFixed(2)}`} />
          <KpiCard label="Ad leads" value={campaigns.loading ? "…" : String(ads.leads)} />
          <KpiCard
            label="Cost per lead"
            value={campaigns.loading ? "…" : ads.leads > 0 ? `$${ads.costPerLead.toFixed(2)}` : "—"}
          />
        </div>
        <p className="metric-note">
          Everything covers {PERIOD_LABEL[period]}, compared against the equally long window before it. Followers is
          net new for the period, not a running total — a “(partial)” label means Instagram’s follower history only
          reaches back 30 days at Meta’s end and the daily snapshots haven’t filled the rest in yet.
        </p>

        {growth.loading && !growth.data && <div className="state-box">Loading performance…</div>}

        {growth.data && (
          <>
            <h2 className="section-title">By platform</h2>
            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Followers</th>
                    <th>Posts</th>
                    <th>Interactions</th>
                    <th>Per post</th>
                  </tr>
                </thead>
                <tbody>
                  {platformRows.map((p) => {
                    const perPost = p.posts.current > 0 ? p.interactions.current / p.posts.current : 0;
                    const perPostPrev = p.posts.previous > 0 ? p.interactions.previous / p.posts.previous : 0;
                    return (
                      <tr key={p.platform}>
                        <td>
                          <span className={`badge ${p.platform === "facebook" ? "badge-info" : "badge-warning"}`}>{p.platform}</span>
                        </td>
                        <td>
                          {p.followers.current >= 0 ? "+" : ""}
                          {p.followers.current.toLocaleString()} <Delta current={p.followers.current} previous={p.followers.previous} />
                        </td>
                        <td>{p.posts.current}</td>
                        <td>
                          {p.interactions.current.toLocaleString()} <Delta current={p.interactions.current} previous={p.interactions.previous} />
                        </td>
                        <td>
                          {perPost.toFixed(1)} <Delta current={perPost} previous={perPostPrev} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="metric-note">
              “Per post” is interactions ÷ posts published — a raw interaction total just rewards posting more often,
              so this is the closer read on whether the content itself is working.
            </p>

            <h2 className="section-title">Best post this period</h2>
            <div className="grid grid-cards">
              <BestPostCard platform="facebook" best={growth.data.bestPosts.facebook} />
              <BestPostCard platform="instagram" best={growth.data.bestPosts.instagram} />
            </div>
          </>
        )}

        <div className="section-head">
          <h2 className="section-title">Ad campaigns</h2>
          {campaigns.data && (
            <span className="section-meta">
              {campaigns.data.account.name} · {campaigns.data.account.id}
            </span>
          )}
        </div>
        {campaigns.error && <FetchFailedState message={campaigns.error} />}
        {campaigns.loading && !campaigns.data && <div className="state-box">Loading campaigns…</div>}
        {/* The campaign list is deliberately NOT filtered by the period — an
            active campaign that hasn't spent yet still has to be visible — so
            an empty list means the ad account genuinely has no campaigns on
            it, not that the window was too narrow. Saying "try a wider
            period" here would send you looking in the wrong place: the usual
            cause is that the ads are running on a different ad account (a
            boost placed from the Instagram app or a personal profile lands
            in a personal ad account, not the business one). */}
        {campaigns.data && ads.list.length === 0 && (
          <EmptyState
            title={`No campaigns on ${campaigns.data.account.name}`}
            hint={
              campaigns.data.account.amountSpentUsd === 0
                ? "This ad account has never run an ad. If you are running one, it lives on a different ad account — boosts placed from the Instagram app or a personal Facebook profile go to a personal ad account, not the business one. Point META_AD_ACCOUNT_ID at that account, or move the campaign into this one in Ads Manager."
                : "This ad account has spent before but has no campaigns on it now. Check that the campaign you are looking for wasn't created on a different ad account."
            }
          />
        )}
        {ads.list.length > 0 && (
          <>
            <div className="grid grid-kpis" style={{ marginBottom: 16 }}>
              <KpiCard label="Active campaigns" value={String(ads.active)} />
              <KpiCard label="Reach" value={ads.reach.toLocaleString()} />
              <KpiCard label="Clicks" value={ads.clicks.toLocaleString()} />
              <KpiCard label="CTR" value={`${ads.ctr.toFixed(2)}%`} />
            </div>
            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th>Spend</th>
                    <th>Leads</th>
                    <th>Cost/lead</th>
                    <th>CTR</th>
                    <th>Reach</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.list.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>
                        <span className={`badge ${c.status === "ACTIVE" ? "badge-active" : "badge-inactive"}`}>{c.status}</span>
                      </td>
                      <td>${c.spend.toFixed(2)}</td>
                      <td>{c.leads}</td>
                      <td>{c.leads > 0 ? `$${(c.spend / c.leads).toFixed(2)}` : "—"}</td>
                      <td>{c.ctr}%</td>
                      <td>{c.reach.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </ErrorBoundary>
    </main>
  );
}

function BestPostCard({ platform, best }: { platform: "facebook" | "instagram"; best: { post: MetaPost; score: number | null } | null }) {
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span className={`badge ${platform === "facebook" ? "badge-info" : "badge-warning"}`}>{platform}</span>
        <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{formatDateDMY(post.createdAt)}</span>
      </div>
      {post.mediaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.mediaUrl}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: "100%", borderRadius: 12, margin: "12px 0", maxHeight: 180, objectFit: "cover" }}
        />
      )}
      <p style={{ fontSize: 13, margin: "0 0 12px", maxHeight: 54, overflow: "hidden" }}>{post.message}</p>
      <div className="post-metrics">
        <div>
          <div className="post-metric-value">{post.likeCount}</div>
          <div className="post-metric-label">Likes</div>
        </div>
        <div>
          <div className="post-metric-value">{post.commentCount}</div>
          <div className="post-metric-label">Comments</div>
        </div>
        {platform === "facebook" ? (
          <div>
            <div className="post-metric-value">{post.shareCount}</div>
            <div className="post-metric-label">Shares</div>
          </div>
        ) : (
          <>
            <div>
              <div className="post-metric-value">{post.reach.toLocaleString()}</div>
              <div className="post-metric-label">Reach</div>
            </div>
            <div>
              <div className="post-metric-value">{post.engagementRate}%</div>
              <div className="post-metric-label">Engagement</div>
            </div>
          </>
        )}
        {score !== null && (
          <div>
            <div className="post-metric-value">{score}</div>
            <div className="post-metric-label">Score</div>
          </div>
        )}
      </div>
      {post.permalink && (
        <a href={post.permalink} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>
          View post ↗
        </a>
      )}
    </div>
  );
}
