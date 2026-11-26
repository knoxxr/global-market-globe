"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { GitCompareArrows } from "lucide-react";
import type { AnyMarketAsset, HistoryPoint, HistoryRange, HistoryResponse } from "@/lib/market/types";

interface InteractiveChartProps {
  asset: AnyMarketAsset;
  compareCandidates: AnyMarketAsset[];
}

const RANGES: HistoryRange[] = ["1D", "1W", "1M", "3M"];

function formatHoverTime(ts: number, range: HistoryRange): string {
  const d = new Date(ts);
  if (range === "1D") {
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export default function InteractiveChart({
  asset,
  compareCandidates,
}: InteractiveChartProps) {
  const gradId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [range, setRange] = useState<HistoryRange>("1D");
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [compareSymbol, setCompareSymbol] = useState<string>("");
  const [compareHistory, setCompareHistory] = useState<HistoryResponse | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const effectiveCompareSymbol =
    compareSymbol === asset.feedSymbol ? "" : compareSymbol;

  const loading =
    !history || history.symbol !== asset.feedSymbol || history.range !== range;

  // Fetch main asset historical data when symbol or range changes
  useEffect(() => {
    let aborted = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/market/history?symbol=${encodeURIComponent(asset.feedSymbol)}&range=${range}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as HistoryResponse;
        if (!aborted) setHistory(data);
      } catch {
        // fallback to asset sparkline
      }
    };
    load();
    return () => {
      aborted = true;
    };
  }, [asset.feedSymbol, range]);

  // Fetch optional 2nd comparison asset history
  useEffect(() => {
    if (!effectiveCompareSymbol) return;
    let aborted = false;
    const loadCompare = async () => {
      try {
        const res = await fetch(
          `/api/market/history?symbol=${encodeURIComponent(
            effectiveCompareSymbol
          )}&range=${range}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as HistoryResponse;
        if (!aborted) setCompareHistory(data);
      } catch {
        // ignore transient compare fetch error
      }
    };
    loadCompare();
    return () => {
      aborted = true;
    };
  }, [effectiveCompareSymbol, range]);

  const points: HistoryPoint[] = useMemo(() => {
    if (
      history &&
      history.symbol === asset.feedSymbol &&
      history.range === range &&
      history.points.length >= 2
    ) {
      return history.points;
    }
    const anchorTime = asset.updatedAt || 0;
    return asset.sparkline.map((v, idx) => ({
      t: anchorTime - (asset.sparkline.length - 1 - idx) * 900_000,
      v,
    }));
  }, [history, asset.feedSymbol, asset.sparkline, asset.updatedAt, range]);

  const compareAsset = useMemo(
    () => compareCandidates.find((c) => c.feedSymbol === effectiveCompareSymbol) ?? null,
    [compareCandidates, effectiveCompareSymbol]
  );

  const activeCompareHistory =
    effectiveCompareSymbol &&
    compareHistory &&
    compareHistory.symbol === effectiveCompareSymbol &&
    compareHistory.range === range &&
    compareHistory.points.length >= 2
      ? compareHistory
      : null;

  const isCompareMode = Boolean(activeCompareHistory);

  const width = 304;
  const height = 104;
  const padX = 4;
  const padY = 8;

  // Compute SVG paths (absolute price mode OR normalized % comparison mode)
  const chartGeometry = useMemo(() => {
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;

    if (isCompareMode && activeCompareHistory) {
      const baseA = points[0]?.v || 1;
      const pctA = points.map((p) => ((p.v - baseA) / baseA) * 100);
      const baseB = activeCompareHistory.points[0]?.v || 1;
      const pctB = activeCompareHistory.points.map((p) => ((p.v - baseB) / baseB) * 100);

      const allVals = [...pctA, ...pctB];
      const minV = Math.min(...allVals);
      const maxV = Math.max(...allVals);
      const span = Math.max(maxV - minV, 0.01);

      const coordsA = pctA.map((val, i) => ({
        x: padX + (i / Math.max(pctA.length - 1, 1)) * usableW,
        y: padY + (1 - (val - minV) / span) * usableH,
        pct: val,
      }));
      const coordsB = pctB.map((val, i) => ({
        x: padX + (i / Math.max(pctB.length - 1, 1)) * usableW,
        y: padY + (1 - (val - minV) / span) * usableH,
        pct: val,
      }));

      const zeroY = padY + (1 - (0 - minV) / span) * usableH;
      const pathA = coordsA
        .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
        .join(" ");
      const pathB = coordsB
        .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
        .join(" ");

      return { coordsA, coordsB, pathA, areaA: "", pathB, zeroY };
    }

    const vals = points.map((p) => p.v);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = Math.max(maxV - minV, 1e-6);

    const coordsA = vals.map((val, i) => ({
      x: padX + (i / Math.max(vals.length - 1, 1)) * usableW,
      y: padY + (1 - (val - minV) / span) * usableH,
      pct: ((val - vals[0]) / Math.max(vals[0], 1e-6)) * 100,
    }));

    const pathA = coordsA
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(" ");
    const areaA =
      coordsA.length > 1
        ? `${pathA} L${coordsA[coordsA.length - 1].x.toFixed(1)},${height} L${coordsA[0].x.toFixed(
            1
          )},${height} Z`
        : "";

    return { coordsA, coordsB: [], pathA, areaA, pathB: "", zeroY: null };
  }, [points, isCompareMode, activeCompareHistory]);

  const periodChangePct =
    history && history.symbol === asset.feedSymbol && history.range === range
      ? history.changePercent
      : asset.changePercent;
  const isPositive = periodChangePct >= 0;
  const strokeColor = isPositive ? "#10b981" : "#f43f5e";

  const handlePointerScrub = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || points.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * (points.length - 1));
    setHoverIdx(idx);
  };

  const activePoint = hoverIdx !== null ? points[hoverIdx] : null;
  const activeCoord = hoverIdx !== null ? chartGeometry.coordsA[hoverIdx] : null;

  return (
    <div className="ichart-wrap">
      <div className="ichart-toolbar">
        <div className="ichart-ranges" role="tablist" aria-label="차트 기간 선택">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              className={`ichart-range-btn ${range === r ? "is-active" : ""}`}
              onClick={() => {
                setHoverIdx(null);
                setRange(r);
              }}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="ichart-compare-box">
          <GitCompareArrows size={12} className="compare-icon" />
          <select
            value={effectiveCompareSymbol}
            onChange={(e) => setCompareSymbol(e.target.value)}
            className="ichart-compare-select"
            aria-label="비교 종목 선택"
          >
            <option value="">비교 안함</option>
            {compareCandidates
              .filter((c) => c.feedSymbol !== asset.feedSymbol)
              .map((c) => (
                <option key={c.id} value={c.feedSymbol}>
                  vs {c.symbol} ({c.nameKo})
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="ichart-readout mono-num">
        {activePoint ? (
          <>
            <span>{formatHoverTime(activePoint.t, range)}</span>
            <strong>
              {activePoint.v.toLocaleString("en-US", {
                minimumFractionDigits: asset.decimals,
                maximumFractionDigits: asset.decimals,
              })}
            </strong>
            {activeCoord && (
              <span className={activeCoord.pct >= 0 ? "text-up" : "text-down"}>
                ({activeCoord.pct >= 0 ? "+" : ""}
                {activeCoord.pct.toFixed(2)}%)
              </span>
            )}
          </>
        ) : (
          <>
            <span className="readout-muted">
              {loading ? "불러오는 중..." : `${range} 수익률`}
            </span>
            <strong className={isPositive ? "text-up" : "text-down"}>
              {periodChangePct >= 0 ? "+" : ""}
              {periodChangePct.toFixed(2)}%
            </strong>
            {isCompareMode && compareAsset && activeCompareHistory && (
              <span className="compare-legend">
                · {compareAsset.symbol}{" "}
                {activeCompareHistory.changePercent >= 0 ? "+" : ""}
                {activeCompareHistory.changePercent.toFixed(2)}%
              </span>
            )}
          </>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="ichart-svg"
        onPointerMove={(e) => handlePointerScrub(e.clientX)}
        onPointerDown={(e) => handlePointerScrub(e.clientX)}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {!isCompareMode && (
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}

        {chartGeometry.zeroY !== null &&
          chartGeometry.zeroY >= padY &&
          chartGeometry.zeroY <= height - padY && (
            <line
              x1={padX}
              x2={width - padX}
              y1={chartGeometry.zeroY}
              y2={chartGeometry.zeroY}
              stroke="rgba(148,163,184,0.28)"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          )}

        {!isCompareMode && chartGeometry.areaA && (
          <path d={chartGeometry.areaA} fill={`url(#${gradId})`} />
        )}

        <path
          d={chartGeometry.pathA}
          fill="none"
          stroke={isCompareMode ? "#38bdf8" : strokeColor}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {isCompareMode && chartGeometry.pathB && (
          <path
            d={chartGeometry.pathB}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.6"
            strokeDasharray="4 2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {activeCoord && (
          <>
            <line
              x1={activeCoord.x}
              x2={activeCoord.x}
              y1={padY}
              y2={height - padY}
              stroke="rgba(241,245,249,0.35)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r="3.5"
              fill={isCompareMode ? "#38bdf8" : strokeColor}
              stroke="#060a12"
              strokeWidth="1.5"
            />
          </>
        )}
      </svg>
    </div>
  );
}
