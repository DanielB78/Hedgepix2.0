/**
 * Unit tests for Notable Trades flattening.
 * Run: npx tsx src/lib/feedActivity/__tests__/notableTrades.test.ts
 */

import assert from "node:assert/strict";
import {
  flattenNotableTrades,
  focusTickerRowOnBuyer,
  notableTradeOverlapLabel,
  notableTradeSignalLabel,
} from "../notableTrades";
import type {
  FeedBuyerTickerSignal,
  FeedTickerRow,
} from "../types";

function signal(
  partial: Partial<FeedBuyerTickerSignal> &
    Pick<FeedBuyerTickerSignal, "personKey" | "person" | "score">,
): FeedBuyerTickerSignal {
  return {
    source: "senate",
    memberSlug: null,
    officerTitle: null,
    hasSectorOverlap: false,
    overlapBand: "none",
    overlapMatchType: null,
    overlapSimilarity: null,
    overlapMemberLabel: null,
    overlapTickerLabel: null,
    buyCount: 1,
    consecutiveStreak: 1,
    lowerPriceRepeatBuys: 0,
    declineSinceFirstBuyPct: null,
    isAveragingDown: false,
    downtrendBuys: 0,
    unusuallyLargeBuys: 0,
    avgRecencyWeight: 1,
    latestDisclosure: "2026-09-01",
    occasions: [],
    whyLines: [],
    ...partial,
  };
}

function tickerRow(
  ticker: string,
  buyers: FeedBuyerTickerSignal[],
): FeedTickerRow {
  const strongest = buyers.slice().sort((a, b) => b.score - a.score)[0] ?? null;
  return {
    ticker,
    company: `${ticker} Inc`,
    generalSector: null,
    industryLabels: [],
    score: strongest?.score ?? 0,
    breakdown: {
      bestBuyerScore: strongest?.score ?? 0,
      secondBuyerContribution: 0,
      additionalBuyerContribution: 0,
      distinctBuyerContext: 0,
      total: strongest?.score ?? 0,
    },
    components: {} as FeedTickerRow["components"],
    whyNoteworthy: [],
    strongestBuyer: strongest,
    buyerSignals: buyers,
    buyOccasions: buyers.reduce((n, b) => n + b.buyCount, 0),
    distinctBuyers: buyers.length,
    repeatBuyers: 0,
    overlapBuyCount: 0,
    distinctOverlapBuyers: 0,
    downtrendBuyCount: 0,
    distinctDowntrendBuyers: 0,
    maxConsecutiveStreak: Math.max(0, ...buyers.map((b) => b.consecutiveStreak)),
    buyersLast14d: 0,
    buyersLast30d: 0,
    buysLast14d: 0,
    buysLast30d: 0,
    unusuallyLargeBuys: 0,
    unusuallyLargeBuyCount: 0,
    averagingDownBuyers: 0,
    newPositionBuyers: 0,
    addingBuyers: 0,
    return20d: null,
    benchmarkReturn20d: null,
    marketBenchmarkReturn: null,
    relativeMarketReturn: null,
    sectorBenchmarkReturn: null,
    sectorBenchmarkReturn20d: null,
    relativeSectorReturn: -12,
    activityRatio: null,
    isCurrentDowntrend: true,
    currentTrendReturn: -8,
    activeSourceTypes: ["senate"],
    latestBuyDisclosure: "2026-09-03",
    latestBuyTransaction: "2026-09-01",
    occasions: [],
    buyerStreaks: [],
  } as unknown as FeedTickerRow;
}

function testFlattenAndSort() {
  const a = signal({
    personKey: "a",
    person: "Senator A",
    score: 91,
    consecutiveStreak: 4,
    buyCount: 4,
    isAveragingDown: true,
    declineSinceFirstBuyPct: -21,
    hasSectorOverlap: true,
    overlapBand: "direct",
    occasions: [
      {
        transactionDate: "2026-06-04",
        disclosureDate: "2026-06-10",
      } as FeedBuyerTickerSignal["occasions"][number],
      {
        transactionDate: "2026-09-03",
        disclosureDate: "2026-09-08",
      } as FeedBuyerTickerSignal["occasions"][number],
    ],
  });
  const b = signal({
    personKey: "b",
    person: "Rep B",
    score: 82,
    hasSectorOverlap: true,
    overlapBand: "very_high",
    overlapSimilarity: 0.97,
  });
  const zero = signal({
    personKey: "z",
    person: "Zero",
    score: 0,
  });

  const rows = flattenNotableTrades([
    tickerRow("XYZ", [a, zero]),
    tickerRow("NVDA", [b]),
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.signal.person, "Senator A");
  assert.equal(rows[0]!.ticker, "XYZ");
  assert.equal(rows[0]!.signalLabel, "Repeated buying into weakness");
  assert.equal(rows[0]!.overlapLabel, "Direct");
  assert.equal(rows[0]!.latestBuyDate, "2026-09-03");
  assert.equal(rows[1]!.signal.person, "Rep B");
  assert.equal(notableTradeOverlapLabel(b), "0.97");
  assert.equal(notableTradeSignalLabel(b), "Sector-overlap buy");
}

function testFocusBuyer() {
  const strong = signal({
    personKey: "strong",
    person: "Strong",
    score: 90,
  });
  const other = signal({
    personKey: "other",
    person: "Other",
    score: 40,
  });
  const row = tickerRow("ABC", [strong, other]);
  const focused = focusTickerRowOnBuyer(row, "other");
  assert.equal(focused.strongestBuyer?.personKey, "other");
  assert.equal(focused.buyerSignals[0]!.personKey, "other");
}

testFlattenAndSort();
testFocusBuyer();
console.log("notableTrades.test.ts: ok");
