import { resolveCeoTransactionCode } from "./ceoAggregate";
import type { Chamber, CeoStockPurchaseRow, CongressTrade } from "./types";

/** Who appears as markers on a stock price chart. */
export type ChartTradeSource = "congress" | "house" | "senate" | "ceo" | "both";

export type ChartTrade = CongressTrade & {
  /** Defaults to congress when omitted. */
  source?: "congress" | "ceo";
};

export function parseChartTradeSource(
  value: string | null | undefined,
): ChartTradeSource {
  const raw = (value ?? "").trim().toLowerCase();
  if (
    raw === "congress" ||
    raw === "house" ||
    raw === "senate" ||
    raw === "ceo" ||
    raw === "both"
  ) {
    return raw;
  }
  return "congress";
}

export function chamberFromTradeSource(
  source: ChartTradeSource,
): "all" | Chamber {
  if (source === "house" || source === "senate") return source;
  return "all";
}

export function includeCongressTrades(source: ChartTradeSource): boolean {
  return source !== "ceo";
}

export function includeCeoTrades(source: ChartTradeSource): boolean {
  return source === "ceo" || source === "both";
}

export function asCongressChartTrade(trade: CongressTrade): ChartTrade {
  return { ...trade, source: "congress" };
}

export function ceoRowToChartTrade(row: CeoStockPurchaseRow): ChartTrade | null {
  const code = resolveCeoTransactionCode(row);
  const side = code === "S" ? "sale" : "purchase";
  const ticker = (row.ticker ?? "").trim().toUpperCase() || null;
  if (!ticker) return null;

  const shares =
    row.shares_purchased != null && Number.isFinite(row.shares_purchased)
      ? row.shares_purchased
      : null;
  const price =
    row.price_per_share != null && Number.isFinite(row.price_per_share)
      ? row.price_per_share
      : null;

  let amount_range: string | null = null;
  if (shares != null && price != null) {
    amount_range = `${shares.toLocaleString("en-US")} @ ${price.toFixed(2)}`;
  } else if (shares != null) {
    amount_range = `${shares.toLocaleString("en-US")} shares`;
  } else if (price != null) {
    amount_range = `$${price.toFixed(2)}/sh`;
  }

  return {
    id: `ceo:${row.id}`,
    member: row.ceo_name,
    member_slug: null,
    chamber: null,
    // Reuse state for officer title so disclosure cards can show CFO/COO/etc.
    state: row.officer_title?.trim() || null,
    ticker,
    asset: row.issuer_name ?? row.security_title,
    transaction_type: side,
    amount_low: null,
    amount_high: null,
    amount_range,
    transaction_date: row.transaction_date,
    disclosure_date: row.filing_date,
    est_price: price,
    recent_price: null,
    recent_price_date: null,
    perf_pct: null,
    realized_return_pct: null,
    outcome: null,
    filing_portal: row.filing_url,
    first_seen_at: row.created_at,
    last_seen_at: row.created_at,
    source: "ceo",
  };
}

export function chartTradeLabel(trade: ChartTrade): string {
  if (trade.source === "ceo") {
    return trade.state?.trim() || "Insider";
  }
  if (trade.chamber === "house") return "House";
  if (trade.chamber === "senate") return "Senate";
  return "Congress";
}
