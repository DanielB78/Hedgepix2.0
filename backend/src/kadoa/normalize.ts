import type { Chamber, CongressTrade } from "../types.js";
import { stableContentSourceId } from "../tradeIdentity.js";
import type { KadoaFiler, KadoaTrade } from "./types.js";

const TICKER_RE = /^[A-Z]{1,5}(\.[A-Z])?$/;

/** Kadoa asset_type values that are ordinary stocks (or preferred). */
const STOCK_ASSET_TYPES = new Set(["ST", "STOCK", "CS", "PS"]);

/** Explicit non-stock Kadoa asset_type values. */
const NON_STOCK_ASSET_TYPES = new Set([
  "MUNICIPAL SECURITY",
  "GS",
  "OP",
  "OT",
  "STOCK OPTION",
  "CORPORATE BOND",
  "COMMODITIES/FUTURES CONTRACT",
  "OTHER",
  "NON-PUBLIC STOCK",
  "CT",
  "HN",
  "AB",
  "OI",
  "OL",
  "ET",
  "VA",
  "CRYPTOCURRENCY",
  "RS",
  "SA",
]);

const STOCK_TAG_RE = /\[(ST|CS|STOCK)\]/i;

export type EquityFn = (
  ticker: string | null,
  asset: string | null,
) => boolean;

export function isHouseOrSenateFiler(filer: KadoaFiler): boolean {
  const chamber = (filer.chamber ?? "").trim().toLowerCase();
  if (chamber === "house" || chamber === "senate") return true;
  // Defensive: some rows may only signal via source prefix on trades.
  return false;
}

export function chamberOfFiler(filer: KadoaFiler): Chamber | null {
  const chamber = (filer.chamber ?? "").trim().toLowerCase();
  if (chamber === "house" || chamber === "senate") return chamber;
  return null;
}

export function normalizeOwner(
  raw: string | null | undefined,
): CongressTrade["owner"] {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "self" || v === "fil") return "self";
  if (v === "sp" || v === "spouse") return "spouse";
  if (v === "jt" || v === "joint") return "joint";
  if (v === "dc" || v === "child" || v === "dependent child") return "child";
  return null;
}

export function normalizeTransactionType(
  raw: string | null | undefined,
): "purchase" | "sale" | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v.startsWith("purchase") || v === "buy" || v === "p") return "purchase";
  if (v.startsWith("sale") || v === "sell" || v === "s") return "sale";
  return null;
}

export function normalizeTickerValue(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  if (
    !trimmed ||
    trimmed === "N/A" ||
    trimmed === "NA" ||
    trimmed === "NONE" ||
    trimmed === "--" ||
    trimmed === "NULL"
  ) {
    return null;
  }
  return trimmed;
}

/**
 * House/Senate purchase/sale that looks like an ordinary listed stock.
 * Uses Kadoa asset_type when present, then shared equity heuristics.
 */
export function isKadoaStockTrade(
  trade: KadoaTrade,
  isLikelyListedEquity: EquityFn,
): boolean {
  const txn = normalizeTransactionType(trade.transaction_type);
  if (!txn) return false;

  const ticker = normalizeTickerValue(trade.ticker);
  const assetName = (trade.asset_name ?? "").trim();
  const assetType = (trade.asset_type ?? "").trim();
  const assetTypeUpper = assetType.toUpperCase();

  if (assetTypeUpper && NON_STOCK_ASSET_TYPES.has(assetTypeUpper)) {
    return false;
  }

  if (assetTypeUpper && !STOCK_ASSET_TYPES.has(assetTypeUpper)) {
    // Unknown typed asset — only keep if tagged as stock in the name.
    if (!STOCK_TAG_RE.test(assetName)) return false;
  }

  return isLikelyListedEquity(ticker, assetName || null);
}

export function stableKadoaSourceId(
  trade: KadoaTrade,
  chamber: Chamber,
  member: string,
  transactionType: "purchase" | "sale",
  amountLow: number | null,
  amountHigh: number | null,
  transactionDate: string,
  owner: CongressTrade["owner"],
): string {
  // Prefer cross-source content hash so InsiderWatch updates can match.
  return stableContentSourceId({
    chamber,
    member,
    ticker: normalizeTickerValue(trade.ticker),
    transactionType,
    amountLow,
    amountHigh,
    transactionDate,
    owner,
  });
}

export function toCongressTradeFromKadoa(
  trade: KadoaTrade,
  filer: KadoaFiler,
  chamber: Chamber,
): CongressTrade {
  const member = (filer.full_name ?? "").trim() || filer.id;
  const txn = normalizeTransactionType(trade.transaction_type);
  if (!txn) {
    throw new Error(`Non purchase/sale transaction: ${trade.transaction_type}`);
  }
  const transactionDate = (trade.transaction_date ?? "").slice(0, 10);
  const disclosureDate = (
    trade.filing_date ??
    trade.notification_date ??
    trade.transaction_date ??
    ""
  ).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
    throw new Error(`Invalid transaction_date: ${trade.transaction_date}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(disclosureDate)) {
    throw new Error(`Invalid filing_date: ${trade.filing_date}`);
  }

  const amountLow =
    trade.amount_range_low == null ? null : Number(trade.amount_range_low);
  const amountHigh =
    trade.amount_range_high == null ? null : Number(trade.amount_range_high);
  const owner = normalizeOwner(trade.owner);

  return {
    sourceId: stableKadoaSourceId(
      trade,
      chamber,
      member,
      txn,
      amountLow,
      amountHigh,
      transactionDate,
      owner,
    ),
    chamber,
    member,
    ticker: normalizeTickerValue(trade.ticker),
    assetName: (trade.asset_name ?? "").trim() || "Unknown",
    assetType: trade.asset_type?.trim() ? trade.asset_type.trim() : null,
    transactionType: txn,
    amountLow,
    amountHigh,
    transactionDate,
    disclosureDate,
    owner,
    rawSource: {
      provider: "kadoa",
      kadoa_id: trade.id,
      filer_id: filer.id,
      source_id: trade.source_id,
      filing_id: trade.filing_id,
      doc_url: trade.doc_url,
      amount_range_label: trade.amount_range_label,
      comment: trade.comment,
    },
  };
}
