"use client";

import React, { useId } from "react";

interface SparklineProps {
  data: number[];
  positive: boolean;
  width?: number;
  height?: number;
  strokeWidth?: number;
  showArea?: boolean;
}

export default function Sparkline({
  data,
  positive,
  width = 68,
  height = 24,
  strokeWidth = 1.6,
  showArea = true,
}: SparklineProps) {
  const gradId = useId();

  if (!data || data.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padY = 2.5;
  const usableH = height - padY * 2;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = padY + (1 - (v - min) / range) * usableH;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], idx) => `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const areaPath = `${linePath} L${width.toFixed(1)},${height.toFixed(1)} L0,${height.toFixed(
    1
  )} Z`;

  const strokeColor = positive ? "#f43f5e" : "#60a5fa";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="sparkline-svg"
      aria-hidden="true"
    >
      {showArea && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {showArea && <path d={areaPath} fill={`url(#${gradId})`} />}
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
