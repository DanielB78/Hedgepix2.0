import type { CongressTrade, SyncState, TradeFilters } from "./types";
import {
  createServiceSupabase,
  hasServiceSupabaseConfig,
} from "./supabase-admin";
import { createBrowserSupabase, hasPublicSupabaseConfig } from "./supabase";

export const PAGE_SIZE = 50;

/** Explicit columns for public trade queries — never select("*"). */
export const PUBLIC_TRADE_COLUMNS = [
  "id",
  "member",
  "member_slug",
  "chamber",
  "state",
  "ticker",
  "asset",
  "transaction_type",
  "amount_low",
  "amount_high",
  "amount_range",
  "transaction_date",
  "disclosure_date",
  "est_price",
  "recent_price",
  "recent_price_date",
  "perf_pct",
  "realized_return_pct",
  "outcome",
  "filing_portal",
  "first_seen_at",
  "last_seen_at",
].join(", ");

export type TradeQueryResult = {
  trades: CongressTrade[];
  totalCount: number;
  page: number;
  pageSize: number;
  syncState: SyncState | null;
  configured: boolean;
  error: string | null;
};

export function parseTradeFilters(
  searchParams: Record<string, string | string[] | undefined>,
): TradeFilters {
  const pick = (key: string) => {
    const value = searchParams[key];
    return typeof value === "string" ? value.trim() : undefined;
  };

  const pageRaw = pick("page");
  const page = pageRaw ? Math.max(1, Number.parseInt(pageRaw, 10) || 1) : 1;

  const chamber = pick("chamber");
  const type = pick("type");

  return {
    member: pick("member") || undefined,
    ticker: pick("ticker")?.toUpperCase() || undefined,
    chamber:
      chamber === "house" || chamber === "senate" ? chamber : undefined,
    type:
      type === "purchase" || type === "sale" || type === "exchange"
        ? type
        : undefined,
    page,
  };
}

export async function fetchTrades(
  filters: TradeFilters,
): Promise<TradeQueryResult> {
  const page = filters.page ?? 1;

  if (!hasPublicSupabaseConfig()) {
    return {
      trades: [],
      totalCount: 0,
      page,
      pageSize: PAGE_SIZE,
      syncState: null,
      configured: false,
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  const supabase = createBrowserSupabase();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("congress_trades")
    .select(PUBLIC_TRADE_COLUMNS, { count: "exact" })
    .order("disclosure_date", { ascending: false, nullsFirst: false })
    .order("transaction_date", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (filters.member) {
    query = query.ilike("member", `%${filters.member}%`);
  }
  if (filters.ticker) {
    query = query.eq("ticker", filters.ticker);
  }
  if (filters.chamber) {
    query = query.eq("chamber", filters.chamber);
  }
  if (filters.type) {
    query = query.eq("transaction_type", filters.type);
  }

  const tradesResult = await query;
  const syncState = await fetchSyncState();

  if (tradesResult.error) {
    return {
      trades: [],
      totalCount: 0,
      page,
      pageSize: PAGE_SIZE,
      syncState,
      configured: true,
      error: tradesResult.error.message,
    };
  }

  return {
    trades: (tradesResult.data ?? []) as unknown as CongressTrade[],
    totalCount: tradesResult.count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    syncState,
    configured: true,
    error: null,
  };
}

export async function fetchSyncState(): Promise<SyncState | null> {
  // congress_sync_state has RLS with no anon read policy; use service role server-side.
  if (!hasServiceSupabaseConfig()) {
    return null;
  }

  const admin = createServiceSupabase();
  const { data, error } = await admin
    .from("congress_sync_state")
    .select(
      "provider, last_attempt_at, last_success_at, latest_seen_disclosure_date, latest_seen_transaction_date, last_rows_received, last_rows_upserted, last_error",
    )
    .eq("provider", "bargo")
    .maybeSingle();

  if (error) {
    console.error("Failed to load congress_sync_state:", error.message);
    return null;
  }

  return (data as SyncState | null) ?? null;
}
