export type AssetCategory = "index" | "fx" | "commodity";

export type RegionKey = "global" | "americas" | "europe" | "asia" | "commodities";

export type DataSourceKind =
  | "polygon"
  | "finnhub"
  | "yahoo"
  | "frankfurter"
  | "hybrid"
  | "simulation";

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
