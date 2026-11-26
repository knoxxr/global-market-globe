import dns from "node:dns";
import type { GeoPoint, NewsPinItem, RegionKey } from "./types";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // ignore
}

interface NewsHubRule {
  city: string;
  cityKo: string;
  region: Exclude<RegionKey, "global">;
  coords: GeoPoint;
  keywords: RegExp;
}

const NEWS_HUB_RULES: NewsHubRule[] = [
  {
    city: "Seoul",
    cityKo: "서울",
    region: "asia",
    coords: { lat: 37.5665, lng: 126.978 },
    keywords: /\b(korea|korean|seoul|kospi|samsung|hyundai|sk hynix|won|krw|bok)\b/i,
  },
  {
    city: "Tokyo",
    cityKo: "도쿄",
    region: "asia",
    coords: { lat: 35.6762, lng: 139.6503 },
    keywords: /\b(japan|japanese|tokyo|nikkei|boj|yen|jpy|toyota|sony|softbank)\b/i,
  },
  {
    city: "Beijing / Shanghai",
    cityKo: "중국 · 상하이",
    region: "asia",
    coords: { lat: 31.2304, lng: 121.4737 },
    keywords: /\b(china|chinese|beijing|shanghai|hong kong|hang seng|pboc|yuan|alibaba|tencent|byd|ev)\b/i,
  },
  {
    city: "Mumbai",
    cityKo: "인도 · 뭄바이",
    region: "asia",
    coords: { lat: 19.076, lng: 72.8777 },
    keywords: /\b(india|indian|mumbai|nifty|sensex|rupee|rbi|modi)\b/i,
  },
  {
    city: "Sydney",
    cityKo: "호주 · 시드니",
    region: "asia",
    coords: { lat: -33.8688, lng: 151.2093 },
    keywords: /\b(australia|australian|sydney|rba|asx|aussie|mining|iron ore)\b/i,
  },
  {
    city: "London",
    cityKo: "런던",
    region: "europe",
    coords: { lat: 51.5074, lng: -0.1278 },
    keywords: /\b(uk|britain|british|london|ftse|boe|bank of england|pound|sterling|gbp)\b/i,
  },
  {
    city: "Frankfurt",
    cityKo: "유럽 · 프랑크푸르트",
    region: "europe",
    coords: { lat: 50.1109, lng: 8.6821 },
    keywords: /\b(europe|european|eurozone|euro|ecb|germany|german|dax|france|paris|eu|brussels|swiss|switzerland)\b/i,
  },
  {
    city: "Middle East / Energy",
    cityKo: "중동 · 에너지 허브",
    region: "commodities",
    coords: { lat: 25.2854, lng: 51.531 },
    keywords: /\b(oil|crude|opec|brent|wti|saudi|qatar|lng|natural gas|middle east|iran|israel|energy|gold|silver|copper)\b/i,
  },
  {
    city: "São Paulo",
    cityKo: "남미 · 상파울루",
    region: "americas",
    coords: { lat: -23.5505, lng: -46.6333 },
    keywords: /\b(brazil|latin america|mexico|argentina|chile|peso|real)\b/i,
  },
  {
    city: "Washington / Fed",
    cityKo: "워싱턴 · 연준",
    region: "americas",
    coords: { lat: 38.9072, lng: -77.0369 },
    keywords: /\b(fed|federal reserve|powell|treasury|tariff|white house|trump|congress|cpi|inflation|jobs report|gdp|recession|rate cut|rates)\b/i,
  },
  {
    city: "New York",
    cityKo: "뉴욕 · 월스트리트",
    region: "americas",
    coords: { lat: 40.7128, lng: -74.006 },
    keywords: /\b(wall street|s&p|nasdaq|dow|nyse|nvidia|apple|microsoft|google|meta|amazon|tesla|ai|earnings|stocks|bitcoin|crypto)\b/i,
  },
];

const BULLISH_RE = /\b(surge|rally|jump|gain|soar|record high|beat|growth|boom|cut rates|rebound|rise|rises|up)\b/i;
const BEARISH_RE = /\b(plunge|slump|drop|fall|falls|crash|tumble|sell-off|selloff|warning|tariff|fear|war|crisis|recession|cut forecast|sink)\b/i;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classifySentiment(text: string): NewsPinItem["sentiment"] {
  if (BEARISH_RE.test(text)) return "bearish";
  if (BULLISH_RE.test(text)) return "bullish";
  return "neutral";
}

function matchHub(text: string, fallbackIndex: number): NewsHubRule {
  for (const rule of NEWS_HUB_RULES) {
    if (rule.keywords.test(text)) return rule;
  }
  // Default financial headlines to New York / London / Frankfurt rotation
  const defaults = [NEWS_HUB_RULES[10], NEWS_HUB_RULES[5], NEWS_HUB_RULES[6]];
  return defaults[fallbackIndex % defaults.length];
}

interface RawHeadline {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: number;
}

function parseRssItems(xml: string, sourceName: string): RawHeadline[] {
  const items: RawHeadline[] = [];
  const itemMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemMatches.slice(0, 18)) {
    const titleMatch = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
    const descMatch = block.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i);
    const dateMatch = block.match(/<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i);

    const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : "";
    const url = linkMatch ? decodeXmlEntities(linkMatch[1]) : "";
    if (!title || !url || !url.startsWith("http")) continue;

    const summary = descMatch ? decodeXmlEntities(descMatch[1]).slice(0, 180) : "";
    const parsedTime = dateMatch ? Date.parse(decodeXmlEntities(dateMatch[1])) : NaN;
    const publishedAt = Number.isFinite(parsedTime) ? parsedTime : Date.now();

    items.push({ title, summary, source: sourceName, url, publishedAt });
  }
  return items;
}

async function fetchTextSafe(url: string, timeoutMs = 4000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

declare global {
  var __GLOBAL_NEWS_CACHE__:
    | { items: NewsPinItem[]; storedAt: number; inflight: Promise<NewsPinItem[]> | null }
    | undefined;
}

const NEWS_CACHE_TTL_MS = 180_000; // 3 minutes

export async function getGeoMappedNews(): Promise<NewsPinItem[]> {
  if (!globalThis.__GLOBAL_NEWS_CACHE__) {
    globalThis.__GLOBAL_NEWS_CACHE__ = { items: [], storedAt: 0, inflight: null };
  }
  const cache = globalThis.__GLOBAL_NEWS_CACHE__;
  if (cache.items.length > 0 && Date.now() - cache.storedAt < NEWS_CACHE_TTL_MS) {
    return cache.items;
  }
  if (cache.inflight) return cache.inflight;

  const task = (async (): Promise<NewsPinItem[]> => {
    try {
      const raw: RawHeadline[] = [];

      // 1) Finnhub General Market News (if API key configured)
      const finnhubKey = process.env.FINNHUB_API_KEY?.trim();
      if (finnhubKey) {
        const txt = await fetchTextSafe(
          `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(finnhubKey)}`,
          3500
        );
        if (txt) {
          try {
            const arr = JSON.parse(txt) as Array<{
              headline?: string;
              summary?: string;
              source?: string;
              url?: string;
              datetime?: number;
            }>;
            for (const n of arr.slice(0, 15)) {
              if (n.headline && n.url) {
                raw.push({
                  title: n.headline.trim(),
                  summary: (n.summary ?? "").trim().slice(0, 180),
                  source: n.source || "Finnhub",
                  url: n.url,
                  publishedAt: n.datetime ? n.datetime * 1000 : Date.now(),
                });
              }
            }
          } catch {
            // ignore JSON parse failure
          }
        }
      }

      // 2) Key-free Public Finance RSS Feeds (CNBC Finance + CNBC World + BBC Business)
      const rssFeeds: Array<[string, string]> = [
        [
          "CNBC Finance",
          "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664",
        ],
        [
          "CNBC World",
          "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362",
        ],
        ["BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml"],
      ];

      const xmlResults = await Promise.all(
        rssFeeds.map(async ([name, url]) => {
          const xml = await fetchTextSafe(url, 4000);
          return xml ? parseRssItems(xml, name) : [];
        })
      );
      for (const batch of xmlResults) raw.push(...batch);

      // Sort newest first & deduplicate by normalized title
      raw.sort((a, b) => b.publishedAt - a.publishedAt);
      const seenTitles = new Set<string>();
      const hubCounts = new Map<string, number>();
      const mapped: NewsPinItem[] = [];

      for (let i = 0; i < raw.length && mapped.length < 12; i++) {
        const item = raw[i];
        const normKey = item.title.toLowerCase().slice(0, 48);
        if (seenTitles.has(normKey)) continue;
        seenTitles.add(normKey);

        const combinedText = `${item.title} ${item.summary}`;
        const hub = matchHub(combinedText, i);
        const countForHub = hubCounts.get(hub.city) ?? 0;
        // Max 2 news pins per city so headlines spread cleanly around the globe
        if (countForHub >= 2) continue;
        hubCounts.set(hub.city, countForHub + 1);

        // Slight offset when a hub has a 2nd news pin so markers never overlap
        const latOffset = countForHub === 0 ? 1.4 : -2.2;
        const lngOffset = countForHub === 0 ? 1.8 : -2.4;

        mapped.push({
          id: `news-${i}-${hub.city.toLowerCase().replace(/[^a-z]/g, "")}`,
          title: item.title,
          summary: item.summary,
          source: item.source,
          url: item.url,
          publishedAt: item.publishedAt,
          city: hub.city,
          cityKo: hub.cityKo,
          region: hub.region,
          coords: {
            lat: hub.coords.lat + latOffset,
            lng: hub.coords.lng + lngOffset,
          },
          sentiment: classifySentiment(combinedText),
        });
      }

      if (mapped.length > 0) {
        cache.items = mapped;
        cache.storedAt = Date.now();
      }
      return cache.items;
    } finally {
      cache.inflight = null;
    }
  })();

  cache.inflight = task;
  return task;
}
