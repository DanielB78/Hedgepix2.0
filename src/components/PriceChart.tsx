"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { CongressTrade, StockPriceBar } from "@/lib/types";

type ChartPoint = {
  date: string;
  close: number;
  open: number | null;
  high: number | null;
  low: number | null;
  x: number;
  y: number;
};

type MarkerGroup = {
  date: string;
  x: number;
  y: number;
  close: number;
  trades: CongressTrade[];
  hasPurchase: boolean;
  hasSale: boolean;
};

type Props = {
  bars: StockPriceBar[];
  trades: CongressTrade[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 2 : 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
  } catch {
    return value;
  }
}

function nearestBarIndex(dates: string[], target: string) {
  let idx = -1;
  for (let i = 0; i < dates.length; i += 1) {
    if (dates[i]! <= target) idx = i;
    else break;
  }
  return idx;
}

function nearestPointIndex(points: ChartPoint[], clientX: number, svg: SVGSVGElement) {
  const rect = svg.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * Number(svg.viewBox.baseVal.width || 840);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const dist = Math.abs(points[i]!.x - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function PriceChart({ bars, trades }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [activeMarker, setActiveMarker] = useState<MarkerGroup | null>(null);
  const [pinnedMarker, setPinnedMarker] = useState(false);

  const chart = useMemo(() => {
    const raw = bars
      .filter((bar) => bar.close != null && bar.bar_date)
      .map((bar) => ({
        date: bar.bar_date,
        close: Number(bar.close),
        open: bar.open == null ? null : Number(bar.open),
        high: bar.high == null ? null : Number(bar.high),
        low: bar.low == null ? null : Number(bar.low),
      }));
    if (raw.length === 0) return null;

    const width = 840;
    const height = 340;
    const pad = { top: 24, right: 20, bottom: 28, left: 52 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const min = Math.min(...raw.map((p) => p.close));
    const max = Math.max(...raw.map((p) => p.close));
    const span = max - min || 1;
    const xAt = (i: number) =>
      pad.left + (raw.length === 1 ? innerW / 2 : (i / (raw.length - 1)) * innerW);
    const yAt = (price: number) =>
      pad.top + (1 - (price - min) / span) * innerH;

    const points: ChartPoint[] = raw.map((p, i) => ({
      ...p,
      x: xAt(i),
      y: yAt(p.close),
    }));

    const line = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    const dates = points.map((p) => p.date);
    const grouped = new Map<string, MarkerGroup>();
    for (const trade of trades) {
      if (!trade.transaction_date) continue;
      if (
        trade.transaction_type !== "purchase" &&
        trade.transaction_type !== "sale"
      ) {
        continue;
      }
      const idx = nearestBarIndex(dates, trade.transaction_date);
      if (idx < 0) continue;
      const point = points[idx]!;
      let group = grouped.get(point.date);
      if (!group) {
        group = {
          date: point.date,
          x: point.x,
          y: point.y,
          close: point.close,
          trades: [],
          hasPurchase: false,
          hasSale: false,
        };
        grouped.set(point.date, group);
      }
      group.trades.push(trade);
      if (trade.transaction_type === "purchase") group.hasPurchase = true;
      if (trade.transaction_type === "sale") group.hasSale = true;
    }

    const yTicks = [min, min + span / 2, max].map((price) => ({
      price,
      y: yAt(price),
    }));

    return {
      width,
      height,
      pad,
      line,
      points,
      yTicks,
      markers: [...grouped.values()],
      first: points[0]!.date,
      last: points[points.length - 1]!.date,
    };
  }, [bars, trades]);

  if (!chart) {
    return (
      <p className="rounded-[20px] bg-[color:var(--surface)] px-5 py-12 text-center text-[color:var(--muted)]">
        No price data yet.
      </p>
    );
  }

  const hoverPoint =
    hoverIndex != null && !activeMarker ? chart.points[hoverIndex] : null;

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (activeMarker && pinnedMarker) return;
    const svg = svgRef.current;
    if (!svg || !chart) return;
    const idx = nearestPointIndex(chart.points, event.clientX, svg);
    setHoverIndex(idx);
  }

  function clearHover() {
    if (!pinnedMarker) {
      setHoverIndex(null);
      setActiveMarker(null);
    }
  }

  const tooltip = activeMarker ? (
    <div className="pointer-events-none absolute top-4 left-4 z-10 max-w-xs rounded-[16px] bg-[color:var(--deep-navy)] px-4 py-3 text-sm text-[color:var(--cream)] shadow-[var(--shadow-soft)]">
      <div className="font-medium">
        {activeMarker.trades.length > 1
          ? `${activeMarker.trades.length} congressional transactions`
          : (activeMarker.trades[0]?.member ?? "Congressional trade")}
      </div>
      <ul className="mt-2 space-y-2">
        {activeMarker.trades.slice(0, 6).map((trade) => (
          <li key={trade.id} className="text-[color:color-mix(in_srgb,var(--cream)_82%,transparent)]">
            <div>
              {activeMarker.trades.length > 1
                ? `${trade.member ?? "Unknown"} — `
                : ""}
              <span className="capitalize">{trade.transaction_type}</span>
              {trade.amount_range ? ` · ${trade.amount_range}` : ""}
            </div>
            <div className="text-xs opacity-80">
              {formatDate(trade.transaction_date)}
              {trade.disclosure_date
                ? ` · Disclosed ${formatDate(trade.disclosure_date)}`
                : ""}
            </div>
          </li>
        ))}
      </ul>
      {activeMarker.trades.length > 6 ? (
        <div className="mt-2 text-xs opacity-70">
          +{activeMarker.trades.length - 6} more
        </div>
      ) : null}
      <div className="mt-2 text-xs opacity-70">
        Market close: {formatMoney(activeMarker.close)}
      </div>
    </div>
  ) : hoverPoint ? (
    <div className="pointer-events-none absolute top-4 left-4 z-10 rounded-[16px] bg-[color:var(--deep-navy)] px-4 py-3 text-sm text-[color:var(--cream)] shadow-[var(--shadow-soft)]">
      <div className="opacity-80">{formatDate(hoverPoint.date)}</div>
      <div className="mt-1 text-lg font-medium tracking-tight">
        {formatMoney(hoverPoint.close)}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative overflow-hidden rounded-[24px] bg-[color:var(--surface)]">
      {tooltip}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        aria-label="Interactive daily closing price chart"
        onPointerMove={onPointerMove}
        onPointerLeave={clearHover}
        onClick={() => {
          setPinnedMarker(false);
          setActiveMarker(null);
        }}
      >
        {chart.yTicks.map((tick) => (
          <g key={tick.price}>
            <line
              x1={chart.pad.left}
              x2={chart.width - chart.pad.right}
              y1={tick.y}
              y2={tick.y}
              stroke="color-mix(in srgb, var(--oatmeal) 55%, transparent)"
              strokeWidth="1"
            />
            <text
              x={chart.pad.left - 10}
              y={tick.y + 4}
              textAnchor="end"
              fill="var(--navy)"
              opacity="0.55"
              fontSize="11"
            >
              {formatMoney(tick.price)}
            </text>
          </g>
        ))}

        <path
          d={chart.line}
          fill="none"
          stroke="var(--deep-navy)"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hoverPoint ? (
          <g>
            <line
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={chart.pad.top}
              y2={chart.height - chart.pad.bottom}
              stroke="var(--oatmeal)"
              strokeWidth="1.5"
            />
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r="4.5"
              fill="var(--cream)"
              stroke="var(--deep-navy)"
              strokeWidth="2"
            />
          </g>
        ) : null}

        {chart.markers.map((group) => {
          const fill = group.hasSale && !group.hasPurchase
            ? "var(--rust)"
            : group.hasPurchase && !group.hasSale
              ? "var(--orange)"
              : "var(--orange)";
          const ring = group.hasSale && group.hasPurchase ? "var(--rust)" : fill;
          return (
            <g key={group.date}>
              {/* Larger invisible hit target */}
              <circle
                cx={group.x}
                cy={group.y}
                r="14"
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => {
                  setActiveMarker(group);
                  setHoverIndex(null);
                }}
                onMouseLeave={() => {
                  if (!pinnedMarker) setActiveMarker(null);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setPinnedMarker(true);
                  setActiveMarker(group);
                }}
                onTouchEnd={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setPinnedMarker(true);
                  setActiveMarker(group);
                }}
              />
              <circle
                cx={group.x}
                cy={group.y}
                r={activeMarker?.date === group.date ? 6.5 : 5}
                fill={fill}
                stroke={ring}
                strokeWidth={group.hasPurchase && group.hasSale ? 2 : 0}
                className="pointer-events-none transition-[r] duration-200"
              />
            </g>
          );
        })}

        <text
          x={chart.pad.left}
          y={chart.height - 8}
          fill="var(--navy)"
          opacity="0.5"
          fontSize="11"
        >
          {formatDate(chart.first)}
        </text>
        <text
          x={chart.width - chart.pad.right}
          y={chart.height - 8}
          textAnchor="end"
          fill="var(--navy)"
          opacity="0.5"
          fontSize="11"
        >
          {formatDate(chart.last)}
        </text>
      </svg>
    </div>
  );
}
