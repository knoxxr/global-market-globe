import MarketGlobeApp from "@/components/MarketGlobeApp";
import { getGeoMappedNews } from "@/lib/market/news";
import { getMarketSnapshot } from "@/lib/market/service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [initialSnapshot, initialNews] = await Promise.all([
    getMarketSnapshot(),
    getGeoMappedNews().catch(() => []),
  ]);

  return (
    <MarketGlobeApp
      initialSnapshot={initialSnapshot}
      initialNews={initialNews}
    />
  );
}
