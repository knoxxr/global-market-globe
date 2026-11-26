"use client";

import React from "react";
import { Gauge } from "lucide-react";
import type { MacroIndicator, RiskRegime } from "@/lib/market/types";

interface MacroPulseStripProps {
  macro: MacroIndicator[];
  riskRegime: RiskRegime;
}

export default function MacroPulseStrip({ macro, riskRegime }: MacroPulseStripProps) {
  if (!macro || macro.length === 0) return null;

  return (
    <div className="macro-pulse-strip" aria-label="글로벌 거시 리스크 지표">
      <div className={`risk-badge risk-${riskRegime.tone}`}>
        <Gauge size={13} />
        <span className="risk-code">{riskRegime.label}</span>
        <span className="risk-ko">{riskRegime.labelKo}</span>
        <span className="risk-score mono-num">{riskRegime.score}</span>
      </div>

      <div className="macro-items-scroll">
        {macro.map((item) => {
          const isPositive = item.changePercent >= 0;
          // For VIX, rising means risk-off (red); for others, standard up=green
          const colorClass =
            item.symbol === "VIX"
              ? isPositive
                ? "text-down"
                : "text-up"
              : isPositive
              ? "text-up"
              : "text-down";

          return (
            <div key={item.id} className="macro-chip" title={`${item.nameKo} (${item.feedSymbol})`}>
              <span className="macro-sym">{item.symbol}</span>
              <span className="macro-val mono-num">
                {item.price.toLocaleString("en-US", {
                  minimumFractionDigits: item.decimals,
                  maximumFractionDigits: item.decimals,
                })}
                {item.unit === "%" ? "%" : ""}
              </span>
              <span className={`macro-chg mono-num ${colorClass}`}>
                {isPositive ? "+" : ""}
                {item.changePercent.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
