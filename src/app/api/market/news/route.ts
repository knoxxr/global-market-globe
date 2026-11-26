import { NextResponse } from "next/server";
import { getGeoMappedNews } from "@/lib/market/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getGeoMappedNews();
    return NextResponse.json(
      { items, fetchedAt: Date.now() },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=180, stale-while-revalidate=600",
          "Vercel-CDN-Cache-Control": "public, s-maxage=180, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    return NextResponse.json({ items: [], fetchedAt: Date.now() }, { status: 200 });
  }
}
