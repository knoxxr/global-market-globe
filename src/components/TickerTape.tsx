"use client";

import React from "react";
import type { AnyMarketAsset } from "@/lib/market/types";
import { formatAssetPrice } from "./AssetDetailCard";

interface TickerTapeProps {
  items: AnyMarketAsset[];
  onSelect: (asset: AnyMarketAsset) => void;
}

export default function TickerTape({ items, onSelect }: TickerTapeProps) {
  if (items.length === 0) return null;

  // Duplicate list once for seamless continuous marquee loop
  const doubled = [...items, ...items];

  return (
    <div className="ticker-bar" aria-label="실시간 글로벌 시세 티커">
      <div className="ticker-track">
        {doubled.map((item, idx) => {
          const isPositive = item.changePercent >= 0;
          return (
            <button
              key={`${item.id}-${idx}`}
              type="button"
              className="ticker-item"
              onClick={() => onSelect(item)}
            >
              <span className="ticker-sym">{item.symbol}</span>
              <span className="ticker-price mono-num">
                {formatAssetPrice(item.price, item.decimals)}
              </span>
              <span className={`ticker-chg mono-num ${isPositive ? "text-up" : "text-down"}`}>
                {isPositive ? "+" : ""}
                {item.changePercent.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
