export type AssetCategory = "index" | "fx" | "commodity";

export type RegionKey = "global" | "americas" | "europe" | "asia" | "commodities";

export type DataSourceKind =
  | "polygon"
  | "finnhub"
  | "yahoo"
  | "frankfurter"
  | "hybrid"
  | "simulation";

export type HistoryRange = "1D" | "1W" | "1M" | "3M";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ExchangeHoursUtc {
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
}

export interface MarketAssetBase {
  id: string;
  symbol: string;
  feedSymbol: string;
  name: string;
  nameKo: string;
  category: AssetCategory;
  region: Exclude<RegionKey, "global">;
  price: number;
  prevClose: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  decimals: number;
  unit: string;
  sparkline: number[];
  updatedAt: number;
  marketTime: number | null;
  source: DataSourceKind;
}

export interface EquityIndexAsset extends MarketAssetBase {
  category: "index";
  exchange: string;
  city: string;
  cityKo: string;
  countryCode: string;
  isoNumeric: string;
  currency: string;
  coords: GeoPoint;
  isOpen: boolean;
  sessionLabel: string;
  hoursUtc: ExchangeHoursUtc;
}

export interface FxPairAsset extends MarketAssetBase {
  category: "fx";
  baseCurrency: string;
  quoteCurrency: string;
  fromCity: string;
  fromCityKo: string;
  toCity: string;
  toCityKo: string;
  fromCoords: GeoPoint;
  toCoords: GeoPoint;
  spreadPips: number;
  isOpen: boolean;
}

export interface CommodityAsset extends MarketAssetBase {
  category: "commodity";
  hubName: string;
  hubNameKo: string;
  sector: "energy" | "metals" | "agriculture";
  colorHex: string;
  coords: GeoPoint;
  isOpen: boolean;
}

export type AnyMarketAsset = EquityIndexAsset | FxPairAsset | CommodityAsset;

export interface MacroIndicator {
  id: string;
  symbol: string;
  feedSymbol: string;
  name: string;
  nameKo: string;
  price: number;
  prevClose: number;
  change: number;
  changePercent: number;
  decimals: number;
  unit: string;
  sparkline: number[];
  source: DataSourceKind;
}

export interface RiskRegime {
  /** 0 (Extreme Risk-Off) to 100 (Strong Risk-On) */
  score: number;
  label: "RISK-ON" | "NEUTRAL" | "RISK-OFF";
  labelKo: string;
  tone: "up" | "neutral" | "down";
}

export interface NewsPinItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: number;
  city: string;
  cityKo: string;
  region: Exclude<RegionKey, "global">;
  coords: GeoPoint;
  sentiment: "bullish" | "bearish" | "neutral";
}

export interface HistoryPoint {
  t: number;
  v: number;
}

export interface HistoryResponse {
  symbol: string;
  range: HistoryRange;
  points: HistoryPoint[];
  changePercent: number;
  high: number;
  low: number;
  fetchedAt: number;
}

export interface PriceAlert {
  id: string;
  assetId: string;
  symbol: string;
  nameKo: string;
  direction: "above" | "below";
  targetPrice: number;
  decimals: number;
  triggered: boolean;
  createdAt: number;
}

export interface CacheTelemetry {
  cacheTier: "l1-memory" | "l2-redis" | "origin-fresh";
  redisConfigured: boolean;
  providersConfigured: {
    polygon: boolean;
    finnhub: boolean;
    publicLiveFeed: boolean;
  };
  activeSource: DataSourceKind;
  liveMappedCount: number;
  totalInstrumentsCount: number;
  ttlSeconds: number;
  ageSeconds: number;
  upstreamCallsTotal: number;
  cacheHitsTotal: number;
  coalescedRequestsTotal: number;
  circuitBreakerOpen: boolean;
  lastUpstreamFetchAt: number | null;
}

export interface MarketSnapshot {
  version: number;
  generatedAt: number;
  indices: EquityIndexAsset[];
  fx: FxPairAsset[];
  commodities: CommodityAsset[];
  macro: MacroIndicator[];
  riskRegime: RiskRegime;
  telemetry: CacheTelemetry;
}

export interface StreamEventPayload {
  type: "snapshot" | "tick" | "heartbeat";
  timestamp: number;
  snapshot?: MarketSnapshot;
  deltas?: Array<{
    id: string;
    category: AssetCategory;
    price: number;
    change: number;
    changePercent: number;
    updatedAt: number;
  }>;
  telemetry?: CacheTelemetry;
}
