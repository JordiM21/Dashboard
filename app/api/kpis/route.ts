import { NextRequest, NextResponse } from "next/server";
import { fetchStripeRevenue } from "@/lib/api/stripe";
import { fetchKommoLeads } from "@/lib/api/kommo";
import { fetchMetaAdsSummary } from "@/lib/api/meta";

// Without this, Next statically prerenders this route at build time — fine
// when it was random dummy data, but fetchStripeRevenue() now calls the
// real Stripe API, and a static build would freeze "today's" KPIs forever.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") ?? "14");

  try {
    const [revenue, leads, ads] = await Promise.all([
      fetchStripeRevenue(days),
      fetchKommoLeads(),
      fetchMetaAdsSummary(days),
    ]);
    // Lets the UI show a "Demo data" badge only on cards actually running on
    // fallback data, instead of hardcoding which channels are connected.
    const sources = {
      revenue: process.env.STRIPE_SECRET_KEY ? "live" : "demo",
      leads: process.env.KOMMO_SUBDOMAIN && process.env.KOMMO_ACCESS_TOKEN ? "live" : "demo",
      ads: process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID ? "live" : "demo",
    } as const;
    return NextResponse.json({ revenue, leads, ads, sources });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error fetching KPIs" },
      { status: 500 }
    );
  }
}
