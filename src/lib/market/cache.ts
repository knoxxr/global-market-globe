import type { MarketSnapshot } from "./types";

const REDIS_SNAPSHOT_KEY = "global-market-globe:snapshot:v1";
const REDIS_LOCK_KEY = "global-market-globe:refresh-lock:v1";

export interface CachedEntry {
  snapshot: MarketSnapshot;
  storedAt: number;
}

interface GlobalCacheStore {
  l1Entry: CachedEntry | null;
  inflight: Promise<MarketSnapshot> | null;
  stats: {
    upstreamCallsTotal: number;
    cacheHitsTotal: number;
    coalescedRequestsTotal: number;
    lastUpstreamFetchAt: number | null;
    circuitBreakerUntil: number;
  };
}

declare global {
  var __GLOBAL_MARKET_CACHE__: GlobalCacheStore | undefined;
}

export function getCacheStore(): GlobalCacheStore {
  if (!globalThis.__GLOBAL_MARKET_CACHE__) {
    globalThis.__GLOBAL_MARKET_CACHE__ = {
      l1Entry: null,
      inflight: null,
      stats: {
        upstreamCallsTotal: 0,
        cacheHitsTotal: 0,
        coalescedRequestsTotal: 0,
        lastUpstreamFetchAt: null,
        circuitBreakerUntil: 0,
      },
    };
  }
  return globalThis.__GLOBAL_MARKET_CACHE__;
}

export function getCacheTtlMs(): number {
  const raw = Number(process.env.MARKET_CACHE_TTL_SECONDS ?? "20");
  const clamped = Number.isFinite(raw) ? Math.max(10, Math.min(300, raw)) : 20;
  return clamped * 1000;
}

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function redisCommand<T = unknown>(command: (string | number)[]): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: T };
    return data.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function readRedisSnapshot(): Promise<CachedEntry | null> {
  if (!isRedisConfigured()) return null;
  const raw = await redisCommand<string>(["GET", REDIS_SNAPSHOT_KEY]);
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as CachedEntry;
    if (parsed && parsed.snapshot && typeof parsed.storedAt === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeRedisSnapshot(entry: CachedEntry, ttlSeconds: number): Promise<void> {
  if (!isRedisConfigured()) return;
  // Store for 4x TTL so stale-while-revalidate always has a warm fallback
  const hardTtl = Math.max(60, ttlSeconds * 4);
  await redisCommand(["SET", REDIS_SNAPSHOT_KEY, JSON.stringify(entry), "EX", hardTtl]);
}

export async function acquireRedisRefreshLock(lockMs = 12000): Promise<boolean> {
  if (!isRedisConfigured()) return true;
  const result = await redisCommand<string | null>([
    "SET",
    REDIS_LOCK_KEY,
    String(Date.now()),
    "NX",
    "PX",
    lockMs,
  ]);
  return result === "OK";
}

export async function releaseRedisRefreshLock(): Promise<void> {
  if (!isRedisConfigured()) return;
  await redisCommand(["DEL", REDIS_LOCK_KEY]);
}
