"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DisclosureDayCard } from "@/components/DisclosureDayCard";
import { PriceChart } from "@/components/PriceChart";
import type {
  FeedPayload,
  FeedView,
  MemberPreviewPayload,
  MemberStockPreviewPayload,
  StockPreviewPayload,
} from "@/lib/feed";
import {
  chamberLabel,
  formatAmountRange,
  formatShortDate,
  tradeVerb,
} from "@/lib/format";
import { groupTradesByDisclosure } from "@/lib/groupTrades";
import type { CongressTrade, TrendingTicker } from "@/lib/types";
import {
  type ChartTrade,
  type ChartTradeSource,
} from "@/lib/chartTrades";
import {
  PERFORMER_PERIODS,
  performerPeriodHref,
  performerPeriodLabel,
  type PerformerPeriod,
  type PortfolioGrowth,
  type TopPerformer,
} from "@/lib/topPerformers";

type Props = {
  view: FeedView;
  payload: FeedPayload;
  query?: string;
  housePage?: number;
  senatePage?: number;
  /** activity (default) | performers */
  tab?: "activity" | "performers";
};

type StockPanelState = {
  ticker: string;
  tradeSource: ChartTradeSource;
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

function TradeRow({
  trade,
  onOpenMember,
}: {
  trade: ChartTrade | CongressTrade;
  onOpenMember?: (slug: string) => void;
}) {
  const buy = trade.transaction_type === "purchase";
  const slug =
    "member_slug" in trade && trade.member_slug
      ? trade.member_slug
      : null;
  const memberClickable = !!slug && !!onOpenMember;

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
          {("source" in trade && trade.source === "ceo") ? "CEO" : chamberLabel(trade.chamber)} ·{" "}
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
  tab = "activity",
}: Props) {
  const [stockPanel, setStockPanel] = useState<StockPanelState | null>(null);
  const [memberPanel, setMemberPanel] = useState<MemberPanelState | null>(null);
  const requestId = useRef(0);
  const q = query?.trim().toLowerCase() ?? "";

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
    async (ticker: string, tradeSource: ChartTradeSource = "congress") => {
      const id = ++requestId.current;
      setMemberPanel(null);
      setStockPanel({
        ticker,
        tradeSource,
        data: null,
        loading: true,
        error: null,
      });
      try {
        const data = await loadJson<StockPreviewPayload>(
          `/api/feed/preview?kind=stock&ticker=${encodeURIComponent(ticker)}&source=${tradeSource}`,
        );
        if (id !== requestId.current) return;
        setStockPanel({
          ticker,
          tradeSource,
          data,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (id !== requestId.current) return;
        setStockPanel({
          ticker,
          tradeSource,
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load",
        });
      }
    },
    [],
  );

  const toggleStock = useCallback(
    (ticker: string, tradeSource: ChartTradeSource = "congress") => {
      if (stockPanel?.ticker === ticker && stockPanel.tradeSource === tradeSource) {
        setStockPanel(null);
        return;
      }
      void openStock(ticker, tradeSource);
    },
    [openStock, stockPanel?.ticker, stockPanel?.tradeSource],
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

  const showTrending = view === "trending";
  const showHouse = view === "house" || view === "feed";
  const showSenate = view === "senate" || view === "feed";
  const showPerformers = tab === "performers";
  const showActivity = tab === "activity";
  const trendingLimit = 40;
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
  const topPerformers = useMemo(
    () =>
      (payload.topPerformers ?? []).filter((row) => {
        if (!q) return true;
        return (
          row.name.toLowerCase().includes(q) ||
          (row.bestTicker ?? "").toLowerCase().includes(q)
        );
      }),
    [payload.topPerformers, q],
  );

  const chamberLabelForTabs =
    view === "senate" ? "Senate" : view === "trending" ? "Trending" : "House";

  return (
    <div className="space-y-8">
      {payload.error ? (
        <div className="rounded-md border border-[color:var(--coral)]/40 bg-[color:var(--panel-elevated)] px-4 py-3 text-sm text-[color:var(--coral)]">
          {payload.error}
        </div>
      ) : null}

      {q ? (
        <p className="text-center text-sm text-[color:var(--fog-dim)]">
          Showing results for{" "}
          <span className="font-semibold text-[color:var(--fog)]">{query}</span>
        </p>
      ) : null}

      <ViewTabs view={view} tab={tab} query={query} />

      {showPerformers ? (
        <TopPerformersSection
          title={`Top performers · ${chamberLabelForTabs}`}
          subtitle="Highest average return on stocks bought in the selected period"
          rows={topPerformers}
          portfolio={payload.portfolioGrowth}
          period={payload.performerPeriod}
          query={query}
          view={view}
          onOpenMember={(slug) => toggleMember(slug)}
          onOpenTicker={(ticker) =>
            toggleStock(
              ticker,
              view === "senate" ? "senate" : view === "house" ? "house" : "congress",
            )
          }
          stockPanel={stockPanel}
          memberPanel={memberPanel}
          onCloseStock={() => setStockPanel(null)}
          onTradeSource={(s) =>
            stockPanel ? void openStock(stockPanel.ticker, s) : undefined
          }
          onOpenMemberStock={(slug, ticker) => void openMemberStock(slug, ticker)}
          onCloseMember={() => setMemberPanel(null)}
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

      {showActivity && showTrending ? (
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
                      sectorLabel={payload.tickerSectors[row.ticker] ?? null}
                      onOpen={() => toggleStock(row.ticker)}
                    />
                    {active && stockPanel ? (
                      <StockPanel
                        state={stockPanel}
                        onClose={() => setStockPanel(null)}
                        onTradeSource={(s) => void openStock(stockPanel.ticker, s)}
                        onOpenMember={(slug) => toggleMember(slug)}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      ) : null}

      {showActivity && showHouse ? (
        <DisclosureDayList
          title="House"
          subtitle="Same-day disclosures — expand for buys and charts"
          trades={houseTrades}
          page={housePage}
          pageParam="housePage"
          query={query}
          view={view}
          sectorByTicker={payload.tickerSectors}
        />
      ) : null}

      {showActivity && showSenate ? (
        <DisclosureDayList
          title="Senate"
          subtitle="Same-day disclosures — expand for buys and charts"
          trades={senateTrades}
          page={senatePage}
          pageParam="senatePage"
          query={query}
          view={view}
          sectorByTicker={payload.tickerSectors}
        />
      ) : null}

      {showPerformers && memberPanel ? (
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
      <h2 className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight text-[color:var(--fog)]">
        {title}
      </h2>
      <p className="text-sm text-[color:var(--fog-dim)]">{subtitle}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] px-4 py-6 text-center text-sm text-[color:var(--fog-dim)]">
      {text}
    </div>
  );
}

function TickerCard({
  rank,
  row,
  active,
  onOpen,
  sectorLabel,
}: {
  rank: number;
  row: TrendingTicker;
  active: boolean;
  onOpen: () => void;
  sectorLabel?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-4 rounded-md border px-4 py-2.5 text-left transition-all duration-300 ${
        active
          ? "border-[color:var(--mint)]/50 bg-[color:var(--panel-elevated)]"
          : "border-[color:var(--line)] bg-[color:var(--panel)] hover:border-[color:var(--mint)]/30 hover:bg-[color:var(--panel-elevated)]"
      }`}
    >
      <span className="w-8 text-sm tabular-nums text-[color:var(--fog-dim)]">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight text-[color:var(--fog)]">
          <span>{row.ticker}</span>
          {sectorLabel ? (
            <span className="rounded bg-[color:var(--panel-elevated)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--fog-dim)]">
              {sectorLabel}
            </span>
          ) : null}
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
  onTradeSource,
  onOpenMember,
  preferredSources = ["congress", "house", "senate"],
}: {
  state: StockPanelState;
  onClose: () => void;
  onTradeSource: (source: ChartTradeSource) => void;
  onOpenMember?: (slug: string) => void;
  preferredSources?: ChartTradeSource[];
}) {
  const ref = useScrollIntoView(true);
  const sources = preferredSources.filter((s) =>
    s === "congress" || s === "house" || s === "senate",
  );

  return (
    <div
      ref={ref}
      className="animate-expand overflow-hidden rounded-md border border-[color:var(--mint)]/25 bg-[color:var(--panel)] shadow-[var(--shadow-soft)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-2.5">
        <div>
          <p className="font-[family-name:var(--font-display)] text-base font-semibold text-[color:var(--fog)]">
            {state.ticker}
          </p>
          <p className="text-sm text-[color:var(--fog-dim)]">
            {state.data?.asset ?? "Congressional activity"}
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
        <aside className="flex max-h-[420px] flex-col border-b border-[color:var(--line)] lg:max-h-[520px] lg:border-b-0 lg:border-r">
          <div className="shrink-0 space-y-3 p-5 pb-3">
            <div className="hx-toolbar gap-3">
              {sources.map((value) => {
                const label =
                  value === "congress"
                    ? "Congress"
                    : value === "house"
                      ? "House"
                      : "Senate";
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

        <div className="p-4 sm:p-5">
          {state.loading ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-[color:var(--fog-dim)]">
              Loading chart…
            </div>
          ) : state.data?.bars.length ? (
            <PriceChart
              key={`${state.ticker}-${state.tradeSource}`}
              bars={state.data.bars}
              trades={state.data.topTrades}
              interactive
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


function ViewTabs({
  view,
  tab,
  query,
}: {
  view: FeedView;
  tab: "activity" | "performers";
  query?: string;
}) {
  if (view !== "house" && view !== "senate" && view !== "trending") return null;
  const activityLabel = view === "trending" ? "Tickers" : "Activity";
  function href(next: "activity" | "performers") {
    const params = new URLSearchParams();
    params.set("view", view);
    if (next === "performers") params.set("tab", "performers");
    if (query) params.set("q", query);
    return `/app?${params.toString()}`;
  }
  return (
    <div className="hx-toolbar">
      <Link
        href={href("activity")}
        className="hx-tab"
        data-active={tab === "activity" ? "true" : "false"}
      >
        {activityLabel}
      </Link>
      <Link
        href={href("performers")}
        className="hx-tab"
        data-active={tab === "performers" ? "true" : "false"}
      >
        Top performers
      </Link>
    </div>
  );
}

function DisclosureDayList({
  title,
  subtitle,
  trades,
  page,
  pageParam,
  query,
  view,
  sectorByTicker,
}: {
  title: string;
  subtitle: string;
  trades: CongressTrade[];
  page: number;
  pageParam: "housePage" | "senatePage";
  query?: string;
  view: FeedView;
  sectorByTicker?: Record<string, string>;
}) {
  const groups = useMemo(() => groupTradesByDisclosure(trades), [trades]);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = groups.slice(
    (safePage - 1) * pageSize,
    (safePage - 1) * pageSize + pageSize,
  );

  return (
    <section className="animate-rise space-y-3">
      <SectionTitle title={title} subtitle={subtitle} />
      {groups.length === 0 ? (
        <Empty text={`No ${title.toLowerCase()} disclosures match.`} />
      ) : (
        <>
          <div className="space-y-3">
            {slice.map((group, index) => (
              <DisclosureDayCard
                key={group.key}
                group={group}
                defaultOpen={false}
                sectorByTicker={sectorByTicker}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--fog-dim)]">
            <p>
              {(safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, groups.length)} of {groups.length}{" "}
              disclosures
              {" · "}
              {trades.length} trade{trades.length === 1 ? "" : "s"}
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
                  className="hx-btn hx-btn-ghost"
                >
                  Previous
                </Link>
              ) : (
                <span className="hx-btn hx-btn-ghost opacity-40">Previous</span>
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
                  className="hx-btn hx-btn-ghost"
                >
                  Next
                </Link>
              ) : (
                <span className="hx-btn hx-btn-ghost opacity-40">Next</span>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function performerChipClass(active: boolean) {
  return active ? "hx-chip hx-chip-accent" : "hx-chip";
}

function formatReturnPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

function performerKindLabel(kind: TopPerformer["kind"]): string {
  if (kind === "ceo") return "CEO";
  if (kind === "house") return "House";
  return "Senate";
}

function PerformerPeriodChips({
  period,
  query,
  view,
}: {
  period: PerformerPeriod;
  query?: string;
  view: FeedView;
}) {
  return (
    <div className="hx-toolbar">
      {PERFORMER_PERIODS.map((value) => (
        <Link
          key={value}
          href={performerPeriodHref(value, {
            q: query,
            view: view === "feed" ? undefined : view,
            tab: "performers",
          })}
          className={performerChipClass(period === value)}
          aria-current={period === value ? "page" : undefined}
        >
          {performerPeriodLabel(value)}
        </Link>
      ))}
    </div>
  );
}

function PortfolioGrowthBanner({
  portfolio,
  period,
}: {
  portfolio: PortfolioGrowth;
  period: PerformerPeriod;
}) {
  const positive = portfolio.avgReturnPct >= 0;
  return (
    <div className="rounded-md border border-[color:var(--mint)]/30 bg-[color:var(--panel)] px-4 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
        Portfolio growth · {performerPeriodLabel(period)}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <p
          className={`font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight ${
            positive ? "text-[color:var(--mint)]" : "text-[color:var(--coral)]"
          }`}
        >
          {formatReturnPct(portfolio.avgReturnPct)}
        </p>
        <p className="text-sm text-[color:var(--fog-dim)]">
          Equal-weighted avg across {portfolio.pricedBuyCount} priced buy
          {portfolio.pricedBuyCount === 1 ? "" : "s"}
          {" · "}
          {portfolio.congressPricedCount} congress
          {portfolio.ceoPricedCount
            ? ` · ${portfolio.ceoPricedCount} CEO`
            : ""}
        </p>
      </div>
    </div>
  );
}

function PerformerCard({
  rank,
  row,
  onOpenMember,
  onOpenTicker,
}: {
  rank: number;
  row: TopPerformer;
  onOpenMember: (slug: string) => void;
  onOpenTicker: (ticker: string) => void;
}) {
  const positive = row.avgReturnPct >= 0;
  const clickableMember = !!row.memberSlug;
  const clickableTicker = !!row.bestTicker;

  return (
    <div className="flex items-center gap-3 rounded-md border border-[color:var(--line)] bg-[color:var(--panel)] px-4 py-3">
      <span className="w-6 shrink-0 text-sm font-semibold text-[color:var(--fog-dim)]">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        {clickableMember ? (
          <button
            type="button"
            onClick={() => onOpenMember(row.memberSlug!)}
            className="truncate text-left font-[family-name:var(--font-display)] text-base font-semibold text-[color:var(--fog)] hover:text-[color:var(--mint)]"
          >
            {row.name}
          </button>
        ) : (
          <p className="truncate font-[family-name:var(--font-display)] text-base font-semibold text-[color:var(--fog)]">
            {row.name}
          </p>
        )}
        <p className="text-xs text-[color:var(--fog-dim)]">
          {performerKindLabel(row.kind)} · {row.pricedBuyCount} priced buy
          {row.pricedBuyCount === 1 ? "" : "s"}
          {row.bestTicker ? (
            <>
              {" "}
              · best{" "}
              {clickableTicker ? (
                <button
                  type="button"
                  onClick={() => onOpenTicker(row.bestTicker!)}
                  className="font-semibold text-[color:var(--fog)] hover:text-[color:var(--mint)]"
                >
                  {row.bestTicker}
                </button>
              ) : (
                row.bestTicker
              )}
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
    </div>
  );
}

function TopPerformersSection({
  title,
  subtitle,
  rows,
  portfolio,
  period,
  query,
  view,
  onOpenMember,
  onOpenTicker,
  stockPanel,
  memberPanel,
  onCloseStock,
  onTradeSource,
  onOpenMemberStock,
  onCloseMember,
  onBackNested,
}: {
  title: string;
  subtitle: string;
  rows: TopPerformer[];
  portfolio: PortfolioGrowth | null;
  period: PerformerPeriod;
  query?: string;
  view: FeedView;
  onOpenMember: (slug: string) => void;
  onOpenTicker: (ticker: string) => void;
  stockPanel: StockPanelState | null;
  memberPanel: MemberPanelState | null;
  onCloseStock: () => void;
  onTradeSource: (source: ChartTradeSource) => void;
  onOpenMemberStock: (slug: string, ticker: string) => void;
  onCloseMember: () => void;
  onBackNested: () => void;
}) {
  return (
    <section className="animate-rise space-y-4">
      <SectionTitle title={title} subtitle={subtitle} />
      <PerformerPeriodChips period={period} query={query} view={view} />
      {portfolio ? (
        <PortfolioGrowthBanner portfolio={portfolio} period={period} />
      ) : null}
      <div className="space-y-3">
        {rows.length === 0 ? (
          <Empty text="No priced purchases in this period yet." />
        ) : (
          rows.map((row, i) => (
            <PerformerCard
              key={row.key}
              rank={i + 1}
              row={row}
              onOpenMember={onOpenMember}
              onOpenTicker={onOpenTicker}
            />
          ))
        )}
      </div>
      {stockPanel ? (
        <StockPanel
          state={stockPanel}
          onClose={onCloseStock}
          onTradeSource={onTradeSource}
          onOpenMember={onOpenMember}
        />
      ) : null}
      {memberPanel ? (
        <MemberPanel
          state={memberPanel}
          onClose={onCloseMember}
          onOpenTicker={(ticker) => onOpenMemberStock(memberPanel.slug, ticker)}
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
      className="animate-expand overflow-hidden rounded-md border border-[color:var(--mint)]/25 bg-[color:var(--panel)] shadow-[var(--shadow-soft)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-2.5">
        <div>
          <p className="font-[family-name:var(--font-display)] text-base font-semibold text-[color:var(--fog)]">
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
          className="rounded-md px-3 py-1.5 text-sm text-[color:var(--fog-dim)] hover:bg-[color:var(--panel-elevated)] hover:text-[color:var(--fog)]"
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
          <p className="mb-3 font-[family-name:var(--font-display)] text-base font-semibold text-[color:var(--fog)]">
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
              key={`${state.slug}-${state.nestedTicker}`}
              bars={state.nested.bars}
              trades={state.nested.trades}
              interactive
            />
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-[color:var(--fog-dim)]">
              No chart data for this holding.
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/stocks/${encodeURIComponent(state.nestedTicker)}`}
              className="inline-flex rounded-md border border-[color:var(--mint)]/40 px-4 py-2 text-sm font-semibold text-[color:var(--mint)] hover:bg-[color:var(--mint)] hover:text-[color:var(--ink)]"
            >
              More on {state.nestedTicker}
            </Link>
            <Link
              href={`/members/${encodeURIComponent(state.slug)}`}
              className="inline-flex rounded-md border border-[color:var(--line)] px-4 py-2 text-sm font-semibold text-[color:var(--fog-dim)] hover:border-[color:var(--mint)]/40 hover:text-[color:var(--fog)]"
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
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-[color:var(--line)] bg-[color:var(--panel-elevated)] px-4 py-3 text-left transition-colors hover:border-[color:var(--mint)]/40"
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
            className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-[color:var(--mint)]/40 px-4 py-2.5 text-sm font-semibold text-[color:var(--mint)] transition-colors hover:bg-[color:var(--mint)] hover:text-[color:var(--ink)]"
          >
            More
          </Link>
        </div>
      )}
    </div>
  );
}
