import { NextRequest, NextResponse } from "next/server";
import { fetchStripeBalanceOverview } from "@/lib/api/stripe";
import { requireAuth } from "@/lib/firebase/verifyAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const overview = await fetchStripeBalanceOverview();
    return NextResponse.json(overview);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error fetching Stripe balance" },
      { status: 502 }
    );
  }
}
