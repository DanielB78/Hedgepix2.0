import type {
  Chamber,
  CeoStockPurchaseRow,
  CongressTrade,
  StockPriceBar,
  TrendingTicker,
} from "./types";
import { createBrowserSupabase, hasPublicSupabaseConfig } from "./supabase";
import { PUBLIC_TRADE_COLUMNS } from "./trades";
import { fetchTrending } from "./trending";
import {
  applyListedEquityFallback,
  isMissingListedEquityColumn,
} from "./stockFilter";
import {
  type CeoActivityCard,
} from "./ceoAggregate";
import {
  fetchTopPerformers,
  type PerformerPeriod,
  type PortfolioGrowth,
  type TopPerformer,
} from "./topPerformers";
import {
  asCongressChartTrade,
  ceoRowToChartTrade,
  chamberFromTradeSource,
  includeCeoTrades,
  includeCongressTrades,
  parseChartTradeSource,
  type ChartTrade,
  type ChartTradeSource,
} from "./chartTrades";
import {
  fetchTickerProfiles,
  tickerSectorLabel,
} from "./tickerProfiles";

export type { PerformerPeriod, PortfolioGrowth, TopPerformer };
export type { ChartTrade, ChartTradeSource };

export type FeedView = "feed" | "trending" | "house" | "senate";

export type PopularMember = {
  slug: string;
  name: string;
  chamber: Chamber;
  state: string | null;
  tradeCount: number;
  uniqueTickers: number;
  latestDisclosure: string | null;
};

export type FeedPayload = {
  trending: TrendingTicker[];
  houseMembers: PopularMember[];
  senateMembers: PopularMember[];
  recentHouse: CongressTrade[];
  recentSenate: CongressTrade[];
  /** Purchase-only slices for the Feed digest. */
  recentHouseBuys: CongressTrade[];
  recentSenateBuys: CongressTrade[];
  recentCeoBuys: CeoActivityCard[];
  topPerformers: TopPerformer[];
  portfolioGrowth: PortfolioGrowth | null;
  performerPeriod: PerformerPeriod;
  /** ticker → industry/sector label for UI chips */
  tickerSectors: Record<string, string>;
  configured: boolean;
  error: string | null;
};

export type StockPreviewPayload = {
  ticker: string;
  asset: string | null;
  bars: StockPriceBar[];
  topTrades: ChartTrade[];
  tradeSource: ChartTradeSource;
};

export type MemberPreviewPayload = {
  slug: string;
  name: string;
  chamber: Chamber | null;
  state: string | null;
  topTickers: Array<{
    ticker: string;
    asset: string | null;
    tradeCount: number;
    latestDate: string | null;
    lastType: "purchase" | "sale" | null;
  }>;
};

export type MemberStockPreviewPayload = {
  slug: string;
  name: string;
  ticker: string;
  asset: string | null;
  bars: StockPriceBar[];
  trades: CongressTrade[];
};

const BAR_COLUMNS = "ticker, bar_date, open, high, low, close, volume";

export function parseFeedView(
  value: string | string[] | undefined,
): FeedView {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    raw === "trending" ||
    raw === "house" ||
    raw === "senate" ||
    raw === "feed"
  ) {
    return raw;
  }
  // Default to House — product focus is congressional chambers for now.
  return "house";
}

async function fetchRecentByChamber(
  chamber: Chamber,
  limit = 12,
  options?: { purchasesOnly?: boolean },
): Promise<{ rows: CongressTrade[]; error: string | null }> {
  const supabase = createBrowserSupabase();
  let query = supabase
    .from("congress_trades")
    .select(PUBLIC_TRADE_COLUMNS)
    .eq("is_listed_equity", true)
    .eq("chamber", chamber)
    .order("disclosure_date", { ascending: false, nullsFirst: false })
    .order("transaction_date", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (options?.purchasesOnly) {
    query = query.eq("transaction_type", "purchase");
  }

  let result = await query;

  if (isMissingListedEquityColumn(result.error)) {
    let fallback = supabase
      .from("congress_trades")
      .select(PUBLIC_TRADE_COLUMNS)
      .eq("chamber", chamber)
      .order("disclosure_date", { ascending: false, nullsFirst: false })
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .limit(limit * 2);
    if (options?.purchasesOnly) {
      fallback = fallback.eq("transaction_type", "purchase");
    }
    result = await fallback;
    if (!result.error && result.data) {
      const filtered = applyListedEquityFallback(
        result.data as unknown as CongressTrade[],
        null,
      );
      return { rows: filtered.rows.slice(0, limit), error: null };
    }
  }

  return {
    rows: (result.data as CongressTrade[] | null) ?? [],
    error: result.error?.message ?? null,
  };
}

const CEO_FEED_COLUMNS =
  "id, source_id, accession_number, ceo_name, officer_title, issuer_name, ticker, security_title, transaction_date, filing_date, shares_purchased, price_per_share, shares_owned_after, ownership_type, filing_url, form_type, quarter, created_at, raw_source, transaction_code";


async function fetchPopularMembers(
  chamber: Chamber,
  limit = 8,
): Promise<{ rows: PopularMember[]; error: string | null }> {
  const supabase = createBrowserSupabase();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  let result = await supabase
    .from("congress_trades")
    .select(
      "member, member_slug, chamber, state, ticker, disclosure_date, is_listed_equity",
    )
    .eq("is_listed_equity", true)
    .eq("chamber", chamber)
    .gte("disclosure_date", cutoffDate)
    .not("member_slug", "is", null)
    .limit(4000);

  if (isMissingListedEquityColumn(result.error)) {
    const fallback = await supabase
      .from("congress_trades")
      .select("member, member_slug, chamber, state, ticker, disclosure_date")
      .eq("chamber", chamber)
      .gte("disclosure_date", cutoffDate)
      .not("member_slug", "is", null)
      .limit(4000);
    if (fallback.error) {
      return { rows: [], error: fallback.error.message };
    }
    result = {
      ...fallback,
      data: (fallback.data ?? []).map((row) => ({
        ...row,
        is_listed_equity: null,
      })),
    } as typeof result;
  }

  if (result.error) {
    return { rows: [], error: result.error.message };
  }

  type Acc = {
    slug: string;
    name: string;
    chamber: Chamber;
    state: string | null;
    tradeCount: number;
    tickers: Set<string>;
    latestDisclosure: string | null;
  };

  const bySlug = new Map<string, Acc>();
  for (const row of result.data ?? []) {
    const slug = String(row.member_slug ?? "").trim();
    if (!slug) continue;
    let acc = bySlug.get(slug);
    if (!acc) {
      acc = {
        slug,
        name: String(row.member ?? slug),
        chamber,
        state: (row.state as string | null) ?? null,
        tradeCount: 0,
        tickers: new Set(),
        latestDisclosure: null,
      };
      bySlug.set(slug, acc);
    }
    acc.tradeCount += 1;
    if (row.ticker) acc.tickers.add(String(row.ticker));
    const disclosure = row.disclosure_date as string | null;
    if (
      disclosure &&
      (!acc.latestDisclosure || disclosure > acc.latestDisclosure)
    ) {
      acc.latestDisclosure = disclosure;
    }
  }

  const rows = [...bySlug.values()]
    .map((acc) => ({
      slug: acc.slug,
      name: acc.name,
      chamber: acc.chamber,
      state: acc.state,
      tradeCount: acc.tradeCount,
      uniqueTickers: acc.tickers.size,
      latestDisclosure: acc.latestDisclosure,
    }))
    .sort((a, b) => {
      if (b.tradeCount !== a.tradeCount) return b.tradeCount - a.tradeCount;
      return b.uniqueTickers - a.uniqueTickers;
    })
    .slice(0, limit);

  return { rows, error: null };
}

type EmptySlice = { rows: never[]; error: string | null };
const EMPTY_SLICE: EmptySlice = { rows: [], error: null };

/**
 * Load feed data scoped to the active view so House/Senate/Trending
 * navigation is not blocked by the expensive top-performers scan.
 */
export async function fetchFeedPayload(
  performerPeriod: PerformerPeriod = "2026",
  view: FeedView = "feed",
): Promise<FeedPayload> {
  if (!hasPublicSupabaseConfig()) {
    return {
      trending: [],
      houseMembers: [],
      senateMembers: [],
      recentHouse: [],
      recentSenate: [],
      recentHouseBuys: [],
      recentSenateBuys: [],
      recentCeoBuys: [],
      topPerformers: [],
      portfolioGrowth: null,
      performerPeriod,
      tickerSectors: {},
      configured: false,
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  // House / Senate activity + top performers. Skip popular-members lists and CEO digest.
  const needTrending = view === "trending";
  const needHouse = view === "feed" || view === "house";
  const needSenate = view === "feed" || view === "senate";
  const needTopPerformers =
    view === "house" || view === "senate" || view === "trending" || view === "feed";

  const performerOpts =
    view === "house"
      ? { chamber: "house" as const, includeCeo: false }
      : view === "senate"
        ? { chamber: "senate" as const, includeCeo: false }
        : { includeCeo: false };

  const [trending, recentHouse, recentSenate, topPerformers] =
    await Promise.all([
      needTrending
        ? fetchTrending({ mode: "all", periodDays: 30 })
        : EMPTY_SLICE,
      needHouse ? fetchRecentByChamber("house", 120) : EMPTY_SLICE,
      needSenate ? fetchRecentByChamber("senate", 120) : EMPTY_SLICE,
      needTopPerformers
        ? fetchTopPerformers(performerPeriod, 10, performerOpts)
        : Promise.resolve({
            rows: [] as TopPerformer[],
            portfolio: null,
            error: null as string | null,
          }),
    ]);

  const error =
    trending.error ||
    recentHouse.error ||
    recentSenate.error ||
    topPerformers.error ||
    null;

  const sectorTickers = [
    ...recentHouse.rows.map((t) => t.ticker ?? ""),
    ...recentSenate.rows.map((t) => t.ticker ?? ""),
    ...trending.rows.map((t) => t.ticker),
    ...topPerformers.rows.map((t) => t.bestTicker ?? ""),
  ];
  const profileMap = await fetchTickerProfiles(sectorTickers);
  const tickerSectors: Record<string, string> = {};
  for (const [ticker, profile] of profileMap.entries()) {
    const label = tickerSectorLabel(profile);
    if (label) tickerSectors[ticker] = label;
  }

  return {
    trending: trending.rows.slice(0, 12),
    houseMembers: [],
    senateMembers: [],
    recentHouse: recentHouse.rows,
    recentSenate: recentSenate.rows,
    recentHouseBuys: [],
    recentSenateBuys: [],
    recentCeoBuys: [],
    topPerformers: topPerformers.rows,
    portfolioGrowth: topPerformers.portfolio,
    performerPeriod,
    tickerSectors,
    configured: true,
    error,
  };
}

export async function fetchStockPreview(
  ticker: string,
  tradeSource: ChartTradeSource = "congress",
): Promise<StockPreviewPayload | null> {
  if (!hasPublicSupabaseConfig()) return null;
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return null;

  const supabase = createBrowserSupabase();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const chamber = chamberFromTradeSource(tradeSource);
  const wantCongress = includeCongressTrades(tradeSource);
  const wantCeo = includeCeoTrades(tradeSource);

  const barsPromise = supabase
    .from("stock_price_bars")
    .select(BAR_COLUMNS)
    .eq("ticker", symbol)
    .gte("bar_date", cutoffDate)
    .order("bar_date", { ascending: true });

  let congressTrades: CongressTrade[] = [];
  let barsResult: Awaited<typeof barsPromise>;

  if (wantCongress) {
    let tradesQuery = supabase
      .from("congress_trades")
      .select(PUBLIC_TRADE_COLUMNS)
      .eq("is_listed_equity", true)
      .eq("ticker", symbol)
      .order("disclosure_date", { ascending: false, nullsFirst: false })
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .limit(400);

    if (chamber !== "all") {
      tradesQuery = tradesQuery.eq("chamber", chamber);
    }

    const [bars, tradesResultRaw] = await Promise.all([
      barsPromise,
      tradesQuery,
    ]);
    barsResult = bars;

    congressTrades = (tradesResultRaw.data as CongressTrade[] | null) ?? [];
    if (isMissingListedEquityColumn(tradesResultRaw.error)) {
      let fallback = supabase
        .from("congress_trades")
        .select(PUBLIC_TRADE_COLUMNS)
        .eq("ticker", symbol)
        .order("disclosure_date", { ascending: false, nullsFirst: false })
        .order("transaction_date", { ascending: false, nullsFirst: false })
        .limit(400);
      if (chamber !== "all") fallback = fallback.eq("chamber", chamber);
      const fb = await fallback;
      congressTrades = applyListedEquityFallback(
        (fb.data as CongressTrade[] | null) ?? [],
        null,
      ).rows;
    }
  } else {
    barsResult = await barsPromise;
  }

  const ceoTrades: ChartTrade[] = [];
  if (wantCeo) {
    const { data: ceoData } = await supabase
      .from("ceo_stock_purchases")
      .select(CEO_FEED_COLUMNS)
      .eq("ticker", symbol)
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .limit(400);
    for (const row of (ceoData as CeoStockPurchaseRow[] | null) ?? []) {
      const trade = ceoRowToChartTrade(row);
      if (trade) ceoTrades.push(trade);
    }
  }

  const topTrades: ChartTrade[] = [
    ...(wantCongress
      ? congressTrades
          .filter(
            (t) =>
              t.transaction_type === "purchase" ||
              t.transaction_type === "sale",
          )
          .map(asCongressChartTrade)
      : []),
    ...ceoTrades.filter(
      (t) =>
        t.transaction_type === "purchase" || t.transaction_type === "sale",
    ),
  ].sort((a, b) => {
    const da = a.disclosure_date ?? a.transaction_date ?? "";
    const db = b.disclosure_date ?? b.transaction_date ?? "";
    return db.localeCompare(da);
  });

  return {
    ticker: symbol,
    asset: congressTrades[0]?.asset ?? ceoTrades[0]?.asset ?? null,
    bars: (barsResult.data as StockPriceBar[] | null) ?? [],
    topTrades,
    tradeSource,
  };
}

export async function fetchMemberPreview(
  slug: string,
): Promise<MemberPreviewPayload | null> {
  if (!hasPublicSupabaseConfig()) return null;
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;

  const supabase = createBrowserSupabase();
  let result = await supabase
    .from("congress_trades")
    .select(PUBLIC_TRADE_COLUMNS)
    .eq("is_listed_equity", true)
    .eq("member_slug", normalized)
    .order("disclosure_date", { ascending: false, nullsFirst: false })
    .order("transaction_date", { ascending: false, nullsFirst: false })
    .limit(300);

  if (isMissingListedEquityColumn(result.error)) {
    result = await supabase
      .from("congress_trades")
      .select(PUBLIC_TRADE_COLUMNS)
      .eq("member_slug", normalized)
      .order("disclosure_date", { ascending: false, nullsFirst: false })
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .limit(400);
    if (!result.error && result.data) {
      result = {
        ...result,
        data: applyListedEquityFallback(
          result.data as unknown as CongressTrade[],
          null,
        ).rows as unknown as typeof result.data,
      };
    }
  }

  const trades = (result.data as CongressTrade[] | null) ?? [];
  if (trades.length === 0) return null;

  type Acc = {
    ticker: string;
    asset: string | null;
    tradeCount: number;
    latestDate: string | null;
    lastType: "purchase" | "sale" | null;
  };
  const byTicker = new Map<string, Acc>();
  for (const trade of trades) {
    const ticker = trade.ticker?.trim().toUpperCase();
    if (!ticker) continue;
    let acc = byTicker.get(ticker);
    if (!acc) {
      acc = {
        ticker,
        asset: trade.asset,
        tradeCount: 0,
        latestDate: null,
        lastType: null,
      };
      byTicker.set(ticker, acc);
    }
    acc.tradeCount += 1;
    const date = trade.disclosure_date ?? trade.transaction_date;
    if (date && (!acc.latestDate || date > acc.latestDate)) {
      acc.latestDate = date;
      acc.lastType =
        trade.transaction_type === "purchase" ||
        trade.transaction_type === "sale"
          ? trade.transaction_type
          : acc.lastType;
    }
  }

  const topTickers = [...byTicker.values()]
    .sort((a, b) => b.tradeCount - a.tradeCount)
    .slice(0, 5);

  return {
    slug: normalized,
    name: trades[0]?.member ?? normalized,
    chamber: trades[0]?.chamber ?? null,
    state: trades[0]?.state ?? null,
    topTickers,
  };
}

export async function fetchMemberStockPreview(
  slug: string,
  ticker: string,
): Promise<MemberStockPreviewPayload | null> {
  if (!hasPublicSupabaseConfig()) return null;
  const normalized = slug.trim().toLowerCase();
  const symbol = ticker.trim().toUpperCase();
  if (!normalized || !symbol) return null;

  const supabase = createBrowserSupabase();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  let tradesResult = await supabase
    .from("congress_trades")
    .select(PUBLIC_TRADE_COLUMNS)
    .eq("is_listed_equity", true)
    .eq("member_slug", normalized)
    .eq("ticker", symbol)
    .order("transaction_date", { ascending: true, nullsFirst: false })
    .limit(200);

  if (isMissingListedEquityColumn(tradesResult.error)) {
    tradesResult = await supabase
      .from("congress_trades")
      .select(PUBLIC_TRADE_COLUMNS)
      .eq("member_slug", normalized)
      .eq("ticker", symbol)
      .order("transaction_date", { ascending: true, nullsFirst: false })
      .limit(200);
    if (!tradesResult.error && tradesResult.data) {
      tradesResult = {
        ...tradesResult,
        data: applyListedEquityFallback(
          tradesResult.data as unknown as CongressTrade[],
          null,
        ).rows as unknown as typeof tradesResult.data,
      };
    }
  }

  const trades = ((tradesResult.data as CongressTrade[] | null) ?? []).filter(
    (t) =>
      t.transaction_type === "purchase" || t.transaction_type === "sale",
  );

  const barsResult = await supabase
    .from("stock_price_bars")
    .select(BAR_COLUMNS)
    .eq("ticker", symbol)
    .gte("bar_date", cutoffDate)
    .order("bar_date", { ascending: true });

  return {
    slug: normalized,
    name: trades[0]?.member ?? normalized,
    ticker: symbol,
    asset: trades[0]?.asset ?? null,
    bars: (barsResult.data as StockPriceBar[] | null) ?? [],
    trades,
  };
}
