/**
 * Flatten Watchlist ticker rows into person+ticker Notable Trade rows.
 * Reuses existing FeedBuyerTickerSignal scores — no new ranking formula.
 */

import type {
  FeedBuyerTickerSignal,
  FeedTickerRow,
} from "@/lib/feedActivity/types";

export type NotableTradeRow = {
  id: string;
  ticker: string;
  company: string | null;
  signal: FeedBuyerTickerSignal;
  /** Parent ticker row for detail expand. */
  tickerRow: FeedTickerRow;
  signalLabel: string;
  overlapLabel: string;
  priceMovePct: number | null;
  latestBuyDate: string | null;
};

export function notableTradeSignalLabel(
  signal: FeedBuyerTickerSignal,
): string {
  const weak =
    (signal.declineSinceFirstBuyPct != null &&
      signal.declineSinceFirstBuyPct < 0) ||
    signal.downtrendBuys > 0 ||
    signal.isAveragingDown;
  if (signal.consecutiveStreak >= 2 || signal.buyCount >= 2) {
    if (weak) return "Repeated buying into weakness";
    return "Repeated buying";
  }
  if (signal.hasSectorOverlap) return "Sector-overlap buy";
  if (signal.unusuallyLargeBuys > 0) {
    return "Unusually large purchase";
  }
  return "Notable purchase";
}

export function notableTradeOverlapLabel(
  signal: FeedBuyerTickerSignal,
): string {
  if (!signal.hasSectorOverlap) return "—";
  if (signal.overlapBand === "direct") return "Direct";
  if (signal.overlapSimilarity != null) {
    return signal.overlapSimilarity.toFixed(2);
  }
  if (signal.overlapBand === "very_high") return "≥0.95";
  if (signal.overlapBand === "high") return "0.90–0.95";
  if (signal.overlapBand === "moderate") return "0.85–0.90";
  return "Overlap";
}

export function flattenNotableTrades(
  tickerRows: FeedTickerRow[],
): NotableTradeRow[] {
  const out: NotableTradeRow[] = [];
  for (const tickerRow of tickerRows) {
    for (const signal of tickerRow.buyerSignals) {
      if (signal.score <= 0) continue;
      const latestBuyDate =
        signal.occasions
          .map((o) => o.transactionDate)
          .sort()
          .at(-1) ?? signal.latestDisclosure;
      const priceMovePct =
        signal.declineSinceFirstBuyPct != null &&
        signal.declineSinceFirstBuyPct !== 0
          ? signal.declineSinceFirstBuyPct
          : tickerRow.relativeSectorReturn ??
            tickerRow.relativeMarketReturn ??
            tickerRow.currentTrendReturn;

      out.push({
        id: `${signal.personKey}|${tickerRow.ticker}`,
        ticker: tickerRow.ticker,
        company: tickerRow.company,
        signal,
        tickerRow,
        signalLabel: notableTradeSignalLabel(signal),
        overlapLabel: notableTradeOverlapLabel(signal),
        priceMovePct,
        latestBuyDate,
      });
    }
  }

  out.sort((a, b) => {
    if (b.signal.score !== a.signal.score) {
      return b.signal.score - a.signal.score;
    }
    return (b.latestBuyDate ?? "").localeCompare(a.latestBuyDate ?? "");
  });

  return out;
}

/** Build a FeedTickerRow focused on one buyer for the detail panel. */
export function focusTickerRowOnBuyer(
  tickerRow: FeedTickerRow,
  personKey: string,
): FeedTickerRow {
  const focused =
    tickerRow.buyerSignals.find((s) => s.personKey === personKey) ??
    tickerRow.strongestBuyer;
  if (!focused) return tickerRow;
  const rest = tickerRow.buyerSignals.filter(
    (s) => s.personKey !== focused.personKey,
  );
  return {
    ...tickerRow,
    strongestBuyer: focused,
    buyerSignals: [focused, ...rest],
    whyNoteworthy: focused.whyLines,
  };
}
