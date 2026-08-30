import type { CongressTrade, ChartRange, StockPriceBar } from "./types";
import { createBrowserSupabase, hasPublicSupabaseConfig } from "./supabase";
import { PUBLIC_TRADE_COLUMNS } from "./trades";

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
  trades: CongressTrade[];
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

  const [barsResult, tradesResult] = await Promise.all([
    barsQuery,
    supabase
      .from("congress_trades")
      .select(PUBLIC_TRADE_COLUMNS)
      .eq("ticker", symbol)
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .order("disclosure_date", { ascending: false, nullsFirst: false })
      .limit(500),
  ]);

  if (barsResult.error && /stock_price_bars/i.test(barsResult.error.message)) {
    // Table may not be applied yet.
    return {
      ticker: symbol,
      asset: (tradesResult.data?.[0] as CongressTrade | undefined)?.asset ?? null,
      bars: [],
      trades: (tradesResult.data ?? []) as unknown as CongressTrade[],
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
      configured: true,
      error: tradesResult.error.message,
    };
  }

  const trades = (tradesResult.data ?? []) as unknown as CongressTrade[];
  return {
    ticker: symbol,
    asset: trades[0]?.asset ?? null,
    bars: (barsResult.data ?? []) as StockPriceBar[],
    trades,
    configured: true,
    error: null,
  };
}
