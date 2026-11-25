import {
  COMMODITY_CATALOG,
  FX_CATALOG,
  INDEX_CATALOG,
  isExchangeOpenUtc,
  isFxMarketOpenUtc,
} from "./catalog";
import { getCacheStore } from "./cache";
import type {
  CommodityAsset,
  DataSourceKind,
  EquityIndexAsset,
  FxPairAsset,
  MarketSnapshot,
} from "./types";

interface QuotePatch {
  price: number;
  prevClose?: number;
  changePercent?: number;
  dayHigh?: number;
  dayLow?: number;
  source: DataSourceKind;
}

interface ProviderFetchResult {
  patches: Map<string, QuotePatch>;
  source: DataSourceKind;
  upstreamRequestsMade: number;
}

function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function deterministicSeed(str: string, bucket: number): number {
  let hash = 2166136261 ^ bucket;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function generateInitialSparkline(
  baseline: number,
  currentPrice: number,
  volatility: number,
  id: string,
  decimals: number
): number[] {
  const points = 24;
  const series: number[] = [];
  const start = baseline;
  const bucket = Math.floor(Date.now() / 3_600_000);
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const wave =
      Math.sin(t * Math.PI * 2.5 + deterministicSeed(id, bucket) * 6.28) *
      volatility *
      0.38;
    const micro = (deterministicSeed(`${id}-${i}`, bucket) - 0.5) * volatility * 0.25;
    const interp = start + (currentPrice - start) * t;
    const val = i === points - 1 ? currentPrice : interp * (1 + wave * (1 - t * 0.6) + micro);
    series.push(roundTo(Math.max(val, baseline * 0.5), decimals));
  }
  return series;
}

function updateSparkline(prev: number[], nextPrice: number, decimals: number): number[] {
  const rounded = roundTo(nextPrice, decimals);
  if (!prev || prev.length < 4) return [rounded];
  const last = prev[prev.length - 1];
  if (Math.abs(last - rounded) / Math.max(last, 1e-6) < 1e-6) {
    return prev;
  }
  return [...prev.slice(-23), rounded];
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 4500): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.status === 429) {
      // Trip circuit breaker for 60 seconds to respect rate limits
      const store = getCacheStore();
      store.stats.circuitBreakerUntil = Date.now() + 60_000;
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Polygon.io Batched Adapter
 * Uses snapshot endpoints so 31 instruments take at most 2 HTTP calls total!
 */
async function fetchFromPolygon(apiKey: string): Promise<ProviderFetchResult> {
  const patches = new Map<string, QuotePatch>();
  let upstreamRequestsMade = 0;

  // 1) Batched Forex Snapshot (1 single HTTP request for all FX pairs)
  const fxTickers = FX_CATALOG.map((f) => f.polygonTicker).join(",");
  const fxUrl = `https://api.polygon.io/v2/snapshot/locale/global/markets/forex/tickers?tickers=${encodeURIComponent(
    fxTickers
  )}&apiKey=${encodeURIComponent(apiKey)}`;

  upstreamRequestsMade += 1;
  const fxRes = await fetchJsonWithTimeout<{
    tickers?: Array<{
      ticker: string;
      todaysChangePerc?: number;
      lastQuote?: { a?: number; b?: number };
      day?: { c?: number; h?: number; l?: number; o?: number };
      prevDay?: { c?: number };
    }>;
  }>(fxUrl);

  if (fxRes?.tickers) {
    const byTicker = new Map(fxRes.tickers.map((t) => [t.ticker, t]));
    for (const item of FX_CATALOG) {
      const t = byTicker.get(item.polygonTicker);
      if (!t) continue;
      const mid =
        t.lastQuote?.a && t.lastQuote?.b
          ? (t.lastQuote.a + t.lastQuote.b) / 2
          : t.day?.c ?? t.prevDay?.c;
      if (mid && mid > 0) {
        patches.set(item.id, {
          price: mid,
          prevClose: t.prevDay?.c,
          changePercent: t.todaysChangePerc,
          dayHigh: t.day?.h,
          dayLow: t.day?.l,
          source: "polygon",
        });
      }
    }
  }

  // 2) Batched US ETF Proxy Snapshot for Global Indices & Commodities (1 single HTTP request!)
  const stockTickers = [
    ...INDEX_CATALOG.map((i) => i.polygonProxyTicker),
    ...COMMODITY_CATALOG.map((c) => c.polygonProxyTicker),
  ].join(",");

  const stocksUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${encodeURIComponent(
    stockTickers
  )}&apiKey=${encodeURIComponent(apiKey)}`;

  upstreamRequestsMade += 1;
  const stockRes = await fetchJsonWithTimeout<{
    tickers?: Array<{
      ticker: string;
      todaysChangePerc?: number;
      lastTrade?: { p?: number };
      day?: { c?: number; h?: number; l?: number };
      prevDay?: { c?: number };
    }>;
  }>(stocksUrl);

  if (stockRes?.tickers) {
    const byTicker = new Map(stockRes.tickers.map((t) => [t.ticker, t]));
    for (const idx of INDEX_CATALOG) {
      const t = byTicker.get(idx.polygonProxyTicker);
      if (!t) continue;
      const rawPrice = t.lastTrade?.p ?? t.day?.c ?? t.prevDay?.c;
      if (rawPrice && rawPrice > 0) {
        patches.set(idx.id, {
          price: rawPrice * idx.proxyMultiplier,
          prevClose: t.prevDay?.c ? t.prevDay.c * idx.proxyMultiplier : undefined,
          changePercent: t.todaysChangePerc,
          dayHigh: t.day?.h ? t.day.h * idx.proxyMultiplier : undefined,
          dayLow: t.day?.l ? t.day.l * idx.proxyMultiplier : undefined,
          source: "polygon",
        });
      }
    }
    for (const cmd of COMMODITY_CATALOG) {
      const t = byTicker.get(cmd.polygonProxyTicker);
      if (!t) continue;
      const rawPrice = t.lastTrade?.p ?? t.day?.c ?? t.prevDay?.c;
      if (rawPrice && rawPrice > 0) {
        patches.set(cmd.id, {
          price: rawPrice * cmd.proxyMultiplier,
          prevClose: t.prevDay?.c ? t.prevDay.c * cmd.proxyMultiplier : undefined,
          changePercent: t.todaysChangePerc,
          dayHigh: t.day?.h ? t.day.h * cmd.proxyMultiplier : undefined,
          dayLow: t.day?.l ? t.day.l * cmd.proxyMultiplier : undefined,
          source: "polygon",
        });
      }
    }
  }

  return {
    patches,
    source: patches.size > 0 ? "polygon" : "simulation",
    upstreamRequestsMade,
  };
}

let finnhubRotationCursor = 0;

/**
 * Finnhub Rate-Limited Adapter
 * Uses 1 FX bulk call + max 6 staggered quote calls per refresh cycle
 * so total usage stays far below Finnhub's 60 req/min limit.
 */
async function fetchFromFinnhub(
  apiKey: string,
  missingIds?: Set<string>
): Promise<ProviderFetchResult> {
  const patches = new Map<string, QuotePatch>();
  let upstreamRequestsMade = 0;

  // 1) Single bulk FX rates request (base=USD) covers all 9 FX corridors
  const needFx = !missingIds || FX_CATALOG.some((f) => missingIds.has(f.id));
  if (needFx) {
    upstreamRequestsMade += 1;
    const fxData = await fetchJsonWithTimeout<{
      quote?: Record<string, number>;
    }>(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${encodeURIComponent(apiKey)}`);

    const q = fxData?.quote;
    if (q) {
      for (const pair of FX_CATALOG) {
        if (missingIds && !missingIds.has(pair.id)) continue;
        let rate: number | null = null;
        if (pair.baseCurrency === "USD" && q[pair.quoteCurrency]) {
          rate = q[pair.quoteCurrency];
        } else if (pair.quoteCurrency === "USD" && q[pair.baseCurrency]) {
          rate = 1 / q[pair.baseCurrency];
        } else if (q[pair.baseCurrency] && q[pair.quoteCurrency]) {
          rate = q[pair.quoteCurrency] / q[pair.baseCurrency];
        }
        if (rate && Number.isFinite(rate) && rate > 0) {
          patches.set(pair.id, {
            price: rate,
            source: "finnhub",
          });
        }
      }
    }
  }

  // 2) Staggered round-robin quote batch (max 6 calls per cycle)
  const quoteTargets = [
    ...INDEX_CATALOG.map((i) => ({
      id: i.id,
      symbol: i.finnhubSymbol,
      multiplier: i.proxyMultiplier,
    })),
    ...COMMODITY_CATALOG.map((c) => ({
      id: c.id,
      symbol: c.finnhubSymbol,
      multiplier: c.proxyMultiplier,
    })),
  ].filter((item) => !missingIds || missingIds.has(item.id));

  const batchSize = Math.min(6, quoteTargets.length);
  const selected: typeof quoteTargets = [];
  for (let i = 0; i < batchSize; i++) {
    const idx = (finnhubRotationCursor + i) % quoteTargets.length;
    selected.push(quoteTargets[idx]);
  }
  finnhubRotationCursor =
    quoteTargets.length > 0 ? (finnhubRotationCursor + batchSize) % quoteTargets.length : 0;

  const quoteResults = await Promise.all(
    selected.map(async (target) => {
      upstreamRequestsMade += 1;
      const data = await fetchJsonWithTimeout<{
        c?: number;
        pc?: number;
        dp?: number;
        h?: number;
        l?: number;
      }>(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
          target.symbol
        )}&token=${encodeURIComponent(apiKey)}`
      );
      return { target, data };
    })
  );

  for (const { target, data } of quoteResults) {
    if (data && data.c && data.c > 0) {
      patches.set(target.id, {
        price: data.c * target.multiplier,
        prevClose: data.pc ? data.pc * target.multiplier : undefined,
        changePercent: data.dp,
        dayHigh: data.h ? data.h * target.multiplier : undefined,
        dayLow: data.l ? data.l * target.multiplier : undefined,
        source: "finnhub",
      });
    }
  }

  return {
    patches,
    source: patches.size > 0 ? "finnhub" : "simulation",
    upstreamRequestsMade,
  };
}

function evolveSimulatedPrice(
  baseline: number,
  prevPrice: number | undefined,
  volatility: number,
  isOpen: boolean,
  id: string
): { price: number; prevClose: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  const dayBucket = Math.floor(Date.now() / 86_400_000);
  const dayBias = (deterministicSeed(id, dayBucket) - 0.48) * volatility * 2.1;
  const prevClose = baseline;

  const anchor = prevPrice ?? baseline * (1 + dayBias);
  // Active sessions move faster; closed markets retain slight futures/after-hours drift
  const stepScale = isOpen ? volatility * 0.14 : volatility * 0.025;
  const pseudoRandom =
    Math.sin(nowSec * 0.37 + deterministicSeed(id, 99) * 100) * 0.45 +
    (Math.random() - 0.5) * 1.1;
  // Gentle mean reversion toward intraday bias
  const target = baseline * (1 + dayBias);
  const meanRevert = (target - anchor) * 0.04;
  const nextPrice = Math.max(anchor + anchor * stepScale * pseudoRandom + meanRevert, baseline * 0.75);

  return { price: nextPrice, prevClose };
}

export async function fetchFreshMarketData(
  previous: MarketSnapshot | null
): Promise<{
  indices: EquityIndexAsset[];
  fx: FxPairAsset[];
  commodities: CommodityAsset[];
  activeSource: DataSourceKind;
  upstreamCallsMade: number;
}> {
  const store = getCacheStore();
  const now = new Date();
  const nowMs = now.getTime();
  const polygonKey = process.env.POLYGON_API_KEY?.trim() || "";
  const finnhubKey = process.env.FINNHUB_API_KEY?.trim() || "";
  const circuitOpen = Date.now() < store.stats.circuitBreakerUntil;

  const mergedPatches = new Map<string, QuotePatch>();
  let upstreamCallsMade = 0;
  const sourcesUsed = new Set<DataSourceKind>();

  if (!circuitOpen && polygonKey) {
    const polyRes = await fetchFromPolygon(polygonKey);
    upstreamCallsMade += polyRes.upstreamRequestsMade;
    if (polyRes.patches.size > 0) {
      sourcesUsed.add("polygon");
      polyRes.patches.forEach((v, k) => mergedPatches.set(k, v));
    }
  }

  if (!circuitOpen && finnhubKey) {
    const allIds = new Set([
      ...INDEX_CATALOG.map((i) => i.id),
      ...FX_CATALOG.map((f) => f.id),
      ...COMMODITY_CATALOG.map((c) => c.id),
    ]);
    const missing = new Set([...allIds].filter((id) => !mergedPatches.has(id)));
    if (missing.size > 0) {
      const finnRes = await fetchFromFinnhub(finnhubKey, missing);
      upstreamCallsMade += finnRes.upstreamRequestsMade;
      if (finnRes.patches.size > 0) {
        sourcesUsed.add("finnhub");
        finnRes.patches.forEach((v, k) => mergedPatches.set(k, v));
      }
    }
  }

  const prevIndexMap = new Map(previous?.indices.map((i) => [i.id, i]) ?? []);
  const prevFxMap = new Map(previous?.fx.map((f) => [f.id, f]) ?? []);
  const prevCmdMap = new Map(previous?.commodities.map((c) => [c.id, c]) ?? []);

  // Build Indices
  const indices: EquityIndexAsset[] = INDEX_CATALOG.map((item) => {
    const prev = prevIndexMap.get(item.id);
    const isOpen = isExchangeOpenUtc(item.hoursUtc, now);
    const patch = mergedPatches.get(item.id);

    let price: number;
    let prevClose: number;
    let source: DataSourceKind;

    if (patch) {
      price = roundTo(patch.price, item.decimals);
      prevClose = roundTo(patch.prevClose ?? prev?.prevClose ?? item.baselinePrice, item.decimals);
      source = patch.source;
    } else {
      const sim = evolveSimulatedPrice(
        item.baselinePrice,
        prev?.price,
        item.volatility,
        isOpen,
        item.id
      );
      price = roundTo(sim.price, item.decimals);
      prevClose = roundTo(prev?.prevClose ?? sim.prevClose, item.decimals);
      source = "simulation";
    }

    const change = roundTo(price - prevClose, item.decimals);
    const changePercent =
      patch?.changePercent !== undefined
        ? roundTo(patch.changePercent, 2)
        : roundTo((change / Math.max(prevClose, 1e-6)) * 100, 2);

    const dayHigh = roundTo(
      Math.max(patch?.dayHigh ?? prev?.dayHigh ?? price * 1.004, price),
      item.decimals
    );
    const dayLow = roundTo(
      Math.min(patch?.dayLow ?? prev?.dayLow ?? price * 0.996, price),
      item.decimals
    );

    const sparkline = prev?.sparkline
      ? updateSparkline(prev.sparkline, price, item.decimals)
      : generateInitialSparkline(prevClose, price, item.volatility, item.id, item.decimals);

    return {
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      nameKo: item.nameKo,
      category: "index",
      region: item.region,
      exchange: item.exchange,
      city: item.city,
      cityKo: item.cityKo,
      countryCode: item.countryCode,
      currency: item.currency,
      coords: item.coords,
      isOpen,
      sessionLabel: isOpen ? "개장중" : "장마감",
      hoursUtc: item.hoursUtc,
      price,
      prevClose,
      change,
      changePercent,
      dayHigh,
      dayLow,
      decimals: item.decimals,
      unit: "pts",
      sparkline,
      updatedAt: nowMs,
      source,
    };
  });

  // Build FX Pairs
  const fxOpen = isFxMarketOpenUtc(now);
  const fx: FxPairAsset[] = FX_CATALOG.map((item) => {
    const prev = prevFxMap.get(item.id);
    const patch = mergedPatches.get(item.id);

    let price: number;
    let prevClose: number;
    let source: DataSourceKind;

    if (patch) {
      price = roundTo(patch.price, item.decimals);
      prevClose = roundTo(patch.prevClose ?? prev?.prevClose ?? item.baselineRate, item.decimals);
      source = patch.source;
    } else {
      const sim = evolveSimulatedPrice(
        item.baselineRate,
        prev?.price,
        item.volatility,
        fxOpen,
        item.id
      );
      price = roundTo(sim.price, item.decimals);
      prevClose = roundTo(prev?.prevClose ?? sim.prevClose, item.decimals);
      source = "simulation";
    }

    const change = roundTo(price - prevClose, item.decimals);
    const changePercent =
      patch?.changePercent !== undefined
        ? roundTo(patch.changePercent, 2)
        : roundTo((change / Math.max(prevClose, 1e-6)) * 100, 2);

    const dayHigh = roundTo(
      Math.max(patch?.dayHigh ?? prev?.dayHigh ?? price * 1.003, price),
      item.decimals
    );
    const dayLow = roundTo(
      Math.min(patch?.dayLow ?? prev?.dayLow ?? price * 0.997, price),
      item.decimals
    );

    const sparkline = prev?.sparkline
      ? updateSparkline(prev.sparkline, price, item.decimals)
      : generateInitialSparkline(prevClose, price, item.volatility, item.id, item.decimals);

    return {
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      nameKo: item.nameKo,
      category: "fx",
      region: item.region,
      baseCurrency: item.baseCurrency,
      quoteCurrency: item.quoteCurrency,
      fromCity: item.fromCity,
      fromCityKo: item.fromCityKo,
      toCity: item.toCity,
      toCityKo: item.toCityKo,
      fromCoords: item.fromCoords,
      toCoords: item.toCoords,
      spreadPips: item.spreadPips,
      isOpen: fxOpen,
      price,
      prevClose,
      change,
      changePercent,
      dayHigh,
      dayLow,
      decimals: item.decimals,
      unit: item.quoteCurrency,
      sparkline,
      updatedAt: nowMs,
      source,
    };
  });

  // Build Commodities
  const commodities: CommodityAsset[] = COMMODITY_CATALOG.map((item) => {
    const prev = prevCmdMap.get(item.id);
    const patch = mergedPatches.get(item.id);

    let price: number;
    let prevClose: number;
    let source: DataSourceKind;

    if (patch) {
      price = roundTo(patch.price, item.decimals);
      prevClose = roundTo(patch.prevClose ?? prev?.prevClose ?? item.baselinePrice, item.decimals);
      source = patch.source;
    } else {
      const sim = evolveSimulatedPrice(
        item.baselinePrice,
        prev?.price,
        item.volatility,
        fxOpen,
        item.id
      );
      price = roundTo(sim.price, item.decimals);
      prevClose = roundTo(prev?.prevClose ?? sim.prevClose, item.decimals);
      source = "simulation";
    }

    const change = roundTo(price - prevClose, item.decimals);
    const changePercent =
      patch?.changePercent !== undefined
        ? roundTo(patch.changePercent, 2)
        : roundTo((change / Math.max(prevClose, 1e-6)) * 100, 2);

    const dayHigh = roundTo(
      Math.max(patch?.dayHigh ?? prev?.dayHigh ?? price * 1.006, price),
      item.decimals
    );
    const dayLow = roundTo(
      Math.min(patch?.dayLow ?? prev?.dayLow ?? price * 0.994, price),
      item.decimals
    );

    const sparkline = prev?.sparkline
      ? updateSparkline(prev.sparkline, price, item.decimals)
      : generateInitialSparkline(prevClose, price, item.volatility, item.id, item.decimals);

    return {
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      nameKo: item.nameKo,
      category: "commodity",
      region: "commodities",
      hubName: item.hubName,
      hubNameKo: item.hubNameKo,
      sector: item.sector,
      colorHex: item.colorHex,
      coords: item.coords,
      isOpen: fxOpen,
      price,
      prevClose,
      change,
      changePercent,
      dayHigh,
      dayLow,
      decimals: item.decimals,
      unit: item.unit,
      sparkline,
      updatedAt: nowMs,
      source,
    };
  });

  let activeSource: DataSourceKind = "simulation";
  if (sourcesUsed.size > 1) {
    activeSource = "hybrid";
  } else if (sourcesUsed.has("polygon")) {
    activeSource = "polygon";
  } else if (sourcesUsed.has("finnhub")) {
    activeSource = "finnhub";
  }

  return {
    indices,
    fx,
    commodities,
    activeSource,
    upstreamCallsMade,
  };
}
