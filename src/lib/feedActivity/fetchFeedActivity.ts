/**
 * Load House + Senate + Insider trades and price bars for Feed ranking.
 */

import { createBrowserSupabase, hasPublicSupabaseConfig } from "@/lib/supabase";
import { PUBLIC_TRADE_COLUMNS } from "@/lib/trades";
import { resolveCeoTransactionCode } from "@/lib/ceoAggregate";
import {
  computeTradeSectorOverlaps,
  fetchMemberIndustryLabels,
} from "@/lib/memberSectors";
import { asCongressChartTrade, ceoRowToChartTrade } from "@/lib/chartTrades";
import type { Chamber, CeoStockPurchaseRow, CongressTrade } from "@/lib/types";
import type { PriceSeries } from "@/lib/findTrades/derivedMetrics";
import { sideFromType } from "@/lib/findTrades/derivedMetrics";
import { getTickerIndustryLabel } from "@/lib/tickerIndustry";
import {
  cutoffDateFromDays,
  parseFeedTimeframe,
  rankFeedTickers,
  timeframeDays,
  type FeedRawTrade,
} from "./rankFeed";
import {
  FEED_HISTORY_LOOKBACK_DAYS,
  FEED_STREAK_LOOKBACK_DAYS,
  MARKET_BENCHMARK_TICKERS,
  SECTOR_BENCHMARK_ETFS,
} from "./weights";
import type { FeedFilters, FeedTickerRow, FeedTimeframe } from "./types";
import { EMPTY_FEED_FILTERS } from "./types";

const TRADE_LIMIT = 8000;
const TICKER_CHUNK = 40;
const BAR_PAGE = 1000;

const CEO_COLUMNS =
  "id, source_id, accession_number, ceo_name, officer_title, issuer_name, ticker, security_title, transaction_date, filing_date, shares_purchased, price_per_share, shares_owned_after, ownership_type, filing_url, form_type, quarter, created_at, raw_source, transaction_code";

export type FeedActivityPayload = {
  rows: FeedTickerRow[];
  timeframe: FeedTimeframe;
  error: string | null;
  tradeCount: number;
  loadedAt: string;
};

async function fetchCongress(
  chamber: Chamber,
  since: string,
): Promise<CongressTrade[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("congress_trades")
    .select(PUBLIC_TRADE_COLUMNS)
    .eq("is_listed_equity", true)
    .eq("chamber", chamber)
    .gte("disclosure_date", since)
    .order("disclosure_date", { ascending: false, nullsFirst: false })
    .order("transaction_date", { ascending: false, nullsFirst: false })
    .limit(TRADE_LIMIT);

  if (error) throw new Error(error.message);
  return (data as unknown as CongressTrade[]) ?? [];
}

async function fetchInsiders(since: string): Promise<CeoStockPurchaseRow[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("ceo_stock_purchases")
    .select(CEO_COLUMNS)
    .gte("filing_date", since)
    .order("filing_date", { ascending: false, nullsFirst: false })
    .order("transaction_date", { ascending: false, nullsFirst: false })
    .limit(TRADE_LIMIT);

  if (error) throw new Error(error.message);
  return (data as CeoStockPurchaseRow[] | null) ?? [];
}

async function loadPriceSeries(
  tickers: string[],
  minDate: string,
): Promise<Map<string, PriceSeries>> {
  const supabase = createBrowserSupabase();
  const seriesByTicker = new Map<string, PriceSeries>();

  const barMin = (() => {
    const d = new Date(`${minDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 60);
    return d.toISOString().slice(0, 10);
  })();

  for (let i = 0; i < tickers.length; i += TICKER_CHUNK) {
    const chunk = tickers.slice(i, i + TICKER_CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("stock_price_bars")
        .select("ticker, bar_date, close")
        .in("ticker", chunk)
        .gte("bar_date", barMin)
        .not("close", "is", null)
        .order("bar_date", { ascending: true })
        .range(from, from + BAR_PAGE - 1);

      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const ticker = String(row.ticker ?? "")
          .trim()
          .toUpperCase();
        const date = String(row.bar_date ?? "").slice(0, 10);
        const close = Number(row.close);
        if (!ticker || !date || !Number.isFinite(close)) continue;
        let list = seriesByTicker.get(ticker);
        if (!list) {
          list = [];
          seriesByTicker.set(ticker, list);
        }
        list.push({ date, close });
      }

      if (rows.length < BAR_PAGE) break;
      from += BAR_PAGE;
    }
  }

  return seriesByTicker;
}

function personKeyCongress(
  name: string | null,
  slug: string | null,
  chamber: Chamber,
): string {
  const s = (slug ?? "").trim().toLowerCase();
  if (s) return `congress:${s}`;
  return `congress:${chamber}:${(name ?? "").trim().toLowerCase()}`;
}

function congressToRaw(
  trade: CongressTrade,
  chamber: Chamber,
  overlap: {
    has_sector_overlap: boolean;
    match_type: "direct" | "embedding" | null;
    similarity: number | null;
    member_label: string | null;
    ticker_label: string | null;
  } | null,
): FeedRawTrade {
  const industry = getTickerIndustryLabel(trade.ticker);
  let matchType: FeedRawTrade["overlapMatchType"] = null;
  if (overlap?.match_type === "direct") matchType = "direct";
  if (overlap?.match_type === "embedding") matchType = "embedding";

  return {
    id: trade.id,
    source: chamber,
    person: trade.member,
    personKey: personKeyCongress(trade.member, trade.member_slug, chamber),
    memberSlug: trade.member_slug,
    ticker: trade.ticker?.trim().toUpperCase() ?? null,
    company: industry?.company ?? trade.asset,
    transactionType: trade.transaction_type,
    transactionDate: trade.transaction_date?.slice(0, 10) ?? null,
    disclosureDate: trade.disclosure_date?.slice(0, 10) ?? null,
    amountRange: trade.amount_range,
    disclosedMin: trade.amount_low,
    disclosedMax: trade.amount_high,
    exactValue: null,
    officerTitle: null,
    filingUrl: trade.filing_portal,
    hasSectorOverlap: overlap?.has_sector_overlap ?? false,
    overlapMatchType: matchType,
    overlapSimilarity: overlap?.similarity ?? null,
    overlapMemberLabel: overlap?.member_label ?? null,
    overlapTickerLabel: overlap?.ticker_label ?? null,
  };
}

function insiderToRaw(row: CeoStockPurchaseRow): FeedRawTrade | null {
  const chart = ceoRowToChartTrade(row);
  if (!chart) return null;
  const code = resolveCeoTransactionCode(row);
  const side =
    code === "S" ? "sale" : sideFromType(chart.transaction_type);
  const shares =
    row.shares_purchased != null && Number.isFinite(row.shares_purchased)
      ? row.shares_purchased
      : null;
  const price =
    row.price_per_share != null && Number.isFinite(row.price_per_share)
      ? row.price_per_share
      : null;
  const industry = getTickerIndustryLabel(chart.ticker);

  return {
    id: chart.id,
    source: "insider",
    person: row.ceo_name,
    personKey: `insider:${(row.ceo_name ?? "").trim().toLowerCase()}`,
    memberSlug: null,
    ticker: chart.ticker,
    company: industry?.company ?? row.issuer_name ?? row.security_title,
    transactionType: side,
    transactionDate: chart.transaction_date?.slice(0, 10) ?? null,
    disclosureDate: chart.disclosure_date?.slice(0, 10) ?? null,
    amountRange: chart.amount_range,
    disclosedMin: null,
    disclosedMax: null,
    exactValue:
      shares != null && price != null ? shares * price : null,
    officerTitle: row.officer_title?.trim() || null,
    filingUrl: row.filing_url,
    hasSectorOverlap: null,
    overlapMatchType: null,
    overlapSimilarity: null,
    overlapMemberLabel: null,
    overlapTickerLabel: null,
  };
}

export async function fetchFeedActivityPayload(
  timeframe: FeedTimeframe = "3m",
  filters: Partial<FeedFilters> = {},
): Promise<FeedActivityPayload> {
  if (!hasPublicSupabaseConfig()) {
    return {
      rows: [],
      timeframe,
      error: "Supabase is not configured",
      tradeCount: 0,
      loadedAt: new Date().toISOString(),
    };
  }

  try {
    const windowDays = timeframeDays(timeframe);
    // Load extra history so buy streaks, size medians, and activity baselines work.
    const fetchDays = Math.max(
      windowDays + FEED_STREAK_LOOKBACK_DAYS,
      FEED_HISTORY_LOOKBACK_DAYS,
    );
    const since = cutoffDateFromDays(fetchDays);

    const [house, senate, insiders] = await Promise.all([
      fetchCongress("house", since),
      fetchCongress("senate", since),
      fetchInsiders(since),
    ]);

    const congressChart = [
      ...house.map(asCongressChartTrade),
      ...senate.map(asCongressChartTrade),
    ];
    const slugs = [
      ...new Set(
        congressChart
          .map((t) => t.member_slug)
          .filter((s): s is string => Boolean(s?.trim())),
      ),
    ];
    const memberLabels = await fetchMemberIndustryLabels(slugs);
    const overlaps = await computeTradeSectorOverlaps(
      congressChart,
      memberLabels,
    );

    const raw: FeedRawTrade[] = [];
    for (const t of house) {
      raw.push(congressToRaw(t, "house", overlaps[t.id] ?? null));
    }
    for (const t of senate) {
      raw.push(congressToRaw(t, "senate", overlaps[t.id] ?? null));
    }
    for (const row of insiders) {
      const built = insiderToRaw(row);
      if (built) raw.push(built);
    }

    const tickers = [
      ...new Set(
        [
          ...raw.map((r) => r.ticker).filter((t): t is string => Boolean(t)),
          ...MARKET_BENCHMARK_TICKERS,
          ...Object.values(SECTOR_BENCHMARK_ETFS),
        ],
      ),
    ];
    const minTx =
      raw.reduce((min, r) => {
        const d = r.transactionDate;
        if (!d) return min;
        return !min || d < min ? d : min;
      }, "" as string) || since;

    const seriesByTicker = await loadPriceSeries(tickers, minTx);
    const rows = rankFeedTickers(raw, seriesByTicker, {
      timeframe,
      filters: { ...EMPTY_FEED_FILTERS, ...filters },
    });

    return {
      rows,
      timeframe,
      error: null,
      tradeCount: raw.length,
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      rows: [],
      timeframe,
      error: err instanceof Error ? err.message : "Failed to load Feed",
      tradeCount: 0,
      loadedAt: new Date().toISOString(),
    };
  }
}

export { parseFeedTimeframe, timeframeDays };
