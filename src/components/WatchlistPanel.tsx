"use client";

import React, { useMemo, useState } from "react";
import { Bell, Newspaper, Search, Star, X } from "lucide-react";
import type {
  AnyMarketAsset,
  AssetCategory,
  CommodityAsset,
  EquityIndexAsset,
  FxPairAsset,
  NewsPinItem,
  PriceAlert,
} from "@/lib/market/types";
import { formatAssetPrice } from "./AssetDetailCard";
import Sparkline from "./Sparkline";

export type WatchlistTab = "all" | AssetCategory | "favorites" | "news";

interface WatchlistPanelProps {
  indices: EquityIndexAsset[];
  fx: FxPairAsset[];
  commodities: CommodityAsset[];
  newsItems: NewsPinItem[];
  activeTab: WatchlistTab;
  selectedAssetId: string | null;
  selectedNewsId: string | null;
  favorites: string[];
  alerts: PriceAlert[];
  flashedIds: Record<string, "up" | "down">;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onChangeTab: (tab: WatchlistTab) => void;
  onToggleFavorite: (assetId: string) => void;
  onSelectAsset: (asset: AnyMarketAsset) => void;
  onSelectNews: (news: NewsPinItem) => void;
}

const TABS: Array<{ key: WatchlistTab; label: string }> = [
  { key: "all", label: "전체" },
  { key: "index", label: "지수" },
  { key: "fx", label: "외환" },
  { key: "commodity", label: "원자재" },
  { key: "favorites", label: "관심" },
  { key: "news", label: "속보" },
];

function formatNewsAge(ts: number): string {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}시간 전` : `${Math.round(h / 24)}일 전`;
}

export default function WatchlistPanel({
  indices,
  fx,
  commodities,
  newsItems,
  activeTab,
  selectedAssetId,
  selectedNewsId,
  favorites,
  alerts,
  flashedIds,
  searchInputRef,
  onChangeTab,
  onToggleFavorite,
  onSelectAsset,
  onSelectNews,
}: WatchlistPanelProps) {
  const [query, setQuery] = useState("");
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const alertedAssetIds = useMemo(
    () => new Set(alerts.map((a) => a.assetId)),
    [alerts]
  );

  const filteredAssets = useMemo(() => {
    const all: AnyMarketAsset[] = [...indices, ...fx, ...commodities];
    const base: AnyMarketAsset[] =
      activeTab === "index"
        ? indices
        : activeTab === "fx"
        ? fx
        : activeTab === "commodity"
        ? commodities
        : activeTab === "favorites"
        ? all.filter((a) => favoriteSet.has(a.id))
        : all;

    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (item) =>
        item.symbol.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.nameKo.toLowerCase().includes(q) ||
        (item.category === "index" &&
          (item.city.toLowerCase().includes(q) || item.cityKo.toLowerCase().includes(q))) ||
        (item.category === "commodity" && item.hubNameKo.toLowerCase().includes(q))
    );
  }, [indices, fx, commodities, activeTab, favoriteSet, query]);

  const filteredNews = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return newsItems;
    return newsItems.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.cityKo.toLowerCase().includes(q) ||
        n.source.toLowerCase().includes(q)
    );
  }, [newsItems, query]);

  return (
    <div className="watchlist-body">
      <div className="watchlist-controls">
        <div className="segmented-tabs segmented-tabs-6" role="tablist" aria-label="자산 및 속보 탭">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`seg-tab ${activeTab === tab.key ? "is-active" : ""}`}
              onClick={() => onChangeTab(tab.key)}
            >
              {tab.key === "favorites" && favorites.length > 0
                ? `${tab.label}(${favorites.length})`
                : tab.label}
            </button>
          ))}
        </div>

        <div className="search-box">
          <Search size={14} className="search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              activeTab === "news"
                ? "속보 키워드, 도시 검색 (예: Fed, Oil, 서울)"
                : "종목·도시 검색 (/ 단축키)"
            }
            className="search-input"
            aria-label="글로벌 종목 및 속보 검색"
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="watchlist-scroll" role="list">
        {activeTab === "news" ? (
          filteredNews.length === 0 ? (
            <div className="watchlist-empty">표시할 글로벌 속보가 없습니다.</div>
          ) : (
            filteredNews.map((item) => (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={`news-list-row ${selectedNewsId === item.id ? "is-selected" : ""}`}
                onClick={() => onSelectNews(item)}
              >
                <div className="news-row-top">
                  <span className={`news-row-city sent-${item.sentiment}`}>
                    <Newspaper size={11} />
                    {item.cityKo}
                  </span>
                  <span className="news-row-meta">
                    {item.source} · {formatNewsAge(item.publishedAt)}
                  </span>
                </div>
                <div className="news-row-title">{item.title}</div>
              </button>
            ))
          )
        ) : filteredAssets.length === 0 ? (
          <div className="watchlist-empty">
            {activeTab === "favorites"
              ? "관심종목이 비어 있습니다. 종목의 ★ 아이콘을 눌러 추가하세요."
              : "일치하는 시장 종목이 없습니다."}
          </div>
        ) : (
          filteredAssets.map((item) => {
            const isPositive = item.changePercent >= 0;
            const isSelected = selectedAssetId === item.id;
            const isFav = favoriteSet.has(item.id);
            const hasAlert = alertedAssetIds.has(item.id);
            const flash = flashedIds[item.id];
            const subtitle =
              item.category === "index"
                ? `${item.cityKo} · ${item.exchange}`
                : item.category === "fx"
                ? `${item.fromCityKo} → ${item.toCityKo}`
                : item.hubNameKo;

            return (
              <div
                key={item.id}
                role="listitem"
                className={`market-row-wrap ${isSelected ? "is-selected" : ""} ${
                  flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : ""
                }`}
              >
                <button
                  type="button"
                  className={`row-star-btn ${isFav ? "is-fav" : ""}`}
                  onClick={() => onToggleFavorite(item.id)}
                  aria-label={`${item.nameKo} 관심종목 토글`}
                  title={isFav ? "관심 해제" : "관심 추가"}
                >
                  <Star size={12} fill={isFav ? "currentColor" : "none"} />
                </button>

                <button
                  type="button"
                  className="market-row-main"
                  onClick={() => onSelectAsset(item)}
                >
                  <div className="row-left">
                    <div className="row-title-line">
                      <span className={`row-indicator ind-${item.category}`} />
                      <span className="row-symbol">{item.symbol}</span>
                      {item.category === "index" && item.isOpen && (
                        <span className="live-mini-dot" title="정규장 개장중" />
                      )}
                      {hasAlert && <Bell size={10} className="row-alert-icon" />}
                    </div>
                    <div className="row-sub">
                      {item.nameKo} · <span className="row-loc">{subtitle}</span>
                    </div>
                  </div>

                  <div className="row-spark">
                    <Sparkline
                      data={item.sparkline}
                      positive={isPositive}
                      width={48}
                      height={19}
                      showArea={false}
                    />
                  </div>

                  <div className="row-right mono-num">
                    <div className="row-price">
                      {formatAssetPrice(item.price, item.decimals)}
                    </div>
                    <div className={`row-pct ${isPositive ? "text-up" : "text-down"}`}>
                      {isPositive ? "+" : ""}
                      {item.changePercent.toFixed(2)}%
                    </div>
                  </div>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
