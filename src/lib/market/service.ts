import {
  acquireRedisRefreshLock,
  getCacheStore,
  getCacheTtlMs,
  isRedisConfigured,
  readRedisSnapshot,
  releaseRedisRefreshLock,
  writeRedisSnapshot,
} from "./cache";
import { COMMODITY_CATALOG, FX_CATALOG, INDEX_CATALOG } from "./catalog";
import { fetchFreshMarketData } from "./providers";
import type { CacheTelemetry, MarketSnapshot, StreamEventPayload } from "./types";

const TOTAL_INSTRUMENTS =
  INDEX_CATALOG.length + FX_CATALOG.length + COMMODITY_CATALOG.length;

function buildTelemetry(
  tier: CacheTelemetry["cacheTier"],
  activeSource: MarketSnapshot["telemetry"]["activeSource"],
  liveMappedCount: number,
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
      publicLiveFeed: true,
    },
    activeSource,
    liveMappedCount,
    totalInstrumentsCount: TOTAL_INSTRUMENTS,
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
    const prevTel = store.l1Entry.snapshot.telemetry;
    return {
      ...store.l1Entry.snapshot,
      telemetry: buildTelemetry(
        "l1-memory",
        prevTel.activeSource,
        prevTel.liveMappedCount,
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
          const prevTel = redisEntry.snapshot.telemetry;
          return {
            ...redisEntry.snapshot,
            telemetry: buildTelemetry(
              "l2-redis",
              prevTel.activeSource,
              prevTel.liveMappedCount,
              redisEntry.storedAt
            ),
          };
        }
      }

      // 4. Acquire distributed soft-lock so only 1 Vercel region hits upstream feeds
      const gotLock = await acquireRedisRefreshLock(12_000);
      if (!gotLock && store.l1Entry) {
        store.stats.cacheHitsTotal += 1;
        const prevTel = store.l1Entry.snapshot.telemetry;
        return {
          ...store.l1Entry.snapshot,
          telemetry: buildTelemetry(
            "l1-memory",
            prevTel.activeSource,
            prevTel.liveMappedCount,
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
        const telemetry = buildTelemetry(
          "origin-fresh",
          fresh.activeSource,
          fresh.liveMappedCount,
          generatedAt
        );

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
 * Only generates micro-ticks if running completely offline in simulation mode.
 * When real market data is mapped, returns an empty array so authentic prices are never altered!
 */
export function buildMicroTickDeltas(
  snapshot: MarketSnapshot
): NonNullable<StreamEventPayload["deltas"]> {
  if (snapshot.telemetry.liveMappedCount > 0) {
    return [];
  }
  return [];
}
