"use client";

import { useMemo, useState } from "react";
import type { CongressTrade, StockPriceBar } from "@/lib/types";

type MarkerGroup = {
  date: string;
  x: number;
  y: number;
  purchases: CongressTrade[];
  sales: CongressTrade[];
};

type Props = {
  bars: StockPriceBar[];
  trades: CongressTrade[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
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

export function PriceChart({ bars, trades }: Props) {
  const [active, setActive] = useState<MarkerGroup | null>(null);
  const [pinned, setPinned] = useState(false);

  const chart = useMemo(() => {
    const points = bars
      .filter((bar) => bar.close != null && bar.bar_date)
      .map((bar) => ({ date: bar.bar_date, close: Number(bar.close) }));
    if (points.length === 0) return null;

    const width = 840;
    const height = 320;
    const pad = { top: 40, right: 16, bottom: 36, left: 56 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const min = Math.min(...points.map((p) => p.close));
    const max = Math.max(...points.map((p) => p.close));
    const span = max - min || 1;
    const xAt = (i: number) =>
      pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const yAt = (price: number) =>
      pad.top + (1 - (price - min) / span) * innerH;

    const line = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(p.close).toFixed(2)}`)
      .join(" ");

    const dates = points.map((p) => p.date);
    const grouped = new Map<string, MarkerGroup>();
    for (const trade of trades) {
      if (!trade.transaction_date) continue;
      const idx = nearestBarIndex(dates, trade.transaction_date);
      if (idx < 0) continue;
      const date = dates[idx]!;
      let group = grouped.get(date);
      if (!group) {
        group = {
          date,
          x: xAt(idx),
          y: yAt(points[idx]!.close),
          purchases: [],
          sales: [],
        };
        grouped.set(date, group);
      }
      if (trade.transaction_type === "sale") group.sales.push(trade);
      else if (trade.transaction_type === "purchase") group.purchases.push(trade);
    }

    const ticks = 4;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
      const price = min + (span * i) / ticks;
      return { price, y: yAt(price) };
    });

    const first = points[0]!.date;
    const last = points[points.length - 1]!.date;

    return {
      width,
      height,
      pad,
      line,
      yTicks,
      first,
      last,
      markers: [...grouped.values()],
    };
  }, [bars, trades]);

  if (!chart) {
    return (
      <p className="rounded border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-stone-600">
        No cached daily prices for this ticker yet. Run the updater after
        adding Alpaca keys to ingest bars.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-auto w-full rounded border border-stone-200 bg-white"
        role="img"
        aria-label="Daily closing price with congressional transaction markers"
        onClick={() => {
          setPinned(false);
          setActive(null);
        }}
      >
        {chart.yTicks.map((tick) => (
          <g key={tick.price}>
            <line
              x1={chart.pad.left}
              x2={chart.width - chart.pad.right}
              y1={tick.y}
              y2={tick.y}
              stroke="#e7e5e4"
              strokeWidth="1"
            />
            <text
              x={chart.pad.left - 8}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-stone-500"
              fontSize="11"
            >
              {formatMoney(tick.price)}
            </text>
          </g>
        ))}
        <path d={chart.line} fill="none" stroke="#0f766e" strokeWidth="2" />
        {chart.markers.map((group) => {
          const purchaseCount = group.purchases.length;
          const saleCount = group.sales.length;
          const purchaseMembers = new Set(
            group.purchases.map((t) => t.member_slug ?? t.member),
          ).size;
          const saleMembers = new Set(
            group.sales.map((t) => t.member_slug ?? t.member),
          ).size;
          return (
          <g key={group.date}>
            {purchaseCount > 0 ? (
              <g
                className="cursor-pointer"
                onMouseEnter={() => setActive(group)}
                onMouseLeave={() => {
                  if (!pinned) setActive(null);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setPinned(true);
                  setActive(group);
                }}
              >
                <polygon
                  points={`${group.x},${group.y - 14} ${group.x - 7},${group.y - 2} ${group.x + 7},${group.y - 2}`}
                  fill="#0f766e"
                />
                {purchaseCount > 1 ? (
                  <text
                    x={group.x}
                    y={group.y - 18}
                    textAnchor="middle"
                    className="fill-teal-800"
                    fontSize="10"
                  >
                    {purchaseMembers > 1
                      ? `${purchaseMembers} members`
                      : `${purchaseCount} txns`}
                  </text>
                ) : null}
              </g>
            ) : null}
            {saleCount > 0 ? (
              <g
                className="cursor-pointer"
                onMouseEnter={() => setActive(group)}
                onMouseLeave={() => {
                  if (!pinned) setActive(null);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setPinned(true);
                  setActive(group);
                }}
              >
                <polygon
                  points={`${group.x},${group.y + 14} ${group.x - 7},${group.y + 2} ${group.x + 7},${group.y + 2}`}
                  fill="#b45309"
                />
                {saleCount > 1 ? (
                  <text
                    x={group.x}
                    y={group.y + 28}
                    textAnchor="middle"
                    className="fill-amber-800"
                    fontSize="10"
                  >
                    {saleMembers > 1
                      ? `${saleMembers} members`
                      : `${saleCount} txns`}
                  </text>
                ) : null}
              </g>
            ) : null}
          </g>
          );
        })}
        <text
          x={chart.pad.left}
          y={chart.height - 10}
          className="fill-stone-500"
          fontSize="11"
        >
          {formatDate(chart.first)}
        </text>
        <text
          x={chart.width - chart.pad.right}
          y={chart.height - 10}
          textAnchor="end"
          className="fill-stone-500"
          fontSize="11"
        >
          {formatDate(chart.last)}
        </text>
      </svg>

      {active ? (
        <div className="rounded border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-800">
          <div className="font-medium text-stone-900">
            {formatDate(active.date)}
            {active.purchases.length + active.sales.length > 1
              ? ` · ${active.purchases.length + active.sales.length} transactions`
              : ""}
          </div>
          <ul className="mt-2 space-y-2">
            {[...active.purchases, ...active.sales].map((trade) => (
              <li key={trade.id}>
                <span className="font-medium">{trade.member ?? "Unknown member"}</span>
                {" · "}
                <span className="capitalize">{trade.transaction_type}</span>
                {trade.amount_range ? ` · ${trade.amount_range}` : ""}
                <div className="text-xs text-stone-600">
                  Transaction {formatDate(trade.transaction_date)} · Disclosed{" "}
                  {formatDate(trade.disclosure_date)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-stone-500">
          Hover a marker for member, type, amount range, and dates. Daily close
          is approximate market context, not an exact execution price.
        </p>
      )}
      <p className="flex flex-wrap gap-4 text-xs text-stone-600">
        <span>
          <span className="font-medium text-teal-800">▲</span> Purchase
        </span>
        <span>
          <span className="font-medium text-amber-800">▼</span> Sale
        </span>
        <span>Same-day trades share one marker.</span>
      </p>
    </div>
  );
}
