"use client";

import React, { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type {
  AnyMarketAsset,
  AssetCategory,
  CommodityAsset,
  EquityIndexAsset,
  FxPairAsset,
} from "@/lib/market/types";
import { formatAssetPrice } from "./AssetDetailCard";
import Sparkline from "./Sparkline";

interface WatchlistPanelProps {
  indices: EquityIndexAsset[];
  fx: FxPairAsset[];
  commodities: CommodityAsset[];
  activeFilter: "all" | AssetCategory;
  selectedAssetId: string | null;
  flashedIds: Record<string, "up" | "down">;
  onChangeFilter: (filter: "all" | AssetCategory) => void;
  onSelectAsset: (asset: AnyMarketAsset) => void;
}

const TABS: Array<{ key: "all" | AssetCategory; label: string }> = [
  { key: "all", label: "전체" },
  { key: "index", label: "주가지수" },
  { key: "fx", label: "외환" },
  { key: "commodity", label: "원자재" },
];

export default function WatchlistPanel({
  indices,
  fx,
  commodities,
  activeFilter,
  selectedAssetId,
  flashedIds,
  onChangeFilter,
  onSelectAsset,
}: WatchlistPanelProps) {
  const [query, setQuery] = useState("");

  const filteredAssets = useMemo(() => {
    const base: AnyMarketAsset[] =
      activeFilter === "index"
        ? indices
        : activeFilter === "fx"
        ? fx
        : activeFilter === "commodity"
        ? commodities
        : [...indices, ...fx, ...commodities];

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
  }, [indices, fx, commodities, activeFilter, query]);

  return (
    <div className="watchlist-body">
      <div className="watchlist-controls">
        <div className="segmented-tabs" role="tablist" aria-label="자산 카테고리 필터">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeFilter === tab.key}
              className={`seg-tab ${activeFilter === tab.key ? "is-active" : ""}`}
              onClick={() => onChangeFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="티커, 도시, 종목 검색 (예: KOSPI, USD/KRW, 금)"
            className="search-input"
            aria-label="글로벌 종목 검색"
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
        {filteredAssets.length === 0 ? (
          <div className="watchlist-empty">일치하는 시장 종목이 없습니다.</div>
        ) : (
          filteredAssets.map((item) => {
            const isPositive = item.changePercent >= 0;
            const isSelected = selectedAssetId === item.id;
            const flash = flashedIds[item.id];
            const subtitle =
              item.category === "index"
                ? `${item.cityKo} · ${item.exchange}`
                : item.category === "fx"
                ? `${item.fromCityKo} → ${item.toCityKo}`
                : item.hubNameKo;

            return (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={`market-row ${isSelected ? "is-selected" : ""} ${
                  flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : ""
                }`}
                onClick={() => onSelectAsset(item)}
              >
                <div className="row-left">
                  <div className="row-title-line">
                    <span className={`row-indicator ind-${item.category}`} />
                    <span className="row-symbol">{item.symbol}</span>
                    {item.category === "index" && item.isOpen && (
                      <span className="live-mini-dot" title="정규장 개장중" />
                    )}
                  </div>
                  <div className="row-sub">
                    {item.nameKo} · <span className="row-loc">{subtitle}</span>
                  </div>
                </div>

                <div className="row-spark">
                  <Sparkline
                    data={item.sparkline}
                    positive={isPositive}
                    width={54}
                    height={20}
                    showArea={false}
                  />
                </div>

                <div className="row-right mono-num">
                  <div className="row-price">{formatAssetPrice(item.price, item.decimals)}</div>
                  <div className={`row-pct ${isPositive ? "text-up" : "text-down"}`}>
                    {isPositive ? "+" : ""}
                    {item.changePercent.toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
