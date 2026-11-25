"use client";

import React from "react";
import { Activity, Database, Layers, Radio, ShieldCheck, X } from "lucide-react";
import type { CacheTelemetry } from "@/lib/market/types";

export type TransportMode = "sse" | "cdn-poll";

interface TelemetryModalProps {
  telemetry: CacheTelemetry | null;
  transportMode: TransportMode;
  connectionStatus: "connecting" | "live" | "polling" | "paused" | "error";
  onChangeTransport: (mode: TransportMode) => void;
  onClose: () => void;
}

export default function TelemetryModal({
  telemetry,
  transportMode,
  connectionStatus,
  onChangeTransport,
  onClose,
}: TelemetryModalProps) {
  const totalRequests =
    (telemetry?.cacheHitsTotal ?? 0) + (telemetry?.upstreamCallsTotal ?? 0);
  const hitRate =
    totalRequests > 0
      ? Math.round(((telemetry?.cacheHitsTotal ?? 0) / totalRequests) * 100)
      : 100;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="다중 접속 API 보호 및 Vercel 아키텍처 상태"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="telemetry-modal">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <ShieldCheck size={18} className="accent-icon" />
            <div>
              <h2 className="modal-title">다중 접속 API 보호 · Vercel 스트리밍 상태</h2>
              <p className="modal-sub">
                상태:{" "}
                <strong>
                  {connectionStatus === "live"
                    ? "SSE 실시간 수신"
                    : connectionStatus === "polling"
                    ? "Edge CDN 폴링"
                    : connectionStatus === "paused"
                    ? "백그라운드 절전"
                    : "연결 중..."}
                </strong>{" "}
                · 동시 접속자 급증 시에도 쿼터를 보호하는 3단계 캐시 팬아웃
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="창 닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-section">
          <div className="section-label">클라이언트 수신 방식</div>
          <div className="transport-grid">
            <button
              type="button"
              className={`transport-card ${transportMode === "sse" ? "is-active" : ""}`}
              onClick={() => onChangeTransport("sse")}
            >
              <div className="transport-top">
                <Radio size={15} />
                <span>실시간 SSE 스트림</span>
              </div>
              <p>
                공유 서버 캐시에서만 읽어 2.4초 주기로 푸시. 백그라운드 탭 전환 시 자동 일시정지.
              </p>
            </button>

            <button
              type="button"
              className={`transport-card ${transportMode === "cdn-poll" ? "is-active" : ""}`}
              onClick={() => onChangeTransport("cdn-poll")}
            >
              <div className="transport-top">
                <Layers size={15} />
                <span>초절약 Vercel Edge CDN</span>
              </div>
              <p>
                <code>s-maxage=15, SWR=45</code> 헤더로 엣지 캐시 직결. 대규모 트래픽에도 서버리스 부담 제로.
              </p>
            </button>
          </div>
        </div>

        <div className="telemetry-stats-grid">
          <div className="stat-tile">
            <span className="stat-k">실데이터 매핑</span>
            <span className="stat-v mono-num text-up">
              {telemetry?.liveMappedCount ?? 0} / {telemetry?.totalInstrumentsCount ?? 31} 종목
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-k">활성 캐시 계층</span>
            <span className="stat-v mono-num">
              {telemetry?.cacheTier === "l2-redis"
                ? "L2 Upstash Redis"
                : telemetry?.cacheTier === "l1-memory"
                ? "L1 Instance Cache"
                : "Origin Fresh"}
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-k">캐시 방어율</span>
            <span className="stat-v mono-num text-up">{hitRate}%</span>
          </div>
          <div className="stat-tile">
            <span className="stat-k">Singleflight 병합</span>
            <span className="stat-v mono-num">
              {telemetry?.coalescedRequestsTotal ?? 0}건
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-k">업스트림 동기화</span>
            <span className="stat-v mono-num">
              {telemetry?.upstreamCallsTotal ?? 0}회
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-k">캐시 TTL / 경과</span>
            <span className="stat-v mono-num">
              {telemetry?.ttlSeconds ?? 20}s / {telemetry?.ageSeconds ?? 0}s
            </span>
          </div>
        </div>

        <div className="provider-status-list">
          <div className="provider-row">
            <div className="provider-name">
              <Activity size={14} />
              <span>글로벌 실거래소 피드 (Yahoo v8 + ECB 환율)</span>
            </div>
            <span
              className={`status-pill ${
                (telemetry?.liveMappedCount ?? 0) > 0 ? "pill-ok" : "pill-muted"
              }`}
            >
              {(telemetry?.liveMappedCount ?? 0) > 0 ? "실데이터 활성" : "대기"}
            </span>
          </div>
          <div className="provider-row">
            <div className="provider-name">
              <Activity size={14} />
              <span>Polygon.io (실시간 FX·지수 배치 스냅샷)</span>
            </div>
            <span
              className={`status-pill ${
                telemetry?.providersConfigured.polygon ? "pill-ok" : "pill-muted"
              }`}
            >
              {telemetry?.providersConfigured.polygon ? "키 연결됨 (우선)" : "선택 연동"}
            </span>
          </div>
          <div className="provider-row">
            <div className="provider-name">
              <Activity size={14} />
              <span>Finnhub (벌크 FX + OANDA 원자재)</span>
            </div>
            <span
              className={`status-pill ${
                telemetry?.providersConfigured.finnhub ? "pill-ok" : "pill-muted"
              }`}
            >
              {telemetry?.providersConfigured.finnhub ? "키 연결됨 (우선)" : "선택 연동"}
            </span>
          </div>
          <div className="provider-row">
            <div className="provider-name">
              <Database size={14} />
              <span>Upstash Redis (멀티 리전 분산 락 & 공유 캐시)</span>
            </div>
            <span
              className={`status-pill ${
                telemetry?.redisConfigured ? "pill-ok" : "pill-muted"
              }`}
            >
              {telemetry?.redisConfigured ? "분산 캐시 활성" : "단일 L1 + Edge CDN"}
            </span>
          </div>
        </div>

        <div className="modal-footnote">
          API 키가 없어도 31개 글로벌 주가지수·외환·원자재 실제 시세와 15분봉 일중 차트가 자동 매핑되며,{" "}
          <code>POLYGON_API_KEY</code>·<code>FINNHUB_API_KEY</code>를 추가하면 상용 API가 1순위로 우선 적용됩니다.
        </div>
      </div>
    </div>
  );
}
