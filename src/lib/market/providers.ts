import dns from "node:dns";
import {
  COMMODITY_CATALOG,
  FX_CATALOG,
  INDEX_CATALOG,
  MACRO_CATALOG,
  isExchangeOpenUtc,
  isFxMarketOpenUtc,
} from "./catalog";
import { getCacheStore } from "./cache";
import type {
  CommodityAsset,
  DataSourceKind,
  EquityIndexAsset,
  FxPairAsset,
  MacroIndicator,
  MarketSnapshot,
  RiskRegime,
} from "./types";

// Prefer IPv4 in Node 22 undici to avoid IPv6 ENETUNREACH timeouts on cloud VMs
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore on runtimes without dns.setDefaultResultOrder
}

interface QuotePatch {
  price: number;
  prevClose?: number;
  changePercent?: number;
  dayHigh?: number;
  dayLow?: number;
  sparkline?: number[];
  marketTime?: number | null;
  source: DataSourceKind;
}

interface ProviderFetchResult {
  patches: Map<string, QuotePatch>;
  upstreamRequestsMade: number;
}

const YAHOO_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

const BROWSER_UA = "Mozilla/5.0";

function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function downsampleSeries(values: number[], maxPoints: number, decimals: number): number[] {
  const valid = values.filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (valid.length === 0) return [];
  if (valid.length <= maxPoints) {
    return valid.map((v) => roundTo(v, decimals));
  }
  const sampled: number[] = [];
  const step = (valid.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    sampled.push(roundTo(valid[idx], decimals));
  }
  return sampled;
}

function updateSparkline(
  prev: number[] | undefined,
  nextPrice: number,
  decimals: number
): number[] {
  const rounded = roundTo(nextPrice, decimals);
  if (!prev || prev.length === 0) return [rounded, rounded];
  const last = prev[prev.length - 1];
  if (Math.abs(last - rounded) / Math.max(last, 1e-6) < 1e-6) {
    return prev;
  }
  return [...prev.slice(-27), rounded];
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs = 4500,
  headers?: Record<string, string>
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...headers,
      },
    });
    if (res.status === 429) {
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
 * Tier 1: Polygon.io Batched Adapter (Real Forex + Real Indices Snapshot)
 * Uses 2 batched HTTP requests total so multi-user refreshes stay well under rate limits.
 */
async function fetchFromPolygon(apiKey: string): Promise<ProviderFetchResult> {
  const patches = new Map<string, QuotePatch>();
  let upstreamRequestsMade = 0;

  // 1) Batched Real Forex Snapshot
  const fxTickers = FX_CATALOG.map((f) => f.polygonTicker).join(",");
  const fxUrl = `https://api.polygon.io/v2/snapshot/locale/global/markets/forex/tickers?tickers=${encodeURIComponent(
    fxTickers
  )}&apiKey=${encodeURIComponent(apiKey)}`;

  upstreamRequestsMade += 1;
  const fxRes = await fetchJsonWithTimeout<{
    tickers?: Array<{
      ticker: string;
      todaysChangePerc?: number;
      updated?: number;
      lastQuote?: { a?: number; b?: number };
      day?: { c?: number; h?: number; l?: number };
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
          marketTime: t.updated ? Math.floor(t.updated / 1_000_000) : Date.now(),
          source: "polygon",
        });
      }
    }
  }

  // 2) Batched Real Polygon Indices Snapshot (for indices with I: ticker)
  const indexTargets = INDEX_CATALOG.filter((i) => i.polygonIndexTicker);
  if (indexTargets.length > 0) {
    const idxParam = indexTargets.map((i) => i.polygonIndexTicker).join(",");
    const idxUrl = `https://api.polygon.io/v3/snapshot/indices?ticker.any_of=${encodeURIComponent(
      idxParam
    )}&apiKey=${encodeURIComponent(apiKey)}`;

    upstreamRequestsMade += 1;
    const idxRes = await fetchJsonWithTimeout<{
      results?: Array<{
        ticker: string;
        value?: number;
        session?: {
          change_percent?: number;
          previous_close?: number;
          high?: number;
          low?: number;
        };
      }>;
    }>(idxUrl);

    if (idxRes?.results) {
      const byTicker = new Map(idxRes.results.map((r) => [r.ticker, r]));
      for (const idx of indexTargets) {
        const hit = idx.polygonIndexTicker ? byTicker.get(idx.polygonIndexTicker) : undefined;
        if (hit?.value && hit.value > 0) {
          patches.set(idx.id, {
            price: hit.value,
            prevClose: hit.session?.previous_close,
            changePercent: hit.session?.change_percent,
            dayHigh: hit.session?.high,
            dayLow: hit.session?.low,
            marketTime: Date.now(),
            source: "polygon",
          });
        }
      }
    }
  }

  return { patches, upstreamRequestsMade };
}

/**
 * Tier 2: Finnhub Adapter (Bulk FX + Real OANDA Commodity Spot Quotes)
 */
async function fetchFromFinnhub(
  apiKey: string,
  missingIds: Set<string>
): Promise<ProviderFetchResult> {
  const patches = new Map<string, QuotePatch>();
  let upstreamRequestsMade = 0;

  // 1) Bulk FX rates (1 HTTP request covers all 9 FX pairs)
  if (FX_CATALOG.some((f) => missingIds.has(f.id))) {
    upstreamRequestsMade += 1;
    const fxData = await fetchJsonWithTimeout<{
      quote?: Record<string, number>;
    }>(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${encodeURIComponent(apiKey)}`);

    const q = fxData?.quote;
    if (q) {
      for (const pair of FX_CATALOG) {
        if (!missingIds.has(pair.id)) continue;
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
            marketTime: Date.now(),
            source: "finnhub",
          });
        }
      }
    }
  }

  // 2) Real OANDA Commodity Quotes (capped at 4 per cycle to stay far below 60/min)
  const commodityTargets = COMMODITY_CATALOG.filter(
    (c) => missingIds.has(c.id) && c.finnhubOandaSymbol
  ).slice(0, 4);

  const results = await Promise.all(
    commodityTargets.map(async (cmd) => {
      upstreamRequestsMade += 1;
      const data = await fetchJsonWithTimeout<{
        c?: number;
        pc?: number;
        dp?: number;
        h?: number;
        l?: number;
        t?: number;
      }>(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
          cmd.finnhubOandaSymbol!
        )}&token=${encodeURIComponent(apiKey)}`
      );
      return { cmd, data };
    })
  );

  for (const { cmd, data } of results) {
    if (data && data.c && data.c > 0) {
      patches.set(cmd.id, {
        price: data.c,
        prevClose: data.pc,
        changePercent: data.dp,
        dayHigh: data.h,
        dayLow: data.l,
        marketTime: data.t ? data.t * 1000 : Date.now(),
        source: "finnhub",
      });
    }
  }

  return { patches, upstreamRequestsMade };
}

interface YahooSparkItem {
  symbol?: string;
  timestamp?: number[];
  start?: number;
  end?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  fulldayPrice?: number;
  fulldayChange?: number;
  fulldayChangePercent?: number;
  close?: Array<number | null>;
}

/**
 * Tier 3: Real-Time Yahoo Finance v8 Batched Spark Feed (Key-Free Public Market Data)
 * Fetches ALL 31 global indices, FX pairs, and commodity futures + real 15m intraday
 * sparklines in just 2 batched HTTP requests (16 + 15 symbols), eliminating 429 bursts!
 */
async function fetchYahooSparkChunk(
  chunk: Array<{ id: string; yahooSymbol: string; decimals: number }>,
  chunkIndex: number
): Promise<Map<string, QuotePatch>> {
  const patches = new Map<string, QuotePatch>();
  const symbolsParam = chunk.map((t) => t.yahooSymbol).join(",");
  const byYahooSymbol = new Map(chunk.map((t) => [t.yahooSymbol, t]));

  const hostOrder =
    chunkIndex % 2 === 0
      ? [YAHOO_HOSTS[0], YAHOO_HOSTS[1]]
      : [YAHOO_HOSTS[1], YAHOO_HOSTS[0]];

  for (const host of hostOrder) {
    const url = `${host}/v8/finance/spark?symbols=${encodeURIComponent(
      symbolsParam
    )}&range=1d&interval=15m`;
    const json = await fetchJsonWithTimeout<Record<string, YahooSparkItem>>(url, 5500, {
      "User-Agent": BROWSER_UA,
    });
    if (!json || typeof json !== "object") continue;

    let matchedAny = false;
    for (const [sym, item] of Object.entries(json)) {
      const target = byYahooSymbol.get(sym) ?? byYahooSymbol.get(item?.symbol ?? "");
      if (!target || !item) continue;

      const rawCloses = (item.close ?? []).filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
      );
      const price =
        typeof item.fulldayPrice === "number" && item.fulldayPrice > 0
          ? item.fulldayPrice
          : rawCloses[rawCloses.length - 1];

      if (!price || !Number.isFinite(price) || price <= 0) continue;

      const prevClose =
        item.chartPreviousClose ??
        item.previousClose ??
        (typeof item.fulldayChange === "number" ? price - item.fulldayChange : price);

      const series =
        rawCloses.length >= 3
          ? downsampleSeries([...rawCloses, price], 28, target.decimals)
          : [roundTo(prevClose, target.decimals), roundTo(price, target.decimals)];

      const dayHigh = Math.max(...series, price);
      const dayLow = Math.min(...series, price);

      const changePct =
        typeof item.fulldayChangePercent === "number" &&
        Number.isFinite(item.fulldayChangePercent)
          ? item.fulldayChangePercent
          : ((price - prevClose) / Math.max(prevClose, 1e-6)) * 100;

      const lastTs =
        item.timestamp && item.timestamp.length > 0
          ? item.timestamp[item.timestamp.length - 1] * 1000
          : item.end
          ? item.end * 1000
          : Date.now();

      patches.set(target.id, {
        price,
        prevClose,
        changePercent: changePct,
        dayHigh,
        dayLow,
        sparkline: series,
        marketTime: lastTs,
        source: "yahoo",
      });
      matchedAny = true;
    }

    if (matchedAny) break;
  }

  return patches;
}

async function fetchFromYahooBatch(
  targets: Array<{ id: string; yahooSymbol: string; decimals: number }>
): Promise<ProviderFetchResult> {
  const patches = new Map<string, QuotePatch>();
  if (targets.length === 0) return { patches, upstreamRequestsMade: 0 };

  const chunkSize = 18;
  const chunks: Array<typeof targets> = [];
  for (let i = 0; i < targets.length; i += chunkSize) {
    chunks.push(targets.slice(i, i + chunkSize));
  }

  const chunkResults = await Promise.all(
    chunks.map((chunk, idx) => fetchYahooSparkChunk(chunk, idx))
  );
  for (const res of chunkResults) {
    res.forEach((v, k) => patches.set(k, v));
  }

  return {
    patches,
    upstreamRequestsMade: chunks.length,
  };
}

/**
 * Tier 4: Frankfurter ECB FX Reference Rates Backup (1 single lightweight HTTP request)
 */
async function fetchFromFrankfurterFx(missingIds: Set<string>): Promise<ProviderFetchResult> {
  const patches = new Map<string, QuotePatch>();
  const missingFx = FX_CATALOG.filter((f) => missingIds.has(f.id));
  if (missingFx.length === 0) return { patches, upstreamRequestsMade: 0 };

  const data = await fetchJsonWithTimeout<{
    rates?: Record<string, number>;
    date?: string;
  }>(
    "https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW,EUR,JPY,GBP,CHF,AUD,CNY,SGD",
    3500
  );

  const rates = data?.rates;
  if (!rates) return { patches, upstreamRequestsMade: 1 };

  for (const pair of missingFx) {
    let rate: number | null = null;
    if (pair.baseCurrency === "USD" && rates[pair.quoteCurrency]) {
      rate = rates[pair.quoteCurrency];
    } else if (pair.quoteCurrency === "USD" && rates[pair.baseCurrency]) {
      rate = 1 / rates[pair.baseCurrency];
    } else if (rates[pair.baseCurrency] && rates[pair.quoteCurrency]) {
      rate = rates[pair.quoteCurrency] / rates[pair.baseCurrency];
    }
    if (rate && Number.isFinite(rate) && rate > 0) {
      patches.set(pair.id, {
        price: rate,
        marketTime: Date.now(),
        source: "frankfurter",
      });
    }
  }

  return { patches, upstreamRequestsMade: 1 };
}

function computeRiskRegime(
  indices: EquityIndexAsset[],
  macro: MacroIndicator[]
): RiskRegime {
  // 1. Equity breadth (0..100)
  const avgIdxPct =
    indices.reduce((sum, i) => sum + i.changePercent, 0) / Math.max(indices.length, 1);
  const advRatio =
    indices.filter((i) => i.changePercent >= 0).length / Math.max(indices.length, 1);

  // 2. VIX pressure (lower VIX = higher Risk-On)
  const vix = macro.find((m) => m.symbol === "VIX");
  const btc = macro.find((m) => m.symbol === "BTC");

  let score = 50;
  score += (advRatio - 0.5) * 44; // -22 .. +22
  score += Math.max(-18, Math.min(18, avgIdxPct * 9)); // -18 .. +18
  if (vix) {
    // VIX 20 is baseline; higher pulls toward Risk-Off
    score += Math.max(-18, Math.min(14, (20 - vix.price) * 1.1));
    score += Math.max(-8, Math.min(8, -vix.changePercent * 0.9));
  }
  if (btc) {
    score += Math.max(-6, Math.min(6, btc.changePercent * 1.2));
  }

  const clamped = Math.round(Math.max(5, Math.min(95, score)));
  if (clamped >= 58) {
    return { score: clamped, label: "RISK-ON", labelKo: "위험선호", tone: "up" };
  }
  if (clamped <= 42) {
    return { score: clamped, label: "RISK-OFF", labelKo: "안전자산 선호", tone: "down" };
  }
  return { score: clamped, label: "NEUTRAL", labelKo: "중립 · 혼조", tone: "neutral" };
}

export async function fetchFreshMarketData(
  previous: MarketSnapshot | null
): Promise<{
  indices: EquityIndexAsset[];
  fx: FxPairAsset[];
  commodities: CommodityAsset[];
  macro: MacroIndicator[];
  riskRegime: RiskRegime;
  activeSource: DataSourceKind;
  liveMappedCount: number;
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

  const allTargets = [
    ...INDEX_CATALOG.map((i) => ({
      id: i.id,
      yahooSymbol: i.yahooSymbol,
      decimals: i.decimals,
    })),
    ...FX_CATALOG.map((f) => ({
      id: f.id,
      yahooSymbol: f.yahooSymbol,
      decimals: f.decimals,
    })),
    ...COMMODITY_CATALOG.map((c) => ({
      id: c.id,
      yahooSymbol: c.yahooSymbol,
      decimals: c.decimals,
    })),
    ...MACRO_CATALOG.map((m) => ({
      id: m.id,
      yahooSymbol: m.yahooSymbol,
      decimals: m.decimals,
    })),
  ];

  // Tier 1: Polygon.io (if configured)
  if (!circuitOpen && polygonKey) {
    const polyRes = await fetchFromPolygon(polygonKey);
    upstreamCallsMade += polyRes.upstreamRequestsMade;
    polyRes.patches.forEach((v, k) => mergedPatches.set(k, v));
  }

  // Tier 2: Finnhub (if configured, fills missing instruments)
  if (!circuitOpen && finnhubKey) {
    const missingAfterPoly = new Set(
      allTargets.filter((t) => !mergedPatches.has(t.id)).map((t) => t.id)
    );
    if (missingAfterPoly.size > 0) {
      const finnRes = await fetchFromFinnhub(finnhubKey, missingAfterPoly);
      upstreamCallsMade += finnRes.upstreamRequestsMade;
      finnRes.patches.forEach((v, k) => mergedPatches.set(k, v));
    }
  }

  // Tier 3: Real-Time Yahoo Finance v8 Batched Spark (all remaining 35 symbols in 2 calls!)
  if (!circuitOpen) {
    const missingForYahoo = allTargets.filter((t) => !mergedPatches.has(t.id));
    if (missingForYahoo.length > 0) {
      const yahooRes = await fetchFromYahooBatch(missingForYahoo);
      upstreamCallsMade += yahooRes.upstreamRequestsMade;
      yahooRes.patches.forEach((v, k) => mergedPatches.set(k, v));
    }
  }

  // Tier 4: Frankfurter ECB FX backup if any FX pair is still missing
  const missingForFrankfurter = new Set(
    FX_CATALOG.filter((f) => !mergedPatches.has(f.id)).map((f) => f.id)
  );
  if (missingForFrankfurter.size > 0) {
    const frankRes = await fetchFromFrankfurterFx(missingForFrankfurter);
    upstreamCallsMade += frankRes.upstreamRequestsMade;
    frankRes.patches.forEach((v, k) => mergedPatches.set(k, v));
  }

  const prevIndexMap = new Map(previous?.indices.map((i) => [i.id, i]) ?? []);
  const prevFxMap = new Map(previous?.fx.map((f) => [f.id, f]) ?? []);
  const prevCmdMap = new Map(previous?.commodities.map((c) => [c.id, c]) ?? []);
  const prevMacroMap = new Map(previous?.macro?.map((m) => [m.id, m]) ?? []);

  const liveSourcesUsed = new Set<DataSourceKind>();
  let liveMappedCount = 0;

  // Build Indices
  const indices: EquityIndexAsset[] = INDEX_CATALOG.map((item) => {
    const prev = prevIndexMap.get(item.id);
    const isOpen = isExchangeOpenUtc(item.hoursUtc, now);
    const patch = mergedPatches.get(item.id);

    let price: number;
    let prevClose: number;
    let dayHigh: number;
    let dayLow: number;
    let changePercent: number;
    let sparkline: number[];
    let marketTime: number | null;
    let source: DataSourceKind;

    if (patch) {
      price = roundTo(patch.price, item.decimals);
      prevClose = roundTo(patch.prevClose ?? prev?.prevClose ?? item.baselinePrice, item.decimals);
      dayHigh = roundTo(
        Math.max(patch.dayHigh ?? prev?.dayHigh ?? price, price),
        item.decimals
      );
      dayLow = roundTo(
        Math.min(patch.dayLow ?? prev?.dayLow ?? price, price),
        item.decimals
      );
      changePercent =
        patch.changePercent !== undefined
          ? roundTo(patch.changePercent, 2)
          : roundTo(((price - prevClose) / Math.max(prevClose, 1e-6)) * 100, 2);
      sparkline =
        patch.sparkline && patch.sparkline.length >= 2
          ? patch.sparkline
          : updateSparkline(prev?.sparkline, price, item.decimals);
      marketTime = patch.marketTime ?? nowMs;
      source = patch.source;
      liveSourcesUsed.add(source);
      liveMappedCount += 1;
    } else if (prev && prev.source !== "simulation") {
      liveSourcesUsed.add(prev.source);
      liveMappedCount += 1;
      return { ...prev, isoNumeric: item.isoNumeric, isOpen, sessionLabel: isOpen ? "개장중" : "장마감" };
    } else {
      price = roundTo(item.baselinePrice, item.decimals);
      prevClose = price;
      dayHigh = price;
      dayLow = price;
      changePercent = 0;
      sparkline = [price, price];
      marketTime = null;
      source = "simulation";
    }

    const change = roundTo(price - prevClose, item.decimals);

    return {
      id: item.id,
      symbol: item.symbol,
      feedSymbol: item.yahooSymbol,
      name: item.name,
      nameKo: item.nameKo,
      category: "index",
      region: item.region,
      exchange: item.exchange,
      city: item.city,
      cityKo: item.cityKo,
      countryCode: item.countryCode,
      isoNumeric: item.isoNumeric,
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
      marketTime,
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
    let dayHigh: number;
    let dayLow: number;
    let changePercent: number;
    let sparkline: number[];
    let marketTime: number | null;
    let source: DataSourceKind;

    if (patch) {
      price = roundTo(patch.price, item.decimals);
      prevClose = roundTo(patch.prevClose ?? prev?.prevClose ?? item.baselineRate, item.decimals);
      dayHigh = roundTo(
        Math.max(patch.dayHigh ?? prev?.dayHigh ?? price, price),
        item.decimals
      );
      dayLow = roundTo(
        Math.min(patch.dayLow ?? prev?.dayLow ?? price, price),
        item.decimals
      );
      changePercent =
        patch.changePercent !== undefined
          ? roundTo(patch.changePercent, 2)
          : roundTo(((price - prevClose) / Math.max(prevClose, 1e-6)) * 100, 2);
      sparkline =
        patch.sparkline && patch.sparkline.length >= 2
          ? patch.sparkline
          : updateSparkline(prev?.sparkline, price, item.decimals);
      marketTime = patch.marketTime ?? nowMs;
      source = patch.source;
      liveSourcesUsed.add(source);
      liveMappedCount += 1;
    } else if (prev && prev.source !== "simulation") {
      liveSourcesUsed.add(prev.source);
      liveMappedCount += 1;
      return { ...prev, isOpen: fxOpen };
    } else {
      price = roundTo(item.baselineRate, item.decimals);
      prevClose = price;
      dayHigh = price;
      dayLow = price;
      changePercent = 0;
      sparkline = [price, price];
      marketTime = null;
      source = "simulation";
    }

    const change = roundTo(price - prevClose, item.decimals);

    return {
      id: item.id,
      symbol: item.symbol,
      feedSymbol: item.yahooSymbol,
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
      marketTime,
      source,
    };
  });

  // Build Commodities
  const commodities: CommodityAsset[] = COMMODITY_CATALOG.map((item) => {
    const prev = prevCmdMap.get(item.id);
    const patch = mergedPatches.get(item.id);

    let price: number;
    let prevClose: number;
    let dayHigh: number;
    let dayLow: number;
    let changePercent: number;
    let sparkline: number[];
    let marketTime: number | null;
    let source: DataSourceKind;

    if (patch) {
      price = roundTo(patch.price, item.decimals);
      prevClose = roundTo(patch.prevClose ?? prev?.prevClose ?? item.baselinePrice, item.decimals);
      dayHigh = roundTo(
        Math.max(patch.dayHigh ?? prev?.dayHigh ?? price, price),
        item.decimals
      );
      dayLow = roundTo(
        Math.min(patch.dayLow ?? prev?.dayLow ?? price, price),
        item.decimals
      );
      changePercent =
        patch.changePercent !== undefined
          ? roundTo(patch.changePercent, 2)
          : roundTo(((price - prevClose) / Math.max(prevClose, 1e-6)) * 100, 2);
      sparkline =
        patch.sparkline && patch.sparkline.length >= 2
          ? patch.sparkline
          : updateSparkline(prev?.sparkline, price, item.decimals);
      marketTime = patch.marketTime ?? nowMs;
      source = patch.source;
      liveSourcesUsed.add(source);
      liveMappedCount += 1;
    } else if (prev && prev.source !== "simulation") {
      liveSourcesUsed.add(prev.source);
      liveMappedCount += 1;
      return { ...prev, isOpen: fxOpen };
    } else {
      price = roundTo(item.baselinePrice, item.decimals);
      prevClose = price;
      dayHigh = price;
      dayLow = price;
      changePercent = 0;
      sparkline = [price, price];
      marketTime = null;
      source = "simulation";
    }

    const change = roundTo(price - prevClose, item.decimals);

    return {
      id: item.id,
      symbol: item.symbol,
      feedSymbol: item.yahooSymbol,
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
      marketTime,
      source,
    };
  });

  // Build Macro Risk Indicators (VIX, DXY, US10Y, BTC)
  const macro: MacroIndicator[] = MACRO_CATALOG.map((item) => {
    const prev = prevMacroMap.get(item.id);
    const patch = mergedPatches.get(item.id);

    let price: number;
    let prevClose: number;
    let changePercent: number;
    let sparkline: number[];
    let source: DataSourceKind;

    if (patch) {
      price = roundTo(patch.price, item.decimals);
      prevClose = roundTo(patch.prevClose ?? prev?.prevClose ?? item.baselinePrice, item.decimals);
      changePercent =
        patch.changePercent !== undefined
          ? roundTo(patch.changePercent, 2)
          : roundTo(((price - prevClose) / Math.max(prevClose, 1e-6)) * 100, 2);
      sparkline =
        patch.sparkline && patch.sparkline.length >= 2
          ? patch.sparkline
          : updateSparkline(prev?.sparkline, price, item.decimals);
      source = patch.source;
      liveSourcesUsed.add(source);
      liveMappedCount += 1;
    } else if (prev && prev.source !== "simulation") {
      liveSourcesUsed.add(prev.source);
      liveMappedCount += 1;
      return prev;
    } else {
      price = roundTo(item.baselinePrice, item.decimals);
      prevClose = price;
      changePercent = 0;
      sparkline = [price, price];
      source = "simulation";
    }

    return {
      id: item.id,
      symbol: item.symbol,
      feedSymbol: item.yahooSymbol,
      name: item.name,
      nameKo: item.nameKo,
      price,
      prevClose,
      change: roundTo(price - prevClose, item.decimals),
      changePercent,
      decimals: item.decimals,
      unit: item.unit,
      sparkline,
      source,
    };
  });

  const riskRegime = computeRiskRegime(indices, macro);

  let activeSource: DataSourceKind = "simulation";
  if (liveSourcesUsed.size > 1) {
    activeSource = "hybrid";
  } else if (liveSourcesUsed.size === 1) {
    activeSource = [...liveSourcesUsed][0];
  }

  return {
    indices,
    fx,
    commodities,
    macro,
    riskRegime,
    activeSource,
    liveMappedCount,
    upstreamCallsMade,
  };
}
