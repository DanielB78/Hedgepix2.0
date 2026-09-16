"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import { SectorChips } from "@/components/SectorChips";
import { SectorOverlapBadge } from "@/components/SectorOverlapBadge";
import type { MemberStockPreviewPayload } from "@/lib/feed";
import type { TradeDisclosureGroup } from "@/lib/groupTrades";
import {
  chamberLabel,
  formatAmountRange,
  formatShortDate,
  tradeVerb,
} from "@/lib/format";
import { memberHref } from "@/lib/holdings";
import type { CongressTrade } from "@/lib/types";
import { asCongressChartTrade } from "@/lib/chartTrades";
import type { SectorOverlapResult } from "@/lib/sectorOverlap";

type ChartState = {
  ticker: string;
  focusDate: string | null;
  data: MemberStockPreviewPayload | null;
  loading: boolean;
  error: string | null;
};

async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function activityHint(group: TradeDisclosureGroup) {
  const parts: string[] = [];
  if (group.purchaseCount > 0) {
    parts.push(`${group.purchaseCount} buy${group.purchaseCount === 1 ? "" : "s"}`);
  }
  if (group.saleCount > 0) {
    parts.push(`${group.saleCount} sale${group.saleCount === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

function pickDefaultTrade(trades: CongressTrade[]): CongressTrade | null {
  const withTicker = trades.filter((t) => (t.ticker ?? "").trim());
  return (
    withTicker.find((t) => t.transaction_type === "purchase") ??
    withTicker[0] ??
    null
  );
}

export function DisclosureDayCard({
  group,
  defaultOpen = false,
  sectorByTicker,
  memberSectors,
  sectorOverlaps,
}: {
  group: TradeDisclosureGroup;
  defaultOpen?: boolean;
  /** ticker → industry/sector label */
  sectorByTicker?: Record<string, string>;
  /** Committee industry labels for this member (shown when expanded). */
  memberSectors?: string[];
  sectorOverlaps?: Record<string, SectorOverlapResult>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chart, setChart] = useState<ChartState | null>(null);
  const requestId = useRef(0);

  const orderedTrades = useMemo(() => {
    const buys = group.trades.filter((t) => t.transaction_type === "purchase");
    const sales = group.trades.filter((t) => t.transaction_type === "sale");
    const other = group.trades.filter(
      (t) => t.transaction_type !== "purchase" && t.transaction_type !== "sale",
    );
    return [...buys, ...sales, ...other];
  }, [group.trades]);

  const loadTradeChart = useCallback(
    async (trade: CongressTrade) => {
      const ticker = (trade.ticker ?? "").trim().toUpperCase();
      if (!ticker) return;
      const slug = group.memberSlug?.trim();
      const focusDate = trade.transaction_date ?? trade.disclosure_date;
      setSelectedId(trade.id);
      setChart({
        ticker,
        focusDate,
        data: null,
        loading: true,
        error: null,
      });

      const id = ++requestId.current;
      try {
        if (slug) {
          const data = await loadJson<MemberStockPreviewPayload>(
            `/api/feed/preview?kind=member-stock&slug=${encodeURIComponent(slug)}&ticker=${encodeURIComponent(ticker)}`,
          );
          if (id !== requestId.current) return;
          setChart({
            ticker,
            focusDate,
            data,
            loading: false,
            error: null,
          });
        } else {
          // Fallback: stock preview when slug is missing (or Form 4 insiders)
          const source = group.chartSource === "ceo" ? "ceo" : "congress";
          const data = await loadJson<{
            ticker: string;
            asset: string | null;
            bars: MemberStockPreviewPayload["bars"];
            topTrades: CongressTrade[];
          }>(
            `/api/feed/preview?kind=stock&ticker=${encodeURIComponent(ticker)}&source=${source}`,
          );
          if (id !== requestId.current) return;
          setChart({
            ticker,
            focusDate,
            data: {
              slug: "",
              name: group.member ?? "Unknown",
              ticker,
              asset: data.asset,
              bars: data.bars,
              trades: data.topTrades,
            },
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (id !== requestId.current) return;
        setChart({
          ticker,
          focusDate,
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load chart",
        });
      }
    },
    [group.chartSource, group.member, group.memberSlug],
  );

  useEffect(() => {
    if (!open) return;
    if (selectedId) return;
    const first = pickDefaultTrade(orderedTrades);
    if (first) void loadTradeChart(first);
  }, [open, selectedId, orderedTrades, loadTradeChart]);

  const chartTrades = useMemo(() => {
    if (!chart?.data?.trades) return [];
    return chart.data.trades.map(asCongressChartTrade);
  }, [chart?.data?.trades]);

  const hint = activityHint(group);
  const tickers = [
    ...new Set(
      group.trades
        .map((t) => (t.ticker ?? "").toUpperCase())
        .filter(Boolean),
    ),
  ];

  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--line)] bg-[color:var(--panel)]">
      <div className="flex w-full items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-90"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span
            aria-hidden
            className={`text-sm text-[color:var(--fog-dim)] transition-transform ${
              open ? "rotate-90" : ""
            }`}
          >
            ›
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="truncate font-medium text-[color:var(--fog)]">
                {group.member ?? "Unknown member"}
              </span>
              <span className="hx-meta">
                {group.roleLabel
                  ? group.roleLabel
                  : chamberLabel(group.chamber)}
                {!group.roleLabel && group.state ? ` · ${group.state}` : ""}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-[color:var(--fog-dim)]">
              {hint || `${group.trades.length} trade${group.trades.length === 1 ? "" : "s"}`}
              {tickers.length ? (
                <>
                  {" · "}
                  {tickers.slice(0, 4).map((t, i) => (
                    <span key={t}>
                      {i > 0 ? ", " : ""}
                      {t}
                      {sectorByTicker?.[t] ? (
                        <span className="text-[color:var(--fog-mute)]">
                          {" "}
                          ({sectorByTicker[t]})
                        </span>
                      ) : null}
                    </span>
                  ))}
                  {tickers.length > 4 ? "…" : ""}
                </>
              ) : null}
            </p>
          </div>
          <span className="hx-meta shrink-0 whitespace-nowrap">
            {formatShortDate(group.disclosureDate)}
          </span>
        </button>
        {group.memberSlug ? (
          <Link
            href={memberHref(group.memberSlug)}
            className="shrink-0 text-xs font-medium text-[color:var(--mint)] hover:opacity-80"
          >
            Profile
          </Link>
        ) : null}
      </div>

      {open ? (
        <div className="border-t border-[color:var(--line)]">
          {memberSectors && memberSectors.length > 0 ? (
            <div className="border-b border-[color:var(--line)] px-4 py-2.5">
              <SectorChips labels={memberSectors} />
            </div>
          ) : null}
          <div className="grid lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
            <aside className="max-h-[420px] overflow-y-auto border-b border-[color:var(--line)] lg:max-h-[480px] lg:border-b-0 lg:border-r">
              <div className="px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
                  Activity · {orderedTrades.length}
                </p>
              </div>
              <ul>
                {orderedTrades.map((trade) => {
                  const ticker = (trade.ticker ?? "").toUpperCase();
                  const buy = trade.transaction_type === "purchase";
                  const active = selectedId === trade.id;
                  return (
                    <li key={trade.id}>
                      <button
                        type="button"
                        disabled={!ticker}
                        onClick={() => void loadTradeChart(trade)}
                        className={`flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left transition-colors disabled:opacity-40 ${
                          active
                            ? "bg-[color:var(--accent-soft)]"
                            : "hover:bg-[color:var(--panel-elevated)]"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 font-medium tracking-tight text-[color:var(--fog)]">
                            <span>{ticker || "—"}</span>
                            {sectorByTicker?.[ticker] ? (
                              <span className="rounded bg-[color:var(--panel-elevated)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--fog-dim)]">
                                {sectorByTicker[ticker]}
                              </span>
                            ) : null}
                            <SectorOverlapBadge
                              overlap={sectorOverlaps?.[trade.id]}
                            />
                          </div>
                          <p className="hx-meta line-clamp-1">
                            {trade.asset ?? "Equity"}
                          </p>
                          <p className="hx-meta mt-0.5">
                            Tx {formatShortDate(trade.transaction_date)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={buy ? "hx-buy" : "hx-sell"}>
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
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <div className="p-4 sm:p-5">
              {chart?.loading ? (
                <div className="flex h-[280px] items-center justify-center text-sm text-[color:var(--fog-dim)]">
                  Loading chart…
                </div>
              ) : chart?.error ? (
                <div className="flex h-[280px] items-center justify-center text-sm text-[color:var(--coral)]">
                  {chart.error}
                </div>
              ) : chart?.data?.bars.length ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="font-[family-name:var(--font-display)] text-base font-semibold text-[color:var(--fog)]">
                        {chart.ticker}
                      </p>
                      <p className="text-sm text-[color:var(--fog-dim)]">
                        {chart.data.asset ?? "Listed security"}
                        {group.member ? ` · ${group.member}` : ""}
                      </p>
                    </div>
                    <Link
                      href={`/stocks/${encodeURIComponent(chart.ticker)}`}
                      className="text-sm text-[color:var(--mint)] hover:opacity-80"
                    >
                      Open full view →
                    </Link>
                  </div>
                  <PriceChart
                    key={`${chart.ticker}-${chart.focusDate ?? ""}`}
                    bars={chart.data.bars}
                    trades={chartTrades}
                    interactive
                    focusDate={chart.focusDate}
                  />
                </div>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-[color:var(--fog-dim)]">
                  {orderedTrades.some((t) => t.ticker)
                    ? "Select a trade to load its chart."
                    : "No listed tickers in this disclosure."}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
