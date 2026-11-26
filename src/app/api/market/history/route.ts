import dns from "node:dns";
import { NextResponse } from "next/server";
import { isAllowedHistorySymbol } from "@/lib/market/catalog";
import type { HistoryPoint, HistoryRange, HistoryResponse } from "@/lib/market/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // ignore
}

const RANGE_MAP: Record<HistoryRange, { range: string; interval: string; ttlMs: number }> = {
  "1D": { range: "1d", interval: "15m", ttlMs: 45_000 },
  "1W": { range: "5d", interval: "1h", ttlMs: 120_000 },
  "1M": { range: "1mo", interval: "1d", ttlMs: 300_000 },
  "3M": { range: "3mo", interval: "1d", ttlMs: 600_000 },
};

const YAHOO_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

declare global {
  var __HISTORY_CACHE__: Map<string, { data: HistoryResponse; expiresAt: number }> | undefined;
}

function getHistoryCache() {
  if (!globalThis.__HISTORY_CACHE__) {
    globalThis.__HISTORY_CACHE__ = new Map();
  }
  return globalThis.__HISTORY_CACHE__;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "").trim();
  const rawRange = (searchParams.get("range") ?? "1D").toUpperCase() as HistoryRange;

  if (!symbol || !isAllowedHistorySymbol(symbol)) {
    return NextResponse.json({ error: "Unsupported symbol" }, { status: 400 });
  }
  const spec = RANGE_MAP[rawRange] ?? RANGE_MAP["1D"];
  const range: HistoryRange = RANGE_MAP[rawRange] ? rawRange : "1D";

  const cache = getHistoryCache();
  const cacheKey = `${symbol}:${range}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        "Vercel-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        "X-History-Cache": "HIT",
      },
    });
  }

  for (const host of YAHOO_HOSTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?range=${spec.range}&interval=${spec.interval}`;
      const res = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      });
      if (!res.ok) continue;

      const json = (await res.json()) as {
        chart?: {
          result?: Array<{
            timestamp?: number[];
            meta?: { chartPreviousClose?: number; regularMarketPrice?: number };
            indicators?: { quote?: Array<{ close?: Array<number | null> }> };
          }>;
        };
      };

      const result = json?.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const points: HistoryPoint[] = [];

      for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
        const val = closes[i];
        if (typeof val === "number" && Number.isFinite(val) && val > 0) {
          points.push({ t: timestamps[i] * 1000, v: val });
        }
      }

      if (points.length < 2) continue;

      const first = points[0].v;
      const last = points[points.length - 1].v;
      const baseline = range === "1D" ? result?.meta?.chartPreviousClose ?? first : first;
      const changePercent =
        Math.round(((last - baseline) / Math.max(baseline, 1e-6)) * 10000) / 100;
      const high = Math.max(...points.map((p) => p.v));
      const low = Math.min(...points.map((p) => p.v));

      const payload: HistoryResponse = {
        symbol,
        range,
        points,
        changePercent,
        high,
        low,
        fetchedAt: Date.now(),
      };

      // Keep cache bounded to 160 entries
      if (cache.size > 160) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
      }
      cache.set(cacheKey, { data: payload, expiresAt: Date.now() + spec.ttlMs });

      return NextResponse.json(payload, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          "Vercel-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          "X-History-Cache": "MISS",
        },
      });
    } catch {
      // failover to next host
    } finally {
      clearTimeout(timer);
    }
  }

  return NextResponse.json(
    { error: "Unable to load historical chart data" },
    { status: 502, headers: { "Cache-Control": "no-store" } }
  );
}
