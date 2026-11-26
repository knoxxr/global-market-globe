"use client";

import React from "react";
import { ExternalLink, Globe2, Newspaper, X } from "lucide-react";
import type { NewsPinItem } from "@/lib/market/types";

interface NewsDetailCardProps {
  news: NewsPinItem;
  onClose: () => void;
  onFocusOnGlobe: (news: NewsPinItem) => void;
}

function formatRelativeTime(ts: number): string {
  const diffMin = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  return `${Math.round(diffHr / 24)}일 전`;
}

export default function NewsDetailCard({
  news,
  onClose,
  onFocusOnGlobe,
}: NewsDetailCardProps) {
  const sentimentLabel =
    news.sentiment === "bullish"
      ? "강세 요인"
      : news.sentiment === "bearish"
      ? "약세 · 경계"
      : "글로벌 속보";

  return (
    <aside className="detail-card news-detail-card" aria-label="글로벌 금융 속보 상세">
      <div className="detail-header">
        <div className="detail-title-group">
          <div className="detail-badges">
            <span className="cat-tag cat-tag-news">
              <Newspaper size={11} style={{ display: "inline", marginRight: 4 }} />
              {news.cityKo}
            </span>
            <span className={`sentiment-tag sent-${news.sentiment}`}>{sentimentLabel}</span>
          </div>
          <h2 className="news-card-title">{news.title}</h2>
          <p className="detail-subtitle">
            {news.source} · {formatRelativeTime(news.publishedAt)}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="속보 카드 닫기">
          <X size={16} />
        </button>
      </div>

      {news.summary && <p className="news-card-summary">{news.summary}</p>}

      <div className="news-card-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onFocusOnGlobe(news)}
        >
          <Globe2 size={14} />
          위치 보기
        </button>
        <a
          href={news.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary-link"
        >
          원문 기사 열기
          <ExternalLink size={13} />
        </a>
      </div>
    </aside>
  );
}
