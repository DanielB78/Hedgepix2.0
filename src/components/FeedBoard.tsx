"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DisclosureDayCard } from "@/components/DisclosureDayCard";
import { PerformerExpandCard } from "@/components/PerformerExpandCard";
import { PriceChart } from "@/components/PriceChart";
import { SectorShareChart } from "@/components/SectorShareChart";
import { TradeFiltersBar } from "@/components/TradeFiltersBar";
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
import {
  filterTrades,
  parseAdvancedTradeFilters,
  type AdvancedTradeFilters,
  type TradeFilterContext,
} from "@/lib/advancedTradeFilters";
import { rankTrending } from "@/lib/trending";
import {
  overlapActivityAsTrending,
  rankSectorOverlapActivity,
  type OverlapPurchaseOccasion,
  type SectorOverlapActivityRow,
} from "@/lib/sectorOverlapActivity";
import type { SectorOverlapResult } from "@/lib/sectorOverlap";

type Props = {
  view: FeedView;
  payload: FeedPayload;
  query?: string;
  housePage?: number;
  senatePage?: number;
  insiderPage?: number;
  /** activity (default) | performers | sectors | overlap */
  tab?: "activity" | "performers" | "sectors" | "overlap";
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
          {("source" in trade && trade.source === "ceo")
            ? (trade.state?.trim() || "Insider")
            : chamberLabel(trade.chamber)}{" "}
          · {formatShortDate(trade.disclosure_date ?? trade.transaction_date)}
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
  insiderPage = 1,
  tab = "activity",
}: Props) {
  const [stockPanel, setStockPanel] = useState<StockPanelState | null>(null);
  const [memberPanel, setMemberPanel] = useState<MemberPanelState | null>(null);
  const requestId = useRef(0);
  const q = query?.trim().toLowerCase() ?? "";
  const searchParams = useSearchParams();
  const advancedFilters: AdvancedTradeFilters = useMemo(
    () => parseAdvancedTradeFilters(searchParams),
    [searchParams],
  );
  const allowMemberSectors = view !== "insiders";
  const filterCtx: TradeFilterContext = useMemo(
    () => ({
      memberSectors: payload.memberSectors ?? {},
      tradeSectorOverlaps: payload.tradeSectorOverlaps ?? {},
      allowMemberSectors,
    }),
    [
      allowMemberSectors,
      payload.memberSectors,
      payload.tradeSectorOverlaps,
    ],
  );

  const filterTrade = useCallback(
    (trade: CongressTrade) => {
      if (q) {
        const ticker = (trade.ticker ?? "").toLowerCase();
        const member = (trade.member ?? "").toLowerCase();
        const asset = (trade.asset ?? "").toLowerCase();
        const textOk =
          ticker.includes(q) ||
          member.includes(q) ||
          asset.includes(q) ||
          ticker === q.toUpperCase().toLowerCase();
        if (!textOk) return false;
      }
      return true;
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
  const showInsiders = view === "insiders";
  const showPerformers = tab === "performers";
  const showSectors = tab === "sectors";
  const showOverlap = tab === "overlap";
  const showActivity = tab === "activity";
  const trendingLimit = 40;

  const houseTrades = useMemo(() => {
    const base = payload.recentHouse.filter(filterTrade);
    return filterTrades(base, advancedFilters, filterCtx);
  }, [advancedFilters, filterCtx, filterTrade, payload.recentHouse]);

  const senateTrades = useMemo(() => {
    const base = payload.recentSenate.filter(filterTrade);
    return filterTrades(base, advancedFilters, filterCtx);
  }, [advancedFilters, filterCtx, filterTrade, payload.recentSenate]);

  const insiderTrades = useMemo(() => {
    const rows = payload.recentInsider ?? [];
    const textFiltered = !q
      ? rows
      : rows.filter((trade) => {
          const ticker = (trade.ticker ?? "").toLowerCase();
          const member = (trade.member ?? "").toLowerCase();
          const title = (trade.state ?? "").toLowerCase();
          const asset = (trade.asset ?? "").toLowerCase();
          return (
            ticker.includes(q) ||
            member.includes(q) ||
            title.includes(q) ||
            asset.includes(q)
          );
        });
    // Insiders: ticker sectors only; member sector source disabled in ctx
    return filterTrades(textFiltered, advancedFilters, {
      ...filterCtx,
      allowMemberSectors: false,
    });
  }, [advancedFilters, filterCtx, payload.recentInsider, q]);

  /** Recalculate trending from filtered underlying congress trades (not post-hide). */
  const trendingRows = useMemo(() => {
    if (view !== "trending") {
      return payload.trending.filter(filterTicker);
    }
    const underlying = filterTrades(
      [...payload.recentHouse, ...payload.recentSenate].filter(filterTrade),
      advancedFilters,
      filterCtx,
    );
    return rankTrending(
      underlying.map((t) => ({
        ticker: t.ticker,
        asset: t.asset,
        transaction_type: t.transaction_type,
        member_slug: t.member_slug,
        disclosure_date: t.disclosure_date,
      })),
    ).filter(filterTicker);
  }, [
    advancedFilters,
    filterCtx,
    filterTicker,
    filterTrade,
    payload.recentHouse,
    payload.recentSenate,
    payload.trending,
    view,
  ]);

  const resultCount = useMemo(() => {
    if (view === "house") return houseTrades.length;
    if (view === "senate") return senateTrades.length;
    if (view === "insiders") return insiderTrades.length;
    if (view === "trending") return trendingRows.length;
    return houseTrades.length + senateTrades.length;
  }, [
    houseTrades.length,
    insiderTrades.length,
    senateTrades.length,
    trendingRows.length,
    view,
  ]);

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

  /** Sector-Overlap Activity: always purchase-only; uses filtered chamber trades. */
  const sectorOverlapActivity = useMemo(() => {
    if (view !== "house" && view !== "senate") return [];
    const trades = view === "house" ? houseTrades : senateTrades;
    return rankSectorOverlapActivity(
      trades,
      payload.tradeSectorOverlaps ?? {},
      25,
    );
  }, [houseTrades, payload.tradeSectorOverlaps, senateTrades, view]);

  const chamberLabelForTabs =
    view === "senate"
      ? "Senate"
      : view === "insiders"
        ? "Insiders"
        : view === "trending"
          ? "Trending"
          : "House";

  const sectorsTabSubtitle =
    view === "insiders"
      ? "Market-share style breakdown of sectors being traded by officers"
      : "Market-share style breakdown of sectors being traded by this chamber";

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

      <TradeFiltersBar
        allowMemberSectors={allowMemberSectors}
        resultCount={resultCount}
        resultLabel={view === "trending" ? "trending tickers" : "trades"}
      />

      <ViewTabs view={view} tab={tab} query={query} />

      {showPerformers ? (
        <TopPerformersSection
          title={`Top performers · ${chamberLabelForTabs}`}
          subtitle={
            view === "insiders"
              ? "Highest average return on stocks bought by officers in the selected period — expand for buys, returns, and charts"
              : "Highest average return on stocks bought in the selected period — expand a member for buys, returns, and charts"
          }
          rows={topPerformers}
          portfolio={payload.portfolioGrowth}
          period={payload.performerPeriod}
          query={query}
          view={view}
          sectorByTicker={payload.tickerSectors}
        />
      ) : null}

      {showSectors ? (
        <SectorShareChart
          title={`Sector mix · ${payload.sectorShareScope}`}
          subtitle={sectorsTabSubtitle}
          slices={payload.sectorShare}
        />
      ) : null}

      {showOverlap && (view === "house" || view === "senate") ? (
        <SectorOverlapActivitySection
          chamberLabel={chamberLabelForTabs}
          rows={sectorOverlapActivity}
          sectorByTicker={payload.tickerSectors}
          stockPanel={stockPanel}
          onOpenTicker={(ticker) =>
            void openStock(ticker, view === "senate" ? "senate" : "house")
          }
          onCloseStock={() => setStockPanel(null)}
          onTradeSource={(s) =>
            stockPanel ? void openStock(stockPanel.ticker, s) : undefined
          }
          onOpenMember={(slug) => toggleMember(slug)}
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
          memberSectors={payload.memberSectors}
          sectorOverlaps={payload.tradeSectorOverlaps}
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
          memberSectors={payload.memberSectors}
          sectorOverlaps={payload.tradeSectorOverlaps}
        />
      ) : null}

      {showActivity && showInsiders ? (
        <DisclosureDayList
          title="Insiders"
          subtitle="Form 4 officer filings (CEO, CFO, and other named officers) — expand for buys and charts"
          trades={insiderTrades}
          page={insiderPage}
          pageParam="insiderPage"
          query={query}
          view={view}
          sectorByTicker={payload.tickerSectors}
        />
      ) : null}

      {showActivity && memberPanel ? (
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
  metric = "trending",
}: {
  rank: number;
  row: TrendingTicker;
  active: boolean;
  onOpen: () => void;
  sectorLabel?: string | null;
  /** trending = members/trades; overlapBuys = overlap buys/members */
  metric?: "trending" | "overlapBuys";
}) {
  const primary =
    metric === "overlapBuys"
      ? `${row.totalTrades} overlap buy${row.totalTrades === 1 ? "" : "s"}`
      : `${row.uniqueMembers} member${row.uniqueMembers === 1 ? "" : "s"}`;
  const secondary =
    metric === "overlapBuys"
      ? `${row.uniqueMembers} member${row.uniqueMembers === 1 ? "" : "s"}`
      : `${row.totalTrades} trade${row.totalTrades === 1 ? "" : "s"}`;

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
        <p className="text-[color:var(--mint)]">{primary}</p>
        <p>{secondary}</p>
      </div>
    </button>
  );
}

function StockPanel({
  state,
  onClose,
  onTradeSource,
  onOpenMember,
  preferredSources = ["congress", "house", "senate", "ceo"],
}: {
  state: StockPanelState;
  onClose: () => void;
  onTradeSource: (source: ChartTradeSource) => void;
  onOpenMember?: (slug: string) => void;
  preferredSources?: ChartTradeSource[];
}) {
  const ref = useScrollIntoView(true);
  const sources = preferredSources.filter(
    (s) =>
      s === "congress" ||
      s === "house" ||
      s === "senate" ||
      s === "ceo" ||
      s === "both",
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
            {state.data?.asset ?? "Trade activity"}
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

const FILTER_PARAM_KEYS = [
  "tx",
  "sectors",
  "sectorSrc",
  "overlap",
  "members",
  "tickers",
] as const;

function copyFilterParams(
  target: URLSearchParams,
  source: URLSearchParams | null | undefined,
) {
  if (!source) return;
  for (const key of FILTER_PARAM_KEYS) {
    const value = source.get(key);
    if (value) target.set(key, value);
  }
}

function tradePageHref(opts: {
  page: number;
  pageParam: "housePage" | "senatePage" | "insiderPage";
  query?: string;
  view: FeedView;
  filterParams?: URLSearchParams | null;
}): string {
  const params = new URLSearchParams();
  if (opts.view && opts.view !== "feed") params.set("view", opts.view);
  if (opts.query) params.set("q", opts.query);
  copyFilterParams(params, opts.filterParams);
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
  tab: "activity" | "performers" | "sectors" | "overlap";
  query?: string;
}) {
  const searchParams = useSearchParams();
  if (
    view !== "house" &&
    view !== "senate" &&
    view !== "trending" &&
    view !== "insiders"
  ) {
    return null;
  }
  const activityLabel = view === "trending" ? "Tickers" : "Activity";
  const showOverlapTab = view === "house" || view === "senate";
  function href(next: "activity" | "performers" | "sectors" | "overlap") {
    const params = new URLSearchParams();
    params.set("view", view);
    if (next === "performers") params.set("tab", "performers");
    if (next === "sectors") params.set("tab", "sectors");
    if (next === "overlap") params.set("tab", "overlap");
    if (query) params.set("q", query);
    copyFilterParams(params, searchParams);
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
      <Link
        href={href("sectors")}
        className="hx-tab"
        data-active={tab === "sectors" ? "true" : "false"}
      >
        Sectors
      </Link>
      {showOverlapTab ? (
        <Link
          href={href("overlap")}
          className="hx-tab"
          data-active={tab === "overlap" ? "true" : "false"}
        >
          Sector overlap
        </Link>
      ) : null}
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
  memberSectors,
  sectorOverlaps,
}: {
  title: string;
  subtitle: string;
  trades: CongressTrade[];
  page: number;
  pageParam: "housePage" | "senatePage" | "insiderPage";
  query?: string;
  view: FeedView;
  sectorByTicker?: Record<string, string>;
  memberSectors?: Record<string, string[]>;
  sectorOverlaps?: Record<string, import("@/lib/sectorOverlap").SectorOverlapResult>;
}) {
  const groups = useMemo(() => groupTradesByDisclosure(trades), [trades]);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = groups.slice(
    (safePage - 1) * pageSize,
    (safePage - 1) * pageSize + pageSize,
  );
  const filterParams = useSearchParams();

  return (
    <section className="animate-rise space-y-3">
      <SectionTitle title={title} subtitle={subtitle} />
      {groups.length === 0 ? (
        <Empty text={`No ${title.toLowerCase()} disclosures match.`} />
      ) : (
        <>
          <div className="space-y-3">
            {slice.map((group) => (
              <DisclosureDayCard
                key={group.key}
                group={group}
                defaultOpen={false}
                sectorByTicker={sectorByTicker}
                memberSectors={
                  group.memberSlug
                    ? memberSectors?.[group.memberSlug] ??
                      memberSectors?.[group.memberSlug.toLowerCase()]
                    : undefined
                }
                sectorOverlaps={sectorOverlaps}
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
                    filterParams,
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
                    filterParams,
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

function PerformerPeriodChips({
  period,
  query,
  view,
}: {
  period: PerformerPeriod;
  query?: string;
  view: FeedView;
}) {
  const searchParams = useSearchParams();
  const filterExtras: Record<string, string | undefined> = {};
  for (const key of FILTER_PARAM_KEYS) {
    const value = searchParams.get(key);
    if (value) filterExtras[key] = value;
  }
  return (
    <div className="hx-toolbar">
      {PERFORMER_PERIODS.map((value) => (
        <Link
          key={value}
          href={performerPeriodHref(value, {
            q: query,
            view: view === "feed" ? undefined : view,
            tab: "performers",
            ...filterExtras,
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
            ? ` · ${portfolio.ceoPricedCount} officer`
            : ""}
        </p>
      </div>
    </div>
  );
}

function overlapMatchCaption(overlap: SectorOverlapResult): string {
  if (overlap.match_type === "direct") return "Direct match";
  if (overlap.match_type === "embedding") {
    const sim =
      typeof overlap.similarity === "number"
        ? overlap.similarity.toFixed(3)
        : null;
    return sim ? `Semantic · ${sim}` : "Semantic";
  }
  return "Overlap";
}

function SectorOverlapActivitySection({
  chamberLabel,
  rows,
  sectorByTicker,
  stockPanel,
  onOpenTicker,
  onCloseStock,
  onTradeSource,
  onOpenMember,
}: {
  chamberLabel: string;
  rows: SectorOverlapActivityRow[];
  sectorByTicker?: Record<string, string>;
  stockPanel: StockPanelState | null;
  onOpenTicker: (ticker: string) => void;
  onCloseStock: () => void;
  onTradeSource: (source: ChartTradeSource) => void;
  onOpenMember: (slug: string) => void;
}) {
  return (
    <section className="animate-rise space-y-4">
      <SectionTitle
        title={`Sector-Overlap Activity · ${chamberLabel}`}
        subtitle="Tickers with the most qualifying overlap purchases — member industry labels match or are highly similar to the ticker’s industries (buys only)"
      />
      <div className="space-y-3">
        {rows.length === 0 ? (
          <Empty text="No overlap buy activity matches the current filters." />
        ) : (
          rows.map((row, i) => {
            const active = stockPanel?.ticker === row.ticker;
            const trendingRow = overlapActivityAsTrending(row);
            return (
              <div key={row.ticker} className="space-y-3">
                <TickerCard
                  rank={i + 1}
                  row={trendingRow}
                  active={active}
                  sectorLabel={sectorByTicker?.[row.ticker] ?? null}
                  metric="overlapBuys"
                  onOpen={() => onOpenTicker(row.ticker)}
                />
                {active ? (
                  <div className="space-y-3">
                    <OverlapBuysPanel
                      occasions={row.occasions}
                      onOpenMember={onOpenMember}
                    />
                    {stockPanel ? (
                      <StockPanel
                        state={stockPanel}
                        onClose={onCloseStock}
                        onTradeSource={onTradeSource}
                        onOpenMember={onOpenMember}
                        preferredSources={
                          chamberLabel === "Senate"
                            ? ["senate", "congress", "ceo"]
                            : ["house", "congress", "ceo"]
                        }
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function OverlapBuysPanel({
  occasions,
  onOpenMember,
}: {
  occasions: OverlapPurchaseOccasion[];
  onOpenMember: (slug: string) => void;
}) {
  return (
    <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel)]">
      <div className="border-b border-[color:var(--line)] px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--fog-dim)]">
          Qualifying overlap purchases · {occasions.length}
        </p>
      </div>
      <ul className="divide-y divide-[color:var(--line)]">
        {occasions.map((occ) => (
          <li key={occ.key} className="px-4 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {occ.memberSlug ? (
                <button
                  type="button"
                  className="text-sm font-medium text-[color:var(--mint)] hover:opacity-80"
                  onClick={() => onOpenMember(occ.memberSlug!)}
                >
                  {occ.member ?? occ.memberSlug}
                </button>
              ) : (
                <p className="text-sm font-medium text-[color:var(--fog)]">
                  {occ.member ?? "Unknown member"}
                </p>
              )}
              <p className="hx-meta">
                {formatShortDate(occ.transactionDate ?? occ.disclosureDate)}
                {occ.amountRange ? ` · ${occ.amountRange}` : ""}
              </p>
            </div>
            <p className="mt-0.5 text-sm text-[color:var(--fog-dim)]">
              Purchase
              {occ.overlap.member_label
                ? ` · Member sector: ${occ.overlap.member_label}`
                : ""}
              {occ.overlap.ticker_label
                ? ` · Ticker sector: ${occ.overlap.ticker_label}`
                : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-[color:var(--fog-mute)]">
              {overlapMatchCaption(occ.overlap)}
            </p>
          </li>
        ))}
      </ul>
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
  sectorByTicker,
}: {
  title: string;
  subtitle: string;
  rows: TopPerformer[];
  portfolio: PortfolioGrowth | null;
  period: PerformerPeriod;
  query?: string;
  view: FeedView;
  sectorByTicker?: Record<string, string>;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

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
          rows.map((row, i) => {
            const key = row.memberSlug ?? row.key;
            return (
              <PerformerExpandCard
                key={row.key}
                rank={i + 1}
                row={row}
                expanded={expandedKey === key}
                defaultPeriod={period}
                onToggle={() =>
                  setExpandedKey((prev) => (prev === key ? null : key))
                }
                sectorByTicker={sectorByTicker}
              />
            );
          })
        )}
      </div>
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
