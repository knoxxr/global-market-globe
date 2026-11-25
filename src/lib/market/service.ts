import {
  acquireRedisRefreshLock,
  getCacheStore,
  getCacheTtlMs,
  isRedisConfigured,
  readRedisSnapshot,
  releaseRedisRefreshLock,
  writeRedisSnapshot,
} from "./cache";
import { fetchFreshMarketData } from "./providers";
import type { CacheTelemetry, MarketSnapshot, StreamEventPayload } from "./types";

function buildTelemetry(
  tier: CacheTelemetry["cacheTier"],
  activeSource: MarketSnapshot["telemetry"]["activeSource"],
  storedAt: number
): CacheTelemetry {
  const store = getCacheStore();
  const ttlSeconds = Math.round(getCacheTtlMs() / 1000);
  return {
    cacheTier: tier,
    redisConfigured: isRedisConfigured(),
    providersConfigured: {
      polygon: Boolean(process.env.POLYGON_API_KEY?.trim()),
      finnhub: Boolean(process.env.FINNHUB_API_KEY?.trim()),
    },
    activeSource,
    ttlSeconds,
    ageSeconds: Math.max(0, Math.round((Date.now() - storedAt) / 1000)),
    upstreamCallsTotal: store.stats.upstreamCallsTotal,
    cacheHitsTotal: store.stats.cacheHitsTotal,
    coalescedRequestsTotal: store.stats.coalescedRequestsTotal,
    circuitBreakerOpen: Date.now() < store.stats.circuitBreakerUntil,
    lastUpstreamFetchAt: store.stats.lastUpstreamFetchAt,
  };
}

/**
 * Multi-User Safe Market Snapshot Orchestrator:
 * 1. L1 Memory Cache (instant, 0ms, 0 external calls)
 * 2. L2 Upstash Redis Cache (shared across all Vercel serverless instances & regions)
 * 3. Singleflight Coalescing (concurrent misses collapse into 1 Promise)
 * 4. Distributed Soft-Lock (prevents cross-region thundering herd)
 */
export async function getMarketSnapshot(options?: {
  forceRefresh?: boolean;
}): Promise<MarketSnapshot> {
  const store = getCacheStore();
  const ttlMs = getCacheTtlMs();
  const now = Date.now();
  const forceRefresh = Boolean(options?.forceRefresh);

  // 1. Check L1 In-Memory Cache
  if (!forceRefresh && store.l1Entry && now - store.l1Entry.storedAt < ttlMs) {
    store.stats.cacheHitsTotal += 1;
    return {
      ...store.l1Entry.snapshot,
      telemetry: buildTelemetry(
        "l1-memory",
        store.l1Entry.snapshot.telemetry.activeSource,
        store.l1Entry.storedAt
      ),
    };
  }

  // 2. Singleflight: if a refresh is already running on this instance, join it
  if (store.inflight) {
    store.stats.coalescedRequestsTotal += 1;
    return store.inflight;
  }

  const refreshPromise = (async (): Promise<MarketSnapshot> => {
    try {
      // 3. Check L2 Shared Upstash Redis Cache before hitting upstream APIs
      if (!forceRefresh) {
        const redisEntry = await readRedisSnapshot();
        if (redisEntry && now - redisEntry.storedAt < ttlMs) {
          store.l1Entry = redisEntry;
          store.stats.cacheHitsTotal += 1;
          return {
            ...redisEntry.snapshot,
            telemetry: buildTelemetry(
              "l2-redis",
              redisEntry.snapshot.telemetry.activeSource,
              redisEntry.storedAt
            ),
          };
        }
      }

      // 4. Acquire distributed soft-lock so only 1 Vercel region hits Polygon/Finnhub
      const gotLock = await acquireRedisRefreshLock(12_000);
      if (!gotLock && store.l1Entry) {
        // Serve stale immediately while another instance refreshes (SWR)
        store.stats.cacheHitsTotal += 1;
        return {
          ...store.l1Entry.snapshot,
          telemetry: buildTelemetry(
            "l1-memory",
            store.l1Entry.snapshot.telemetry.activeSource,
            store.l1Entry.storedAt
          ),
        };
      }

      try {
        const previous = store.l1Entry?.snapshot ?? null;
        const fresh = await fetchFreshMarketData(previous);
        const generatedAt = Date.now();

        if (fresh.upstreamCallsMade > 0) {
          store.stats.upstreamCallsTotal += fresh.upstreamCallsMade;
          store.stats.lastUpstreamFetchAt = generatedAt;
        }

        const version = (previous?.version ?? 0) + 1;
        const telemetry = buildTelemetry("origin-fresh", fresh.activeSource, generatedAt);

        const snapshot: MarketSnapshot = {
          version,
          generatedAt,
          indices: fresh.indices,
          fx: fresh.fx,
          commodities: fresh.commodities,
          telemetry,
        };

        const entry = { snapshot, storedAt: generatedAt };
        store.l1Entry = entry;
        await writeRedisSnapshot(entry, Math.round(ttlMs / 1000));

        return snapshot;
      } finally {
        if (gotLock) {
          await releaseRedisRefreshLock();
        }
      }
    } finally {
      store.inflight = null;
    }
  })();

  store.inflight = refreshPromise;
  return refreshPromise;
}

/**
 * Generates subtle micro-tick deltas between upstream cache refreshes
 * for smooth live UI streaming without consuming ANY external API quota.
 */
export function buildMicroTickDeltas(
  snapshot: MarketSnapshot
): NonNullable<StreamEventPayload["deltas"]> {
  const now = Date.now();
  const deltas: NonNullable<StreamEventPayload["deltas"]> = [];

  const sampleList = [
    ...snapshot.indices.filter((i) => i.isOpen || i.source === "simulation"),
    ...snapshot.fx,
    ...snapshot.commodities,
  ];

  // Pick 5–7 instruments per tick cycle for lively, realistic order-book cadence
  for (let i = 0; i < sampleList.length; i++) {
    if ((i + Math.floor(now / 2000)) % 4 !== 0) continue;
    const item = sampleList[i];
    const factor = Math.pow(10, item.decimals);
    const jitter = (Math.random() - 0.5) * 0.00075;
    const nextPrice = Math.round(item.price * (1 + jitter) * factor) / factor;
    const nextChange = Math.round((nextPrice - item.prevClose) * factor) / factor;
    const nextPct =
      Math.round((nextChange / Math.max(item.prevClose, 1e-6)) * 10000) / 100;

    deltas.push({
      id: item.id,
      category: item.category,
      price: nextPrice,
      change: nextChange,
      changePercent: nextPct,
      updatedAt: now,
    });
  }

  return deltas;
}
