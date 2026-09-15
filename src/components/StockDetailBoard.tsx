"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FollowButton } from "@/components/FollowButton";
import { PriceChart } from "@/components/PriceChart";
import type { ChartRange, StockPriceBar } from "@/lib/types";
import {
  type ChartTrade,
  type ChartTradeSource,
} from "@/lib/chartTrades";
import {
  chamberLabel,
  formatAmountRange,
  formatShortDate,
  tradeVerb,
} from "@/lib/format";

type Props = {
  ticker: string;
  asset: string | null;
  bars: StockPriceBar[];
  trades: ChartTrade[];
  range: ChartRange;
  latest: number | null;
  changePct: number | null;
  error: string | null;
  initialSource?: ChartTradeSource;
  sectorLabel?: string | null;
};

function cleanAssetName(asset: string | null) {
  if (!asset) return null;
  return asset
    .replace(/\s*-\s*Common Stock.*$/i, "")
    .replace(/\s*Common Stock.*$/i, "")
    .trim();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function MemberTradeRow({ trade }: { trade: ChartTrade }) {
  const buy = trade.transaction_type === "purchase";
  const slug = trade.member_slug;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-3 py-2.5 last:border-0">
      <div className="min-w-0">
        {slug ? (
          <Link
            href={`/members/${encodeURIComponent(slug)}`}
            className="truncate text-sm font-medium text-[color:var(--mint)] hover:opacity-80"
          >
            {trade.member ?? "Unknown"}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium text-[color:var(--fog)]">
            {trade.member ?? "Unknown"}
          </p>
        )}
        <p className="hx-meta">
          {chamberLabel(trade.chamber)} ·{" "}
          {formatShortDate(trade.disclosure_date ?? trade.transaction_date)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-xs uppercase tracking-wide ${buy ? "hx-buy" : "hx-sell"}`}>
          {tradeVerb(trade.transaction_type)}
        </p>
        <p className="hx-meta">
          {formatAmountRange(
            trade.amount_low,
            trade.amount_high,
            trade.amount_range,
          )}
        </p>
      </div>
    </div>
  );
}

function filterChartTrades(
  trades: ChartTrade[],
  source: ChartTradeSource,
): ChartTrade[] {
  return trades.filter((t) => {
    if (source === "house") return t.chamber === "house";
    if (source === "senate") return t.chamber === "senate";
    return true; // congress
  });
}

const CONGRESS_SOURCES: { value: ChartTradeSource; label: string }[] = [
  { value: "congress", label: "Congress" },
  { value: "house", label: "House" },
  { value: "senate", label: "Senate" },
];

export function StockDetailBoard({
  ticker,
  asset,
  bars,
  trades,
  range,
  latest,
  changePct,
  error,
  initialSource = "congress",
  sectorLabel = null,
}: Props) {
  const startSource =
    initialSource === "house" || initialSource === "senate"
      ? initialSource
      : "congress";
  const [tradeSource, setTradeSource] = useState<ChartTradeSource>(startSource);

  const activity = useMemo(() => {
    const base = trades.filter(
      (t) =>
        t.transaction_type === "purchase" || t.transaction_type === "sale",
    );
    return filterChartTrades(base, tradeSource);
  }, [trades, tradeSource]);

  const uniqueMembers = useMemo(() => {
    const set = new Set(
      activity.map((t) => t.member_slug ?? t.member ?? "unknown"),
    );
    return set.size;
  }, [activity]);

  return (
    <section className="hx-section animate-expand overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3 sm:px-5">
        <div>
          <p className="hx-page-title tracking-tight">{ticker}</p>
          <p className="hx-page-desc">
            {cleanAssetName(asset) ?? "Listed security"}
            {sectorLabel ? ` · ${sectorLabel}` : ""}
            {uniqueMembers
              ? ` · ${uniqueMembers} member${uniqueMembers === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <div className="flex items-end gap-3">
          {latest != null ? (
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums tracking-tight text-[color:var(--fog)]">
                {formatMoney(latest)}
              </div>
              {changePct != null ? (
                <div
                  className={
                    changePct >= 0
                      ? "text-sm text-[color:var(--mint)]"
                      : "text-sm text-[color:var(--coral)]"
                  }
                >
                  {formatPct(changePct)}
                </div>
              ) : null}
            </div>
          ) : null}
          <FollowButton type="ticker" targetKey={ticker} label={ticker} />
          <Link href="/app?view=house" className="hx-btn hx-btn-ghost">
            ← House
          </Link>
        </div>
      </div>

      {error ? (
        <div className="border-b border-[color:var(--line)] px-4 py-2.5 text-sm text-[color:var(--coral)] sm:px-5">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-[70vh] lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)]">
        <div className="order-1 flex min-h-[420px] flex-col border-b border-[color:var(--line)] p-3 sm:p-4 lg:order-0 lg:border-b-0 lg:border-r">
          {bars.length ? (
            <PriceChart
              bars={bars}
              trades={activity}
              interactive
              tall
              initialRange={range}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-[color:var(--fog-dim)]">
              No price history yet for this ticker.
            </div>
          )}
        </div>

        <aside className="order-2 flex max-h-[50vh] flex-col lg:order-0 lg:max-h-[calc(100vh-10rem)]">
          <div className="hx-section-head shrink-0 !flex-col !items-stretch gap-2">
            <div className="hx-toolbar gap-3">
              {CONGRESS_SOURCES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTradeSource(value)}
                  className="hx-tab"
                  data-active={tradeSource === value ? "true" : "false"}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="hx-section-title">Trades · {activity.length}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activity.length ? (
              activity.map((trade) => (
                <MemberTradeRow key={trade.id} trade={trade} />
              ))
            ) : (
              <p className="px-3 py-4 text-sm text-[color:var(--fog-dim)]">
                No buys or sales for this ticker.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
