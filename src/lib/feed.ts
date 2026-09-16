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
import {
  chamberScopeLabel,
  computeSectorShare,
  mergeIndustryLabels,
  type SectorShareSlice,
} from "./sectorShare";
import {
  computeTradeSectorOverlaps,
  fetchMemberIndustryLabels,
  memberSectorsRecord,
  type SectorOverlapResult,
} from "./memberSectors";

export type { PerformerPeriod, PortfolioGrowth, TopPerformer };
export type { ChartTrade, ChartTradeSource };
export type { SectorShareSlice };
export type { SectorOverlapResult };

export type FeedView = "feed" | "trending" | "house" | "senate" | "insiders";

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
  /** Form 4 officer trades (CEO/CFO/…) for the Insiders activity view. */
  recentInsider: ChartTrade[];
  topPerformers: TopPerformer[];
  portfolioGrowth: PortfolioGrowth | null;
  performerPeriod: PerformerPeriod;
  /** ticker → industry/sector label for UI chips */
  tickerSectors: Record<string, string>;
  /** member_slug → committee industry labels */
  memberSectors: Record<string, string[]>;
  /** trade id → sector overlap (matched trades only) */
  tradeSectorOverlaps: Record<string, SectorOverlapResult>;
  /** Sector mix for the chamber / window (buys+sales). */
  sectorShare: SectorShareSlice[];
  sectorShareScope: string;
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
    raw === "insiders" ||
    raw === "feed"
  ) {
    return raw;
  }
  if (raw === "ceo") return "insiders";
  // Default to House — product focus is congressional chambers for now.
  return "house";
}

async function fetchRecentByChamber(
  chamber: Chamber,
  limit = 12,
  options?: { purchasesOnly?: boolean; sinceDays?: number },
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
  if (options?.sinceDays != null && options.sinceDays > 0) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - options.sinceDays);
    query = query.gte("disclosure_date", cutoff.toISOString().slice(0, 10));
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
    if (options?.sinceDays != null && options.sinceDays > 0) {
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - options.sinceDays);
      fallback = fallback.gte(
        "disclosure_date",
        cutoff.toISOString().slice(0, 10),
      );
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

/** Recent Form 4 officer P/S rows as chart trades (activity disclosure cards). */
async function fetchRecentInsiderTrades(
  limit = 5000,
  options?: { sinceDays?: number },
): Promise<{ rows: ChartTrade[]; error: string | null }> {
  const supabase = createBrowserSupabase();
  const sinceDays = options?.sinceDays;

  async function loadSince(cutoff: string | null) {
    let query = supabase
      .from("ceo_stock_purchases")
      .select(CEO_FEED_COLUMNS)
      .order("filing_date", { ascending: false, nullsFirst: false })
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (cutoff) query = query.gte("filing_date", cutoff);
    return query;
  }

  let cutoff: string | null = null;
  if (sinceDays != null && sinceDays > 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - sinceDays);
    cutoff = d.toISOString().slice(0, 10);
  }

  let { data, error } = await loadSince(cutoff);
  if (error) {
    return { rows: [], error: error.message };
  }

  // SEC Form 4 bulk ZIPs lag the live calendar. If the calendar window is
  // empty, fall back to the most recent ~sinceDays of filings in the table.
  if ((data?.length ?? 0) === 0 && sinceDays != null && sinceDays > 0) {
    const latest = await supabase
      .from("ceo_stock_purchases")
      .select("filing_date")
      .not("filing_date", "is", null)
      .order("filing_date", { ascending: false })
      .limit(1);
    const maxDate = (latest.data?.[0]?.filing_date as string | null)?.slice(
      0,
      10,
    );
    if (maxDate) {
      const anchor = new Date(`${maxDate}T00:00:00Z`);
      anchor.setUTCDate(anchor.getUTCDate() - sinceDays);
      const fallbackCutoff = anchor.toISOString().slice(0, 10);
      const retry = await loadSince(fallbackCutoff);
      if (retry.error) {
        return { rows: [], error: retry.error.message };
      }
      data = retry.data;
    }
  }

  const rows: ChartTrade[] = [];
  for (const row of (data as CeoStockPurchaseRow[] | null) ?? []) {
    const trade = ceoRowToChartTrade(row);
    if (trade) rows.push(trade);
  }
  return { rows, error: null };
}

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
  performerPeriod: PerformerPeriod = "1m",
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
      recentInsider: [],
      topPerformers: [],
      portfolioGrowth: null,
      performerPeriod,
      tickerSectors: {},
      memberSectors: {},
      tradeSectorOverlaps: {},
      sectorShare: [],
      sectorShareScope: "Congress",
      configured: false,
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  // House / Senate / Insiders activity + top performers.
  const needTrending = view === "trending";
  const needHouse =
    view === "feed" || view === "house" || view === "trending";
  const needSenate =
    view === "feed" || view === "senate" || view === "trending";
  const needInsiders = view === "insiders";
  const needTopPerformers =
    view === "house" ||
    view === "senate" ||
    view === "trending" ||
    view === "feed" ||
    view === "insiders";

  const performerOpts =
    view === "house"
      ? { chamber: "house" as const, includeCeo: false, includeCongress: true }
      : view === "senate"
        ? { chamber: "senate" as const, includeCeo: false, includeCongress: true }
        : view === "insiders"
          ? { includeCeo: true, includeCongress: false }
          : { includeCeo: false, includeCongress: true };

  // Pull the full local month of disclosures (not a tiny recent slice).
  // 120 rows previously collapsed to only ~4 member-days because big
  // filers disclose dozens of trades on one day.
  const MONTH_TRADE_LIMIT = 5000;
  const MONTH_LOOKBACK_DAYS = 40;

  const [trending, recentHouse, recentSenate, recentInsider, topPerformers] =
    await Promise.all([
      needTrending
        ? fetchTrending({ mode: "all", periodDays: 30 })
        : EMPTY_SLICE,
      needHouse
        ? fetchRecentByChamber("house", MONTH_TRADE_LIMIT, {
            sinceDays: MONTH_LOOKBACK_DAYS,
          })
        : EMPTY_SLICE,
      needSenate
        ? fetchRecentByChamber("senate", MONTH_TRADE_LIMIT, {
            sinceDays: MONTH_LOOKBACK_DAYS,
          })
        : EMPTY_SLICE,
      needInsiders
        ? fetchRecentInsiderTrades(MONTH_TRADE_LIMIT, {
            sinceDays: MONTH_LOOKBACK_DAYS,
          })
        : EMPTY_SLICE,
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
    recentInsider.error ||
    topPerformers.error ||
    null;

  const sectorTickers = [
    ...recentHouse.rows.map((t) => t.ticker ?? ""),
    ...recentSenate.rows.map((t) => t.ticker ?? ""),
    ...recentInsider.rows.map((t) => t.ticker ?? ""),
    ...trending.rows.map((t) => t.ticker),
    ...topPerformers.rows.map((t) => t.bestTicker ?? ""),
  ];
  const profileMap = await fetchTickerProfiles(sectorTickers);
  const tickerSectors: Record<string, string> = {};
  for (const [ticker, profile] of profileMap.entries()) {
    const label = tickerSectorLabel(profile);
    if (label) tickerSectors[ticker] = label;
  }
  // Prefer curated primary-industry labels wherever available.
  const mergedSectors = mergeIndustryLabels(sectorTickers, tickerSectors);

  const shareTrades =
    view === "house"
      ? recentHouse.rows
      : view === "senate"
        ? recentSenate.rows
        : view === "insiders"
          ? recentInsider.rows
          : [...recentHouse.rows, ...recentSenate.rows];
  const sectorShare = computeSectorShare(shareTrades);
  const sectorShareScope = chamberScopeLabel(
    view === "feed" ? "feed" : view,
  );

  const congressTrades = [...recentHouse.rows, ...recentSenate.rows];
  const memberSlugs = congressTrades
    .map((t) => t.member_slug)
    .filter((s): s is string => Boolean(s));
  const memberLabelMap = await fetchMemberIndustryLabels(memberSlugs);
  const tradeSectorOverlaps = await computeTradeSectorOverlaps(
    congressTrades,
    memberLabelMap,
  );

  return {
    trending: trending.rows.slice(0, 40),
    houseMembers: [],
    senateMembers: [],
    recentHouse: recentHouse.rows,
    recentSenate: recentSenate.rows,
    recentHouseBuys: [],
    recentSenateBuys: [],
    recentCeoBuys: [],
    recentInsider: recentInsider.rows,
    topPerformers: topPerformers.rows,
    portfolioGrowth: topPerformers.portfolio,
    performerPeriod,
    tickerSectors: mergedSectors,
    memberSectors: memberSectorsRecord(memberLabelMap),
    tradeSectorOverlaps,
    sectorShare,
    sectorShareScope,
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
