"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatShortDate } from "@/lib/format";
import {
  GENERAL_SECTOR_ORDER,
  nicheLabelsForParent,
} from "@/lib/generalSectors";
import {
  TickerDetailView,
  type TickerDetailState,
} from "@/components/TickerDetailView";
import { SegmentedToggle } from "@/components/SegmentedToggle";
import type { StockPreviewPayload } from "@/lib/feed";
import type { ChartTradeSource } from "@/lib/chartTrades";

import type {
  FeedFilters,
  FeedSourceFilter,
  FeedTickerRow,
  FeedTimeframe,
  FeedTrendFilter,
  FeedOverlapFilter,
  FeedYesNoFilter,
} from "@/lib/feedActivity/types";
import {
  flattenNotableTrades,
  focusTickerRowOnBuyer,
  type NotableTradeRow,
} from "@/lib/feedActivity/notableTrades";

const TIMEFRAMES: Array<{ id: FeedTimeframe; label: string }> = [
  { id: "3m", label: "3 Months" },
  { id: "6m", label: "6 Months" },
  { id: "1y", label: "1 Year" },
];

export type WatchlistViewMode = "tickers" | "trades";

function parseWatchlistView(raw: string | null): WatchlistViewMode {
  return raw === "trades" ? "trades" : "tickers";
}

async function loadStockPreview(
  ticker: string,
  tradeSource: ChartTradeSource,
): Promise<StockPreviewPayload> {
  const res = await fetch(
    `/api/feed/preview?kind=stock&ticker=${encodeURIComponent(ticker)}&source=${tradeSource}`,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as StockPreviewPayload;
}

function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function daysAgoLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "—";
  const ms =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 60) return `${days} days ago`;
  return formatShortDate(iso);
}

function buildHref(
  timeframe: FeedTimeframe,
  filters: FeedFilters,
  viewMode: WatchlistViewMode = "tickers",
): string {
  const params = new URLSearchParams();
  if (timeframe !== "3m") params.set("tf", timeframe);
  if (viewMode !== "tickers") params.set("wv", viewMode);
  if (filters.source !== "all") params.set("src", filters.source);
  if (filters.trend !== "all") params.set("trend", filters.trend);
  if (filters.overlap !== "all") params.set("overlap", "1");
  if (filters.minBuyers > 0) params.set("minBuyers", String(filters.minBuyers));
  if (filters.minBuys > 0) params.set("minBuys", String(filters.minBuys));
  if (filters.minRepeatBuyers > 0) {
    params.set("minRepeat", String(filters.minRepeatBuyers));
  }
  if (filters.minOverlapBuyers > 0) {
    params.set("minOverlap", String(filters.minOverlapBuyers));
  }
  if (filters.minBuyers30d > 0) {
    params.set("minBuyers30d", String(filters.minBuyers30d));
  }
  if (filters.minActivityRatio > 0) {
    params.set("minAct", String(filters.minActivityRatio));
  }
  if (filters.averagingDown !== "all") {
    params.set("avgDown", filters.averagingDown);
  }
  if (filters.maxRelativeSectorPct != null) {
    params.set("maxRelSector", String(filters.maxRelativeSectorPct));
  }
  if (filters.crossSource !== "all") {
    params.set("crossSrc", filters.crossSource);
  }
  if (filters.nicheLabels.length) {
    params.set("sectors", filters.nicheLabels.join("|"));
  }
  const qs = params.toString();
  return qs ? `/watchlist?${qs}` : "/watchlist";
}

function NumInput({
  label,
  testId,
  value,
  onCommit,
}: {
  label: string;
  testId: string;
  value: number;
  onCommit: (n: number) => void;
}) {
  const [local, setLocal] = useState(String(value || ""));
  return (
    <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
      {label}
      <input
        data-testid={testId}
        type="number"
        min={0}
        step="any"
        className="w-14 rounded border border-[var(--line)] bg-[var(--panel)] px-1.5 py-1 text-[12px]"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit(Math.max(0, Number(local) || 0))}
      />
    </label>
  );
}

function FilterBar({
  timeframe,
  filters,
  viewMode,
  onNavigate,
}: {
  timeframe: FeedTimeframe;
  filters: FeedFilters;
  viewMode: WatchlistViewMode;
  onNavigate: (href: string) => void;
}) {
  const [sectorOpen, setSectorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  function apply(next: Partial<FeedFilters>, tf = timeframe, wv = viewMode) {
    onNavigate(buildHref(tf, { ...filters, ...next }, wv));
  }

  return (
    <div className="space-y-3">
      <SegmentedToggle
        testIdPrefix="watchlist-view"
        value={viewMode}
        onChange={(wv) => apply({}, timeframe, wv)}
        options={[
          { id: "tickers", label: "Notable Tickers" },
          { id: "trades", label: "Notable Trades" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {TIMEFRAMES.map((tf) => {
          const active = timeframe === tf.id;
          return (
            <button
              key={tf.id}
              type="button"
              data-testid={`feed-tf-${tf.id}`}
              className={[
                "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--fog-dim)] hover:text-[var(--ink)]",
              ].join(" ")}
              onClick={() => apply({}, tf.id)}
            >
              {tf.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
          Source
          <select
            data-testid="feed-source"
            className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)]"
            value={filters.source}
            onChange={(e) =>
              apply({ source: e.target.value as FeedSourceFilter })
            }
          >
            <option value="all">All</option>
            <option value="congress">Congress</option>
            <option value="house">House</option>
            <option value="senate">Senate</option>
            <option value="insiders">Insiders</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
          Trend
          <select
            data-testid="feed-trend"
            className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)]"
            value={filters.trend}
            onChange={(e) =>
              apply({ trend: e.target.value as FeedTrendFilter })
            }
          >
            <option value="all">All</option>
            <option value="down">Down</option>
            <option value="up">Up</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
          Overlap
          <select
            data-testid="feed-overlap"
            className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)]"
            value={filters.overlap}
            onChange={(e) =>
              apply({ overlap: e.target.value as FeedOverlapFilter })
            }
          >
            <option value="all">All</option>
            <option value="has_overlap">Has overlap</option>
          </select>
        </label>

        <div className="relative">
          <button
            type="button"
            className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--fog-dim)] hover:text-[var(--ink)]"
            onClick={() => setSectorOpen((v) => !v)}
          >
            Sector
            {filters.nicheLabels.length
              ? ` (${filters.nicheLabels.length})`
              : ""}
          </button>
          {sectorOpen ? (
            <div className="absolute left-0 z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--panel)] p-2 shadow-lg">
              {GENERAL_SECTOR_ORDER.map((parent) => (
                <div key={parent} className="mb-2">
                  <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fog-mute)]">
                    {parent}
                  </div>
                  {nicheLabelsForParent(parent)
                    .slice(0, 8)
                    .map((label) => {
                      const on = filters.nicheLabels.includes(label);
                      return (
                        <button
                          key={label}
                          type="button"
                          className={[
                            "block w-full rounded px-1.5 py-0.5 text-left text-[11px]",
                            on
                              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                              : "text-[var(--ink)] hover:bg-[var(--panel-muted)]",
                          ].join(" ")}
                          onClick={() => {
                            const next = on
                              ? filters.nicheLabels.filter((x) => x !== label)
                              : [...filters.nicheLabels, label];
                            apply({ nicheLabels: next });
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                </div>
              ))}
              {filters.nicheLabels.length > 0 ? (
                <button
                  type="button"
                  className="mt-1 w-full text-left text-[11px] text-[var(--fog-dim)]"
                  onClick={() => {
                    apply({ nicheLabels: [] });
                    setSectorOpen(false);
                  }}
                >
                  Clear sectors
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <NumInput
          label="Min buyers"
          testId="feed-min-buyers"
          value={filters.minBuyers}
          onCommit={(n) => apply({ minBuyers: n })}
        />
        <NumInput
          label="Min buys"
          testId="feed-min-buys"
          value={filters.minBuys}
          onCommit={(n) => apply({ minBuys: n })}
        />

        <button
          type="button"
          className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--fog-dim)] hover:text-[var(--ink)]"
          onClick={() => setMoreOpen((v) => !v)}
        >
          {moreOpen ? "Fewer filters" : "More filters"}
        </button>
      </div>

      {moreOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-2 text-[12px]">
          <NumInput
            label="Min repeat"
            testId="feed-min-repeat"
            value={filters.minRepeatBuyers}
            onCommit={(n) => apply({ minRepeatBuyers: n })}
          />
          <NumInput
            label="Min overlap buyers"
            testId="feed-min-overlap"
            value={filters.minOverlapBuyers}
            onCommit={(n) => apply({ minOverlapBuyers: n })}
          />
          <NumInput
            label="Min buyers / 30D"
            testId="feed-min-buyers-30d"
            value={filters.minBuyers30d}
            onCommit={(n) => apply({ minBuyers30d: n })}
          />
          <NumInput
            label="Min activity ×"
            testId="feed-min-activity"
            value={filters.minActivityRatio}
            onCommit={(n) => apply({ minActivityRatio: n })}
          />
          <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
            Averaging down
            <select
              data-testid="feed-avg-down"
              className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)]"
              value={filters.averagingDown}
              onChange={(e) =>
                apply({ averagingDown: e.target.value as FeedYesNoFilter })
              }
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
            Cross-source
            <select
              data-testid="feed-cross-source"
              className="rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[12px] text-[var(--ink)]"
              value={filters.crossSource}
              onChange={(e) =>
                apply({ crossSource: e.target.value as FeedYesNoFilter })
              }
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[var(--fog-dim)]">
            Rel. sector ≤
            <input
              data-testid="feed-max-rel-sector"
              type="number"
              className="w-16 rounded border border-[var(--line)] bg-[var(--panel)] px-1.5 py-1 text-[12px]"
              placeholder="%"
              defaultValue={
                filters.maxRelativeSectorPct != null
                  ? String(filters.maxRelativeSectorPct)
                  : ""
              }
              onBlur={(e) => {
                const raw = e.target.value.trim();
                apply({
                  maxRelativeSectorPct:
                    raw === "" || !Number.isFinite(Number(raw))
                      ? null
                      : Number(raw),
                });
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}


function preferredFeedSource(
  row: FeedTickerRow,
): import("@/lib/chartTrades").ChartTradeSource {
  const types = new Set(row.activeSourceTypes);
  const hasCongress = types.has("house") || types.has("senate");
  const hasInsider = types.has("insider");
  if (hasCongress && hasInsider) return "both";
  if (hasInsider && !hasCongress) return "ceo";
  if (types.has("house") && !types.has("senate")) return "house";
  if (types.has("senate") && !types.has("house")) return "senate";
  return "both";
}

function sequenceFocusDates(row: FeedTickerRow): string[] {
  const occasions = row.strongestBuyer?.occasions ?? [];
  return [
    ...new Set(
      occasions
        .map((o) => o.transactionDate?.slice(0, 10))
        .filter((d): d is string => Boolean(d)),
    ),
  ].sort();
}

function FeedRow({
  row,
  open,
  detail,
  onToggle,
  onTradeSource,
  onClose,
}: {
  row: FeedTickerRow;
  open: boolean;
  detail: import("@/components/TickerDetailView").TickerDetailState | null;
  onToggle: () => void;
  onTradeSource: (source: import("@/lib/chartTrades").ChartTradeSource) => void;
  onClose: () => void;
}) {
  const focusDates = sequenceFocusDates(row);
  const initialFocusDate =
    focusDates.slice().sort((a, b) => b.localeCompare(a))[0] ?? null;

  return (
    <>
      <tr
        data-testid={`feed-row-${row.ticker}`}
        className="cursor-pointer border-b border-[var(--line)] hover:bg-[var(--panel-muted)]"
        onClick={onToggle}
      >
        <td className="whitespace-nowrap py-2 pl-3 pr-2 text-[12px]">
          <span className="inline-flex items-center gap-1 font-mono font-semibold text-[var(--ink)]">
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {row.ticker}
          </span>
          {row.company ? (
            <div className="pl-4 text-[11px] text-[var(--fog-mute)]">
              {row.company}
            </div>
          ) : null}
          {row.strongestBuyer?.person ? (
            <div className="pl-4 text-[11px] text-[var(--fog-dim)]">
              Strongest: {row.strongestBuyer.person}
              {row.strongestBuyer.hasSectorOverlap ? " · overlap" : ""}
            </div>
          ) : null}
        </td>
        <td className="num py-2 pr-3 text-right text-[13px] font-semibold tabular-nums text-[var(--ink)]">
          {row.score}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums">
          {row.buyOccasions}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums text-[var(--fog-mute)]">
          {row.distinctBuyers}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums">
          {row.distinctOverlapBuyers}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums">
          {row.maxConsecutiveStreak >= 2
            ? row.maxConsecutiveStreak
            : row.repeatBuyers}
        </td>
        <td className="py-2 pr-3 text-[12px] tabular-nums">
          {row.isCurrentDowntrend ? (
            <span className="text-[var(--fog-dim)]">
              ↓ {pct(row.currentTrendReturn)}
            </span>
          ) : (
            <span className="text-[var(--fog-mute)]">
              {pct(row.currentTrendReturn)}
            </span>
          )}
        </td>
        <td className="py-2 pr-3 text-[12px] tabular-nums text-[var(--fog-dim)]">
          {row.relativeSectorReturn != null
            ? pct(row.relativeSectorReturn)
            : pct(row.relativeMarketReturn)}
        </td>
        <td className="py-2 pr-3 text-[12px] tabular-nums text-[var(--fog-dim)]">
          {row.buyersLast30d} / 30D
          {row.activityRatio != null && row.activityRatio >= 1.5
            ? ` · ${row.activityRatio.toFixed(1)}×`
            : ""}
        </td>
        <td className="py-2 pr-3 text-[12px] text-[var(--fog-dim)]">
          {daysAgoLabel(row.latestBuyDisclosure ?? row.latestBuyTransaction)}
        </td>
      </tr>
      {open && detail ? (
        <tr className="border-b border-[var(--line)]">
          <td colSpan={10} className="bg-[var(--panel-muted)] p-2 sm:p-3">
            <TickerDetailView
              context="feed"
              state={detail}
              feedRow={row}
              onClose={onClose}
              onTradeSource={onTradeSource}
              preferredSources={["both", "congress", "house", "senate", "ceo"]}
              initialFocusDate={initialFocusDate}
              highlightDates={focusDates}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function buySequenceLabel(trade: NotableTradeRow): string {
  const n =
    trade.signal.consecutiveStreak >= 2
      ? trade.signal.consecutiveStreak
      : trade.signal.buyCount;
  return n === 1 ? "1 buy" : `${n} buys`;
}

function TradeRow({
  trade,
  open,
  detail,
  onToggle,
  onTradeSource,
  onClose,
}: {
  trade: NotableTradeRow;
  open: boolean;
  detail: TickerDetailState | null;
  onToggle: () => void;
  onTradeSource: (source: ChartTradeSource) => void;
  onClose: () => void;
}) {
  const focusedRow = useMemo(
    () => focusTickerRowOnBuyer(trade.tickerRow, trade.signal.personKey),
    [trade],
  );
  const focusDates = sequenceFocusDates(focusedRow);
  const initialFocusDate = trade.latestBuyDate ?? focusDates.at(-1) ?? null;

  return (
    <>
      <tr
        data-testid={`notable-trade-${trade.id}`}
        className="cursor-pointer border-b border-[var(--line)] hover:bg-[var(--panel-muted)]"
        onClick={onToggle}
      >
        <td className="whitespace-nowrap py-2 pl-3 pr-2 text-[12px] text-[var(--ink)]">
          <span className="inline-flex items-center gap-1 font-medium">
            {open ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )}
            {trade.signal.person ?? "Unknown"}
          </span>
        </td>
        <td className="py-2 pr-3 font-mono text-[12px] font-semibold text-[var(--ink)]">
          {trade.ticker}
        </td>
        <td className="py-2 pr-3 text-[12px] text-[var(--fog-dim)]">
          {trade.signalLabel}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums">
          {buySequenceLabel(trade)}
        </td>
        <td className="py-2 pr-3 text-[12px] tabular-nums text-[var(--fog-dim)]">
          {trade.overlapLabel}
        </td>
        <td className="num py-2 pr-3 text-right text-[12px] tabular-nums text-[var(--fog-dim)]">
          {pct(trade.priceMovePct)}
        </td>
        <td className="py-2 pr-3 text-[12px] text-[var(--fog-dim)]">
          {trade.latestBuyDate ? formatShortDate(trade.latestBuyDate) : "—"}
        </td>
        <td className="num py-2 pr-3 text-right text-[13px] font-semibold tabular-nums text-[var(--ink)]">
          {trade.signal.score}
        </td>
      </tr>
      {open && detail ? (
        <tr className="border-b border-[var(--line)]">
          <td colSpan={8} className="bg-[var(--panel-muted)] p-2 sm:p-3">
            <TickerDetailView
              context="feed"
              state={detail}
              feedRow={focusedRow}
              onClose={onClose}
              onTradeSource={onTradeSource}
              preferredSources={["both", "congress", "house", "senate", "ceo"]}
              initialFocusDate={initialFocusDate}
              highlightDates={focusDates}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function FeedActivityBoard({
  rows,
  timeframe,
  filters,
  error,
  tradeCount,
}: {
  rows: FeedTickerRow[];
  timeframe: FeedTimeframe;
  filters: FeedFilters;
  error: string | null;
  tradeCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewMode = parseWatchlistView(searchParams.get("wv"));
  const [pending, startTransition] = useTransition();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<TickerDetailState | null>(null);
  const requestId = useRef(0);

  function onNavigate(href: string) {
    startTransition(() => {
      router.push(href);
    });
  }

  const notableTrades = useMemo(() => flattenNotableTrades(rows), [rows]);

  const openDetail = useCallback(
    async (
      row: FeedTickerRow,
      key: string,
      tradeSource?: ChartTradeSource,
    ) => {
      const source = tradeSource ?? preferredFeedSource(row);
      const id = ++requestId.current;
      setOpenKey(key);
      setDetail({
        ticker: row.ticker,
        tradeSource: source,
        data: null,
        loading: true,
        error: null,
      });
      try {
        const data = await loadStockPreview(row.ticker, source);
        if (id !== requestId.current) return;
        setDetail({
          ticker: row.ticker,
          tradeSource: source,
          data,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (id !== requestId.current) return;
        setDetail({
          ticker: row.ticker,
          tradeSource: source,
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load",
        });
      }
    },
    [],
  );

  const closeDetail = useCallback(() => {
    setOpenKey(null);
    setDetail(null);
  }, []);

  const toggleTicker = useCallback(
    (row: FeedTickerRow) => {
      if (openKey === row.ticker) {
        closeDetail();
        return;
      }
      void openDetail(row, row.ticker);
    },
    [closeDetail, openDetail, openKey],
  );

  const toggleTrade = useCallback(
    (trade: NotableTradeRow) => {
      if (openKey === trade.id) {
        closeDetail();
        return;
      }
      const focused = focusTickerRowOnBuyer(
        trade.tickerRow,
        trade.signal.personKey,
      );
      void openDetail(focused, trade.id);
    },
    [closeDetail, openDetail, openKey],
  );

  return (
    <div className={`space-y-4 ${pending ? "opacity-70" : ""}`}>
      <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 sm:p-4">
        <div className="mb-3">
          <h2 className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[var(--ink)]">
            Watchlist
          </h2>
          <p className="mt-0.5 max-w-2xl text-[12px] text-[var(--fog-dim)]">
            {viewMode === "trades"
              ? "Strongest individual buyer + ticker patterns — consecutive purchases, sector overlap, and averaging down. Distinct unrelated buyers are not a ranking factor."
              : "Ticker-level aggregation of buyer-specific sector-overlap signals — repeated purchases into weakness when a member's industry exposure overlaps the company."}
          </p>
        </div>
        <FilterBar
          timeframe={timeframe}
          filters={filters}
          viewMode={viewMode}
          onNavigate={onNavigate}
        />
      </div>

      {error ? (
        <div className="rounded-md border border-[var(--coral)]/30 bg-[color-mix(in_srgb,var(--coral)_6%,white)] px-3 py-2 text-[13px] text-[var(--coral)]">
          {error}
        </div>
      ) : null}

      {viewMode === "trades" ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2
              data-testid="feed-result-count"
              className="text-[13px] font-semibold text-[var(--ink)]"
            >
              {notableTrades.length.toLocaleString()} notable trade
              {notableTrades.length === 1 ? "" : "s"}
            </h2>
            <span className="text-[11px] text-[var(--fog-mute)]">
              from {tradeCount.toLocaleString()} trades · sorted by buyer+ticker
              score
            </span>
          </div>

          <div className="hx-table-wrap overflow-x-auto rounded-md border border-[var(--line)]">
            <table className="hx-table w-full min-w-[56rem]">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[11px] uppercase tracking-wide text-[var(--fog-mute)]">
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="py-2 pr-3 font-medium">Ticker</th>
                  <th className="py-2 pr-3 font-medium">Signal</th>
                  <th className="num py-2 pr-3 text-right font-medium">
                    Buy Sequence
                  </th>
                  <th className="py-2 pr-3 font-medium">Sector Overlap</th>
                  <th className="num py-2 pr-3 text-right font-medium">
                    Price Move
                  </th>
                  <th className="py-2 pr-3 font-medium">Latest Buy</th>
                  <th className="num py-2 pr-3 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {notableTrades.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-8 text-center text-[13px] text-[var(--fog-dim)]"
                    >
                      No notable trades match the current Watchlist criteria.
                    </td>
                  </tr>
                ) : (
                  notableTrades.map((trade) => (
                    <TradeRow
                      key={trade.id}
                      trade={trade}
                      open={openKey === trade.id}
                      detail={openKey === trade.id ? detail : null}
                      onToggle={() => toggleTrade(trade)}
                      onClose={closeDetail}
                      onTradeSource={(s) => {
                        const focused = focusTickerRowOnBuyer(
                          trade.tickerRow,
                          trade.signal.personKey,
                        );
                        void openDetail(focused, trade.id, s);
                      }}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2
              data-testid="feed-result-count"
              className="text-[13px] font-semibold text-[var(--ink)]"
            >
              {rows.length.toLocaleString()} ticker
              {rows.length === 1 ? "" : "s"}
            </h2>
            <span className="text-[11px] text-[var(--fog-mute)]">
              from {tradeCount.toLocaleString()} trades · sorted by Watchlist
              score
            </span>
          </div>

          <div className="hx-table-wrap overflow-x-auto rounded-md border border-[var(--line)]">
            <table className="hx-table w-full min-w-[62rem]">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[11px] uppercase tracking-wide text-[var(--fog-mute)]">
                  <th className="px-3 py-2 font-medium">Ticker</th>
                  <th className="num py-2 pr-3 text-right font-medium">Score</th>
                  <th className="num py-2 pr-3 text-right font-medium">Buys</th>
                  <th
                    className="num py-2 pr-3 text-right font-medium"
                    title="Context only — not a major ranking factor"
                  >
                    Buyers
                  </th>
                  <th className="num py-2 pr-3 text-right font-medium">
                    Overlap
                  </th>
                  <th
                    className="num py-2 pr-3 text-right font-medium"
                    title="Max consecutive streak for strongest buyer pattern"
                  >
                    Streak
                  </th>
                  <th className="py-2 pr-3 font-medium">Trend</th>
                  <th className="py-2 pr-3 font-medium">Rel. trend</th>
                  <th className="py-2 pr-3 font-medium">Recent</th>
                  <th className="py-2 pr-3 font-medium">Latest</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-8 text-center text-[13px] text-[var(--fog-dim)]"
                    >
                      No tickers match the current Watchlist criteria.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <FeedRow
                      key={row.ticker}
                      row={row}
                      open={openKey === row.ticker}
                      detail={openKey === row.ticker ? detail : null}
                      onToggle={() => toggleTicker(row)}
                      onClose={closeDetail}
                      onTradeSource={(s) =>
                        void openDetail(row, row.ticker, s)
                      }
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
