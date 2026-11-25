import { NextResponse } from "next/server";
import { getMarketSnapshot } from "@/lib/market/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional Vercel Cron pre-warmer (/api/cron/refresh).
 * Keeps L2 Upstash Redis warm in the background so user requests never wait on upstream APIs.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const snapshot = await getMarketSnapshot({ forceRefresh: true });
    return NextResponse.json(
      {
        ok: true,
        version: snapshot.version,
        generatedAt: snapshot.generatedAt,
        source: snapshot.telemetry.activeSource,
        redisConfigured: snapshot.telemetry.redisConfigured,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[/api/cron/refresh] error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
