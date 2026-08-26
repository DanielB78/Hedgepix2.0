export type Chamber = "house" | "senate";
export type TransactionType = "purchase" | "sale" | "exchange";

export type CongressTrade = {
  id: string;
  member: string | null;
  member_slug: string | null;
  chamber: Chamber | null;
  state: string | null;
  ticker: string | null;
  asset: string | null;
  transaction_type: TransactionType | null;
  amount_low: number | null;
  amount_high: number | null;
  amount_range: string | null;
  transaction_date: string | null;
  disclosure_date: string | null;
  est_price: number | null;
  recent_price: number | null;
  recent_price_date: string | null;
  perf_pct: number | null;
  realized_return_pct: number | null;
  outcome: string | null;
  filing_portal: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export type TradeFilters = {
  member?: string;
  ticker?: string;
  chamber?: Chamber;
  type?: TransactionType;
  page?: number;
};

export type SyncState = {
  provider: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  latest_seen_disclosure_date: string | null;
  latest_seen_transaction_date: string | null;
  last_rows_received: number | null;
  last_rows_upserted: number | null;
  last_error: string | null;
};

export type TrendingMode = "all" | "buys" | "sales";
export type TrendingPeriodDays = 7 | 30 | 90;

export type TrendingFilters = {
  mode: TrendingMode;
  periodDays: TrendingPeriodDays;
};

export type TrendingTicker = {
  ticker: string;
  asset: string | null;
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  uniqueMembers: number;
  latestDisclosure: string | null;
};
