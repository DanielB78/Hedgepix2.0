"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { ChartRange, StockPriceBar } from "@/lib/types";
import { chartTradeLabel, type ChartTrade } from "@/lib/chartTrades";

type ChartPoint = {
  date: string;
  close: number;
  open: number | null;
  high: number | null;
  low: number | null;
  x: number;
  y: number;
  index: number;
};

type MarkerGroup = {
  date: string;
  x: number;
  y: number;
  close: number;
  trades: ChartTrade[];
  hasPurchase: boolean;
  hasSale: boolean;
};

type Props = {
  bars: StockPriceBar[];
  trades: ChartTrade[];
  /** Show range + member filters and enable zoom/pan gestures. */
  interactive?: boolean;
  /** Taller chart for the full ticker page. */
  tall?: boolean;
  initialRange?: ChartRange;
  /** Auto-pin the marker nearest this transaction date when data loads. */
  focusDate?: string | null;
};

const RANGES: { value: ChartRange; label: string }[] = [
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
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

function rangeCutoff(range: ChartRange): string | null {
  if (range === "all") return null;
  const days = range === "3m" ? 90 : range === "6m" ? 180 : 365;
  const now = new Date();
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  utc.setUTCDate(utc.getUTCDate() - days);
  return utc.toISOString().slice(0, 10);
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

function memberMatches(trade: ChartTrade, filters: string[]) {
  if (filters.length === 0) return true;
  const name = (trade.member ?? "").toLowerCase();
  const slug = (trade.member_slug ?? "").toLowerCase();
  return filters.some((f) => {
    const q = f.toLowerCase().trim();
    if (!q) return false;
    return name.includes(q) || slug.includes(q);
  });
}

export function PriceChart({
  bars,
  trades,
  interactive = false,
  tall = false,
  initialRange = "1y",
  focusDate = null,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [activeMarker, setActiveMarker] = useState<MarkerGroup | null>(null);
  const [pinnedMarker, setPinnedMarker] = useState(false);
  const [range, setRange] = useState<ChartRange>(initialRange);
  const [whoFilters, setWhoFilters] = useState<string[]>([]);
  const [whoInput, setWhoInput] = useState("");
  const [windowSpan, setWindowSpan] = useState<{ start: number; end: number } | null>(
    null,
  );
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    originStart: number;
    originEnd: number;
  } | null>(null);

  const filteredBars = useMemo(() => {
    const cutoff = rangeCutoff(range);
    return bars
      .filter((bar) => bar.close != null && bar.bar_date)
      .filter((bar) => !cutoff || bar.bar_date >= cutoff)
      .map((bar) => ({
        date: bar.bar_date,
        close: Number(bar.close),
        open: bar.open == null ? null : Number(bar.open),
        high: bar.high == null ? null : Number(bar.high),
        low: bar.low == null ? null : Number(bar.low),
      }));
  }, [bars, range]);

  const filteredTrades = useMemo(() => {
    const cutoff = rangeCutoff(range);
    return trades.filter((trade) => {
      if (
        trade.transaction_type !== "purchase" &&
        trade.transaction_type !== "sale"
      ) {
        return false;
      }
      if (!memberMatches(trade, whoFilters)) return false;
      const d = trade.transaction_date ?? trade.disclosure_date;
      if (cutoff && d && d < cutoff) return false;
      return true;
    });
  }, [trades, whoFilters, range]);

  useEffect(() => {
    setWindowSpan(null);
    setActiveMarker(null);
    setPinnedMarker(false);
    setHoverIndex(null);
  }, [range, whoFilters, bars]);

  const chart = useMemo(() => {
    if (filteredBars.length === 0) return null;

    const fullLen = filteredBars.length;
    let start = 0;
    let end = fullLen - 1;
    if (windowSpan) {
      start = Math.max(0, Math.min(windowSpan.start, fullLen - 1));
      end = Math.max(start, Math.min(windowSpan.end, fullLen - 1));
      const minSpan = Math.min(8, fullLen);
      if (end - start + 1 < minSpan) {
        end = Math.min(fullLen - 1, start + minSpan - 1);
        start = Math.max(0, end - minSpan + 1);
      }
    }
    const raw = filteredBars.slice(start, end + 1);
    if (raw.length === 0) return null;

    const width = 840;
    const height = tall ? 520 : 340;
    const pad = { top: 28, right: 20, bottom: 32, left: 56 };
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
      index: start + i,
    }));

    const line = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    const dates = points.map((p) => p.date);
    const grouped = new Map<string, MarkerGroup>();
    for (const trade of filteredTrades) {
      if (!trade.transaction_date) continue;
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
      fullLen,
      start,
      end,
    };
  }, [filteredBars, filteredTrades, windowSpan, tall]);

  useEffect(() => {
    if (!focusDate || !chart?.markers.length) return;
    const target = focusDate.slice(0, 10);
    let best: (typeof chart.markers)[number] | null = null;
    let bestDist = Infinity;
    for (const marker of chart.markers) {
      const dist = Math.abs(
        Date.parse(`${marker.date}T00:00:00Z`) -
          Date.parse(`${target}T00:00:00Z`),
      );
      if (!Number.isFinite(dist)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = marker;
      }
    }
    if (best) {
      setActiveMarker(best);
      setPinnedMarker(true);
    }
  }, [focusDate, chart]);

  function addWhoFilter(event?: FormEvent) {
    event?.preventDefault();
    const name = whoInput.trim();
    if (!name) return;
    const exists = whoFilters.some(
      (f) => f.toLowerCase() === name.toLowerCase(),
    );
    if (!exists) setWhoFilters((prev) => [...prev, name]);
    setWhoInput("");
  }

  function removeWhoFilter(name: string) {
    setWhoFilters((prev) => prev.filter((f) => f !== name));
  }

  function onWheel(event: ReactWheelEvent<SVGSVGElement>) {
    if (!interactive || !chart) return;
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const idx = nearestPointIndex(chart.points, event.clientX, svg);
    const focus = chart.points[idx]?.index ?? Math.floor((chart.start + chart.end) / 2);
    const span = chart.end - chart.start + 1;
    const zoomIn = event.deltaY < 0;
    const nextSpan = zoomIn
      ? Math.max(8, Math.floor(span * 0.8))
      : Math.min(chart.fullLen, Math.ceil(span * 1.25));
    let nextStart = focus - Math.floor(((focus - chart.start) / span) * nextSpan);
    let nextEnd = nextStart + nextSpan - 1;
    if (nextStart < 0) {
      nextStart = 0;
      nextEnd = nextSpan - 1;
    }
    if (nextEnd > chart.fullLen - 1) {
      nextEnd = chart.fullLen - 1;
      nextStart = Math.max(0, nextEnd - nextSpan + 1);
    }
    setWindowSpan({ start: nextStart, end: nextEnd });
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!interactive || !chart) return;
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      originStart: chart.start,
      originEnd: chart.end,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || !chart) return;

    if (dragRef.current && interactive) {
      const rect = svg.getBoundingClientRect();
      const pxPerIndex =
        rect.width / Math.max(1, dragRef.current.originEnd - dragRef.current.originStart);
      const deltaIdx = Math.round(
        (dragRef.current.startX - event.clientX) / Math.max(1, pxPerIndex),
      );
      const span = dragRef.current.originEnd - dragRef.current.originStart;
      let nextStart = dragRef.current.originStart + deltaIdx;
      let nextEnd = nextStart + span;
      if (nextStart < 0) {
        nextStart = 0;
        nextEnd = span;
      }
      if (nextEnd > chart.fullLen - 1) {
        nextEnd = chart.fullLen - 1;
        nextStart = Math.max(0, nextEnd - span);
      }
      setWindowSpan({ start: nextStart, end: nextEnd });
      return;
    }

    if (activeMarker && pinnedMarker) return;
    const idx = nearestPointIndex(chart.points, event.clientX, svg);
    setHoverIndex(idx);
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function clearHover() {
    if (!pinnedMarker) {
      setHoverIndex(null);
      setActiveMarker(null);
    }
  }

  if (!chart) {
    return (
      <div className="space-y-3">
        {interactive ? (
          <ChartFilters
            range={range}
            onRange={setRange}
            whoInput={whoInput}
            onWhoInput={setWhoInput}
            onAddWho={addWhoFilter}
            whoFilters={whoFilters}
            onRemoveWho={removeWhoFilter}
          />
        ) : null}
        <p className="rounded-md bg-[color:var(--surface)] px-4 py-8 text-center text-sm text-[color:var(--muted)]">
          No price data yet.
        </p>
      </div>
    );
  }

  const hoverPoint =
    hoverIndex != null && !activeMarker ? chart.points[hoverIndex] : null;

  const tooltip = activeMarker ? (
    <div className="pointer-events-none absolute top-3 left-3 z-10 max-w-sm rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2.5 text-sm text-[color:var(--fog)] shadow-[var(--shadow-soft)]">
      <div className="font-semibold text-[color:var(--fog)]">
        {activeMarker.trades.length > 1
          ? `${activeMarker.trades.length} transactions`
          : (activeMarker.trades[0]?.member ?? "Trade")}
      </div>
      <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
        {activeMarker.trades.map((trade) => (
          <li key={trade.id} className="text-[color:var(--fog-dim)]">
            <div className="text-[color:var(--fog)]">
              {activeMarker.trades.length > 1
                ? `${trade.member ?? "Unknown"} (${chartTradeLabel(trade)}) — `
                : `${chartTradeLabel(trade)} · `}
              <span className="capitalize">{trade.transaction_type}</span>
              {trade.amount_range ? ` · ${trade.amount_range}` : ""}
            </div>
            <div className="text-xs opacity-90">
              {formatDate(trade.transaction_date)}
              {trade.disclosure_date
                ? ` · Disclosed ${formatDate(trade.disclosure_date)}`
                : ""}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-xs text-[color:var(--fog-dim)]">
        Market close: {formatMoney(activeMarker.close)}
      </div>
    </div>
  ) : hoverPoint ? (
    <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2.5 text-sm text-[color:var(--fog)] shadow-[var(--shadow-soft)]">
      <div className="hx-meta">{formatDate(hoverPoint.date)}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums tracking-tight text-[color:var(--fog)]">
        {formatMoney(hoverPoint.close)}
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      {interactive ? (
        <ChartFilters
          range={range}
          onRange={(next) => {
            setRange(next);
            setWindowSpan(null);
          }}
          whoInput={whoInput}
          onWhoInput={setWhoInput}
          onAddWho={addWhoFilter}
          whoFilters={whoFilters}
          onRemoveWho={removeWhoFilter}
        />
      ) : null}

      <div
        className={`relative overflow-hidden rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] ${
          interactive ? "cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        {tooltip}
        {interactive ? (
          <p className="pointer-events-none absolute right-3 top-3 z-10 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)]/90 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--fog-dim)]">
            Scroll to zoom · drag to pan
          </p>
        ) : null}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className={`h-auto w-full ${interactive ? "touch-none" : "touch-pan-y"}`}
          role="img"
          aria-label="Interactive daily closing price chart"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={clearHover}
          onWheel={onWheel}
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
                stroke="color-mix(in srgb, var(--aqua) 22%, transparent)"
                strokeWidth="1"
              />
              <text
                x={chart.pad.left - 10}
                y={tick.y + 4}
                textAnchor="end"
                fill="var(--fog-dim)"
                fontSize="11"
              >
                {formatMoney(tick.price)}
              </text>
            </g>
          ))}

          <path
            d={chart.line}
            fill="none"
            stroke="var(--aqua)"
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
                stroke="color-mix(in srgb, var(--aqua) 45%, transparent)"
                strokeWidth="1.5"
              />
              <circle
                cx={hoverPoint.x}
                cy={hoverPoint.y}
                r="4.5"
                fill="var(--panel)"
                stroke="var(--aqua)"
                strokeWidth="2"
              />
            </g>
          ) : null}

          {chart.markers.map((group) => {
            const fill =
              group.hasSale && !group.hasPurchase
                ? "var(--coral)"
                : group.hasPurchase && !group.hasSale
                  ? "var(--mint)"
                  : "var(--gold)";
            const ring =
              group.hasSale && group.hasPurchase ? "var(--coral)" : fill;
            return (
              <g key={group.date}>
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
            fill="var(--fog-dim)"
            fontSize="11"
          >
            {formatDate(chart.first)}
          </text>
          <text
            x={chart.width - chart.pad.right}
            y={chart.height - 8}
            textAnchor="end"
            fill="var(--fog-dim)"
            fontSize="11"
          >
            {formatDate(chart.last)}
          </text>
        </svg>
      </div>

      {interactive && whoFilters.length > 0 ? (
        <p className="text-xs text-[color:var(--fog-dim)]">
          Showing buys &amp; sales for{" "}
          {whoFilters.map((n, i) => (
            <span key={n}>
              {i > 0 ? (i === whoFilters.length - 1 ? " and " : ", ") : ""}
              <span className="text-[color:var(--mint)]">{n}</span>
            </span>
          ))}
          {" · "}
          {filteredTrades.length} marker
          {filteredTrades.length === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

function ChartFilters({
  range,
  onRange,
  whoInput,
  onWhoInput,
  onAddWho,
  whoFilters,
  onRemoveWho,
}: {
  range: ChartRange;
  onRange: (range: ChartRange) => void;
  whoInput: string;
  onWhoInput: (value: string) => void;
  onAddWho: (event?: FormEvent) => void;
  whoFilters: string[];
  onRemoveWho: (name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="hx-toolbar gap-3">
        {RANGES.map((item) => {
          const active = range === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onRange(item.value)}
              className="hx-tab"
              data-active={active ? "true" : "false"}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={onAddWho}
        className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md sm:items-end"
      >
        <div className="flex w-full gap-2">
          <input
            type="text"
            value={whoInput}
            onChange={(event) => onWhoInput(event.target.value)}
            placeholder="Filter by member name…"
            className="hx-input min-w-0 flex-1"
          />
          <button type="submit" className="hx-btn shrink-0">
            Add
          </button>
        </div>
        {whoFilters.length ? (
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {whoFilters.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onRemoveWho(name)}
                className="hx-chip hx-chip-accent"
                title="Remove filter"
              >
                {name} ×
              </button>
            ))}
          </div>
        ) : (
          <p className="hx-meta sm:text-right">
            Add one or more names to show their buys &amp; sales together.
          </p>
        )}
      </form>
    </div>
  );
}
