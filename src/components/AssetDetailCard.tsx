"use client";

import React, { useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Bell,
  Clock,
  Compass,
  Globe2,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { AnyMarketAsset, PriceAlert } from "@/lib/market/types";
import InteractiveChart from "./InteractiveChart";

interface AssetDetailCardProps {
  asset: AnyMarketAsset;
  allAssets: AnyMarketAsset[];
  isFavorite: boolean;
  alerts: PriceAlert[];
  onToggleFavorite: (assetId: string) => void;
  onAddAlert: (asset: AnyMarketAsset, direction: "above" | "below", targetPrice: number) => void;
  onRemoveAlert: (alertId: string) => void;
  onShareView: () => void;
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
  allAssets,
  isFavorite,
  alerts,
  onToggleFavorite,
  onAddAlert,
  onRemoveAlert,
  onShareView,
  onClose,
  onFocusOnGlobe,
}: AssetDetailCardProps) {
  const isPositive = asset.changePercent >= 0;
  const rangeSpan = Math.max(asset.dayHigh - asset.dayLow, 1e-6);
  const rangePct = Math.max(
    0,
    Math.min(100, ((asset.price - asset.dayLow) / rangeSpan) * 100)
  );

  // FX Calculator local state
  const [fxAmount, setFxAmount] = useState("1000");
  const [fxReversed, setFxReversed] = useState(false);

  // Price Alert form state
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("above");
  const [alertPriceInput, setAlertPriceInput] = useState(() =>
    asset.price.toFixed(asset.decimals)
  );

  const assetAlerts = alerts.filter((a) => a.assetId === asset.id);

  const categoryBadge =
    asset.category === "index"
      ? "주가지수"
      : asset.category === "fx"
      ? "실시간 외환"
      : "원자재";

  const sourceLabel =
    asset.source === "polygon"
      ? "Polygon.io Live"
      : asset.source === "finnhub"
      ? "Finnhub Live"
      : asset.source === "yahoo"
      ? `실시간 (${asset.feedSymbol})`
      : asset.source === "frankfurter"
      ? "ECB 환율 피드"
      : asset.source === "hybrid"
      ? "Multi-API Live"
      : "오프라인 폴백";

  const quoteTimeText = asset.marketTime
    ? new Date(asset.marketTime).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "—";

  const parsedFxAmount = Number(fxAmount.replace(/,/g, ""));
  const validFxNum = Number.isFinite(parsedFxAmount) && parsedFxAmount >= 0 ? parsedFxAmount : 0;
  const convertedFx =
    asset.category === "fx"
      ? fxReversed
        ? validFxNum / Math.max(asset.price, 1e-6)
        : validFxNum * asset.price
      : 0;

  const handleSubmitAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(alertPriceInput);
    if (!Number.isFinite(target) || target <= 0) return;
    onAddAlert(asset, alertDirection, target);
    setShowAlertForm(false);
  };

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

        <div className="detail-header-actions">
          <button
            type="button"
            className={`icon-btn ${isFavorite ? "is-star-active" : ""}`}
            onClick={() => onToggleFavorite(asset.id)}
            title={isFavorite ? "관심종목 해제" : "관심종목 추가"}
            aria-label="관심종목 토글"
          >
            <Star size={14} fill={isFavorite ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            className={`icon-btn ${showAlertForm || assetAlerts.length > 0 ? "is-accent" : ""}`}
            onClick={() => setShowAlertForm((v) => !v)}
            title="목표가 알림 설정"
            aria-label="목표가 알림 설정"
          >
            <Bell size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onShareView}
            title="현재 뷰 딥링크 복사"
            aria-label="현재 뷰 링크 공유"
          >
            <Share2 size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="상세 패널 닫기"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Live Price Block */}
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
      </div>

      {/* FX Intuitive Weak -> Strong Direction Banner */}
      {asset.category === "fx" && (
        <div className="fx-strength-banner" aria-label="통화 강약 방향">
          <span className="fx-pill-weak">
            약세 {isPositive ? asset.quoteCurrency : asset.baseCurrency} (
            {isPositive ? asset.toCityKo : asset.fromCityKo})
          </span>
          <ArrowRight size={13} className="fx-banner-arrow" />
          <span className="fx-pill-strong">
            강세 {isPositive ? asset.baseCurrency : asset.quoteCurrency} (
            {isPositive ? asset.fromCityKo : asset.toCityKo})
          </span>
        </div>
      )}

      {/* Interactive Multi-Range Chart (1D / 1W / 1M / 3M + 2-Asset Compare) */}
      <InteractiveChart asset={asset} compareCandidates={allAssets} />

      {/* Price Alert Creator & Active Alerts */}
      {(showAlertForm || assetAlerts.length > 0) && (
        <div className="alert-panel">
          {showAlertForm && (
            <form className="alert-form" onSubmit={handleSubmitAlert}>
              <select
                value={alertDirection}
                onChange={(e) => setAlertDirection(e.target.value as "above" | "below")}
                className="alert-select"
                aria-label="알림 조건 방향"
              >
                <option value="above">이상 (≥)</option>
                <option value="below">이하 (≤)</option>
              </select>
              <input
                type="number"
                step="any"
                value={alertPriceInput}
                onChange={(e) => setAlertPriceInput(e.target.value)}
                className="alert-input mono-num"
                placeholder="목표가"
                aria-label="목표가 입력"
              />
              <button type="submit" className="alert-save-btn">
                등록
              </button>
            </form>
          )}
          {assetAlerts.length > 0 && (
            <div className="alert-chip-list">
              {assetAlerts.map((al) => (
                <div key={al.id} className={`alert-chip ${al.triggered ? "is-triggered" : ""}`}>
                  <span className="mono-num">
                    {al.direction === "above" ? "≥" : "≤"}{" "}
                    {formatAssetPrice(al.targetPrice, al.decimals)}
                    {al.triggered ? " (도달)" : ""}
                  </span>
                  <button
                    type="button"
                    className="alert-del-btn"
                    onClick={() => onRemoveAlert(al.id)}
                    aria-label="알림 삭제"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FX Instant Currency Converter */}
      {asset.category === "fx" && (
        <div className="fx-calc-box">
          <div className="fx-calc-header">
            <span>실시간 환율 계산기</span>
            <button
              type="button"
              className="fx-swap-btn"
              onClick={() => setFxReversed((v) => !v)}
              title="통화 방향 전환"
            >
              <ArrowLeftRight size={12} />
              전환
            </button>
          </div>
          <div className="fx-calc-row">
            <div className="fx-calc-input-wrap">
              <input
                type="number"
                inputMode="decimal"
                value={fxAmount}
                onChange={(e) => setFxAmount(e.target.value)}
                className="fx-calc-input mono-num"
                aria-label="환산 금액 입력"
              />
              <span className="fx-calc-ccy">
                {fxReversed ? asset.quoteCurrency : asset.baseCurrency}
              </span>
            </div>
            <span className="fx-calc-eq">=</span>
            <div className="fx-calc-result mono-num">
              <strong>
                {convertedFx.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: fxReversed ? 4 : 2,
                })}
              </strong>
              <span className="fx-calc-ccy">
                {fxReversed ? asset.baseCurrency : asset.quoteCurrency}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Intraday Range Bar */}
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

      {/* Metadata Grid */}
      <div className="detail-meta-grid">
        <div className="meta-cell">
          <span className="meta-label">전일 종가</span>
          <span className="meta-val mono-num">
            {formatAssetPrice(asset.prevClose, asset.decimals)}
          </span>
        </div>
        <div className="meta-cell">
          <span className="meta-label">실제 시세 소스</span>
          <span className="meta-val">{sourceLabel}</span>
        </div>
        {asset.category === "index" && (
          <div className="meta-cell">
            <span className="meta-label">정규장 (UTC) · 호가</span>
            <span className="meta-val mono-num">
              <Clock size={11} style={{ display: "inline", marginRight: 4 }} />
              {String(asset.hoursUtc.openHour).padStart(2, "0")}:
              {String(asset.hoursUtc.openMinute).padStart(2, "0")}–
              {String(asset.hoursUtc.closeHour).padStart(2, "0")}:
              {String(asset.hoursUtc.closeMinute).padStart(2, "0")} · {quoteTimeText}
            </span>
          </div>
        )}
        {asset.category === "fx" && (
          <div className="meta-cell">
            <span className="meta-label">흐름 · 호가시각</span>
            <span className="meta-val">
              {isPositive ? `${asset.baseCurrency} 강세` : `${asset.quoteCurrency} 강세`} ·{" "}
              {quoteTimeText}
            </span>
          </div>
        )}
        {asset.category === "commodity" && (
          <div className="meta-cell">
            <span className="meta-label">섹터 · 호가시각</span>
            <span className="meta-val">
              {asset.sector === "energy"
                ? "에너지"
                : asset.sector === "metals"
                ? "귀금속·산업금속"
                : "농산물"}{" "}
              · {quoteTimeText}
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
