"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import { FollowingFeed } from "@/components/FollowingFeed";
import { useAuth } from "@/components/AuthProvider";
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
  query?: string;
  housePage?: number;
  senatePage?: number;
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

function useScrollIntoView(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [active]);
  return ref;
}

export function FeedBoard({
  view,
  payload,
  query,
  housePage = 1,
  senatePage = 1,
}: Props) {
  const [stockPanel, setStockPanel] = useState<StockPanelState | null>(null);
  const [memberPanel, setMemberPanel] = useState<MemberPanelState | null>(null);
  const requestId = useRef(0);
  const q = query?.trim().toLowerCase() ?? "";
  const { user, loading: authLoading } = useAuth();
  const personalFeed = view === "feed" && !!user;

  const filterTrade = useCallback(
    (trade: CongressTrade) => {
      if (!q) return true;
      const ticker = (trade.ticker ?? "").toLowerCase();
      const member = (trade.member ?? "").toLowerCase();
      const asset = (trade.asset ?? "").toLowerCase();
      return (
        ticker.includes(q) ||
        member.includes(q) ||
        asset.includes(q) ||
        ticker === q.toUpperCase().toLowerCase()
      );
    },
    [q],
  );

  const filterTicker = useCallback(
    (row: TrendingTicker) => {
      if (!q) return true;
      return (
        row.ticker.toLowerCase().includes(q) ||
        (row.asset ?? "").toLowerCase().includes(q)
      );
    },
    [q],
  );

  const openStock = useCallback(
    async (ticker: string, chamber: "all" | Chamber = "all") => {
      const id = ++requestId.current;
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
        if (id !== requestId.current) return;
        setStockPanel({
          ticker,
          chamber,
          data,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (id !== requestId.current) return;
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

  const toggleStock = useCallback(
    (ticker: string) => {
      if (stockPanel?.ticker === ticker) {
        setStockPanel(null);
        return;
      }
      void openStock(ticker);
    },
    [openStock, stockPanel?.ticker],
  );

  const openMember = useCallback(async (slug: string) => {
    const id = ++requestId.current;
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
      if (id !== requestId.current) return;
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
      if (id !== requestId.current) return;
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

  const toggleMember = useCallback(
    (slug: string) => {
      if (memberPanel?.slug === slug && !memberPanel.nestedTicker) {
        setMemberPanel(null);
        return;
      }
      void openMember(slug);
    },
    [memberPanel?.nestedTicker, memberPanel?.slug, openMember],
  );

  const openMemberStock = useCallback(async (slug: string, ticker: string) => {
    const id = ++requestId.current;
    setMemberPanel((prev) =>
      prev
        ? { ...prev, nestedTicker: ticker, nested: null, nestedLoading: true }
        : prev,
    );
    try {
      const data = await loadJson<MemberStockPreviewPayload>(
        `/api/feed/preview?kind=member-stock&slug=${encodeURIComponent(slug)}&ticker=${encodeURIComponent(ticker)}`,
      );
      if (id !== requestId.current) return;
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
      if (id !== requestId.current) return;
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

  const showTrending =
    view === "trending" || (view === "feed" && !user && !authLoading);
  const showHouse =
    view === "house" || (view === "feed" && !user && !authLoading);
  const showSenate =
    view === "senate" || (view === "feed" && !user && !authLoading);
  const trendingLimit = view === "trending" ? 20 : 8;
  const trendingRows = useMemo(
    () => payload.trending.filter(filterTicker),
    [filterTicker, payload.trending],
  );
  const houseTrades = useMemo(
    () => payload.recentHouse.filter(filterTrade),
    [filterTrade, payload.recentHouse],
  );
  const senateTrades = useMemo(
    () => payload.recentSenate.filter(filterTrade),
    [filterTrade, payload.recentSenate],
  );
  const houseMembers = useMemo(
    () =>
      payload.houseMembers.filter((member) =>
        q ? member.name.toLowerCase().includes(q) : true,
      ),
    [payload.houseMembers, q],
  );
  const senateMembers = useMemo(
    () =>
      payload.senateMembers.filter((member) =>
        q ? member.name.toLowerCase().includes(q) : true,
      ),
    [payload.senateMembers, q],
  );

  return (
    <div className="space-y-10">
      {payload.error ? (
        <div className="rounded-2xl border border-[color:var(--coral)]/40 bg-[color:var(--panel-elevated)] px-4 py-3 text-sm text-[color:var(--coral)]">
          {payload.error}
        </div>
      ) : null}

      {q ? (
        <p className="text-center text-sm text-[color:var(--fog-dim)]">
          Showing results for{" "}
          <span className="font-semibold text-[color:var(--fog)]">{query}</span>
          .{" "}
          <Link
            href={`/ceo-buys?q=${encodeURIComponent(query ?? "")}`}
            className="text-[color:var(--mint)] hover:opacity-80"
          >
            Search CEO activity →
          </Link>
        </p>
      ) : null}

      {personalFeed || (view === "feed" && authLoading) ? (
        <section className="animate-rise space-y-4">
          <SectionTitle
            title="Following"
            subtitle="Stocks and people you follow"
          />
          <FollowingFeed
            onOpenTicker={(ticker) => toggleStock(ticker)}
            onOpenMember={(slug) => toggleMember(slug)}
          />
          {stockPanel ? (
            <StockPanel
              state={stockPanel}
              onClose={() => setStockPanel(null)}
              onChamber={(c) => void openStock(stockPanel.ticker, c)}
            />
          ) : null}
          {memberPanel ? (
            <MemberPanel
              state={memberPanel}
              onClose={() => setMemberPanel(null)}
              onOpenTicker={(ticker) =>
                void openMemberStock(memberPanel.slug, ticker)
              }
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
        </section>
      ) : null}

      {showTrending ? (
        <section className="animate-rise space-y-4">
          <SectionTitle
            title="Trending"
            subtitle="Tickers with the most congressional attention"
          />
          <div className="space-y-3">
            {trendingRows.length === 0 ? (
              <Empty text="No trending tickers match this search." />
            ) : (
              trendingRows.slice(0, trendingLimit).map((row, i) => {
                const active = stockPanel?.ticker === row.ticker;
                return (
                  <div key={row.ticker} className="space-y-3">
                    <TickerCard
                      rank={i + 1}
                      row={row}
                      active={active}
                      onOpen={() => toggleStock(row.ticker)}
                    />
                    {active && stockPanel ? (
                      <StockPanel
                        state={stockPanel}
                        onClose={() => setStockPanel(null)}
                        onChamber={(c) => void openStock(stockPanel.ticker, c)}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      ) : null}

      {showHouse ? (
        <>
          <TradeActivityBlock
            title="House"
            subtitle="Recent buys and sales"
            trades={houseTrades}
            page={housePage}
            pageParam="housePage"
            query={query}
            view={view}
            stockPanel={stockPanel}
            onOpenTicker={(ticker) => toggleStock(ticker)}
            onCloseStock={() => setStockPanel(null)}
            onChamber={(ticker, c) => void openStock(ticker, c)}
          />
          <MemberBlock
            title="House members"
            subtitle="Popular representatives"
            members={houseMembers}
            panel={memberPanel}
            onToggle={(slug) => toggleMember(slug)}
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
        </>
      ) : null}

      {showSenate ? (
        <>
          <TradeActivityBlock
            title="Senate"
            subtitle="Recent buys and sales"
            trades={senateTrades}
            page={senatePage}
            pageParam="senatePage"
            query={query}
            view={view}
            stockPanel={stockPanel}
            onOpenTicker={(ticker) => toggleStock(ticker)}
            onCloseStock={() => setStockPanel(null)}
            onChamber={(ticker, c) => void openStock(ticker, c)}
          />
          <MemberBlock
            title="Senate members"
            subtitle="Popular senators"
            members={senateMembers}
            panel={memberPanel}
            onToggle={(slug) => toggleMember(slug)}
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
        </>
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
  const ref = useScrollIntoView(true);

  return (
    <div
      ref={ref}
      className="animate-expand overflow-hidden rounded-[22px] border border-[color:var(--mint)]/25 bg-[color:var(--panel)] shadow-[var(--shadow-soft)]"
    >
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

      <div className="grid lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <aside className="flex max-h-[420px] flex-col border-b border-[color:var(--line)] lg:max-h-[520px] lg:border-b-0 lg:border-r">
          <div className="shrink-0 space-y-3 p-5 pb-3">
            <div className="flex gap-1 rounded-full bg-[color:var(--panel-elevated)] p-1">
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
                  onClick={(event) => {
                    event.stopPropagation();
                    onChamber(value);
                  }}
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
              Members
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
                <TradeRow key={trade.id} trade={trade} />
              ))
            ) : (
              <p className="text-sm text-[color:var(--fog-dim)]">
                No matching trades.
              </p>
            )}
          </div>
          <div className="shrink-0 p-5 pt-3">
            <Link
              href={`/stocks/${encodeURIComponent(state.ticker)}`}
              className="inline-flex w-full items-center justify-center rounded-full border border-[color:var(--mint)]/40 px-4 py-2.5 text-sm font-semibold text-[color:var(--mint)] transition-colors hover:bg-[color:var(--mint)] hover:text-[color:var(--ink)]"
            >
              Open full view
            </Link>
          </div>
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

function tradePageHref(opts: {
  page: number;
  pageParam: "housePage" | "senatePage";
  query?: string;
  view: FeedView;
}): string {
  const params = new URLSearchParams();
  if (opts.view && opts.view !== "feed") params.set("view", opts.view);
  if (opts.query) params.set("q", opts.query);
  if (opts.page > 1) params.set(opts.pageParam, String(opts.page));
  const qs = params.toString();
  return qs ? `/app?${qs}` : "/app";
}

function TradeActivityBlock({
  title,
  subtitle,
  trades,
  page,
  pageParam,
  query,
  view,
  stockPanel,
  onOpenTicker,
  onCloseStock,
  onChamber,
}: {
  title: string;
  subtitle: string;
  trades: CongressTrade[];
  page: number;
  pageParam: "housePage" | "senatePage";
  query?: string;
  view: FeedView;
  stockPanel: StockPanelState | null;
  onOpenTicker: (ticker: string) => void;
  onCloseStock: () => void;
  onChamber: (ticker: string, chamber: "all" | Chamber) => void;
}) {
  const pageSize = 2;
  const totalPages = Math.max(1, Math.ceil(trades.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = trades.slice(
    (safePage - 1) * pageSize,
    (safePage - 1) * pageSize + pageSize,
  );
  const activeTicker =
    stockPanel &&
    slice.some((t) => (t.ticker ?? "").toUpperCase() === stockPanel.ticker)
      ? stockPanel
      : null;

  return (
    <section className="animate-rise space-y-4">
      <SectionTitle title={title} subtitle={subtitle} />
      {trades.length === 0 ? (
        <Empty text={`No ${title.toLowerCase()} buys or sales match.`} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {slice.map((trade) => {
              const ticker = (trade.ticker ?? "").toUpperCase();
              const buy = trade.transaction_type === "purchase";
              const expanded = activeTicker?.ticker === ticker;
              return (
                <button
                  key={trade.id}
                  type="button"
                  onClick={() => {
                    if (!ticker) return;
                    onOpenTicker(ticker);
                  }}
                  className={`rounded-[18px] border px-4 py-4 text-left transition-all duration-300 ${
                    expanded
                      ? "border-[color:var(--mint)]/50 bg-[color:var(--panel-elevated)] shadow-[0_0_28px_var(--glow)]"
                      : "border-[color:var(--line)] bg-[color:var(--panel)] hover:border-[color:var(--mint)]/30 hover:bg-[color:var(--panel-elevated)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-[family-name:var(--font-display)] text-lg font-bold text-[color:var(--fog)]">
                        {trade.member ?? "Unknown"}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--fog-dim)]">
                        {chamberLabel(trade.chamber)}
                        {trade.state ? ` · ${trade.state}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tracking-tight text-[color:var(--fog)]">
                      {ticker || "—"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span
                      className={`font-semibold uppercase tracking-wide ${
                        buy
                          ? "text-[color:var(--mint)]"
                          : "text-[color:var(--coral)]"
                      }`}
                    >
                      {tradeVerb(trade.transaction_type)}
                    </span>
                    <span className="text-[color:var(--fog-dim)]">
                      {formatAmountRange(
                        trade.amount_low,
                        trade.amount_high,
                        trade.amount_range,
                      )}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[color:var(--fog-dim)]">
                    {formatShortDate(
                      trade.disclosure_date ?? trade.transaction_date,
                    )}
                  </p>
                </button>
              );
            })}
          </div>

          {activeTicker ? (
            <StockPanel
              state={activeTicker}
              onClose={onCloseStock}
              onChamber={(c) => onChamber(activeTicker.ticker, c)}
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--fog-dim)]">
            <p>
              {(safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, trades.length)} of {trades.length}
            </p>
            <div className="flex items-center gap-2">
              {safePage > 1 ? (
                <Link
                  href={tradePageHref({
                    page: safePage - 1,
                    pageParam,
                    query,
                    view,
                  })}
                  className="rounded-full bg-[color:var(--panel-elevated)] px-3 py-1.5 text-[color:var(--fog)] hover:text-[color:var(--mint)]"
                >
                  Previous
                </Link>
              ) : (
                <span className="rounded-full px-3 py-1.5 opacity-40">
                  Previous
                </span>
              )}
              <span>
                {safePage} / {totalPages}
              </span>
              {safePage < totalPages ? (
                <Link
                  href={tradePageHref({
                    page: safePage + 1,
                    pageParam,
                    query,
                    view,
                  })}
                  className="rounded-full bg-[color:var(--panel-elevated)] px-3 py-1.5 text-[color:var(--fog)] hover:text-[color:var(--mint)]"
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-full px-3 py-1.5 opacity-40">Next</span>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function MemberBlock({
  title,
  subtitle,
  members,
  panel,
  onToggle,
  onOpenStock,
  onClose,
  onBackNested,
}: {
  title: string;
  subtitle: string;
  members: PopularMember[];
  panel: MemberPanelState | null;
  onToggle: (slug: string) => void;
  onOpenStock: (slug: string, ticker: string) => void;
  onClose: () => void;
  onBackNested: () => void;
}) {
  const pageSize = 2;
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(members.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageMembers = members.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );
  const active =
    panel && pageMembers.some((m) => m.slug === panel.slug) ? panel : null;

  useEffect(() => {
    setPage(0);
  }, [members.length, members[0]?.slug]);

  return (
    <section className="animate-rise space-y-4">
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="grid gap-3 sm:grid-cols-2">
        {members.length === 0 ? (
          <Empty text={`No active ${title.toLowerCase()} members yet.`} />
        ) : (
          pageMembers.map((member) => {
            const expanded = panel?.slug === member.slug;
            return (
              <button
                key={member.slug}
                type="button"
                onClick={() => onToggle(member.slug)}
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

      {members.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--fog-dim)]">
          <p>
            {safePage * pageSize + 1}–
            {Math.min((safePage + 1) * pageSize, members.length)} of{" "}
            {members.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-full bg-[color:var(--panel-elevated)] px-3 py-1.5 text-[color:var(--fog)] enabled:hover:text-[color:var(--mint)] disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="rounded-full bg-[color:var(--panel-elevated)] px-3 py-1.5 text-[color:var(--fog)] enabled:hover:text-[color:var(--mint)] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

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
  const ref = useScrollIntoView(true);

  return (
    <div
      ref={ref}
      className="animate-expand overflow-hidden rounded-[22px] border border-[color:var(--mint)]/25 bg-[color:var(--panel)] shadow-[var(--shadow-soft)]"
    >
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
