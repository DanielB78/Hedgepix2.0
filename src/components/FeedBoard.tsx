"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import type {
  FeedPayload,
  FeedView,
  MemberPreviewPayload,
  MemberStockPreviewPayload,
  PopularMember,
  StockPreviewPayload,
} from "@/lib/feed";
import {
  chamberLabel,
  formatAmountRange,
  formatShortDate,
  tradeVerb,
} from "@/lib/format";
import type { Chamber, CongressTrade, TrendingTicker } from "@/lib/types";

type Props = {
  view: FeedView;
  payload: FeedPayload;
};

type StockPanelState = {
  ticker: string;
  chamber: "all" | Chamber;
  data: StockPreviewPayload | null;
  loading: boolean;
  error: string | null;
};

type MemberPanelState = {
  slug: string;
  data: MemberPreviewPayload | null;
  loading: boolean;
  error: string | null;
  nestedTicker: string | null;
  nested: MemberStockPreviewPayload | null;
  nestedLoading: boolean;
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

function TradeRow({ trade }: { trade: CongressTrade }) {
  const buy = trade.transaction_type === "purchase";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[color:var(--fog)]">
          {trade.member ?? "Unknown"}
        </p>
        <p className="text-xs text-[color:var(--fog-dim)]">
          {chamberLabel(trade.chamber)} ·{" "}
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

export function FeedBoard({ view, payload }: Props) {
  const [stockPanel, setStockPanel] = useState<StockPanelState | null>(null);
  const [memberPanel, setMemberPanel] = useState<MemberPanelState | null>(null);

  const openStock = useCallback(
    async (ticker: string, chamber: "all" | Chamber = "all") => {
      setMemberPanel(null);
      setStockPanel({
        ticker,
        chamber,
        data: null,
        loading: true,
        error: null,
      });
      try {
        const data = await loadJson<StockPreviewPayload>(
          `/api/feed/preview?kind=stock&ticker=${encodeURIComponent(ticker)}&chamber=${chamber}`,
        );
        setStockPanel({
          ticker,
          chamber,
          data,
          loading: false,
          error: null,
        });
      } catch (err) {
        setStockPanel({
          ticker,
          chamber,
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load",
        });
      }
    },
    [],
  );

  const openMember = useCallback(async (slug: string) => {
    setStockPanel(null);
    setMemberPanel({
      slug,
      data: null,
      loading: true,
      error: null,
      nestedTicker: null,
      nested: null,
      nestedLoading: false,
    });
    try {
      const data = await loadJson<MemberPreviewPayload>(
        `/api/feed/preview?kind=member&slug=${encodeURIComponent(slug)}`,
      );
      setMemberPanel({
        slug,
        data,
        loading: false,
        error: null,
        nestedTicker: null,
        nested: null,
        nestedLoading: false,
      });
    } catch (err) {
      setMemberPanel({
        slug,
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load",
        nestedTicker: null,
        nested: null,
        nestedLoading: false,
      });
    }
  }, []);

  const openMemberStock = useCallback(async (slug: string, ticker: string) => {
    setMemberPanel((prev) =>
      prev
        ? { ...prev, nestedTicker: ticker, nested: null, nestedLoading: true }
        : prev,
    );
    try {
      const data = await loadJson<MemberStockPreviewPayload>(
        `/api/feed/preview?kind=member-stock&slug=${encodeURIComponent(slug)}&ticker=${encodeURIComponent(ticker)}`,
      );
      setMemberPanel((prev) =>
        prev
          ? {
              ...prev,
              nestedTicker: ticker,
              nested: data,
              nestedLoading: false,
            }
          : prev,
      );
    } catch {
      setMemberPanel((prev) =>
        prev
          ? {
              ...prev,
              nestedTicker: ticker,
              nested: null,
              nestedLoading: false,
            }
          : prev,
      );
    }
  }, []);

  const showTrending = view === "feed" || view === "trending";
  const showHouse = view === "feed" || view === "house";
  const showSenate = view === "feed" || view === "senate";
  const trendingLimit = view === "trending" ? 20 : 8;

  return (
    <div className="space-y-10">
      {payload.error ? (
        <div className="rounded-2xl border border-[color:var(--coral)]/40 bg-[color:var(--panel-elevated)] px-4 py-3 text-sm text-[color:var(--coral)]">
          {payload.error}
        </div>
      ) : null}

      {showTrending ? (
        <section className="animate-rise space-y-4">
          <SectionTitle
            title="Trending"
            subtitle="Tickers with the most congressional attention"
          />
          <div className="space-y-3">
            {payload.trending.length === 0 ? (
              <Empty text="No trending tickers right now." />
            ) : (
              payload.trending.slice(0, trendingLimit).map((row, i) => (
                <TickerCard
                  key={row.ticker}
                  rank={i + 1}
                  row={row}
                  active={stockPanel?.ticker === row.ticker}
                  onOpen={() => void openStock(row.ticker)}
                />
              ))
            )}
          </div>
          {stockPanel ? (
            <StockPanel
              state={stockPanel}
              onClose={() => setStockPanel(null)}
              onChamber={(c) => void openStock(stockPanel.ticker, c)}
            />
          ) : null}
        </section>
      ) : null}

      {showHouse ? (
        <MemberBlock
          title="House"
          subtitle="Popular representatives"
          members={payload.houseMembers}
          panel={memberPanel}
          onOpen={(slug) => void openMember(slug)}
          onOpenStock={(slug, ticker) => void openMemberStock(slug, ticker)}
          onClose={() => setMemberPanel(null)}
          onBackNested={() =>
            setMemberPanel((p) =>
              p
                ? {
                    ...p,
                    nestedTicker: null,
                    nested: null,
                    nestedLoading: false,
                  }
                : p,
            )
          }
        />
      ) : null}

      {showSenate ? (
        <MemberBlock
          title="Senate"
          subtitle="Popular senators"
          members={payload.senateMembers}
          panel={memberPanel}
          onOpen={(slug) => void openMember(slug)}
          onOpenStock={(slug, ticker) => void openMemberStock(slug, ticker)}
          onClose={() => setMemberPanel(null)}
          onBackNested={() =>
            setMemberPanel((p) =>
              p
                ? {
                    ...p,
                    nestedTicker: null,
                    nested: null,
                    nestedLoading: false,
                  }
                : p,
            )
          }
        />
      ) : null}
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[color:var(--fog)]">
        {title}
      </h2>
      <p className="text-sm text-[color:var(--fog-dim)]">{subtitle}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel)] px-5 py-8 text-center text-sm text-[color:var(--fog-dim)]">
      {text}
    </div>
  );
}

function TickerCard({
  rank,
  row,
  active,
  onOpen,
}: {
  rank: number;
  row: TrendingTicker;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-4 rounded-[18px] border px-4 py-4 text-left transition-all duration-300 ${
        active
          ? "border-[color:var(--mint)]/50 bg-[color:var(--panel-elevated)] shadow-[0_0_28px_var(--glow)]"
          : "border-[color:var(--line)] bg-[color:var(--panel)] hover:border-[color:var(--mint)]/30 hover:bg-[color:var(--panel-elevated)]"
      }`}
    >
      <span className="w-8 text-sm tabular-nums text-[color:var(--fog-dim)]">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[color:var(--fog)]">
          {row.ticker}
        </p>
        {row.asset ? (
          <p className="truncate text-sm text-[color:var(--fog-dim)]">
            {row.asset}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right text-sm text-[color:var(--fog-dim)]">
        <p className="text-[color:var(--mint)]">
          {row.uniqueMembers} member{row.uniqueMembers === 1 ? "" : "s"}
        </p>
        <p>{row.totalTrades} trades</p>
      </div>
    </button>
  );
}

function StockPanel({
  state,
  onClose,
  onChamber,
}: {
  state: StockPanelState;
  onClose: () => void;
  onChamber: (chamber: "all" | Chamber) => void;
}) {
  return (
    <div className="animate-expand overflow-hidden rounded-[22px] border border-[color:var(--mint)]/25 bg-[color:var(--panel)] shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-5 py-4">
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[color:var(--fog)]">
            {state.ticker}
          </p>
          <p className="text-sm text-[color:var(--fog-dim)]">
            {state.data?.asset ?? "Congressional activity"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3 py-1.5 text-sm text-[color:var(--fog-dim)] hover:bg-[color:var(--panel-elevated)] hover:text-[color:var(--fog)]"
        >
          Close
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <aside className="border-b border-[color:var(--line)] p-5 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex gap-1 rounded-full bg-[color:var(--panel-elevated)] p-1">
            {(
              [
                ["all", "All"],
                ["house", "House"],
                ["senate", "Senate"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onChamber(value)}
                className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors ${
                  state.chamber === value
                    ? "bg-[color:var(--mint)] text-[color:var(--ink)]"
                    : "text-[color:var(--fog-dim)] hover:text-[color:var(--fog)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
            Top 5 latest
          </p>
          {state.loading ? (
            <p className="text-sm text-[color:var(--fog-dim)]">Loading…</p>
          ) : state.error ? (
            <p className="text-sm text-[color:var(--coral)]">{state.error}</p>
          ) : state.data?.topTrades.length ? (
            state.data.topTrades.map((trade) => (
              <TradeRow key={trade.id} trade={trade} />
            ))
          ) : (
            <p className="text-sm text-[color:var(--fog-dim)]">
              No matching trades.
            </p>
          )}
          <Link
            href={`/stocks/${encodeURIComponent(state.ticker)}`}
            className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-[color:var(--mint)]/40 px-4 py-2.5 text-sm font-semibold text-[color:var(--mint)] transition-colors hover:bg-[color:var(--mint)] hover:text-[color:var(--ink)]"
          >
            More
          </Link>
        </aside>

        <div className="p-4 sm:p-5">
          {state.loading ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-[color:var(--fog-dim)]">
              Loading chart…
            </div>
          ) : state.data?.bars.length ? (
            <PriceChart bars={state.data.bars} trades={state.data.topTrades} />
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

function MemberBlock({
  title,
  subtitle,
  members,
  panel,
  onOpen,
  onOpenStock,
  onClose,
  onBackNested,
}: {
  title: string;
  subtitle: string;
  members: PopularMember[];
  panel: MemberPanelState | null;
  onOpen: (slug: string) => void;
  onOpenStock: (slug: string, ticker: string) => void;
  onClose: () => void;
  onBackNested: () => void;
}) {
  const active =
    panel && members.some((m) => m.slug === panel.slug) ? panel : null;

  return (
    <section className="animate-rise space-y-4">
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="grid gap-3 sm:grid-cols-2">
        {members.length === 0 ? (
          <Empty text={`No active ${title.toLowerCase()} members yet.`} />
        ) : (
          members.map((member) => {
            const expanded = panel?.slug === member.slug;
            return (
              <button
                key={member.slug}
                type="button"
                onClick={() => onOpen(member.slug)}
                className={`rounded-[18px] border px-4 py-4 text-left transition-all duration-300 ${
                  expanded
                    ? "border-[color:var(--mint)]/50 bg-[color:var(--panel-elevated)] shadow-[0_0_28px_var(--glow)]"
                    : "border-[color:var(--line)] bg-[color:var(--panel)] hover:border-[color:var(--mint)]/30 hover:bg-[color:var(--panel-elevated)]"
                }`}
              >
                <p className="font-[family-name:var(--font-display)] text-lg font-bold text-[color:var(--fog)]">
                  {member.name}
                </p>
                <p className="mt-1 text-sm text-[color:var(--fog-dim)]">
                  {chamberLabel(member.chamber)}
                  {member.state ? ` · ${member.state}` : ""}
                </p>
                <p className="mt-3 text-xs text-[color:var(--mint)]">
                  {member.tradeCount} trades · {member.uniqueTickers} tickers
                </p>
              </button>
            );
          })
        )}
      </div>

      {active ? (
        <MemberPanel
          state={active}
          onClose={onClose}
          onOpenTicker={(ticker) => onOpenStock(active.slug, ticker)}
          onBackNested={onBackNested}
        />
      ) : null}
    </section>
  );
}

function MemberPanel({
  state,
  onClose,
  onOpenTicker,
  onBackNested,
}: {
  state: MemberPanelState;
  onClose: () => void;
  onOpenTicker: (ticker: string) => void;
  onBackNested: () => void;
}) {
  return (
    <div className="animate-expand overflow-hidden rounded-[22px] border border-[color:var(--mint)]/25 bg-[color:var(--panel)] shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-5 py-4">
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[color:var(--fog)]">
            {state.data?.name ?? state.slug}
          </p>
          <p className="text-sm text-[color:var(--fog-dim)]">
            {chamberLabel(state.data?.chamber)}
            {state.data?.state ? ` · ${state.data.state}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3 py-1.5 text-sm text-[color:var(--fog-dim)] hover:bg-[color:var(--panel-elevated)] hover:text-[color:var(--fog)]"
        >
          Close
        </button>
      </div>

      {state.nestedTicker ? (
        <div className="p-5">
          <button
            type="button"
            onClick={onBackNested}
            className="mb-4 text-sm text-[color:var(--mint)] hover:opacity-80"
          >
            ← Back to top tickers
          </button>
          <p className="mb-3 font-[family-name:var(--font-display)] text-xl font-bold text-[color:var(--fog)]">
            {state.nestedTicker}
            <span className="ml-2 text-sm font-medium text-[color:var(--fog-dim)]">
              trades by {state.data?.name ?? "member"}
            </span>
          </p>
          {state.nestedLoading ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-[color:var(--fog-dim)]">
              Loading chart…
            </div>
          ) : state.nested?.bars.length ? (
            <PriceChart
              bars={state.nested.bars}
              trades={state.nested.trades}
            />
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-[color:var(--fog-dim)]">
              No chart data for this holding.
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/stocks/${encodeURIComponent(state.nestedTicker)}`}
              className="inline-flex rounded-full border border-[color:var(--mint)]/40 px-4 py-2 text-sm font-semibold text-[color:var(--mint)] hover:bg-[color:var(--mint)] hover:text-[color:var(--ink)]"
            >
              More on {state.nestedTicker}
            </Link>
            <Link
              href={`/members/${encodeURIComponent(state.slug)}`}
              className="inline-flex rounded-full border border-[color:var(--line)] px-4 py-2 text-sm font-semibold text-[color:var(--fog-dim)] hover:border-[color:var(--mint)]/40 hover:text-[color:var(--fog)]"
            >
              More on member
            </Link>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
            Top 5 tickers
          </p>
          {state.loading ? (
            <p className="text-sm text-[color:var(--fog-dim)]">Loading…</p>
          ) : state.error ? (
            <p className="text-sm text-[color:var(--coral)]">{state.error}</p>
          ) : state.data?.topTickers.length ? (
            <div className="space-y-2">
              {state.data.topTickers.map((row) => (
                <button
                  key={row.ticker}
                  type="button"
                  onClick={() => onOpenTicker(row.ticker)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-elevated)] px-4 py-3 text-left transition-colors hover:border-[color:var(--mint)]/40"
                >
                  <div>
                    <p className="font-semibold text-[color:var(--fog)]">
                      {row.ticker}
                    </p>
                    <p className="text-xs text-[color:var(--fog-dim)]">
                      {row.asset ?? "Equity"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-[color:var(--fog-dim)]">
                    <p className="text-[color:var(--mint)]">
                      {row.tradeCount} trades
                    </p>
                    <p>{formatShortDate(row.latestDate)}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[color:var(--fog-dim)]">
              No ticker activity found.
            </p>
          )}
          <Link
            href={`/members/${encodeURIComponent(state.slug)}`}
            className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-[color:var(--mint)]/40 px-4 py-2.5 text-sm font-semibold text-[color:var(--mint)] transition-colors hover:bg-[color:var(--mint)] hover:text-[color:var(--ink)]"
          >
            More
          </Link>
        </div>
      )}
    </div>
  );
}
