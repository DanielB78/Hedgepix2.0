/**
 * Rank tickers by congressional BUY occasions with member↔ticker sector overlap.
 * House and Senate are ranked separately by the caller (pass chamber-scoped trades).
 */

import { normalizeTransactionType } from "./advancedTradeFilters";
import type { SectorOverlapResult } from "./sectorOverlap";
import type { CongressTrade, TrendingTicker } from "./types";

export type OverlapPurchaseOccasion = {
  key: string;
  member: string | null;
  memberSlug: string | null;
  ticker: string;
  asset: string | null;
  transactionDate: string | null;
  disclosureDate: string | null;
  amountRange: string | null;
  overlap: SectorOverlapResult;
};

export type SectorOverlapActivityRow = {
  ticker: string;
  asset: string | null;
  /** Distinct member + ticker + transaction_date purchase occasions. */
  overlapBuyOccasions: number;
  uniqueMembers: number;
  latestPurchaseDate: string | null;
  occasions: OverlapPurchaseOccasion[];
};

function occasionKey(trade: CongressTrade): string {
  const member =
    trade.member_slug?.trim().toLowerCase() ||
    trade.member?.trim().toLowerCase() ||
    "unknown";
  const ticker = (trade.ticker ?? "").trim().toUpperCase();
  const date = trade.transaction_date ?? trade.disclosure_date ?? "unknown";
  return `${member}|${ticker}|${date}`;
}

/**
 * Rank tickers by distinct overlap BUY occasions.
 * Primary sort: occasions desc; tie-break: unique members; then most recent purchase.
 */
export function rankSectorOverlapActivity(
  trades: CongressTrade[],
  overlaps: Record<string, SectorOverlapResult>,
  limit = 40,
): SectorOverlapActivityRow[] {
  type Acc = {
    ticker: string;
    asset: string | null;
    occasionKeys: Set<string>;
    members: Set<string>;
    latestPurchaseDate: string | null;
    occasionsByKey: Map<string, OverlapPurchaseOccasion>;
  };

  const byTicker = new Map<string, Acc>();

  for (const trade of trades) {
    if (normalizeTransactionType(trade.transaction_type) !== "buy") continue;
    const overlap = overlaps[trade.id];
    if (!overlap?.has_sector_overlap) continue;

    const ticker = (trade.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;

    const key = occasionKey(trade);
    const memberId =
      trade.member_slug?.trim().toLowerCase() ||
      trade.member?.trim().toLowerCase() ||
      null;

    let acc = byTicker.get(ticker);
    if (!acc) {
      acc = {
        ticker,
        asset: trade.asset,
        occasionKeys: new Set(),
        members: new Set(),
        latestPurchaseDate: null,
        occasionsByKey: new Map(),
      };
      byTicker.set(ticker, acc);
    }

    if (trade.asset && !acc.asset) acc.asset = trade.asset;
    if (memberId) acc.members.add(memberId);

    const txDate = trade.transaction_date ?? trade.disclosure_date;
    if (
      txDate &&
      (!acc.latestPurchaseDate || txDate > acc.latestPurchaseDate)
    ) {
      acc.latestPurchaseDate = txDate;
    }

    if (!acc.occasionKeys.has(key)) {
      acc.occasionKeys.add(key);
      acc.occasionsByKey.set(key, {
        key,
        member: trade.member,
        memberSlug: trade.member_slug,
        ticker,
        asset: trade.asset,
        transactionDate: trade.transaction_date,
        disclosureDate: trade.disclosure_date,
        amountRange: trade.amount_range,
        overlap,
      });
    }
  }

  return [...byTicker.values()]
    .map((acc) => ({
      ticker: acc.ticker,
      asset: acc.asset,
      overlapBuyOccasions: acc.occasionKeys.size,
      uniqueMembers: acc.members.size,
      latestPurchaseDate: acc.latestPurchaseDate,
      occasions: [...acc.occasionsByKey.values()].sort((a, b) => {
        const da = a.transactionDate ?? a.disclosureDate ?? "";
        const db = b.transactionDate ?? b.disclosureDate ?? "";
        if (db !== da) return db.localeCompare(da);
        return (a.member ?? "").localeCompare(b.member ?? "");
      }),
    }))
    .filter((row) => row.overlapBuyOccasions > 0)
    .sort((a, b) => {
      if (b.overlapBuyOccasions !== a.overlapBuyOccasions) {
        return b.overlapBuyOccasions - a.overlapBuyOccasions;
      }
      if (b.uniqueMembers !== a.uniqueMembers) {
        return b.uniqueMembers - a.uniqueMembers;
      }
      const da = a.latestPurchaseDate ?? "";
      const db = b.latestPurchaseDate ?? "";
      if (db !== da) return db.localeCompare(da);
      return a.ticker.localeCompare(b.ticker);
    })
    .slice(0, limit);
}

/** Adapt overlap activity rows to TrendingTicker shape for the shared TickerCard. */
export function overlapActivityAsTrending(
  row: SectorOverlapActivityRow,
): TrendingTicker {
  return {
    ticker: row.ticker,
    asset: row.asset,
    uniqueMembers: row.uniqueMembers,
    buyMembers: row.uniqueMembers,
    sellMembers: 0,
    totalTrades: row.overlapBuyOccasions,
    latestDisclosure: row.latestPurchaseDate,
  };
}
