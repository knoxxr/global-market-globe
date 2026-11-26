"use client";

import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { SESSION_RELAY_BLOCKS, type SessionRelayItem } from "@/lib/market/catalog";
import type { GeoPoint } from "@/lib/market/types";

interface SessionRelayBarProps {
  onFocusCoords: (coords: GeoPoint, distance?: number) => void;
}

function getSessionStatus(item: SessionRelayItem, now: Date): {
  isOpen: boolean;
  minsUntilOpen: number;
} {
  const day = now.getUTCDay();
  const curMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const openMins = item.openHourUtc * 60 + item.openMinuteUtc;
  const closeMins = item.closeHourUtc * 60 + item.closeMinuteUtc;

  const isWeekend = day === 0 || day === 6;
  const isOpen = !isWeekend && curMins >= openMins && curMins <= closeMins;

  let minsUntilOpen = openMins - curMins;
  if (isWeekend) {
    const daysToMon = day === 6 ? 2 : 1;
    minsUntilOpen = daysToMon * 1440 + openMins - curMins;
  } else if (minsUntilOpen <= 0) {
    const extraDays = day === 5 ? 3 : 1;
    minsUntilOpen = extraDays * 1440 + openMins - curMins;
  }
  return { isOpen, minsUntilOpen };
}

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(
    2,
    "0"
  )}`;
}

export default function SessionRelayBar({ onFocusCoords }: SessionRelayBarProps) {
  // Start as null so SSR HTML and initial client render match 100% (zero hydration mismatch)
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    queueMicrotask(() => setNow(new Date()));
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const utcProgressPct = now
    ? ((now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60) / 1440) * 100
    : 0;

  const statuses = SESSION_RELAY_BLOCKS.map((block) => ({
    block,
    ...(now ? getSessionStatus(block, now) : { isOpen: false, minsUntilOpen: 0 }),
  }));

  const openSessions = statuses.filter((s) => s.isOpen);
  const nextOpening = [...statuses]
    .filter((s) => !s.isOpen)
    .sort((a, b) => a.minsUntilOpen - b.minsUntilOpen)[0];

  const nextSeconds =
    now && nextOpening
      ? Math.max(0, nextOpening.minsUntilOpen * 60 - now.getUTCSeconds())
      : 0;

  const kstTime = now
    ? now.toLocaleTimeString("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "--:--";

  const utcTime = now
    ? `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(
        2,
        "0"
      )}`
    : "--:--";

  return (
    <div className="session-relay-bar" aria-label="24시간 글로벌 증시 개장 릴레이">
      <div className="relay-header-row">
        <div className="relay-clock mono-num">
          <Clock size={12} />
          <span>KST {kstTime}</span>
          <span className="relay-sep">·</span>
          <span>UTC {utcTime}</span>
        </div>

        <div className="relay-countdown mono-num">
          {!now ? (
            <span>글로벌 세션 동기화 중...</span>
          ) : openSessions.length > 0 ? (
            <span className="relay-open-summary">
              <span className="live-mini-dot" />
              개장중: {openSessions.map((o) => o.block.labelKo).join(" · ")}
            </span>
          ) : nextOpening ? (
            <span>
              다음 개장 {nextOpening.block.labelKo}까지{" "}
              <strong>{formatCountdown(nextSeconds)}</strong>
            </span>
          ) : null}
        </div>
      </div>

      <div className="relay-timeline-track">
        {statuses.map(({ block, isOpen }) => {
          const leftPct = ((block.openHourUtc * 60 + block.openMinuteUtc) / 1440) * 100;
          const widthPct =
            ((block.closeHourUtc * 60 +
              block.closeMinuteUtc -
              (block.openHourUtc * 60 + block.openMinuteUtc)) /
              1440) *
            100;

          return (
            <button
              key={block.id}
              type="button"
              className={`relay-segment ${isOpen ? "is-open" : ""}`}
              style={{
                left: `${leftPct}%`,
                width: `${Math.max(widthPct, 12)}%`,
              }}
              onClick={() => onFocusCoords(block.coords, 2.25)}
              title={`${block.labelKo} (${block.exchange}) 클릭 시 지구본 이동`}
            >
              <span className="relay-seg-label">{block.labelKo}</span>
            </button>
          );
        })}

        {now && (
          <div
            className="relay-now-marker"
            style={{ left: `${utcProgressPct}%` }}
            title="현재 UTC 시각"
          />
        )}
      </div>
    </div>
  );
}
