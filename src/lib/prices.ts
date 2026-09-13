import type { CongressTrade, ChartRange, StockPriceBar } from "./types";
import type { CeoStockPurchaseRow } from "./types";
import {
  asCongressChartTrade,
  ceoRowToChartTrade,
  type ChartTrade,
} from "./chartTrades";
import { createBrowserSupabase, hasPublicSupabaseConfig } from "./supabase";
import { PUBLIC_TRADE_COLUMNS } from "./trades";
import {
  applyListedEquityFallback,
  isMissingListedEquityColumn,
} from "./stockFilter";

const BAR_COLUMNS = "ticker, bar_date, open, high, low, close, volume";

export function parseChartRange(
  value: string | string[] | undefined,
): ChartRange {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "3m" || raw === "6m" || raw === "1y" || raw === "all") {
    return raw;
  }
  return "1y";
}

export function rangeCutoffDate(range: ChartRange): string | null {
  if (range === "all") return null;
  const days = range === "3m" ? 90 : range === "6m" ? 180 : 365;
  const now = new Date();
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  utc.setUTCDate(utc.getUTCDate() - days);
  return utc.toISOString().slice(0, 10);
}

export type StockPageData = {
  ticker: string;
  asset: string | null;
  bars: StockPriceBar[];
  /** Congress + CEO markers for the chart. */
  trades: ChartTrade[];
  congressTrades: CongressTrade[];
  configured: boolean;
  error: string | null;
};

export async function fetchStockPage(
  ticker: string,
  range: ChartRange,
): Promise<StockPageData> {
  const symbol = ticker.trim().toUpperCase();

  if (!hasPublicSupabaseConfig()) {
    return {
      ticker: symbol,
      asset: null,
      bars: [],
      trades: [],
      congressTrades: [],
      configured: false,
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  const supabase = createBrowserSupabase();
  const cutoff = rangeCutoffDate(range);

  let barsQuery = supabase
    .from("stock_price_bars")
    .select(BAR_COLUMNS)
    .eq("ticker", symbol)
    .order("bar_date", { ascending: true });
  if (cutoff) barsQuery = barsQuery.gte("bar_date", cutoff);

  const [barsResult, tradesResultRaw] = await Promise.all([
    barsQuery,
    supabase
      .from("congress_trades")
      .select(PUBLIC_TRADE_COLUMNS)
      .eq("ticker", symbol)
      .eq("is_listed_equity", true)
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .order("disclosure_date", { ascending: false, nullsFirst: false })
      .limit(500),
  ]);

  let tradesResult = tradesResultRaw;
  if (isMissingListedEquityColumn(tradesResult.error)) {
    tradesResult = await supabase
      .from("congress_trades")
      .select(PUBLIC_TRADE_COLUMNS)
      .eq("ticker", symbol)
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .order("disclosure_date", { ascending: false, nullsFirst: false })
      .limit(500);

    if (!tradesResult.error && tradesResult.data) {
      const filtered = applyListedEquityFallback(
        tradesResult.data as unknown as CongressTrade[],
        null,
      );
      tradesResult = {
        ...tradesResult,
        data: filtered.rows as unknown as typeof tradesResult.data,
      };
    }
  }

  if (barsResult.error && /stock_price_bars/i.test(barsResult.error.message)) {
    // Table may not be applied yet.
    return {
      ticker: symbol,
      asset: (tradesResult.data?.[0] as CongressTrade | undefined)?.asset ?? null,
      bars: [],
      trades: ((tradesResult.data ?? []) as unknown as CongressTrade[]).map(asCongressChartTrade),
      congressTrades: (tradesResult.data ?? []) as unknown as CongressTrade[],
      configured: true,
      error: null,
    };
  }

  if (barsResult.error) {
    return {
      ticker: symbol,
      asset: null,
      bars: [],
      trades: [],
      congressTrades: [],
      configured: true,
      error: barsResult.error.message,
    };
  }

  if (tradesResult.error) {
    return {
      ticker: symbol,
      asset: null,
      bars: (barsResult.data ?? []) as StockPriceBar[],
      trades: [],
      congressTrades: [],
      configured: true,
      error: tradesResult.error.message,
    };
  }

  const congressTrades = (tradesResult.data ?? []) as unknown as CongressTrade[];

  const { data: ceoData } = await supabase
    .from("ceo_stock_purchases")
    .select(
      "id, source_id, accession_number, ceo_name, officer_title, issuer_name, ticker, security_title, transaction_date, filing_date, shares_purchased, price_per_share, shares_owned_after, ownership_type, filing_url, form_type, quarter, created_at, raw_source, transaction_code",
    )
    .eq("ticker", symbol)
    .order("transaction_date", { ascending: false, nullsFirst: false })
    .limit(400);

  const ceoTrades: ChartTrade[] = [];
  for (const row of (ceoData as CeoStockPurchaseRow[] | null) ?? []) {
    const trade = ceoRowToChartTrade(row);
    if (trade) ceoTrades.push(trade);
  }

  const trades: ChartTrade[] = [
    ...congressTrades
      .filter(
        (t) =>
          t.transaction_type === "purchase" || t.transaction_type === "sale",
      )
      .map(asCongressChartTrade),
    ...ceoTrades.filter(
      (t) =>
        t.transaction_type === "purchase" || t.transaction_type === "sale",
    ),
  ];

  return {
    ticker: symbol,
    asset: congressTrades[0]?.asset ?? ceoTrades[0]?.asset ?? null,
    bars: (barsResult.data ?? []) as StockPriceBar[],
    trades,
    congressTrades,
    configured: true,
    error: null,
  };
}
