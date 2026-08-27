/**
 * Meta Ads (Marketing API) — daily spend for the Overview KPI chart, plus
 * campaign-level insights for the Meta view's Campaigns tab.
 *
 * SETUP:
 * 1. Create a Meta App at developers.facebook.com, add the Marketing API product.
 * 2. Generate a long-lived System User access token with ads_read permission.
 * 3. Add to .env.local:
 *      META_AD_ACCOUNT_ID=1234567890   ("act_" prefix optional — added automatically if missing)
 *      META_ACCESS_TOKEN=EAAG...
 *
 * See lib/api/metaCore.ts for the shared Graph API plumbing, and
 * lib/api/metaContent.ts / lib/api/metaLeads.ts for the Page/Instagram
 * content and Lead Ads integrations that live alongside this one.
 */
import { graphGet, metaAdAccountId } from "./metaCore";
import type { MetaCampaign } from "@/lib/types";

export interface MetaAdsSummary {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
}

interface MetaInsightRaw {
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
}

function countLeadActions(actions: { action_type: string; value: string }[] = []): number {
  // "lead" shows up under several action_types depending on the ad's
  // conversion event (native lead form vs. pixel vs. offsite) — sum
  // anything lead-shaped.
  return Math.round(
    actions.filter((a) => a.action_type.includes("lead")).reduce((total, a) => total + Number(a.value), 0)
  );
}

export async function fetchMetaAdsSummary(days = 14): Promise<MetaAdsSummary[]> {
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
    return dummyMetaData(days);
  }

  const until = new Date();
  const since = new Date(until);
  since.setDate(since.getDate() - (days - 1));

  const body = await graphGet<{ data?: MetaInsightRaw[] }>(`/${metaAdAccountId()}/insights`, {
    fields: "spend,impressions,clicks,actions",
    time_range: JSON.stringify({
      since: since.toISOString().slice(0, 10),
      until: until.toISOString().slice(0, 10),
    }),
    time_increment: "1",
  });

  const byDate = new Map<string, MetaAdsSummary>();
  for (const row of body.data ?? []) {
    byDate.set(row.date_start, {
      date: row.date_start,
      spend: Math.round(Number(row.spend ?? 0) * 100) / 100,
      impressions: Math.round(Number(row.impressions ?? 0)),
      clicks: Math.round(Number(row.clicks ?? 0)),
      leads: countLeadActions(row.actions),
    });
  }

  // Fill in every day in the window, including $0 days, so the chart has no gaps.
  const out: MetaAdsSummary[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(byDate.get(key) ?? { date: key, spend: 0, impressions: 0, clicks: 0, leads: 0 });
  }
  return out;
}

function dummyMetaData(days: number): MetaAdsSummary[] {
  const out: MetaAdsSummary[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push({
      date: d.toISOString().slice(0, 10),
      spend: Math.round((20 + Math.random() * 30) * 100) / 100,
      impressions: Math.round(1500 + Math.random() * 2500),
      clicks: Math.round(20 + Math.random() * 60),
      leads: Math.round(Math.random() * 5),
    });
  }
  return out;
}

interface MetaCampaignRaw {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

interface MetaCampaignInsightRaw {
  campaign_id: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  ctr?: string;
  cpc?: string;
  actions?: { action_type: string; value: string }[];
}

/** Every campaign on the ad account (any status) with its rolled-up insights for the given date range. No dummy fallback — the Campaigns tab shows a clear "not configured" state instead, same as /kommo. */
export async function fetchMetaCampaigns(days = 30): Promise<MetaCampaign[]> {
  const until = new Date();
  const since = new Date(until);
  since.setDate(since.getDate() - (days - 1));
  const timeRange = JSON.stringify({
    since: since.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10),
  });

  const [campaignsBody, insightsBody] = await Promise.all([
    graphGet<{ data?: MetaCampaignRaw[] }>(`/${metaAdAccountId()}/campaigns`, {
      fields: "id,name,status,objective,daily_budget,lifetime_budget",
      limit: "200",
    }),
    graphGet<{ data?: MetaCampaignInsightRaw[] }>(`/${metaAdAccountId()}/insights`, {
      level: "campaign",
      fields: "campaign_id,spend,impressions,clicks,reach,ctr,cpc,actions",
      time_range: timeRange,
      limit: "200",
    }),
  ]);

  const insightsByCampaign = new Map((insightsBody.data ?? []).map((row) => [row.campaign_id, row]));

  return (campaignsBody.data ?? []).map((c) => {
    const insight = insightsByCampaign.get(c.id);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      dailyBudgetUsd: c.daily_budget ? Math.round(Number(c.daily_budget)) / 100 : null,
      lifetimeBudgetUsd: c.lifetime_budget ? Math.round(Number(c.lifetime_budget)) / 100 : null,
      spend: Math.round(Number(insight?.spend ?? 0) * 100) / 100,
      impressions: Math.round(Number(insight?.impressions ?? 0)),
      clicks: Math.round(Number(insight?.clicks ?? 0)),
      reach: Math.round(Number(insight?.reach ?? 0)),
      ctr: Math.round(Number(insight?.ctr ?? 0) * 100) / 100,
      cpc: Math.round(Number(insight?.cpc ?? 0) * 100) / 100,
      leads: countLeadActions(insight?.actions),
    };
  });
}
