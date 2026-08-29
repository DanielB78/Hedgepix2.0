import type {
  TrendingFilters,
  TrendingMode,
  TrendingPeriodDays,
  TrendingTicker,
} from "./types";
import { createBrowserSupabase, hasPublicSupabaseConfig } from "./supabase";

type RawTradeRow = {
  ticker: string | null;
  asset: string | null;
  transaction_type: "purchase" | "sale" | "exchange" | null;
  member_slug: string | null;
  disclosure_date: string | null;
};

export type TrendingQueryResult = {
  rows: TrendingTicker[];
  filters: TrendingFilters;
  cutoffDate: string;
  configured: boolean;
  error: string | null;
};

export function parseTrendingFilters(
  searchParams: Record<string, string | string[] | undefined>,
): TrendingFilters {
  const pick = (key: string) => {
    const value = searchParams[key];
    return typeof value === "string" ? value.trim().toLowerCase() : undefined;
  };

  const modeRaw = pick("mode");
  const mode: TrendingMode =
    modeRaw === "buys" || modeRaw === "sales" || modeRaw === "all"
      ? modeRaw
      : "all";

  const periodRaw = pick("period");
  const periodDays: TrendingPeriodDays =
    periodRaw === "30" || periodRaw === "90"
      ? (Number(periodRaw) as TrendingPeriodDays)
      : 7;

  return { mode, periodDays };
}

export function trendingHref(filters: TrendingFilters): string {
  const params = new URLSearchParams();
  if (filters.mode !== "all") params.set("mode", filters.mode);
  if (filters.periodDays !== 7) params.set("period", String(filters.periodDays));
  const qs = params.toString();
  return qs ? `/trending?${qs}` : "/trending";
}

/** UTC calendar date string YYYY-MM-DD for CURRENT_DATE - N days. */
export function disclosureCutoffDate(periodDays: TrendingPeriodDays): string {
  const now = new Date();
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  utc.setUTCDate(utc.getUTCDate() - periodDays);
  return utc.toISOString().slice(0, 10);
}

export function periodLabel(periodDays: TrendingPeriodDays): string {
  return `Last ${periodDays} Days`;
}

export async function fetchTrending(
  filters: TrendingFilters,
): Promise<TrendingQueryResult> {
  const cutoffDate = disclosureCutoffDate(filters.periodDays);

  if (!hasPublicSupabaseConfig()) {
    return {
      rows: [],
      filters,
      cutoffDate,
      configured: false,
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  const supabase = createBrowserSupabase();

  let query = supabase
    .from("congress_trades")
    .select("ticker, asset, transaction_type, member_slug, disclosure_date")
    .not("ticker", "is", null)
    .gte("disclosure_date", cutoffDate);

  if (filters.mode === "buys") {
    query = query.eq("transaction_type", "purchase");
  } else if (filters.mode === "sales") {
    query = query.eq("transaction_type", "sale");
  }

  // Cap fetch for MVP; enough for ranking without a DB aggregate RPC.
  const { data, error } = await query.limit(5000);

  if (error) {
    return {
      rows: [],
      filters,
      cutoffDate,
      configured: true,
      error: error.message,
    };
  }

  return {
    rows: rankTrending((data ?? []) as RawTradeRow[]),
    filters,
    cutoffDate,
    configured: true,
    error: null,
  };
}

function memberIdentity(row: RawTradeRow): string | null {
  const slug = row.member_slug?.trim();
  return slug || null;
}

/**
 * Rank tickers by breadth of congressional participation:
 * distinct members first, then disclosure volume as a tie-breaker.
 */
export function rankTrending(rows: RawTradeRow[]): TrendingTicker[] {
  type Acc = {
    ticker: string;
    asset: string | null;
    totalTrades: number;
    members: Set<string>;
    buyMembers: Set<string>;
    sellMembers: Set<string>;
    latestDisclosure: string | null;
  };

  const byTicker = new Map<string, Acc>();

  for (const row of rows) {
    const ticker = row.ticker?.trim();
    if (!ticker) continue;

    const member = memberIdentity(row);

    let acc = byTicker.get(ticker);
    if (!acc) {
      acc = {
        ticker,
        asset: row.asset,
        totalTrades: 0,
        members: new Set(),
        buyMembers: new Set(),
        sellMembers: new Set(),
        latestDisclosure: null,
      };
      byTicker.set(ticker, acc);
    }

    acc.totalTrades += 1;
    if (member) {
      acc.members.add(member);
      if (row.transaction_type === "purchase") acc.buyMembers.add(member);
      if (row.transaction_type === "sale") acc.sellMembers.add(member);
    }
    if (row.asset && !acc.asset) acc.asset = row.asset;
    if (
      row.disclosure_date &&
      (!acc.latestDisclosure || row.disclosure_date > acc.latestDisclosure)
    ) {
      acc.latestDisclosure = row.disclosure_date;
    }
  }

  return [...byTicker.values()]
    .map((acc) => ({
      ticker: acc.ticker,
      asset: acc.asset,
      uniqueMembers: acc.members.size,
      buyMembers: acc.buyMembers.size,
      sellMembers: acc.sellMembers.size,
      totalTrades: acc.totalTrades,
      latestDisclosure: acc.latestDisclosure,
    }))
    .sort((a, b) => {
      if (b.uniqueMembers !== a.uniqueMembers) {
        return b.uniqueMembers - a.uniqueMembers;
      }
      if (b.totalTrades !== a.totalTrades) return b.totalTrades - a.totalTrades;
      const aDate = a.latestDisclosure ?? "";
      const bDate = b.latestDisclosure ?? "";
      if (bDate !== aDate) return bDate.localeCompare(aDate);
      return a.ticker.localeCompare(b.ticker);
    });
}
