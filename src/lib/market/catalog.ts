import type { ExchangeHoursUtc, GeoPoint, RegionKey } from "./types";

export interface IndexCatalogItem {
  id: string;
  symbol: string;
  yahooSymbol: string;
  polygonIndexTicker?: string;
  name: string;
  nameKo: string;
  exchange: string;
  city: string;
  cityKo: string;
  countryCode: string;
  /** ISO 3166-1 numeric code matching world-atlas/countries-50m.json feature.id */
  isoNumeric: string;
  currency: string;
  region: Exclude<RegionKey, "global" | "commodities">;
  coords: GeoPoint;
  baselinePrice: number;
  decimals: number;
  volatility: number;
  hoursUtc: ExchangeHoursUtc;
  polygonProxyTicker: string;
  proxyMultiplier: number;
  finnhubSymbol: string;
}

export interface FxCatalogItem {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  nameKo: string;
  baseCurrency: string;
  quoteCurrency: string;
  fromCity: string;
  fromCityKo: string;
  toCity: string;
  toCityKo: string;
  fromCoords: GeoPoint;
  toCoords: GeoPoint;
  region: Exclude<RegionKey, "global" | "commodities">;
  baselineRate: number;
  decimals: number;
  volatility: number;
  spreadPips: number;
  polygonTicker: string;
}

export interface CommodityCatalogItem {
  id: string;
  symbol: string;
  yahooSymbol: string;
  finnhubOandaSymbol?: string;
  name: string;
  nameKo: string;
  hubName: string;
  hubNameKo: string;
  sector: "energy" | "metals" | "agriculture";
  colorHex: string;
  coords: GeoPoint;
  baselinePrice: number;
  decimals: number;
  unit: string;
  volatility: number;
  polygonProxyTicker: string;
  proxyMultiplier: number;
  finnhubSymbol: string;
}

export interface MacroCatalogItem {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  nameKo: string;
  baselinePrice: number;
  decimals: number;
  unit: string;
}

export interface SessionRelayItem {
  id: string;
  labelKo: string;
  exchange: string;
  openHourUtc: number;
  openMinuteUtc: number;
  closeHourUtc: number;
  closeMinuteUtc: number;
  coords: GeoPoint;
  color: string;
}

export const REGION_PRESETS: Record<
  RegionKey,
  { labelKo: string; labelEn: string; lat: number; lng: number; distance: number }
> = {
  global: { labelKo: "글로벌", labelEn: "Global", lat: 22, lng: 25, distance: 2.85 },
  americas: { labelKo: "미주", labelEn: "Americas", lat: 28, lng: -85, distance: 2.35 },
  europe: { labelKo: "유럽", labelEn: "Europe", lat: 48, lng: 10, distance: 2.1 },
  asia: { labelKo: "아시아", labelEn: "Asia-Pac", lat: 24, lng: 118, distance: 2.25 },
  commodities: { labelKo: "원자재", labelEn: "Resources", lat: 5, lng: 35, distance: 2.65 },
};

export const SESSION_RELAY_BLOCKS: SessionRelayItem[] = [
  {
    id: "sess-sydney",
    labelKo: "시드니",
    exchange: "ASX",
    openHourUtc: 0,
    openMinuteUtc: 0,
    closeHourUtc: 6,
    closeMinuteUtc: 0,
    coords: { lat: -33.8688, lng: 151.2093 },
    color: "#38bdf8",
  },
  {
    id: "sess-seoul-tokyo",
    labelKo: "서울·도쿄",
    exchange: "KRX/TSE",
    openHourUtc: 0,
    openMinuteUtc: 0,
    closeHourUtc: 6,
    closeMinuteUtc: 30,
    coords: { lat: 36.6, lng: 133.2 },
    color: "#10b981",
  },
  {
    id: "sess-hk-shanghai",
    labelKo: "홍콩·상하이",
    exchange: "HKEX/SSE",
    openHourUtc: 1,
    openMinuteUtc: 30,
    closeHourUtc: 8,
    closeMinuteUtc: 0,
    coords: { lat: 26.5, lng: 117.5 },
    color: "#22d3ee",
  },
  {
    id: "sess-europe",
    labelKo: "런던·유럽",
    exchange: "LSE/XETRA",
    openHourUtc: 8,
    openMinuteUtc: 0,
    closeHourUtc: 16,
    closeMinuteUtc: 30,
    coords: { lat: 50.5, lng: 4.5 },
    color: "#f59e0b",
  },
  {
    id: "sess-ny",
    labelKo: "뉴욕",
    exchange: "NYSE/NASDAQ",
    openHourUtc: 14,
    openMinuteUtc: 30,
    closeHourUtc: 21,
    closeMinuteUtc: 0,
    coords: { lat: 40.7128, lng: -74.006 },
    color: "#34d399",
  },
];

export const MACRO_CATALOG: MacroCatalogItem[] = [
  {
    id: "macro-vix",
    symbol: "VIX",
    yahooSymbol: "^VIX",
    name: "CBOE Volatility Index",
    nameKo: "공포지수 VIX",
    baselinePrice: 28.29,
    decimals: 2,
    unit: "pts",
  },
  {
    id: "macro-dxy",
    symbol: "DXY",
    yahooSymbol: "DX-Y.NYB",
    name: "US Dollar Index",
    nameKo: "달러인덱스",
    baselinePrice: 103.7,
    decimals: 2,
    unit: "pts",
  },
  {
    id: "macro-us10y",
    symbol: "US10Y",
    yahooSymbol: "^TNX",
    name: "US 10Y Treasury Yield",
    nameKo: "미 10년물 금리",
    baselinePrice: 4.85,
    decimals: 2,
    unit: "%",
  },
  {
    id: "macro-btc",
    symbol: "BTC",
    yahooSymbol: "BTC-USD",
    name: "Bitcoin Spot",
    nameKo: "비트코인",
    baselinePrice: 60322,
    decimals: 0,
    unit: "USD",
  },
];

export const INDEX_CATALOG: IndexCatalogItem[] = [
  {
    id: "idx-sp500",
    symbol: "SPX",
    yahooSymbol: "^GSPC",
    polygonIndexTicker: "I:SPX",
    name: "S&P 500",
    nameKo: "S&P 500",
    exchange: "NYSE",
    city: "New York",
    cityKo: "뉴욕",
    countryCode: "US",
    isoNumeric: "840",
    currency: "USD",
    region: "americas",
    coords: { lat: 40.7128, lng: -74.006 },
    baselinePrice: 7182.78,
    decimals: 2,
    volatility: 0.0085,
    hoursUtc: { openHour: 14, openMinute: 30, closeHour: 21, closeMinute: 0 },
    polygonProxyTicker: "SPY",
    proxyMultiplier: 10.02,
    finnhubSymbol: "SPY",
  },
  {
    id: "idx-nasdaq",
    symbol: "NDX",
    yahooSymbol: "^NDX",
    polygonIndexTicker: "I:NDX",
    name: "NASDAQ 100",
    nameKo: "나스닥 100",
    exchange: "NASDAQ",
    city: "New York",
    cityKo: "뉴욕",
    countryCode: "US",
    isoNumeric: "840",
    currency: "USD",
    region: "americas",
    coords: { lat: 41.9, lng: -72.1 },
    baselinePrice: 26046.9,
    decimals: 2,
    volatility: 0.0115,
    hoursUtc: { openHour: 14, openMinute: 30, closeHour: 21, closeMinute: 0 },
    polygonProxyTicker: "QQQ",
    proxyMultiplier: 41.05,
    finnhubSymbol: "QQQ",
  },
  {
    id: "idx-tsx",
    symbol: "TSX",
    yahooSymbol: "^GSPTSE",
    name: "S&P/TSX",
    nameKo: "토론토 TSX",
    exchange: "TMX",
    city: "Toronto",
    cityKo: "토론토",
    countryCode: "CA",
    isoNumeric: "124",
    currency: "CAD",
    region: "americas",
    coords: { lat: 43.6532, lng: -79.3832 },
    baselinePrice: 34179.99,
    decimals: 2,
    volatility: 0.007,
    hoursUtc: { openHour: 14, openMinute: 30, closeHour: 21, closeMinute: 0 },
    polygonProxyTicker: "EWC",
    proxyMultiplier: 605,
    finnhubSymbol: "EWC",
  },
  {
    id: "idx-ibov",
    symbol: "IBOV",
    yahooSymbol: "^BVSP",
    name: "Ibovespa",
    nameKo: "브라질 보베스파",
    exchange: "B3",
    city: "São Paulo",
    cityKo: "상파울루",
    countryCode: "BR",
    isoNumeric: "076",
    currency: "BRL",
    region: "americas",
    coords: { lat: -23.5505, lng: -46.6333 },
    baselinePrice: 166685.0,
    decimals: 0,
    volatility: 0.0125,
    hoursUtc: { openHour: 13, openMinute: 0, closeHour: 20, closeMinute: 0 },
    polygonProxyTicker: "EWZ",
    proxyMultiplier: 4450,
    finnhubSymbol: "EWZ",
  },
  {
    id: "idx-ftse",
    symbol: "UKX",
    yahooSymbol: "^FTSE",
    name: "FTSE 100",
    nameKo: "영국 FTSE 100",
    exchange: "LSE",
    city: "London",
    cityKo: "런던",
    countryCode: "GB",
    isoNumeric: "826",
    currency: "GBP",
    region: "europe",
    coords: { lat: 51.5074, lng: -0.1278 },
    baselinePrice: 10426.94,
    decimals: 2,
    volatility: 0.0068,
    hoursUtc: { openHour: 8, openMinute: 0, closeHour: 16, closeMinute: 30 },
    polygonProxyTicker: "EWU",
    proxyMultiplier: 230,
    finnhubSymbol: "EWU",
  },
  {
    id: "idx-dax",
    symbol: "DAX",
    yahooSymbol: "^GDAXI",
    name: "DAX 40",
    nameKo: "독일 DAX 40",
    exchange: "XETRA",
    city: "Frankfurt",
    cityKo: "프랑크푸르트",
    countryCode: "DE",
    isoNumeric: "276",
    currency: "EUR",
    region: "europe",
    coords: { lat: 50.1109, lng: 8.6821 },
    baselinePrice: 24702.13,
    decimals: 2,
    volatility: 0.0085,
    hoursUtc: { openHour: 8, openMinute: 0, closeHour: 16, closeMinute: 30 },
    polygonProxyTicker: "EWG",
    proxyMultiplier: 590,
    finnhubSymbol: "EWG",
  },
  {
    id: "idx-cac",
    symbol: "CAC",
    yahooSymbol: "^FCHI",
    name: "CAC 40",
    nameKo: "프랑스 CAC 40",
    exchange: "Euronext",
    city: "Paris",
    cityKo: "파리",
    countryCode: "FR",
    isoNumeric: "250",
    currency: "EUR",
    region: "europe",
    coords: { lat: 48.8566, lng: 2.3522 },
    baselinePrice: 7980.57,
    decimals: 2,
    volatility: 0.0082,
    hoursUtc: { openHour: 8, openMinute: 0, closeHour: 16, closeMinute: 30 },
    polygonProxyTicker: "EWQ",
    proxyMultiplier: 192,
    finnhubSymbol: "EWQ",
  },
  {
    id: "idx-smi",
    symbol: "SMI",
    yahooSymbol: "^SSMI",
    name: "Swiss Market",
    nameKo: "스위스 SMI",
    exchange: "SIX",
    city: "Zurich",
    cityKo: "취리히",
    countryCode: "CH",
    isoNumeric: "756",
    currency: "CHF",
    region: "europe",
    coords: { lat: 47.3769, lng: 8.5417 },
    baselinePrice: 14664.92,
    decimals: 2,
    volatility: 0.006,
    hoursUtc: { openHour: 8, openMinute: 0, closeHour: 16, closeMinute: 30 },
    polygonProxyTicker: "EWL",
    proxyMultiplier: 245,
    finnhubSymbol: "EWL",
  },
  {
    id: "idx-kospi",
    symbol: "KOSPI",
    yahooSymbol: "^KS11",
    name: "KOSPI",
    nameKo: "코스피",
    exchange: "KRX",
    city: "Seoul",
    cityKo: "서울",
    countryCode: "KR",
    isoNumeric: "410",
    currency: "KRW",
    region: "asia",
    coords: { lat: 37.5665, lng: 126.978 },
    baselinePrice: 4697.51,
    decimals: 2,
    volatility: 0.0105,
    hoursUtc: { openHour: 0, openMinute: 0, closeHour: 6, closeMinute: 30 },
    polygonProxyTicker: "EWY",
    proxyMultiplier: 42.5,
    finnhubSymbol: "EWY",
  },
  {
    id: "idx-nikkei",
    symbol: "N225",
    yahooSymbol: "^N225",
    name: "Nikkei 225",
    nameKo: "니케이 225",
    exchange: "TSE",
    city: "Tokyo",
    cityKo: "도쿄",
    countryCode: "JP",
    isoNumeric: "392",
    currency: "JPY",
    region: "asia",
    coords: { lat: 35.6762, lng: 139.6503 },
    baselinePrice: 57011.62,
    decimals: 2,
    volatility: 0.011,
    hoursUtc: { openHour: 0, openMinute: 0, closeHour: 6, closeMinute: 0 },
    polygonProxyTicker: "EWJ",
    proxyMultiplier: 558,
    finnhubSymbol: "EWJ",
  },
  {
    id: "idx-hsi",
    symbol: "HSI",
    yahooSymbol: "^HSI",
    name: "Hang Seng",
    nameKo: "홍콩 항셍",
    exchange: "HKEX",
    city: "Hong Kong",
    cityKo: "홍콩",
    countryCode: "HK",
    isoNumeric: "344",
    currency: "HKD",
    region: "asia",
    coords: { lat: 22.3193, lng: 114.1694 },
    baselinePrice: 21966.01,
    decimals: 2,
    volatility: 0.0145,
    hoursUtc: { openHour: 1, openMinute: 30, closeHour: 8, closeMinute: 0 },
    polygonProxyTicker: "EWH",
    proxyMultiplier: 1120,
    finnhubSymbol: "EWH",
  },
  {
    id: "idx-sse",
    symbol: "SSEC",
    yahooSymbol: "000001.SS",
    name: "Shanghai Comp",
    nameKo: "상하이 종합",
    exchange: "SSE",
    city: "Shanghai",
    cityKo: "상하이",
    countryCode: "CN",
    isoNumeric: "156",
    currency: "CNY",
    region: "asia",
    coords: { lat: 31.2304, lng: 121.4737 },
    baselinePrice: 3476.47,
    decimals: 2,
    volatility: 0.0115,
    hoursUtc: { openHour: 1, openMinute: 30, closeHour: 7, closeMinute: 0 },
    polygonProxyTicker: "FXI",
    proxyMultiplier: 108,
    finnhubSymbol: "FXI",
  },
  {
    id: "idx-nifty",
    symbol: "NIFTY",
    yahooSymbol: "^NSEI",
    name: "Nifty 50",
    nameKo: "인도 니프티 50",
    exchange: "NSE",
    city: "Mumbai",
    cityKo: "뭄바이",
    countryCode: "IN",
    isoNumeric: "356",
    currency: "INR",
    region: "asia",
    coords: { lat: 19.076, lng: 72.8777 },
    baselinePrice: 25819.25,
    decimals: 2,
    volatility: 0.009,
    hoursUtc: { openHour: 3, openMinute: 45, closeHour: 10, closeMinute: 0 },
    polygonProxyTicker: "INDA",
    proxyMultiplier: 445,
    finnhubSymbol: "INDA",
  },
  {
    id: "idx-asx",
    symbol: "ASX200",
    yahooSymbol: "^AXJO",
    name: "S&P/ASX 200",
    nameKo: "호주 ASX 200",
    exchange: "ASX",
    city: "Sydney",
    cityKo: "시드니",
    countryCode: "AU",
    isoNumeric: "036",
    currency: "AUD",
    region: "asia",
    coords: { lat: -33.8688, lng: 151.2093 },
    baselinePrice: 8710.1,
    decimals: 2,
    volatility: 0.0072,
    hoursUtc: { openHour: 0, openMinute: 0, closeHour: 6, closeMinute: 0 },
    polygonProxyTicker: "EWA",
    proxyMultiplier: 325,
    finnhubSymbol: "EWA",
  },
];

export const FX_CATALOG: FxCatalogItem[] = [
  {
    id: "fx-usdkrw",
    symbol: "USD/KRW",
    yahooSymbol: "KRW=X",
    name: "US Dollar / Korean Won",
    nameKo: "달러 / 원",
    baseCurrency: "USD",
    quoteCurrency: "KRW",
    fromCity: "New York",
    fromCityKo: "뉴욕",
    toCity: "Seoul",
    toCityKo: "서울",
    fromCoords: { lat: 40.7128, lng: -74.006 },
    toCoords: { lat: 37.5665, lng: 126.978 },
    region: "asia",
    baselineRate: 1343.91,
    decimals: 2,
    volatility: 0.0052,
    spreadPips: 1.8,
    polygonTicker: "C:USDKRW",
  },
  {
    id: "fx-eurusd",
    symbol: "EUR/USD",
    yahooSymbol: "EURUSD=X",
    name: "Euro / US Dollar",
    nameKo: "유로 / 달러",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    fromCity: "Frankfurt",
    fromCityKo: "프랑크푸르트",
    toCity: "New York",
    toCityKo: "뉴욕",
    fromCoords: { lat: 50.1109, lng: 8.6821 },
    toCoords: { lat: 40.7128, lng: -74.006 },
    region: "europe",
    baselineRate: 1.0977,
    decimals: 4,
    volatility: 0.0044,
    spreadPips: 0.4,
    polygonTicker: "C:EURUSD",
  },
  {
    id: "fx-usdjpy",
    symbol: "USD/JPY",
    yahooSymbol: "JPY=X",
    name: "US Dollar / Japanese Yen",
    nameKo: "달러 / 엔",
    baseCurrency: "USD",
    quoteCurrency: "JPY",
    fromCity: "New York",
    fromCityKo: "뉴욕",
    toCity: "Tokyo",
    toCityKo: "도쿄",
    fromCoords: { lat: 40.7128, lng: -74.006 },
    toCoords: { lat: 35.6762, lng: 139.6503 },
    region: "asia",
    baselineRate: 159.18,
    decimals: 2,
    volatility: 0.0062,
    spreadPips: 0.6,
    polygonTicker: "C:USDJPY",
  },
  {
    id: "fx-gbpusd",
    symbol: "GBP/USD",
    yahooSymbol: "GBPUSD=X",
    name: "British Pound / US Dollar",
    nameKo: "파운드 / 달러",
    baseCurrency: "GBP",
    quoteCurrency: "USD",
    fromCity: "London",
    fromCityKo: "런던",
    toCity: "New York",
    toCityKo: "뉴욕",
    fromCoords: { lat: 51.5074, lng: -0.1278 },
    toCoords: { lat: 40.7128, lng: -74.006 },
    region: "europe",
    baselineRate: 1.3115,
    decimals: 4,
    volatility: 0.0048,
    spreadPips: 0.7,
    polygonTicker: "C:GBPUSD",
  },
  {
    id: "fx-usdchf",
    symbol: "USD/CHF",
    yahooSymbol: "CHF=X",
    name: "US Dollar / Swiss Franc",
    nameKo: "달러 / 스위스프랑",
    baseCurrency: "USD",
    quoteCurrency: "CHF",
    fromCity: "New York",
    fromCityKo: "뉴욕",
    toCity: "Zurich",
    toCityKo: "취리히",
    fromCoords: { lat: 40.7128, lng: -74.006 },
    toCoords: { lat: 47.3769, lng: 8.5417 },
    region: "europe",
    baselineRate: 0.8308,
    decimals: 4,
    volatility: 0.0042,
    spreadPips: 0.8,
    polygonTicker: "C:USDCHF",
  },
  {
    id: "fx-audusd",
    symbol: "AUD/USD",
    yahooSymbol: "AUDUSD=X",
    name: "Australian Dollar / USD",
    nameKo: "호주달러 / 달러",
    baseCurrency: "AUD",
    quoteCurrency: "USD",
    fromCity: "Sydney",
    fromCityKo: "시드니",
    toCity: "New York",
    toCityKo: "뉴욕",
    fromCoords: { lat: -33.8688, lng: 151.2093 },
    toCoords: { lat: 40.7128, lng: -74.006 },
    region: "asia",
    baselineRate: 0.6629,
    decimals: 4,
    volatility: 0.0058,
    spreadPips: 0.8,
    polygonTicker: "C:AUDUSD",
  },
  {
    id: "fx-usdcny",
    symbol: "USD/CNY",
    yahooSymbol: "CNY=X",
    name: "US Dollar / Chinese Yuan",
    nameKo: "달러 / 위안",
    baseCurrency: "USD",
    quoteCurrency: "CNY",
    fromCity: "New York",
    fromCityKo: "뉴욕",
    toCity: "Hong Kong",
    toCityKo: "홍콩",
    fromCoords: { lat: 40.7128, lng: -74.006 },
    toCoords: { lat: 22.3193, lng: 114.1694 },
    region: "asia",
    baselineRate: 6.6593,
    decimals: 4,
    volatility: 0.0036,
    spreadPips: 1.5,
    polygonTicker: "C:USDCNY",
  },
  {
    id: "fx-eurjpy",
    symbol: "EUR/JPY",
    yahooSymbol: "EURJPY=X",
    name: "Euro / Japanese Yen",
    nameKo: "유로 / 엔",
    baseCurrency: "EUR",
    quoteCurrency: "JPY",
    fromCity: "Frankfurt",
    fromCityKo: "프랑크푸르트",
    toCity: "Tokyo",
    toCityKo: "도쿄",
    fromCoords: { lat: 50.1109, lng: 8.6821 },
    toCoords: { lat: 35.6762, lng: 139.6503 },
    region: "europe",
    baselineRate: 174.68,
    decimals: 2,
    volatility: 0.0064,
    spreadPips: 1.1,
    polygonTicker: "C:EURJPY",
  },
  {
    id: "fx-usdsgd",
    symbol: "USD/SGD",
    yahooSymbol: "SGD=X",
    name: "US Dollar / Singapore Dollar",
    nameKo: "달러 / 싱가포르달러",
    baseCurrency: "USD",
    quoteCurrency: "SGD",
    fromCity: "London",
    fromCityKo: "런던",
    toCity: "Singapore",
    toCityKo: "싱가포르",
    fromCoords: { lat: 51.5074, lng: -0.1278 },
    toCoords: { lat: 1.3521, lng: 103.8198 },
    region: "asia",
    baselineRate: 1.2902,
    decimals: 4,
    volatility: 0.0034,
    spreadPips: 0.9,
    polygonTicker: "C:USDSGD",
  },
];

export const COMMODITY_CATALOG: CommodityCatalogItem[] = [
  {
    id: "cmd-gold",
    symbol: "XAU",
    yahooSymbol: "GC=F",
    finnhubOandaSymbol: "OANDA:XAU_USD",
    name: "Gold Futures (COMEX)",
    nameKo: "국제 금 (Gold)",
    hubName: "Perth / Global Gold Hub",
    hubNameKo: "퍼스 · 금 정련 허브",
    sector: "metals",
    colorHex: "#f59e0b",
    coords: { lat: -31.9505, lng: 115.8605 },
    baselinePrice: 3603.9,
    decimals: 2,
    unit: "USD/oz",
    volatility: 0.0085,
    polygonProxyTicker: "GLD",
    proxyMultiplier: 10.82,
    finnhubSymbol: "GLD",
  },
  {
    id: "cmd-wti",
    symbol: "WTI",
    yahooSymbol: "CL=F",
    finnhubOandaSymbol: "OANDA:WTICO_USD",
    name: "WTI Crude Oil (NYMEX)",
    nameKo: "WTI 원유",
    hubName: "Houston / Cushing",
    hubNameKo: "휴스턴 · WTI 허브",
    sector: "energy",
    colorHex: "#fb923c",
    coords: { lat: 29.7604, lng: -95.3698 },
    baselinePrice: 84.05,
    decimals: 2,
    unit: "USD/bbl",
    volatility: 0.0165,
    polygonProxyTicker: "USO",
    proxyMultiplier: 0.96,
    finnhubSymbol: "USO",
  },
  {
    id: "cmd-brent",
    symbol: "BRENT",
    yahooSymbol: "BZ=F",
    finnhubOandaSymbol: "OANDA:BCO_USD",
    name: "Brent Crude Oil (ICE)",
    nameKo: "브렌트유",
    hubName: "North Sea / Aberdeen",
    hubNameKo: "북해 · 브렌트 허브",
    sector: "energy",
    colorHex: "#f97316",
    coords: { lat: 57.1497, lng: -2.0943 },
    baselinePrice: 90.7,
    decimals: 2,
    unit: "USD/bbl",
    volatility: 0.0155,
    polygonProxyTicker: "BNO",
    proxyMultiplier: 2.55,
    finnhubSymbol: "BNO",
  },
  {
    id: "cmd-natgas",
    symbol: "NG",
    yahooSymbol: "NG=F",
    finnhubOandaSymbol: "OANDA:NATGAS_USD",
    name: "Natural Gas (NYMEX)",
    nameKo: "천연가스 (LNG)",
    hubName: "Doha / Ras Laffan",
    hubNameKo: "도하 · LNG 허브",
    sector: "energy",
    colorHex: "#38bdf8",
    coords: { lat: 25.2854, lng: 51.531 },
    baselinePrice: 3.687,
    decimals: 3,
    unit: "USD/MMBtu",
    volatility: 0.028,
    polygonProxyTicker: "UNG",
    proxyMultiplier: 0.22,
    finnhubSymbol: "UNG",
  },
  {
    id: "cmd-copper",
    symbol: "HG",
    yahooSymbol: "HG=F",
    finnhubOandaSymbol: "OANDA:XCU_USD",
    name: "High Grade Copper (COMEX)",
    nameKo: "구리 (Copper)",
    hubName: "Santiago / Escondida",
    hubNameKo: "산티아고 · 구리 허브",
    sector: "metals",
    colorHex: "#ea580c",
    coords: { lat: -33.4489, lng: -70.6693 },
    baselinePrice: 5.478,
    decimals: 3,
    unit: "USD/lb",
    volatility: 0.013,
    polygonProxyTicker: "CPER",
    proxyMultiplier: 0.16,
    finnhubSymbol: "CPER",
  },
  {
    id: "cmd-silver",
    symbol: "XAG",
    yahooSymbol: "SI=F",
    finnhubOandaSymbol: "OANDA:XAG_USD",
    name: "Silver Futures (COMEX)",
    nameKo: "국제 은 (Silver)",
    hubName: "Mexico City / Zacatecas",
    hubNameKo: "멕시코시티 · 은 허브",
    sector: "metals",
    colorHex: "#cbd5e1",
    coords: { lat: 19.4326, lng: -99.1332 },
    baselinePrice: 41.6,
    decimals: 2,
    unit: "USD/oz",
    volatility: 0.014,
    polygonProxyTicker: "SLV",
    proxyMultiplier: 1.09,
    finnhubSymbol: "SLV",
  },
  {
    id: "cmd-wheat",
    symbol: "ZW",
    yahooSymbol: "ZW=F",
    finnhubOandaSymbol: "OANDA:WHEAT_USD",
    name: "CBOT Wheat Futures",
    nameKo: "시카고 소맥 (밀)",
    hubName: "Chicago / CBOT",
    hubNameKo: "시카고 · 곡물 거래소",
    sector: "agriculture",
    colorHex: "#eab308",
    coords: { lat: 41.8781, lng: -87.6298 },
    baselinePrice: 586.5,
    decimals: 2,
    unit: "USc/bu",
    volatility: 0.0145,
    polygonProxyTicker: "WEAT",
    proxyMultiplier: 108,
    finnhubSymbol: "WEAT",
  },
  {
    id: "cmd-platinum",
    symbol: "XPT",
    yahooSymbol: "PL=F",
    finnhubOandaSymbol: "OANDA:XPT_USD",
    name: "Platinum Futures (NYMEX)",
    nameKo: "백금 (Platinum)",
    hubName: "Johannesburg / Bushveld",
    hubNameKo: "요하네스버그 · 백금 허브",
    sector: "metals",
    colorHex: "#e2e8f0",
    coords: { lat: -26.2041, lng: 28.0473 },
    baselinePrice: 1264.6,
    decimals: 2,
    unit: "USD/oz",
    volatility: 0.013,
    polygonProxyTicker: "PPLT",
    proxyMultiplier: 10.6,
    finnhubSymbol: "PPLT",
  },
];

const ALLOWED_HISTORY_SYMBOLS = new Set<string>([
  ...INDEX_CATALOG.map((i) => i.yahooSymbol),
  ...FX_CATALOG.map((f) => f.yahooSymbol),
  ...COMMODITY_CATALOG.map((c) => c.yahooSymbol),
  ...MACRO_CATALOG.map((m) => m.yahooSymbol),
]);

export function isAllowedHistorySymbol(symbol: string): boolean {
  return ALLOWED_HISTORY_SYMBOLS.has(symbol);
}

export function isExchangeOpenUtc(hours: ExchangeHoursUtc, now: Date = new Date()): boolean {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const currentMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const openMins = hours.openHour * 60 + hours.openMinute;
  const closeMins = hours.closeHour * 60 + hours.closeMinute;
  if (openMins <= closeMins) {
    return currentMins >= openMins && currentMins <= closeMins;
  }
  return currentMins >= openMins || currentMins <= closeMins;
}

export function isFxMarketOpenUtc(now: Date = new Date()): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 6) return false;
  if (day === 0 && hour < 22) return false;
  if (day === 5 && hour >= 22) return false;
  return true;
}
