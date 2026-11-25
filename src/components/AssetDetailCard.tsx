"use client";

import React from "react";
import { ArrowRight, Clock, Compass, Globe2, X } from "lucide-react";
import type { AnyMarketAsset } from "@/lib/market/types";
import Sparkline from "./Sparkline";

interface AssetDetailCardProps {
  asset: AnyMarketAsset;
  onClose: () => void;
  onFocusOnGlobe: (asset: AnyMarketAsset) => void;
}

export function formatAssetPrice(price: number, decimals: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function AssetDetailCard({
  asset,
  onClose,
  onFocusOnGlobe,
}: AssetDetailCardProps) {
  const isPositive = asset.changePercent >= 0;
  const rangeSpan = Math.max(asset.dayHigh - asset.dayLow, 1e-6);
  const rangePct = Math.max(
    0,
    Math.min(100, ((asset.price - asset.dayLow) / rangeSpan) * 100)
  );

  const categoryBadge =
    asset.category === "index"
      ? "주가지수"
      : asset.category === "fx"
      ? "실시간 외환"
      : "원자재";

  const sourceLabel =
    asset.source === "polygon"
      ? "Polygon.io"
      : asset.source === "finnhub"
      ? "Finnhub"
      : asset.source === "hybrid"
      ? "Polygon + Finnhub"
      : "실시간 시뮬레이션";

  return (
    <aside className="detail-card" aria-label={`${asset.nameKo} 상세 정보`}>
      <div className="detail-header">
        <div className="detail-title-group">
          <div className="detail-badges">
            <span className={`cat-tag cat-tag-${asset.category}`}>{categoryBadge}</span>
            <span className={`session-tag ${asset.isOpen ? "is-open" : "is-closed"}`}>
              <span className="session-dot" />
              {asset.isOpen ? "LIVE 거래중" : "장마감"}
            </span>
          </div>
          <h2 className="detail-name">
            {asset.nameKo} <span className="detail-symbol">{asset.symbol}</span>
          </h2>
          <p className="detail-subtitle">
            {asset.category === "index" &&
              `${asset.exchange} · ${asset.cityKo} (${asset.city})`}
            {asset.category === "fx" && (
              <span className="corridor-inline">
                {asset.fromCityKo} <ArrowRight size={12} /> {asset.toCityKo} · 스프레드{" "}
                {asset.spreadPips} pips
              </span>
            )}
            {asset.category === "commodity" && `${asset.hubNameKo} · ${asset.unit}`}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="상세 패널 닫기"
        >
          <X size={16} />
        </button>
      </div>

      <div className="detail-price-row">
        <div className="detail-price-block">
          <div className="detail-price mono-num">
            {formatAssetPrice(asset.price, asset.decimals)}
            <span className="detail-unit">
              {asset.category === "index" ? asset.currency : asset.unit}
            </span>
          </div>
          <div className={`detail-delta mono-num ${isPositive ? "text-up" : "text-down"}`}>
            {isPositive ? "+" : ""}
            {formatAssetPrice(asset.change, asset.decimals)} ({isPositive ? "+" : ""}
            {asset.changePercent.toFixed(2)}%)
          </div>
        </div>
        <div className="detail-spark-wrap">
          <Sparkline data={asset.sparkline} positive={isPositive} width={112} height={42} />
        </div>
      </div>

      <div className="detail-range-box">
        <div className="range-labels mono-num">
          <span>저가 {formatAssetPrice(asset.dayLow, asset.decimals)}</span>
          <span className="range-mid-label">일중 변동폭</span>
          <span>고가 {formatAssetPrice(asset.dayHigh, asset.decimals)}</span>
        </div>
        <div className="range-track">
          <div
            className={`range-fill ${isPositive ? "fill-up" : "fill-down"}`}
            style={{ width: `${rangePct}%` }}
          />
          <div className="range-thumb" style={{ left: `${rangePct}%` }} />
        </div>
      </div>

      <div className="detail-meta-grid">
        <div className="meta-cell">
          <span className="meta-label">전일 종가</span>
          <span className="meta-val mono-num">
            {formatAssetPrice(asset.prevClose, asset.decimals)}
          </span>
        </div>
        <div className="meta-cell">
          <span className="meta-label">데이터 소스</span>
          <span className="meta-val">{sourceLabel}</span>
        </div>
        {asset.category === "index" && (
          <div className="meta-cell">
            <span className="meta-label">정규장 (UTC)</span>
            <span className="meta-val mono-num">
              <Clock size={11} style={{ display: "inline", marginRight: 4 }} />
              {String(asset.hoursUtc.openHour).padStart(2, "0")}:
              {String(asset.hoursUtc.openMinute).padStart(2, "0")}–
              {String(asset.hoursUtc.closeHour).padStart(2, "0")}:
              {String(asset.hoursUtc.closeMinute).padStart(2, "0")}
            </span>
          </div>
        )}
        {asset.category === "fx" && (
          <div className="meta-cell">
            <span className="meta-label">흐름 방향</span>
            <span className="meta-val">
              {isPositive ? `${asset.baseCurrency} 강세` : `${asset.quoteCurrency} 강세`}
            </span>
          </div>
        )}
        {asset.category === "commodity" && (
          <div className="meta-cell">
            <span className="meta-label">섹터</span>
            <span className="meta-val">
              {asset.sector === "energy"
                ? "에너지"
                : asset.sector === "metals"
                ? "귀금속·산업금속"
                : "농산물"}
            </span>
          </div>
        )}
        <div className="meta-cell">
          <span className="meta-label">지구본 좌표</span>
          <span className="meta-val mono-num">
            <Compass size={11} style={{ display: "inline", marginRight: 4 }} />
            {asset.category === "fx"
              ? `${asset.fromCity} ↔ ${asset.toCity}`
              : `${asset.coords.lat.toFixed(1)}°, ${asset.coords.lng.toFixed(1)}°`}
          </span>
        </div>
      </div>

      <div className="detail-actions">
        <button
          type="button"
          className="btn-secondary full-width"
          onClick={() => onFocusOnGlobe(asset)}
        >
          <Globe2 size={14} />
          지구본에서 위치 재초점
        </button>
      </div>
    </aside>
  );
}
