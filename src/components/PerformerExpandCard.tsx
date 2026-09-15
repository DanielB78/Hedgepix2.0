"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import type { MemberStockPreviewPayload } from "@/lib/feed";
import {
  formatAmountRange,
  formatShortDate,
} from "@/lib/format";
import { memberHref } from "@/lib/holdings";
import { asCongressChartTrade } from "@/lib/chartTrades";
import {
  PERFORMER_PERIODS,
  performerPeriodLabel,
  type MemberBuyPerformance,
  type MemberBuysPayload,
  type PerformerPeriod,
  type TopPerformer,
} from "@/lib/topPerformers";

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

function formatReturnPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

type ChartState = {
  buyId: string;
  ticker: string;
  focusDate: string | null;
  data: MemberStockPreviewPayload | null;
  loading: boolean;
  error: string | null;
};

export function PerformerExpandCard({
  rank,
  row,
  expanded,
  defaultPeriod,
  onToggle,
  sectorByTicker,
}: {
  rank: number;
  row: TopPerformer;
  expanded: boolean;
  defaultPeriod: PerformerPeriod;
  onToggle: () => void;
  sectorByTicker?: Record<string, string>;
}) {
  const positive = row.avgReturnPct >= 0;
  const clickableMember = !!row.memberSlug;
  const [period, setPeriod] = useState<PerformerPeriod>(defaultPeriod);
  const [buysPayload, setBuysPayload] = useState<MemberBuysPayload | null>(null);
  const [loadingBuys, setLoadingBuys] = useState(false);
  const [buysError, setBuysError] = useState<string | null>(null);
  const [chart, setChart] = useState<ChartState | null>(null);
  const buysRequestId = useRef(0);
  const chartRequestId = useRef(0);

  useEffect(() => {
    if (expanded) setPeriod(defaultPeriod);
  }, [defaultPeriod, expanded]);

  useEffect(() => {
    if (!expanded || !row.memberSlug) return;
    const slug = row.memberSlug;
    const id = ++buysRequestId.current;
    setLoadingBuys(true);
    setBuysError(null);
    setChart(null);
    void loadJson<MemberBuysPayload>(
      `/api/feed/preview?kind=member-buys&slug=${encodeURIComponent(slug)}&perf=${encodeURIComponent(period)}`,
    )
      .then((data) => {
        if (id !== buysRequestId.current) return;
        setBuysPayload(data);
        setLoadingBuys(false);
      })
      .catch((err) => {
        if (id !== buysRequestId.current) return;
        setBuysPayload(null);
        setLoadingBuys(false);
        setBuysError(err instanceof Error ? err.message : "Failed to load buys");
      });
  }, [expanded, period, row.memberSlug]);

  const buys = buysPayload?.buys ?? [];

  const loadBuyChart = useCallback(
    async (buy: MemberBuyPerformance) => {
      if (!row.memberSlug) return;
      const slug = row.memberSlug;
      setChart({
        buyId: buy.id,
        ticker: buy.ticker,
        focusDate: buy.transactionDate,
        data: null,
        loading: true,
        error: null,
      });
      const id = ++chartRequestId.current;
      try {
        const data = await loadJson<MemberStockPreviewPayload>(
          `/api/feed/preview?kind=member-stock&slug=${encodeURIComponent(slug)}&ticker=${encodeURIComponent(buy.ticker)}`,
        );
        if (id !== chartRequestId.current) return;
        setChart({
          buyId: buy.id,
          ticker: buy.ticker,
          focusDate: buy.transactionDate,
          data,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (id !== chartRequestId.current) return;
        setChart({
          buyId: buy.id,
          ticker: buy.ticker,
          focusDate: buy.transactionDate,
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load chart",
        });
      }
    },
    [row.memberSlug],
  );

  // Auto-select best / first priced buy when list loads.
  useEffect(() => {
    if (!expanded || loadingBuys || chart) return;
    const first =
      buys.find((b) => b.returnPct != null) ?? buys[0] ?? null;
    if (first) void loadBuyChart(first);
  }, [buys, chart, expanded, loadBuyChart, loadingBuys]);

  const chartTrades = useMemo(() => {
    if (!chart?.data?.trades) return [];
    return chart.data.trades.map(asCongressChartTrade);
  }, [chart?.data?.trades]);

  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--line)] bg-[color:var(--panel)]">
      <div className="flex w-full items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-90"
          onClick={onToggle}
          aria-expanded={expanded}
          disabled={!clickableMember}
        >
          <span
            aria-hidden
            className={`text-sm text-[color:var(--fog-dim)] transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          >
            ›
          </span>
          <span className="w-6 shrink-0 text-sm font-semibold text-[color:var(--fog-dim)]">
            {rank}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-[family-name:var(--font-display)] text-base font-semibold text-[color:var(--fog)]">
              {row.name}
            </p>
            <p className="text-xs text-[color:var(--fog-dim)]">
              {row.kind === "ceo"
                ? "CEO"
                : row.kind === "house"
                  ? "House"
                  : "Senate"}{" "}
              · {row.pricedBuyCount} priced buy
              {row.pricedBuyCount === 1 ? "" : "s"}
              {row.bestTicker ? (
                <>
                  {" "}
                  · best {row.bestTicker}
                  {sectorByTicker?.[row.bestTicker] ? (
                    <span className="text-[color:var(--fog-mute)]">
                      {" "}
                      ({sectorByTicker[row.bestTicker]})
                    </span>
                  ) : null}
                  {row.bestReturnPct != null
                    ? ` (${formatReturnPct(row.bestReturnPct)})`
                    : null}
                </>
              ) : null}
            </p>
          </div>
          <span
            className={`shrink-0 font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight ${
              positive ? "text-[color:var(--mint)]" : "text-[color:var(--coral)]"
            }`}
          >
            {formatReturnPct(row.avgReturnPct)}
          </span>
        </button>
        {row.memberSlug ? (
          <Link
            href={memberHref(row.memberSlug)}
            className="shrink-0 text-xs font-medium text-[color:var(--mint)] hover:opacity-80"
          >
            Profile
          </Link>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-[color:var(--line)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line)] px-4 py-2.5">
            <p className="mr-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
              Buys since
            </p>
            {PERFORMER_PERIODS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                className="hx-tab"
                data-active={period === value ? "true" : "false"}
              >
                {performerPeriodLabel(value)}
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-[minmax(240px,340px)_minmax(0,1fr)]">
            <aside className="max-h-[420px] overflow-y-auto border-b border-[color:var(--line)] lg:max-h-[480px] lg:border-b-0 lg:border-r">
              <div className="px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
                  Tickers bought · {buys.length}
                </p>
              </div>
              {loadingBuys ? (
                <p className="px-4 pb-4 text-sm text-[color:var(--fog-dim)]">
                  Loading buys…
                </p>
              ) : buysError ? (
                <p className="px-4 pb-4 text-sm text-[color:var(--coral)]">
                  {buysError}
                </p>
              ) : buys.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-[color:var(--fog-dim)]">
                  No purchases in {performerPeriodLabel(period).toLowerCase()}.
                </p>
              ) : (
                <ul>
                  {buys.map((buy) => {
                    const active = chart?.buyId === buy.id;
                    const ret = buy.returnPct;
                    const retPositive = ret != null && ret >= 0;
                    return (
                      <li key={buy.id}>
                        <button
                          type="button"
                          onClick={() => void loadBuyChart(buy)}
                          className={`flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                            active
                              ? "bg-[color:var(--accent-soft)]"
                              : "hover:bg-[color:var(--panel-elevated)]"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-1.5 font-medium tracking-tight text-[color:var(--fog)]">
                              <span>{buy.ticker}</span>
                              {sectorByTicker?.[buy.ticker] ? (
                                <span className="rounded bg-[color:var(--panel-elevated)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--fog-dim)]">
                                  {sectorByTicker[buy.ticker]}
                                </span>
                              ) : null}
                            </p>
                            <p className="hx-meta line-clamp-1">
                              {buy.asset ?? "Equity"}
                            </p>
                            <p className="hx-meta mt-0.5">
                              Bought {formatShortDate(buy.transactionDate)}
                              {" · "}
                              {formatAmountRange(
                                buy.amountLow,
                                buy.amountHigh,
                                buy.amountRange,
                              )}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p
                              className={`font-[family-name:var(--font-display)] text-sm font-semibold ${
                                ret == null
                                  ? "text-[color:var(--fog-dim)]"
                                  : retPositive
                                    ? "text-[color:var(--mint)]"
                                    : "text-[color:var(--coral)]"
                              }`}
                            >
                              {ret == null ? "—" : formatReturnPct(ret)}
                            </p>
                            <p className="hx-meta">since buy</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
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
                        {row.name ? ` · ${row.name}` : ""}
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
                  Select a buy to load its chart.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
