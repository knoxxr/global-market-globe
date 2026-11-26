"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  BellRing,
  ChevronDown,
  ChevronUp,
  Globe2,
  ListFilter,
  Map as MapIcon,
  Newspaper,
  Pause,
  Play,
  Share2,
  ShieldCheck,
  SunMoon,
  X,
} from "lucide-react";
import { REGION_PRESETS } from "@/lib/market/catalog";
import type {
  AnyMarketAsset,
  AssetCategory,
  GeoPoint,
  MarketSnapshot,
  NewsPinItem,
  PriceAlert,
  RegionKey,
  StreamEventPayload,
} from "@/lib/market/types";
import type { GlobeFocusTarget } from "./GlobeCanvas";
import { getMidpointCoords } from "./GlobeCanvas";
import AssetDetailCard, { formatAssetPrice } from "./AssetDetailCard";
import MacroPulseStrip from "./MacroPulseStrip";
import NewsDetailCard from "./NewsDetailCard";
import SessionRelayBar from "./SessionRelayBar";
import TelemetryModal, { type TransportMode } from "./TelemetryModal";
import TickerTape from "./TickerTape";
import WatchlistPanel, { type WatchlistTab } from "./WatchlistPanel";

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

interface ToastMessage {
  id: number;
  title: string;
  body?: string;
  assetId?: string;
}

interface MarketGlobeAppProps {
  initialSnapshot: MarketSnapshot;
  initialNews: NewsPinItem[];
}

const LS_FAVORITES_KEY = "orbital-markets:favorites:v1";
const LS_ALERTS_KEY = "orbital-markets:alerts:v1";

export default function MarketGlobeApp({
  initialSnapshot,
  initialNews,
}: MarketGlobeAppProps) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot>(initialSnapshot);
  const [newsItems, setNewsItems] = useState<NewsPinItem[]>(initialNews);
  const [activeFilter, setActiveFilter] = useState<"all" | AssetCategory>("all");
  const [watchlistTab, setWatchlistTab] = useState<WatchlistTab>("all");
  const [activeRegion, setActiveRegion] = useState<RegionKey>("global");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showDayNight, setShowDayNight] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showNewsPins, setShowNewsPins] = useState(true);
  const [desktopWatchlistOpen, setDesktopWatchlistOpen] = useState(true);
  const [mobileSheet, setMobileSheet] = useState<SheetSnap>("peek");
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [transportMode, setTransportMode] = useState<TransportMode>("sse");
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "live" | "polling" | "paused" | "error"
  >("connecting");
  const [flashedIds, setFlashedIds] = useState<Record<string, "up" | "down">>({});
  const [focusTarget, setFocusTarget] = useState<GlobeFocusTarget | null>(null);

  // LocalStorage persisted Favorites & Price Alerts
  const [favorites, setFavorites] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTouchStartYRef = useRef<number | null>(null);
  const didHydrateDeepLinkRef = useRef(false);

  const showToast = useCallback((title: string, body?: string, assetId?: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), title, body, assetId });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, []);

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

  const allAssets = useMemo<AnyMarketAsset[]>(
    () => [...snapshot.indices, ...snapshot.fx, ...snapshot.commodities],
    [snapshot]
  );

  const focusCoordsOnGlobe = useCallback((coords: GeoPoint, distance = 2.15) => {
    setFocusTarget({ lat: coords.lat, lng: coords.lng, distance, nonce: Date.now() });
  }, []);

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

  // Load favorites & alerts from localStorage + parse initial URL deep-link params once
  useEffect(() => {
    if (typeof window === "undefined") return;
    queueMicrotask(() => {
      try {
        const savedFavs = localStorage.getItem(LS_FAVORITES_KEY);
        if (savedFavs) {
          const parsed = JSON.parse(savedFavs);
          if (Array.isArray(parsed)) setFavorites(parsed.filter((x) => typeof x === "string"));
        }
        const savedAlerts = localStorage.getItem(LS_ALERTS_KEY);
        if (savedAlerts) {
          const parsed = JSON.parse(savedAlerts);
          if (Array.isArray(parsed)) setAlerts(parsed as PriceAlert[]);
        }
      } catch {
        // ignore storage errors
      }

      if (!didHydrateDeepLinkRef.current) {
        didHydrateDeepLinkRef.current = true;
        const params = new URLSearchParams(window.location.search);
        const layerParam = params.get("layer");
        if (
          layerParam === "all" ||
          layerParam === "index" ||
          layerParam === "fx" ||
          layerParam === "commodity"
        ) {
          setActiveFilter(layerParam);
          setWatchlistTab(layerParam);
        }
        if (params.get("heatmap") === "1") {
          setShowHeatmap(true);
        }
        if (params.get("news") === "0") {
          setShowNewsPins(false);
        }
        const assetParam = params.get("asset");
        if (assetParam) {
          const found = [
            ...initialSnapshot.indices,
            ...initialSnapshot.fx,
            ...initialSnapshot.commodities,
          ].find((a) => a.id === assetParam || a.symbol.toLowerCase() === assetParam.toLowerCase());
          if (found) {
            setSelectedAssetId(found.id);
            focusAssetOnGlobe(found);
          }
        }
      }
    });
  }, [initialSnapshot, focusAssetOnGlobe]);

  // Keep URL query cleanly synced for instant deep-link sharing (replaceState, zero history spam)
  useEffect(() => {
    if (typeof window === "undefined" || !didHydrateDeepLinkRef.current) return;
    const params = new URLSearchParams();
    if (activeFilter !== "all") params.set("layer", activeFilter);
    if (selectedAssetId) params.set("asset", selectedAssetId);
    if (showHeatmap) params.set("heatmap", "1");
    if (!showNewsPins) params.set("news", "0");
    const qs = params.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [activeFilter, selectedAssetId, showHeatmap, showNewsPins]);

  // Evaluate Price Alerts whenever live market prices update
  const checkPriceAlerts = useCallback(
    (incoming: MarketSnapshot) => {
      const priceMap = new Map<string, AnyMarketAsset>();
      for (const a of [...incoming.indices, ...incoming.fx, ...incoming.commodities]) {
        priceMap.set(a.id, a);
      }

      setAlerts((prev) => {
        if (prev.length === 0) return prev;
        let changed = false;
        const next = prev.map((al) => {
          if (al.triggered) return al;
          const live = priceMap.get(al.assetId);
          if (!live) return al;
          const hit =
            (al.direction === "above" && live.price >= al.targetPrice) ||
            (al.direction === "below" && live.price <= al.targetPrice);
          if (!hit) return al;

          changed = true;
          const msg = `${al.nameKo} (${al.symbol}) 현재가 ${formatAssetPrice(
            live.price,
            live.decimals
          )} — 목표가 ${formatAssetPrice(al.targetPrice, al.decimals)} 도달`;
          showToast("목표가 알림 도달", msg, al.assetId);

          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification("ORBITAL MARKETS 목표가 도달", { body: msg });
            } catch {
              // ignore notification restriction
            }
          }
          return { ...al, triggered: true };
        });

        if (changed) {
          try {
            localStorage.setItem(LS_ALERTS_KEY, JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        }
        return prev;
      });
    },
    [showToast]
  );

  // Apply authentic incoming snapshot, flash moved prices, and check price alerts
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
      checkPriceAlerts(incoming);
    },
    [triggerFlash, checkPriceAlerts]
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
          // ignore malformed SSE frames
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

  // Periodically refresh Edge-cached global news (every 3 minutes)
  useEffect(() => {
    const refreshNews = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/market/news");
        if (!res.ok) return;
        const data = (await res.json()) as { items?: NewsPinItem[] };
        if (data.items && data.items.length > 0) {
          setNewsItems(data.items);
        }
      } catch {
        // ignore transient news error
      }
    };
    const timer = setInterval(refreshNews, 180_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timers = flashTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const selectedAsset = useMemo(
    () => allAssets.find((a) => a.id === selectedAssetId) ?? null,
    [allAssets, selectedAssetId]
  );

  const selectedNews = useMemo(
    () => newsItems.find((n) => n.id === selectedNewsId) ?? null,
    [newsItems, selectedNewsId]
  );

  const openExchangeCount = useMemo(
    () => snapshot.indices.filter((i) => i.isOpen).length,
    [snapshot.indices]
  );

  const advancingCount = useMemo(
    () => allAssets.filter((a) => a.changePercent >= 0).length,
    [allAssets]
  );

  const handleToggleFavorite = useCallback((assetId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId];
      try {
        localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleAddAlert = useCallback(
    (asset: AnyMarketAsset, direction: "above" | "below", targetPrice: number) => {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        Notification.requestPermission().catch(() => {});
      }
      const nextAlert: PriceAlert = {
        id: `al-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        assetId: asset.id,
        symbol: asset.symbol,
        nameKo: asset.nameKo,
        direction,
        targetPrice,
        decimals: asset.decimals,
        triggered: false,
        createdAt: Date.now(),
      };
      setAlerts((prev) => {
        const next = [nextAlert, ...prev];
        try {
          localStorage.setItem(LS_ALERTS_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      showToast(
        "목표가 알림 등록 완료",
        `${asset.symbol} ${direction === "above" ? "≥" : "≤"} ${formatAssetPrice(
          targetPrice,
          asset.decimals
        )}`
      );
    },
    [showToast]
  );

  const handleRemoveAlert = useCallback((alertId: string) => {
    setAlerts((prev) => {
      const next = prev.filter((a) => a.id !== alertId);
      try {
        localStorage.setItem(LS_ALERTS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleShareView = useCallback(async () => {
    if (typeof window === "undefined") return;
    const shareUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("현재 지구본 뷰 링크 복사됨", "공유하면 동일한 종목·레이어 상태로 열립니다.");
    } catch {
      showToast("링크 복사", shareUrl);
    }
  }, [showToast]);

  const handleSelectAsset = useCallback(
    (asset: AnyMarketAsset | null) => {
      if (!asset) {
        setSelectedAssetId(null);
        return;
      }
      setSelectedNewsId(null);
      setSelectedAssetId(asset.id);
      focusAssetOnGlobe(asset);
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setMobileSheet("half");
      }
    },
    [focusAssetOnGlobe]
  );

  const handleSelectNews = useCallback(
    (news: NewsPinItem | null) => {
      if (!news) {
        setSelectedNewsId(null);
        return;
      }
      setSelectedAssetId(null);
      setSelectedNewsId(news.id);
      focusCoordsOnGlobe(news.coords, 2.2);
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setMobileSheet("half");
      }
    },
    [focusCoordsOnGlobe]
  );

  const handleChangeLayerFilter = useCallback((filter: "all" | AssetCategory) => {
    setActiveFilter(filter);
    setWatchlistTab(filter);
  }, []);

  const handleChangeWatchlistTab = useCallback((tab: WatchlistTab) => {
    setWatchlistTab(tab);
    if (tab === "all" || tab === "index" || tab === "fx" || tab === "commodity") {
      setActiveFilter(tab);
    }
    if (tab === "news") {
      setShowNewsPins(true);
    }
  }, []);

  const handleRegionJump = useCallback((region: RegionKey) => {
    setActiveRegion(region);
    setSelectedAssetId(null);
    setSelectedNewsId(null);
    const preset = REGION_PRESETS[region];
    setFocusTarget({
      lat: preset.lat,
      lng: preset.lng,
      distance: preset.distance,
      nonce: Date.now(),
    });
    if (region === "commodities") {
      setActiveFilter("commodity");
      setWatchlistTab("commodity");
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
        newsItems={newsItems}
        activeFilter={activeFilter}
        selectedAssetId={selectedAssetId}
        selectedNewsId={selectedNewsId}
        autoRotate={autoRotate}
        showDayNight={showDayNight}
        showHeatmap={showHeatmap}
        showNewsPins={showNewsPins}
        focusTarget={focusTarget}
        onSelectAsset={handleSelectAsset}
        onSelectNews={handleSelectNews}
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

          <nav className="desktop-filter-group" aria-label="지구본 레이어 필터">
            {(
              [
                { key: "all", label: "전체" },
                { key: "index", label: "주가지수" },
                { key: "fx", label: "외환 아크" },
                { key: "commodity", label: "원자재" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                className={`hud-pill ${activeFilter === f.key ? "is-active" : ""}`}
                onClick={() => handleChangeLayerFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="hud-right">
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
              className={`tool-icon-btn ${showHeatmap ? "is-active" : ""}`}
              onClick={() => setShowHeatmap((v) => !v)}
              title="국가별 등락 히트맵 모드"
              aria-label="국가 등락 히트맵 토글"
            >
              <MapIcon size={15} />
            </button>

            <button
              type="button"
              className={`tool-icon-btn ${showNewsPins ? "is-active" : ""}`}
              onClick={() => setShowNewsPins((v) => !v)}
              title="지구본 글로벌 금융 속보 핀 표시"
              aria-label="글로벌 속보 핀 토글"
            >
              <Newspaper size={15} />
            </button>

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
              className="tool-icon-btn"
              onClick={handleShareView}
              title="현재 지구본 뷰 딥링크 복사"
              aria-label="현재 뷰 링크 공유"
            >
              <Share2 size={14} />
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

      {/* Feature 1: Global Macro Risk Pulse Strip (VIX, DXY, US10Y, BTC + Risk-On/Off) */}
      <div className="macro-hud-slot">
        <MacroPulseStrip macro={snapshot.macro} riskRegime={snapshot.riskRegime} />
      </div>

      {/* Mobile Compact Quick Filter & Feature Strip */}
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
            onClick={() => handleChangeLayerFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
        <span className="mobile-strip-divider" aria-hidden="true" />
        <button
          type="button"
          className={`mobile-chip ${showHeatmap ? "is-active" : ""}`}
          onClick={() => setShowHeatmap((v) => !v)}
        >
          히트맵
        </button>
        <button
          type="button"
          className={`mobile-chip ${showNewsPins ? "is-active" : ""}`}
          onClick={() => setShowNewsPins((v) => !v)}
        >
          속보핀
        </button>
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
            <span className="summary-label">관심 · 알림</span>
            <span className="summary-val mono-num">
              ★{favorites.length} · 🔔{alerts.filter((a) => !a.triggered).length}
            </span>
          </div>
        </div>
        <WatchlistPanel
          indices={snapshot.indices}
          fx={snapshot.fx}
          commodities={snapshot.commodities}
          newsItems={newsItems}
          activeTab={watchlistTab}
          selectedAssetId={selectedAssetId}
          selectedNewsId={selectedNewsId}
          favorites={favorites}
          alerts={alerts}
          flashedIds={flashedIds}
          onChangeTab={handleChangeWatchlistTab}
          onToggleFavorite={handleToggleFavorite}
          onSelectAsset={handleSelectAsset}
          onSelectNews={handleSelectNews}
        />
      </aside>

      {/* Desktop Right Detail Inspector (Asset or News) */}
      {(selectedAsset || selectedNews) && (
        <div className="desktop-detail-slot">
          {selectedAsset ? (
            <AssetDetailCard
              key={selectedAsset.id}
              asset={selectedAsset}
              allAssets={allAssets}
              isFavorite={favorites.includes(selectedAsset.id)}
              alerts={alerts}
              onToggleFavorite={handleToggleFavorite}
              onAddAlert={handleAddAlert}
              onRemoveAlert={handleRemoveAlert}
              onShareView={handleShareView}
              onClose={() => setSelectedAssetId(null)}
              onFocusOnGlobe={focusAssetOnGlobe}
            />
          ) : selectedNews ? (
            <NewsDetailCard
              news={selectedNews}
              onClose={() => setSelectedNewsId(null)}
              onFocusOnGlobe={(n) => focusCoordsOnGlobe(n.coords, 2.2)}
            />
          ) : null}
        </div>
      )}

      {/* Feature 3: 24h Global Market Session Relay Bar (Desktop Bottom Center) */}
      <div className="desktop-relay-slot">
        <SessionRelayBar onFocusCoords={focusCoordsOnGlobe} />
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
                {selectedAsset
                  ? `${selectedAsset.nameKo} (${selectedAsset.symbol})`
                  : selectedNews
                  ? `속보 · ${selectedNews.cityKo}`
                  : "글로벌 실시간 시세 · 속보"}
              </span>
              <span className="sheet-peek-sub mono-num">
                {snapshot.riskRegime.label} {snapshot.riskRegime.score} · 개장 {openExchangeCount} · 상승{" "}
                {advancingCount}/{allAssets.length}
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
                allAssets={allAssets}
                isFavorite={favorites.includes(selectedAsset.id)}
                alerts={alerts}
                onToggleFavorite={handleToggleFavorite}
                onAddAlert={handleAddAlert}
                onRemoveAlert={handleRemoveAlert}
                onShareView={handleShareView}
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
          ) : selectedNews ? (
            <div className="mobile-detail-wrap">
              <NewsDetailCard
                news={selectedNews}
                onClose={() => {
                  setSelectedNewsId(null);
                  setMobileSheet("half");
                }}
                onFocusOnGlobe={(n) => {
                  focusCoordsOnGlobe(n.coords, 2.2);
                  setMobileSheet("peek");
                }}
              />
            </div>
          ) : (
            <>
              <div className="mobile-relay-wrap">
                <SessionRelayBar
                  onFocusCoords={(c, d) => {
                    focusCoordsOnGlobe(c, d);
                    setMobileSheet("peek");
                  }}
                />
              </div>
              <WatchlistPanel
                indices={snapshot.indices}
                fx={snapshot.fx}
                commodities={snapshot.commodities}
                newsItems={newsItems}
                activeTab={watchlistTab}
                selectedAssetId={selectedAssetId}
                selectedNewsId={selectedNewsId}
                favorites={favorites}
                alerts={alerts}
                flashedIds={flashedIds}
                onChangeTab={handleChangeWatchlistTab}
                onToggleFavorite={handleToggleFavorite}
                onSelectAsset={handleSelectAsset}
                onSelectNews={handleSelectNews}
              />
            </>
          )}
        </div>
      </section>

      {/* Live Toast Notification (Price Alerts & Link Copy) */}
      {toast && (
        <div className="toast-banner" role="status" aria-live="polite">
          <BellRing size={15} className="toast-icon" />
          <div className="toast-text">
            <div className="toast-title">{toast.title}</div>
            {toast.body && <div className="toast-body">{toast.body}</div>}
          </div>
          {toast.assetId && (
            <button
              type="button"
              className="toast-action-btn"
              onClick={() => {
                const target = allAssets.find((a) => a.id === toast.assetId);
                if (target) handleSelectAsset(target);
                setToast(null);
              }}
            >
              이동
            </button>
          )}
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label="알림 닫기"
          >
            <X size={13} />
          </button>
        </div>
      )}

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
