import { NextResponse } from "next/server";
import { getMarketSnapshot } from "@/lib/market/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getMarketSnapshot();
    return NextResponse.json(snapshot, {
      status: 200,
      headers: {
        // Vercel Edge CDN caches for 15s globally & serves stale for 45s while revalidating
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
        "CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
        "Vercel-CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
        "X-Market-Cache-Tier": snapshot.telemetry.cacheTier,
        "X-Market-Source": snapshot.telemetry.activeSource,
      },
    });
  } catch (error) {
    console.error("[/api/market/snapshot] error:", error);
    return NextResponse.json(
      { error: "Failed to load market snapshot" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
