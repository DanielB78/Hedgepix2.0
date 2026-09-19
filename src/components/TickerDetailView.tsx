"use client";

/**
 * Shared ticker detail panel used by Trending and Feed.
 * Same header + price chart; left panel switches by context.
 */

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PriceChart } from "@/components/PriceChart";
import type { StockPreviewPayload } from "@/lib/feed";
import {
  chamberLabel,
  formatAmountRange,
  formatShortDate,
  tradeVerb,
} from "@/lib/format";
import {
  type ChartTrade,
  type ChartTradeSource,
} from "@/lib/chartTrades";
import type { CongressTrade } from "@/lib/types";
import type {
  FeedBuyOccasion,
  FeedBuyerTickerSignal,
  FeedTickerRow,
} from "@/lib/feedActivity/types";
import type { StockPriceBar } from "@/lib/types";

export type TickerDetailContext = "trending" | "feed";

export type TickerDetailState = {
  ticker: string;
  tradeSource: ChartTradeSource;
  data: StockPreviewPayload | null;
  loading: boolean;
  error: string | null;
};

function useScrollIntoView(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [active]);
  return ref;
}

function TradeRow({
  trade,
  onOpenMember,
  onFocusDate,
}: {
  trade: ChartTrade | CongressTrade;
  onOpenMember?: (slug: string) => void;
  onFocusDate?: (date: string) => void;
}) {
  const buy = trade.transaction_type === "purchase";
  const slug =
    "member_slug" in trade && trade.member_slug ? trade.member_slug : null;
  const memberClickable = !!slug && !!onOpenMember;
  const txDate = trade.transaction_date ?? trade.disclosure_date;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] py-2.5 last:border-0">
      <div className="min-w-0">
        {memberClickable ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenMember(slug!);
            }}
            className="truncate text-left text-sm font-semibold text-[color:var(--mint)] hover:opacity-80"
          >
            {trade.member ?? "Unknown"}
          </button>
        ) : (
          <p className="truncate text-sm font-semibold text-[color:var(--fog)]">
            {trade.member ?? "Unknown"}
          </p>
        )}
        <p className="text-xs text-[color:var(--fog-dim)]">
          {"source" in trade && trade.source === "ceo"
            ? trade.state?.trim() || "Insider"
            : chamberLabel(trade.chamber)}{" "}
          ·{" "}
          {txDate && onFocusDate ? (
            <button
              type="button"
              className="hover:text-[color:var(--mint)]"
              onClick={(e) => {
                e.stopPropagation();
                onFocusDate(txDate);
              }}
            >
              {formatShortDate(txDate)}
            </button>
          ) : (
            formatShortDate(txDate)
          )}
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

function marketPriceNearDate(
  bars: StockPriceBar[],
  date: string,
): number | null {
  const target = date.slice(0, 10);
  let best: StockPriceBar | null = null;
  for (const bar of bars) {
    if (!bar.bar_date || bar.close == null) continue;
    if (bar.bar_date <= target) best = bar;
    else break;
  }
  if (!best && bars.length) {
    const after = bars.find((b) => b.bar_date && b.bar_date >= target);
    best = after ?? null;
  }
  return best?.close != null && Number.isFinite(Number(best.close))
    ? Number(best.close)
    : null;
}

function pctLabel(n: number | null | undefined, digits = 1): string {
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

function sourceLabel(source: string): string {
  if (source === "house") return "House";
  if (source === "senate") return "Senate";
  return "Insider";
}

function SignalSection({
  title,
  children,
  onActivate,
}: {
  title: string;
  children: ReactNode;
  onActivate?: () => void;
}) {
  if (onActivate) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className="block w-full border-b border-[color:var(--line)] py-2.5 text-left last:border-0 rounded-sm transition-colors hover:bg-[color:var(--panel-elevated)]"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--fog-dim)]">
          {title}
        </p>
        <div className="mt-1 text-[12px] text-[color:var(--fog)]">{children}</div>
      </button>
    );
  }
  return (
    <div className="block w-full border-b border-[color:var(--line)] py-2.5 text-left last:border-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--fog-dim)]">
        {title}
      </p>
      <div className="mt-1 text-[12px] text-[color:var(--fog)]">{children}</div>
    </div>
  );
}

function BuyerSignalSummary({
  signal,
  bars,
  onFocusDate,
  compact = false,
}: {
  signal: FeedBuyerTickerSignal;
  bars: StockPriceBar[];
  onFocusDate: (date: string) => void;
  compact?: boolean;
}) {
  const buys = useMemo(
    () =>
      [...signal.occasions].sort((a, b) =>
        a.transactionDate.localeCompare(b.transactionDate),
      ),
    [signal.occasions],
  );

  const sequence = useMemo(() => {
    return buys.map((o) => ({
      date: o.transactionDate,
      price: o.priceAtTrade ?? marketPriceNearDate(bars, o.transactionDate),
    }));
  }, [buys, bars]);

  const firstPx = sequence[0]?.price ?? null;
  const lastPx = sequence[sequence.length - 1]?.price ?? null;
  const declinePct =
    firstPx != null && lastPx != null && firstPx > 0
      ? ((lastPx - firstPx) / firstPx) * 100
      : signal.declineSinceFirstBuyPct;

  const latestRatio = [...buys]
    .reverse()
    .find((o) => o.personSizeRatio != null)?.personSizeRatio;

  if (compact) {
    return (
      <button
        type="button"
        className="w-full rounded border border-[color:var(--line)] bg-[color:var(--panel-elevated)] px-2.5 py-2 text-left hover:border-[color:var(--mint)]/40"
        onClick={() => {
          const d = buys[buys.length - 1]?.transactionDate;
          if (d) onFocusDate(d);
        }}
      >
        <p className="text-[12px] font-medium text-[color:var(--fog)]">
          {signal.person ?? "Unknown"}
          <span className="ml-1.5 font-normal text-[color:var(--fog-dim)]">
            {sourceLabel(signal.source)}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-[color:var(--fog-dim)]">
          {signal.consecutiveStreak >= 2
            ? `${signal.consecutiveStreak} consecutive buys`
            : `${signal.buyCount} buy${signal.buyCount === 1 ? "" : "s"}`}
          {signal.hasSectorOverlap
            ? signal.overlapBand === "direct"
              ? " · Direct sector match"
              : signal.overlapSimilarity != null
                ? ` · ${(signal.overlapSimilarity * 100).toFixed(0)}% similarity`
                : " · Sector overlap"
            : ""}
        </p>
      </button>
    );
  }

  return (
    <div className="space-y-0">
      <div className="border-b border-[color:var(--line)] pb-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--fog-dim)]">
          Strongest signal
        </p>
        <p className="mt-1 font-[family-name:var(--font-display)] text-[14px] font-semibold text-[color:var(--fog)]">
          {signal.person ?? "Unknown"}
        </p>
        <p className="text-[11px] text-[color:var(--fog-dim)]">
          {sourceLabel(signal.source)}
          {signal.officerTitle ? ` · ${signal.officerTitle}` : ""}
        </p>
        {signal.consecutiveStreak >= 2 || signal.buyCount >= 2 ? (
          <button
            type="button"
            className="mt-1 text-[12px] text-[color:var(--mint)] hover:underline"
            onClick={() => {
              const d = buys[buys.length - 1]?.transactionDate;
              if (d) onFocusDate(d);
            }}
          >
            {signal.consecutiveStreak >= 2
              ? `${signal.consecutiveStreak} consecutive buys`
              : `${signal.buyCount} purchases`}
          </button>
        ) : null}
      </div>

      {signal.hasSectorOverlap ? (
        <SignalSection title="Sector overlap">
          {signal.overlapMemberLabel && signal.overlapTickerLabel ? (
            <p>
              {signal.overlapMemberLabel}
              <span className="mx-1 text-[color:var(--fog-mute)]">↔</span>
              {signal.overlapTickerLabel}
            </p>
          ) : (
            <p>Member&apos;s industry exposure overlaps this ticker</p>
          )}
          <p className="mt-0.5 text-[11px] text-[color:var(--fog-dim)]">
            {signal.overlapBand === "direct"
              ? "Direct sector match"
              : signal.overlapSimilarity != null
                ? `Similarity: ${signal.overlapSimilarity.toFixed(2)}`
                : "Semantic sector match"}
          </p>
        </SignalSection>
      ) : null}

      {(signal.lowerPriceRepeatBuys > 0 ||
        (declinePct != null && declinePct < 0) ||
        signal.buyCount >= 2) && (
        <SignalSection
          title="Buying pattern"
          onActivate={() => {
            const d = buys[buys.length - 1]?.transactionDate;
            if (d) onFocusDate(d);
          }}
        >
          {signal.lowerPriceRepeatBuys > 0 ? (
            <p>
              {signal.lowerPriceRepeatBuys} purchase
              {signal.lowerPriceRepeatBuys === 1 ? "" : "s"} at lower prices
            </p>
          ) : null}
          {declinePct != null && declinePct < 0 ? (
            <p className="text-[color:var(--fog-dim)]">
              {pctLabel(declinePct)} since first buy
            </p>
          ) : null}
        </SignalSection>
      )}

      {sequence.length >= 2 ? (
        <SignalSection title="Buy sequence">
          <ul className="space-y-0.5 tabular-nums">
            {sequence.map((s) => (
              <li key={s.date}>
                <button
                  type="button"
                  className="flex w-full justify-between gap-2 text-left hover:text-[color:var(--mint)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusDate(s.date);
                  }}
                >
                  <span>{formatShortDate(s.date)}</span>
                  <span className="text-[color:var(--fog-dim)]">
                    {s.price != null ? `$${s.price.toFixed(2)}` : "—"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-[color:var(--fog-mute)]">
            Market price near trade
          </p>
          {declinePct != null && declinePct < 0 ? (
            <p className="mt-0.5 text-[11px] text-[color:var(--fog-dim)]">
              ↓ {Math.abs(declinePct).toFixed(1)}% from first to latest buy
            </p>
          ) : null}
        </SignalSection>
      ) : null}
    </div>
  );
}

function FeedStrongestSignalsPanel({
  row,
  bars,
  trades,
  onFocusDate,
  showAllTrades,
  onToggleTrades,
  onOpenMember,
}: {
  row: FeedTickerRow;
  bars: StockPriceBar[];
  trades: ChartTrade[];
  onFocusDate: (date: string) => void;
  showAllTrades: boolean;
  onToggleTrades: () => void;
  onOpenMember?: (slug: string) => void;
}) {
  const best = row.strongestBuyer;
  const otherStrong = row.buyerSignals
    .slice(1)
    .filter(
      (s) =>
        s.hasSectorOverlap ||
        s.buyCount >= 2 ||
        s.consecutiveStreak >= 2 ||
        s.isAveragingDown,
    )
    .slice(0, 4);

  const latestRatio = best
    ? [...best.occasions]
        .sort((a, b) =>
          (b.disclosureDate ?? b.transactionDate).localeCompare(
            a.disclosureDate ?? a.transactionDate,
          ),
        )
        .find((o) => o.personSizeRatio != null)?.personSizeRatio
    : null;

  return (
    <aside
      data-testid="feed-strongest-signals"
      className="flex max-h-[420px] flex-col border-b border-[color:var(--line)] lg:max-h-[520px] lg:border-b-0 lg:border-r"
    >
      <div className="shrink-0 border-b border-[color:var(--line)] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
          Strongest Signals
        </p>
        <p className="mt-0.5 text-[11px] text-[color:var(--fog-mute)]">
          Feed score {row.score}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-1">
        {best ? (
          <BuyerSignalSummary
            signal={best}
            bars={bars}
            onFocusDate={onFocusDate}
          />
        ) : (
          <p className="py-3 text-sm text-[color:var(--fog-dim)]">
            No buyer signal available.
          </p>
        )}

        {row.relativeSectorReturn != null ||
        row.relativeMarketReturn != null ||
        row.currentTrendReturn != null ? (
          <SignalSection title="Relative weakness">
            {row.currentTrendReturn != null ? (
              <p>20D: {pctLabel(row.currentTrendReturn)}</p>
            ) : null}
            {row.relativeSectorReturn != null ? (
              <p className="text-[color:var(--fog-dim)]">
                vs sector: {pctLabel(row.relativeSectorReturn)}
              </p>
            ) : null}
            {row.relativeMarketReturn != null &&
            row.relativeSectorReturn == null ? (
              <p className="text-[color:var(--fog-dim)]">
                vs market: {pctLabel(row.relativeMarketReturn)}
              </p>
            ) : null}
          </SignalSection>
        ) : null}

        {best && best.downtrendBuys > 0 ? (
          <SignalSection title="Buying into weakness">
            <p>
              {best.downtrendBuys} buy
              {best.downtrendBuys === 1 ? "" : "s"} during a negative 20D trend
            </p>
          </SignalSection>
        ) : null}

        {latestRatio != null && latestRatio >= 2 ? (
          <SignalSection title="Unusual trade size">
            <p>
              Latest purchase ~{latestRatio.toFixed(1)}× typical disclosed size
            </p>
            <p className="mt-0.5 text-[10px] text-[color:var(--fog-mute)]">
              Congressional sizes use disclosed ranges / estimates
            </p>
          </SignalSection>
        ) : null}

        {best?.latestDisclosure ? (
          <SignalSection title="Recency">
            <p>
              Latest disclosure: {daysAgoLabel(best.latestDisclosure)}
            </p>
          </SignalSection>
        ) : null}

        {otherStrong.length > 0 ? (
          <div className="border-b border-[color:var(--line)] py-2.5 last:border-0">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--fog-dim)]">
              Other strong signals
            </p>
            <div className="space-y-1.5">
              {otherStrong.map((s) => (
                <BuyerSignalSummary
                  key={s.personKey}
                  signal={s}
                  bars={bars}
                  onFocusDate={onFocusDate}
                  compact
                />
              ))}
            </div>
            {row.distinctOverlapBuyers > 1 && best?.hasSectorOverlap ? (
              <p className="mt-1.5 text-[11px] text-[color:var(--fog-dim)]">
                +{row.distinctOverlapBuyers - 1} additional sector-overlap buyer
                {row.distinctOverlapBuyers - 1 === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        ) : row.distinctOverlapBuyers > 1 && best?.hasSectorOverlap ? (
          <SignalSection title="Additional overlap">
            <p>
              +{row.distinctOverlapBuyers - 1} additional sector-overlap buyer
              {row.distinctOverlapBuyers - 1 === 1 ? "" : "s"}
            </p>
          </SignalSection>
        ) : null}

        {showAllTrades ? (
          <div className="py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--fog-dim)]">
              All trades
              {trades.length ? ` · ${trades.length}` : ""}
            </p>
            {trades.length ? (
              trades.map((trade) => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  onOpenMember={onOpenMember}
                  onFocusDate={onFocusDate}
                />
              ))
            ) : (
              <p className="text-sm text-[color:var(--fog-dim)]">
                No matching trades.
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 space-y-2 border-t border-[color:var(--line)] p-4">
        <button
          type="button"
          data-testid="feed-view-all-trades"
          onClick={onToggleTrades}
          className="inline-flex w-full items-center justify-center rounded-md border border-[color:var(--line)] px-3 py-2 text-sm font-medium text-[color:var(--fog)] transition-colors hover:border-[color:var(--mint)]/40 hover:text-[color:var(--mint)]"
        >
          {showAllTrades
            ? "Hide trades"
            : `View all trades${trades.length ? ` (${trades.length})` : ""}`}
        </button>
        <Link
          href={`/stocks/${encodeURIComponent(row.ticker)}?source=both`}
          className="inline-flex w-full items-center justify-center rounded-md border border-[color:var(--mint)]/40 px-4 py-2.5 text-sm font-semibold text-[color:var(--mint)] transition-colors hover:bg-[color:var(--mint)] hover:text-[color:var(--ink)]"
          onClick={(e) => e.stopPropagation()}
        >
          Open full view
        </Link>
      </div>
    </aside>
  );
}

function TrendingTradesPanel({
  state,
  sources,
  onTradeSource,
  onOpenMember,
  onFocusDate,
}: {
  state: TickerDetailState;
  sources: ChartTradeSource[];
  onTradeSource: (source: ChartTradeSource) => void;
  onOpenMember?: (slug: string) => void;
  onFocusDate?: (date: string) => void;
}) {
  return (
    <aside className="flex max-h-[420px] flex-col border-b border-[color:var(--line)] lg:max-h-[520px] lg:border-b-0 lg:border-r">
      <div className="shrink-0 space-y-3 p-5 pb-3">
        <div className="hx-toolbar gap-3">
          {sources.map((value) => {
            const label =
              value === "congress"
                ? "Congress"
                : value === "house"
                  ? "House"
                  : value === "senate"
                    ? "Senate"
                    : value === "both"
                      ? "All"
                      : "Insiders";
            return (
              <button
                key={value}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onTradeSource(value);
                }}
                className="hx-tab"
                data-active={state.tradeSource === value ? "true" : "false"}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
          Trades
          {state.data?.topTrades.length
            ? ` · ${state.data.topTrades.length}`
            : ""}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        {state.loading ? (
          <p className="text-sm text-[color:var(--fog-dim)]">Loading…</p>
        ) : state.error ? (
          <p className="text-sm text-[color:var(--coral)]">{state.error}</p>
        ) : state.data?.topTrades.length ? (
          state.data.topTrades.map((trade) => (
            <TradeRow
              key={trade.id}
              trade={trade}
              onOpenMember={onOpenMember}
              onFocusDate={onFocusDate}
            />
          ))
        ) : (
          <p className="text-sm text-[color:var(--fog-dim)]">
            No matching trades.
          </p>
        )}
      </div>
      <div className="shrink-0 p-5 pt-3">
        <Link
          href={`/stocks/${encodeURIComponent(state.ticker)}?source=${encodeURIComponent(state.tradeSource)}`}
          className="inline-flex w-full items-center justify-center rounded-md border border-[color:var(--mint)]/40 px-4 py-2.5 text-sm font-semibold text-[color:var(--mint)] transition-colors hover:bg-[color:var(--mint)] hover:text-[color:var(--ink)]"
        >
          Open full view
        </Link>
      </div>
    </aside>
  );
}

export function TickerDetailView({
  state,
  context = "trending",
  onClose,
  onTradeSource,
  onOpenMember,
  preferredSources = ["congress", "house", "senate", "ceo"],
  feedRow = null,
  initialFocusDate = null,
}: {
  state: TickerDetailState;
  context?: TickerDetailContext;
  onClose: () => void;
  onTradeSource: (source: ChartTradeSource) => void;
  onOpenMember?: (slug: string) => void;
  preferredSources?: ChartTradeSource[];
  feedRow?: FeedTickerRow | null;
  initialFocusDate?: string | null;
}) {
  const ref = useScrollIntoView(true);
  const [focusDate, setFocusDate] = useState<string | null>(initialFocusDate);
  const [showAllTrades, setShowAllTrades] = useState(false);

  useEffect(() => {
    setFocusDate(initialFocusDate);
  }, [initialFocusDate, state.ticker]);

  const sources = preferredSources.filter(
    (s) =>
      s === "congress" ||
      s === "house" ||
      s === "senate" ||
      s === "ceo" ||
      s === "both",
  );

  const bars = state.data?.bars ?? [];
  const trades = state.data?.topTrades ?? [];

  // Prefer strongest buyer's latest purchase as initial chart focus for Feed
  const chartFocus =
    focusDate ??
    (context === "feed"
      ? feedRow?.strongestBuyer?.occasions
          ?.slice()
          .sort((a: FeedBuyOccasion, b: FeedBuyOccasion) =>
            b.transactionDate.localeCompare(a.transactionDate),
          )[0]?.transactionDate ?? null
      : null);

  return (
    <div
      ref={ref}
      data-testid={
        context === "feed" ? "feed-ticker-detail" : "trending-ticker-detail"
      }
      className="animate-expand overflow-hidden rounded-md border border-[color:var(--mint)]/25 bg-[color:var(--panel)] shadow-[var(--shadow-soft)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-2.5">
        <div>
          <p className="font-[family-name:var(--font-display)] text-base font-semibold text-[color:var(--fog)]">
            {state.ticker}
          </p>
          <p className="text-sm text-[color:var(--fog-dim)]">
            {state.data?.asset ?? feedRow?.company ?? "Trade activity"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-sm text-[color:var(--fog-dim)] hover:bg-[color:var(--panel-elevated)] hover:text-[color:var(--fog)]"
        >
          Close
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        {context === "feed" && feedRow ? (
          <FeedStrongestSignalsPanel
            row={feedRow}
            bars={bars}
            trades={trades}
            onFocusDate={setFocusDate}
            showAllTrades={showAllTrades}
            onToggleTrades={() => setShowAllTrades((v) => !v)}
            onOpenMember={onOpenMember}
          />
        ) : (
          <TrendingTradesPanel
            state={state}
            sources={sources}
            onTradeSource={onTradeSource}
            onOpenMember={onOpenMember}
            onFocusDate={setFocusDate}
          />
        )}

        <div className="p-4 sm:p-5">
          {state.loading ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-[color:var(--fog-dim)]">
              Loading chart…
            </div>
          ) : state.error && !bars.length ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-[color:var(--coral)]">
              {state.error}
            </div>
          ) : bars.length ? (
            <PriceChart
              key={`${state.ticker}-${state.tradeSource}`}
              bars={bars}
              trades={trades}
              interactive
              focusDate={chartFocus}
            />
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-[color:var(--fog-dim)]">
              No price history yet for this ticker.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
