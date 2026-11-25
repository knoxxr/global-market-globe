"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ChevronDown,
  ChevronUp,
  Globe2,
  ListFilter,
  Pause,
  Play,
  ShieldCheck,
  SunMoon,
} from "lucide-react";
import { REGION_PRESETS } from "@/lib/market/catalog";
import type {
  AnyMarketAsset,
  AssetCategory,
  MarketSnapshot,
  RegionKey,
  StreamEventPayload,
} from "@/lib/market/types";
import type { GlobeFocusTarget } from "./GlobeCanvas";
import { getMidpointCoords } from "./GlobeCanvas";
import AssetDetailCard from "./AssetDetailCard";
import TelemetryModal, { type TransportMode } from "./TelemetryModal";
import TickerTape from "./TickerTape";
import WatchlistPanel from "./WatchlistPanel";

// Dynamically load WebGL globe on client only (zero SSR Three.js mismatch)
const GlobeCanvas = dynamic(() => import("./GlobeCanvas"), {
  ssr: false,
  loading: () => (
    <div className="globe-loading">
      <div className="globe-spinner" />
      <span>3D 글로벌 마켓 지구본 초기화 중...</span>
    </div>
  ),
});

type SheetSnap = "peek" | "half" | "full";

interface MarketGlobeAppProps {
  initialSnapshot: MarketSnapshot;
}

export default function MarketGlobeApp({ initialSnapshot }: MarketGlobeAppProps) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot>(initialSnapshot);
  const [activeFilter, setActiveFilter] = useState<"all" | AssetCategory>("all");
  const [activeRegion, setActiveRegion] = useState<RegionKey>("global");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showDayNight, setShowDayNight] = useState(true);
  const [desktopWatchlistOpen, setDesktopWatchlistOpen] = useState(true);
  const [mobileSheet, setMobileSheet] = useState<SheetSnap>("peek");
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [transportMode, setTransportMode] = useState<TransportMode>("sse");
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "live" | "polling" | "paused" | "error"
  >("connecting");
  const [flashedIds, setFlashedIds] = useState<Record<string, "up" | "down">>({});
  const [focusTarget, setFocusTarget] = useState<GlobeFocusTarget | null>(null);

  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const sheetTouchStartYRef = useRef<number | null>(null);

  const triggerFlash = useCallback((id: string, dir: "up" | "down") => {
    const existing = flashTimersRef.current.get(id);
    if (existing) clearTimeout(existing);
    setFlashedIds((prev) => ({ ...prev, [id]: dir }));
    const timer = setTimeout(() => {
      setFlashedIds((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      flashTimersRef.current.delete(id);
    }, 900);
    flashTimersRef.current.set(id, timer);
  }, []);

  // Apply authentic incoming snapshot and flash any instruments whose real price changed
  const applyIncomingSnapshot = useCallback(
    (incoming: MarketSnapshot) => {
      setSnapshot((prev) => {
        const prevPrices = new Map<string, number>();
        for (const item of [...prev.indices, ...prev.fx, ...prev.commodities]) {
          prevPrices.set(item.id, item.price);
        }
        for (const item of [...incoming.indices, ...incoming.fx, ...incoming.commodities]) {
          const oldPrice = prevPrices.get(item.id);
          if (oldPrice !== undefined && oldPrice !== item.price) {
            triggerFlash(item.id, item.price > oldPrice ? "up" : "down");
          }
        }
        return incoming;
      });
    },
    [triggerFlash]
  );

  // Hybrid Live Stream (SSE) + Edge CDN Polling + Background-Tab Auto-Pause
  useEffect(() => {
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let isDisposed = false;

    const cleanup = () => {
      if (es) {
        es.close();
        es = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const fetchCdnSnapshot = async () => {
      try {
        const res = await fetch("/api/market/snapshot", { cache: "default" });
        if (!res.ok) return;
        const data = (await res.json()) as MarketSnapshot;
        if (!isDisposed) {
          applyIncomingSnapshot(data);
          setConnectionStatus("polling");
        }
      } catch {
        if (!isDisposed) setConnectionStatus("error");
      }
    };

    const startTransport = () => {
      cleanup();
      if (document.visibilityState === "hidden") {
        setConnectionStatus("paused");
        return;
      }

      if (transportMode === "cdn-poll") {
        setConnectionStatus("polling");
        fetchCdnSnapshot();
        pollTimer = setInterval(fetchCdnSnapshot, 15_000);
        return;
      }

      setConnectionStatus("connecting");
      es = new EventSource("/api/market/stream");
      es.onopen = () => {
        if (!isDisposed) setConnectionStatus("live");
      };
      es.onmessage = (event) => {
        if (isDisposed) return;
        try {
          const payload = JSON.parse(event.data) as StreamEventPayload;
          if (payload.type === "snapshot" && payload.snapshot) {
            applyIncomingSnapshot(payload.snapshot);
            setConnectionStatus("live");
          } else if (payload.type === "heartbeat" && payload.telemetry) {
            setSnapshot((prev) => ({
              ...prev,
              telemetry: payload.telemetry ?? prev.telemetry,
            }));
            setConnectionStatus("live");
          }
        } catch {
          // Ignore malformed event frames
        }
      };
      es.onerror = () => {
        if (!isDisposed) {
          fetchCdnSnapshot();
        }
      };
    };

    startTransport();

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        cleanup();
        setConnectionStatus("paused");
      } else {
        startTransport();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isDisposed = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      cleanup();
    };
  }, [transportMode, applyIncomingSnapshot]);

  useEffect(() => {
    const timers = flashTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const allAssets = useMemo<AnyMarketAsset[]>(
    () => [...snapshot.indices, ...snapshot.fx, ...snapshot.commodities],
    [snapshot]
  );

  const selectedAsset = useMemo(
    () => allAssets.find((a) => a.id === selectedAssetId) ?? null,
    [allAssets, selectedAssetId]
  );

  const openExchangeCount = useMemo(
    () => snapshot.indices.filter((i) => i.isOpen).length,
    [snapshot.indices]
  );

  const advancingCount = useMemo(
    () => allAssets.filter((a) => a.changePercent >= 0).length,
    [allAssets]
  );

  const focusAssetOnGlobe = useCallback((asset: AnyMarketAsset) => {
    if (asset.category === "fx") {
      const mid = getMidpointCoords(asset.fromCoords, asset.toCoords);
      setFocusTarget({ lat: mid.lat, lng: mid.lng, distance: 2.35, nonce: Date.now() });
    } else {
      setFocusTarget({
        lat: asset.coords.lat,
        lng: asset.coords.lng,
        distance: 2.05,
        nonce: Date.now(),
      });
    }
  }, []);

  const handleSelectAsset = useCallback(
    (asset: AnyMarketAsset | null) => {
      if (!asset) {
        setSelectedAssetId(null);
        return;
      }
      setSelectedAssetId(asset.id);
      focusAssetOnGlobe(asset);
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setMobileSheet("half");
      }
    },
    [focusAssetOnGlobe]
  );

  const handleRegionJump = useCallback((region: RegionKey) => {
    setActiveRegion(region);
    setSelectedAssetId(null);
    const preset = REGION_PRESETS[region];
    setFocusTarget({
      lat: preset.lat,
      lng: preset.lng,
      distance: preset.distance,
      nonce: Date.now(),
    });
    if (region === "commodities") {
      setActiveFilter("commodity");
    }
  }, []);

  const handleSheetTouchStart = (e: React.TouchEvent) => {
    sheetTouchStartYRef.current = e.touches[0].clientY;
  };

  const handleSheetTouchEnd = (e: React.TouchEvent) => {
    if (sheetTouchStartYRef.current === null) return;
    const dy = e.changedTouches[0].clientY - sheetTouchStartYRef.current;
    sheetTouchStartYRef.current = null;
    if (Math.abs(dy) < 28) return;
    if (dy < 0) {
      setMobileSheet((prev) => (prev === "peek" ? "half" : "full"));
    } else {
      setMobileSheet((prev) => (prev === "full" ? "half" : "peek"));
    }
  };

  const cycleMobileSheet = () => {
    setMobileSheet((prev) => (prev === "peek" ? "half" : prev === "half" ? "full" : "peek"));
  };

  const sourceBadgeText =
    snapshot.telemetry.activeSource === "polygon"
      ? "POLYGON LIVE"
      : snapshot.telemetry.activeSource === "finnhub"
      ? "FINNHUB LIVE"
      : snapshot.telemetry.activeSource === "hybrid"
      ? "MULTI-API LIVE"
      : snapshot.telemetry.activeSource === "yahoo" ||
        snapshot.telemetry.activeSource === "frankfurter"
      ? `LIVE ${snapshot.telemetry.liveMappedCount}/${snapshot.telemetry.totalInstrumentsCount}`
      : "OFFLINE";

  return (
    <main className="app-shell">
      {/* Full-Bleed Interactive 3D WebGL Globe */}
      <GlobeCanvas
        indices={snapshot.indices}
        fx={snapshot.fx}
        commodities={snapshot.commodities}
        activeFilter={activeFilter}
        selectedAssetId={selectedAssetId}
        autoRotate={autoRotate}
        showDayNight={showDayNight}
        focusTarget={focusTarget}
        onSelectAsset={handleSelectAsset}
      />

      {/* Top Floating HUD Header */}
      <header className="top-hud">
        <div className="hud-left">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              <Globe2 size={18} />
            </div>
            <div className="brand-text">
              <h1 className="brand-title">ORBITAL MARKETS</h1>
              <span className="brand-sub">글로벌 실시간 주가 · 외환 · 원자재</span>
            </div>
          </div>

          {/* Desktop Layer Filter Pills */}
          <nav className="desktop-filter-group" aria-label="지구본 레이어 필터">
            {(
              [
                { key: "all", label: "전체 레이어" },
                { key: "index", label: "주가지수" },
                { key: "fx", label: "외환 아크" },
                { key: "commodity", label: "원자재 허브" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                className={`hud-pill ${activeFilter === f.key ? "is-active" : ""}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="hud-right">
          {/* Desktop Region Presets */}
          <div className="desktop-region-group" aria-label="권역 빠른 이동">
            {(Object.keys(REGION_PRESETS) as RegionKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`region-btn ${activeRegion === key ? "is-active" : ""}`}
                onClick={() => handleRegionJump(key)}
              >
                {REGION_PRESETS[key].labelKo}
              </button>
            ))}
          </div>

          <div className="hud-tools">
            <button
              type="button"
              className={`tool-icon-btn ${showDayNight ? "is-active" : ""}`}
              onClick={() => setShowDayNight((v) => !v)}
              title="실시간 태양광 주야간 경계 표시"
              aria-label="주야간 태양광 토글"
            >
              <SunMoon size={15} />
            </button>

            <button
              type="button"
              className={`tool-icon-btn ${autoRotate ? "is-active" : ""}`}
              onClick={() => setAutoRotate((v) => !v)}
              title={autoRotate ? "자동 회전 일시정지" : "자동 회전 시작"}
              aria-label="지구본 자동 회전 토글"
            >
              {autoRotate ? <Pause size={14} /> : <Play size={14} />}
            </button>

            <button
              type="button"
              className="tool-icon-btn desktop-only-btn"
              onClick={() => setDesktopWatchlistOpen((v) => !v)}
              title="워치리스트 패널 토글"
              aria-label="워치리스트 토글"
            >
              <ListFilter size={15} />
            </button>

            <button
              type="button"
              className="telemetry-trigger"
              onClick={() => setShowTelemetry(true)}
              aria-label="API 캐시 보호 및 스트리밍 상태 보기"
            >
              <span
                className={`status-dot ${
                  connectionStatus === "live" || connectionStatus === "polling"
                    ? "is-live"
                    : connectionStatus === "paused"
                    ? "is-paused"
                    : "is-connecting"
                }`}
              />
              <span className="telemetry-badge-text">{sourceBadgeText}</span>
              <ShieldCheck size={14} className="telemetry-shield" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Compact Quick Filter & Region Strip */}
      <div className="mobile-quick-strip" aria-label="모바일 빠른 필터">
        {(
          [
            { key: "all", label: "전체" },
            { key: "index", label: "지수" },
            { key: "fx", label: "외환" },
            { key: "commodity", label: "원자재" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            className={`mobile-chip ${activeFilter === item.key ? "is-active" : ""}`}
            onClick={() => setActiveFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
        <span className="mobile-strip-divider" aria-hidden="true" />
        {(["global", "americas", "europe", "asia"] as RegionKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`mobile-chip region-chip ${activeRegion === key ? "is-active" : ""}`}
            onClick={() => handleRegionJump(key)}
          >
            {REGION_PRESETS[key].labelKo}
          </button>
        ))}
      </div>

      {/* Desktop Left Watchlist Floating Drawer */}
      <aside
        className={`desktop-watchlist-drawer ${desktopWatchlistOpen ? "is-open" : "is-collapsed"}`}
        aria-label="글로벌 실시간 시세 목록"
      >
        <div className="drawer-summary-bar">
          <div className="summary-stat">
            <span className="summary-label">개장 거래소</span>
            <span className="summary-val mono-num">
              {openExchangeCount} / {snapshot.indices.length}
            </span>
          </div>
          <div className="summary-stat">
            <span className="summary-label">상승 종목</span>
            <span className="summary-val mono-num text-up">
              {advancingCount} / {allAssets.length}
            </span>
          </div>
          <div className="summary-stat">
            <span className="summary-label">캐시 보호</span>
            <span className="summary-val mono-num">
              {snapshot.telemetry.redisConfigured ? "Redis" : "Edge"}
            </span>
          </div>
        </div>
        <WatchlistPanel
          indices={snapshot.indices}
          fx={snapshot.fx}
          commodities={snapshot.commodities}
          activeFilter={activeFilter}
          selectedAssetId={selectedAssetId}
          flashedIds={flashedIds}
          onChangeFilter={setActiveFilter}
          onSelectAsset={handleSelectAsset}
        />
      </aside>

      {/* Desktop Right Detail Inspector */}
      {selectedAsset && (
        <div className="desktop-detail-slot">
          <AssetDetailCard
            asset={selectedAsset}
            onClose={() => setSelectedAssetId(null)}
            onFocusOnGlobe={focusAssetOnGlobe}
          />
        </div>
      )}

      {/* Desktop Subtle Visual Legend */}
      <div className="globe-legend" aria-label="지구본 범례">
        <span className="legend-item">
          <span className="legend-swatch swatch-index" />
          주가 기둥 (높이=변동폭)
        </span>
        <span className="legend-item">
          <span className="legend-swatch swatch-fx" />
          외환 아크 (강세 방향)
        </span>
        <span className="legend-item">
          <span className="legend-swatch swatch-cmd" />
          원자재 허브
        </span>
      </div>

      {/* Desktop Bottom Live Ticker Tape */}
      <div className="desktop-ticker-slot">
        <TickerTape items={allAssets} onSelect={handleSelectAsset} />
      </div>

      {/* Mobile Interactive Snap Bottom Sheet */}
      <section
        className={`mobile-bottom-sheet snap-${mobileSheet}`}
        aria-label="모바일 실시간 시세 패널"
      >
        <div
          className="sheet-handle-zone"
          onTouchStart={handleSheetTouchStart}
          onTouchEnd={handleSheetTouchEnd}
          onClick={cycleMobileSheet}
          role="button"
          tabIndex={0}
          aria-label="시세 패널 높이 조절"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") cycleMobileSheet();
          }}
        >
          <div className="sheet-grabber" />
          <div className="sheet-peek-row">
            <div className="sheet-peek-info">
              <span className="sheet-peek-title">
                {selectedAsset ? `${selectedAsset.nameKo} (${selectedAsset.symbol})` : "글로벌 실시간 시세"}
              </span>
              <span className="sheet-peek-sub mono-num">
                개장 {openExchangeCount} · 상승 {advancingCount}/{allAssets.length}
              </span>
            </div>
            <span className="sheet-chevron">
              {mobileSheet === "full" ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </span>
          </div>
        </div>

        <div className="sheet-content">
          {selectedAsset ? (
            <div className="mobile-detail-wrap">
              <AssetDetailCard
                asset={selectedAsset}
                onClose={() => {
                  setSelectedAssetId(null);
                  setMobileSheet("half");
                }}
                onFocusOnGlobe={(asset) => {
                  focusAssetOnGlobe(asset);
                  setMobileSheet("peek");
                }}
              />
            </div>
          ) : (
            <WatchlistPanel
              indices={snapshot.indices}
              fx={snapshot.fx}
              commodities={snapshot.commodities}
              activeFilter={activeFilter}
              selectedAssetId={selectedAssetId}
              flashedIds={flashedIds}
              onChangeFilter={setActiveFilter}
              onSelectAsset={handleSelectAsset}
            />
          )}
        </div>
      </section>

      {/* Architecture & API Rate-Limit Protection Telemetry Modal */}
      {showTelemetry && (
        <TelemetryModal
          telemetry={snapshot.telemetry}
          transportMode={transportMode}
          connectionStatus={connectionStatus}
          onChangeTransport={setTransportMode}
          onClose={() => setShowTelemetry(false)}
        />
      )}
    </main>
  );
}
