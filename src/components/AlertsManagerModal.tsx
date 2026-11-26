"use client";

import React from "react";
import { Bell, Globe2, Trash2, X } from "lucide-react";
import type { AnyMarketAsset, PriceAlert } from "@/lib/market/types";
import { formatAssetPrice } from "./AssetDetailCard";

interface AlertsManagerModalProps {
  alerts: PriceAlert[];
  allAssets: AnyMarketAsset[];
  onFocusAsset: (asset: AnyMarketAsset) => void;
  onRemoveAlert: (alertId: string) => void;
  onClearTriggered: () => void;
  onClose: () => void;
}

export default function AlertsManagerModal({
  alerts,
  allAssets,
  onFocusAsset,
  onRemoveAlert,
  onClearTriggered,
  onClose,
}: AlertsManagerModalProps) {
  const assetById = new Map(allAssets.map((a) => [a.id, a]));
  const triggeredCount = alerts.filter((a) => a.triggered).length;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="등록된 목표가 알림 관리"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="telemetry-modal alerts-modal">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <Bell size={18} className="accent-icon" />
            <div>
              <h2 className="modal-title">목표가 알림 통합 관리</h2>
              <p className="modal-sub">
                브라우저에 저장된 전체 가격 알림 ({alerts.length}건 · 도달 {triggeredCount}건)
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="창 닫기">
            <X size={16} />
          </button>
        </div>

        {alerts.length === 0 ? (
          <div className="watchlist-empty">
            등록된 목표가 알림이 없습니다. 지구본이나 목록에서 종목을 선택한 뒤 종(🔔) 아이콘으로 알림을 등록해 보세요.
          </div>
        ) : (
          <div className="alerts-manager-list">
            {alerts.map((al) => {
              const live = assetById.get(al.assetId);
              return (
                <div
                  key={al.id}
                  className={`alerts-manager-row ${al.triggered ? "is-triggered" : ""}`}
                >
                  <div className="alerts-row-info">
                    <div className="alerts-row-top">
                      <span className="alerts-sym">{al.symbol}</span>
                      <span className="alerts-name">{al.nameKo}</span>
                      <span className={`status-pill ${al.triggered ? "pill-ok" : "pill-muted"}`}>
                        {al.triggered ? "도달됨" : "감시중"}
                      </span>
                    </div>
                    <div className="alerts-row-sub mono-num">
                      조건: {al.direction === "above" ? "이상 (≥)" : "이하 (≤)"}{" "}
                      <strong>{formatAssetPrice(al.targetPrice, al.decimals)}</strong>
                      {live && (
                        <>
                          {" "}
                          · 현재가 {formatAssetPrice(live.price, live.decimals)}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="alerts-row-actions">
                    {live && (
                      <button
                        type="button"
                        className="icon-btn"
                        title="지구본에서 이동"
                        aria-label={`${al.nameKo} 위치로 이동`}
                        onClick={() => {
                          onFocusAsset(live);
                          onClose();
                        }}
                      >
                        <Globe2 size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      title="알림 삭제"
                      aria-label={`${al.nameKo} 알림 삭제`}
                      onClick={() => onRemoveAlert(al.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {triggeredCount > 0 && (
          <button
            type="button"
            className="btn-secondary full-width"
            onClick={onClearTriggered}
          >
            도달 완료된 알림 일괄 정리 ({triggeredCount}건)
          </button>
        )}

        <div className="modal-footnote">
          단축키 안내: <code>/</code> 검색 · <code>H</code> 히트맵 · <code>N</code> 속보핀 ·{" "}
          <code>Space</code> 자동회전 · <code>Esc</code> 닫기
        </div>
      </div>
    </div>
  );
}
