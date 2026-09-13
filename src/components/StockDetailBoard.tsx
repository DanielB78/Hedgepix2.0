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
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] py-3 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[color:var(--fog)]">
          {trade.member ?? "Unknown"}
        </p>
        <p className="text-xs text-[color:var(--fog-dim)]">
          {trade.source === "ceo" ? "CEO" : chamberLabel(trade.chamber)} ·{" "}
          {formatShortDate(trade.disclosure_date ?? trade.transaction_date)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`text-xs font-semibold uppercase tracking-wide ${
            buy ? "text-[color:var(--mint)]" : "text-[color:var(--coral)]"
          }`}
        >
          {tradeVerb(trade.transaction_type)}
        </p>
        <p className="text-xs text-[color:var(--fog-dim)]">
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
    const isCeo = t.source === "ceo";
    if (source === "ceo") return isCeo;
    if (source === "both") return true;
    if (source === "house") return !isCeo && t.chamber === "house";
    if (source === "senate") return !isCeo && t.chamber === "senate";
    return !isCeo; // congress
  });
}

export function StockDetailBoard({
  ticker,
  asset,
  bars,
  trades,
  range,
  latest,
  changePct,
  error,
}: Props) {
  const [tradeSource, setTradeSource] = useState<ChartTradeSource>("both");

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
    <section className="animate-expand overflow-hidden rounded-[24px] border border-[color:var(--aqua)]/25 bg-[color:var(--panel)] shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[color:var(--line)] px-5 py-5 sm:px-6">
        <div>
          <p className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[color:var(--fog)] sm:text-4xl">
            {ticker}
          </p>
          <p className="mt-1 text-sm text-[color:var(--fog-dim)]">
            {cleanAssetName(asset) ?? "Listed security"}
            {uniqueMembers
              ? ` · ${uniqueMembers} member${uniqueMembers === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <div className="flex items-end gap-4">
          {latest != null ? (
            <div className="text-right">
              <div className="text-2xl font-semibold tracking-tight text-[color:var(--fog)]">
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
          <Link
            href="/app?view=feed"
            className="rounded-full px-3 py-1.5 text-sm text-[color:var(--fog-dim)] hover:bg-[color:var(--panel-elevated)] hover:text-[color:var(--fog)]"
          >
            ← Feed
          </Link>
        </div>
      </div>

      {error ? (
        <div className="border-b border-[color:var(--line)] px-5 py-3 text-sm text-[color:var(--coral)] sm:px-6">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-[70vh] lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <aside className="flex max-h-[50vh] flex-col border-b border-[color:var(--line)] lg:max-h-[calc(100vh-10rem)] lg:border-b-0 lg:border-r">
          <div className="shrink-0 space-y-3 px-5 py-4">
            <div className="grid grid-cols-3 gap-1 rounded-[16px] bg-[color:var(--panel-elevated)] p-1 sm:grid-cols-5">
              {(
                [
                  ["congress", "Congress"],
                  ["house", "House"],
                  ["senate", "Senate"],
                  ["ceo", "CEO"],
                  ["both", "Both"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTradeSource(value)}
                  className={`rounded-full px-2 py-2 text-xs font-semibold transition-colors ${
                    tradeSource === value
                      ? "bg-[color:var(--mint)] text-[color:var(--ink)]"
                      : "text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
              Trades · {activity.length}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            {activity.length ? (
              activity.map((trade) => (
                <MemberTradeRow key={trade.id} trade={trade} />
              ))
            ) : (
              <p className="text-sm text-[color:var(--fog-dim)]">
                No buys or sales for this ticker.
              </p>
            )}
          </div>
        </aside>

        <div className="flex min-h-[420px] flex-col p-4 sm:p-6">
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
      </div>
    </section>
  );
}
