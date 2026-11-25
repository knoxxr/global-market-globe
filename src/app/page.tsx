import MarketGlobeApp from "@/components/MarketGlobeApp";
import { getMarketSnapshot } from "@/lib/market/service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialSnapshot = await getMarketSnapshot();
  return <MarketGlobeApp initialSnapshot={initialSnapshot} />;
}
