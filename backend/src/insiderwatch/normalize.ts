import type { Chamber, CongressTrade } from "../types.js";
import {
  parseAmountRangeLabel,
  parseFlexibleDate,
  stableContentSourceId,
} from "../tradeIdentity.js";
import type { InsiderWatchCsvRow } from "./types.js";

export type EquityFn = (
  ticker: string | null,
  asset: string | null,
) => boolean;

export function normalizeChamber(raw: string | null | undefined): Chamber | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "house" || v === "senate") return v;
  return null;
}

export function normalizeAction(
  raw: string | null | undefined,
): "purchase" | "sale" | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "buy" || v === "purchase" || v === "p") return "purchase";
  if (v === "sell" || v === "sale" || v === "s") return "sale";
  return null;
}

export function normalizeOwner(
  raw: string | null | undefined,
): CongressTrade["owner"] {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === "self" || v === "fil") return "self";
  if (v === "sp" || v === "spouse") return "spouse";
  if (v === "jt" || v === "joint") return "joint";
  if (v === "dc" || v === "child" || v === "dependent child") return "child";
  return null;
}

export function normalizeTicker(raw: string | null | undefined): string | null {
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

export function isInsiderWatchStockRow(
  row: InsiderWatchCsvRow,
  isLikelyListedEquity: EquityFn,
): boolean {
  if (!normalizeChamber(row.chamber)) return false;
  if (!normalizeAction(row.action)) return false;
  const ticker = normalizeTicker(row.ticker);
  return isLikelyListedEquity(ticker, row.asset || null);
}

export function toCongressTradeFromInsiderWatch(
  row: InsiderWatchCsvRow,
  rowIndex: number,
): CongressTrade {
  const chamber = normalizeChamber(row.chamber);
  if (!chamber) throw new Error(`Unsupported chamber: ${row.chamber}`);

  const transactionType = normalizeAction(row.action);
  if (!transactionType) {
    throw new Error(`Unsupported action: ${row.action}`);
  }

  const transactionDate = parseFlexibleDate(row.transaction_date);
  const disclosureDate = parseFlexibleDate(row.filed_date);
  if (!transactionDate) {
    throw new Error(`Invalid transaction_date: ${row.transaction_date}`);
  }
  if (!disclosureDate) {
    throw new Error(`Invalid filed_date: ${row.filed_date}`);
  }

  const fromLabel = parseAmountRangeLabel(row.amount_range);
  const minUsd = Number(row.amount_min_usd);
  const amountLow = Number.isFinite(minUsd)
    ? Math.round(minUsd)
    : fromLabel.low;
  const amountHigh = fromLabel.high;

  const member = (row.member ?? "").trim();
  if (!member) throw new Error("Missing member");

  const ticker = normalizeTicker(row.ticker);
  const owner = normalizeOwner(row.owner);

  return {
    sourceId: stableContentSourceId({
      chamber,
      member,
      memberSlug: row.member_slug,
      ticker,
      transactionType,
      amountLow,
      amountHigh,
      transactionDate,
      owner,
    }),
    chamber,
    member,
    ticker,
    assetName: (row.asset ?? "").trim() || "Unknown",
    assetType: null,
    transactionType,
    amountLow,
    amountHigh,
    transactionDate,
    disclosureDate,
    owner,
    rawSource: {
      provider: "insiderwatch",
      filing_id: row.filing_id,
      row_index: rowIndex,
      amount_range: row.amount_range,
      disclosure_lag_days: row.disclosure_lag_days,
      member_slug: row.member_slug,
    },
  };
}
