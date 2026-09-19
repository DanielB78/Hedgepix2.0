/**
 * Unit tests for buyer/ticker sector-overlap Feed ranking.
 * Run: npx tsx src/lib/feedActivity/__tests__/rankFeed.test.ts
 */

import assert from "node:assert/strict";
import {
  aggregateTickerScore,
  buildBuyerWhyLines,
  buildWhyNoteworthy,
  computeBuyStreaks,
  purchaseSizeEstimate,
  rankFeedTickers,
  scoreBuyerTicker,
  type FeedRawTrade,
} from "../rankFeed";
import type { PriceSeries } from "@/lib/findTrades/derivedMetrics";
import { FEED_WEIGHTS, overlapStrengthWeight } from "../weights";
import type { FeedBuyerTickerSignal } from "../types";

function testStreaks() {
  const a = computeBuyStreaks([
    { txDate: "2026-01-05", isBuy: true, occasionKey: "a|NVDA|2026-01-05" },
    { txDate: "2026-01-20", isBuy: true, occasionKey: "a|NVDA|2026-01-20" },
    { txDate: "2026-02-02", isBuy: true, occasionKey: "a|NVDA|2026-02-02" },
    { txDate: "2026-02-18", isBuy: false, occasionKey: "a|NVDA|2026-02-18" },
  ]);
  assert.equal(a.maxStreak, 3);
  assert.equal(a.currentStreak, 0);

  const b = computeBuyStreaks([
    { txDate: "2026-01-01", isBuy: true, occasionKey: "b|1" },
    { txDate: "2026-01-02", isBuy: true, occasionKey: "b|2" },
    { txDate: "2026-01-03", isBuy: false, occasionKey: "b|3" },
    { txDate: "2026-01-04", isBuy: true, occasionKey: "b|4" },
    { txDate: "2026-01-05", isBuy: true, occasionKey: "b|5" },
  ]);
  assert.equal(b.maxStreak, 2);
  assert.equal(b.currentStreak, 2);
}

function testPurchaseEstimate() {
  assert.deepEqual(
    purchaseSizeEstimate({
      exactValue: 100000,
      disclosedMin: null,
      disclosedMax: null,
    }),
    { value: 100000, approximate: false },
  );
  assert.deepEqual(
    purchaseSizeEstimate({
      exactValue: null,
      disclosedMin: 15001,
      disclosedMax: 50000,
    }),
    { value: 32500.5, approximate: true },
  );
}

function testOverlapStrengthBands() {
  assert.equal(
    overlapStrengthWeight({
      hasOverlap: true,
      matchType: "direct",
      similarity: null,
    }).weight,
    FEED_WEIGHTS.overlapDirect,
  );
  assert.equal(
    overlapStrengthWeight({
      hasOverlap: true,
      matchType: "semantic",
      similarity: 0.99,
    }).band,
    "very_high",
  );
  assert.equal(
    overlapStrengthWeight({
      hasOverlap: true,
      matchType: "semantic",
      similarity: 0.92,
    }).band,
    "high",
  );
  assert.equal(
    overlapStrengthWeight({
      hasOverlap: true,
      matchType: "semantic",
      similarity: 0.86,
    }).band,
    "moderate",
  );
  assert.ok(
    overlapStrengthWeight({
      hasOverlap: true,
      matchType: "semantic",
      similarity: 0.99,
    }).weight >
      overlapStrengthWeight({
        hasOverlap: true,
        matchType: "semantic",
        similarity: 0.86,
      }).weight,
  );
}

function testAggregationDoesNotSumAllBuyers() {
  // Eight weak one-buy scores must not beat one strong overlap pattern.
  const strong = aggregateTickerScore(
    [{ score: 90, hasSectorOverlap: true }],
    1,
  );
  const manyWeak = aggregateTickerScore(
    [12, 11, 10, 9, 8, 7, 6, 5].map((score) => ({
      score,
      hasSectorOverlap: false,
    })),
    8,
  );
  assert.ok(
    strong.total > manyWeak.total,
    `expected strong ${strong.total} > manyWeak ${manyWeak.total}`,
  );
  assert.ok(manyWeak.distinctBuyerContext < 2);
  assert.equal(strong.bestBuyerScore, 90);
  // Non-overlap seconds must not contribute beyond tiny distinct-buyer context
  assert.equal(manyWeak.secondBuyerContribution, 0);
  assert.equal(manyWeak.additionalBuyerContribution, 0);

  const withSecondOverlap = aggregateTickerScore(
    [
      { score: 80, hasSectorOverlap: true },
      { score: 50, hasSectorOverlap: true },
      { score: 40, hasSectorOverlap: false },
    ],
    3,
  );
  assert.equal(withSecondOverlap.secondBuyerContribution, 20); // 50 * 0.4
  assert.equal(withSecondOverlap.additionalBuyerContribution, 0); // non-overlap ignored
}

function makeBuy(
  overrides: Partial<FeedRawTrade> &
    Pick<
      FeedRawTrade,
      "id" | "personKey" | "ticker" | "transactionDate" | "disclosureDate"
    >,
): FeedRawTrade {
  return {
    source: "senate",
    person: "Test Member",
    memberSlug: "test-member",
    company: "Test Co",
    transactionType: "purchase",
    amountRange: null,
    disclosedMin: 1001,
    disclosedMax: 15000,
    exactValue: null,
    officerTitle: null,
    filingUrl: null,
    hasSectorOverlap: false,
    overlapMatchType: null,
    overlapSimilarity: null,
    overlapMemberLabel: null,
    overlapTickerLabel: null,
    ...overrides,
  };
}

function decliningSeries(): PriceSeries {
  const out: PriceSeries = [];
  const start = new Date("2025-12-01T00:00:00Z");
  for (let i = 0; i < 320; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    out.push({
      date: d.toISOString().slice(0, 10),
      close: 100 - i * 0.2,
    });
  }
  return out;
}

function risingSeries(): PriceSeries {
  const out: PriceSeries = [];
  const start = new Date("2025-12-01T00:00:00Z");
  for (let i = 0; i < 320; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    out.push({
      date: d.toISOString().slice(0, 10),
      close: 40 + i * 0.25,
    });
  }
  return out;
}

function mildDeclineSeries(): PriceSeries {
  const out: PriceSeries = [];
  const start = new Date("2025-12-01T00:00:00Z");
  for (let i = 0; i < 320; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    out.push({
      date: d.toISOString().slice(0, 10),
      close: 80 - i * 0.03,
    });
  }
  return out;
}

/**
 * Spec example:
 * Ticker A — one overlap member, 4 consecutive buys averaging down, weak stock
 * Ticker B — 8 unrelated members, one buy each, no overlap, stock up
 * A must rank substantially above B.
 */
function testOverlapRepeatBeatsManyUnrelatedBuyers() {
  const now = new Date("2026-09-01T00:00:00Z");
  const seriesMap = new Map<string, PriceSeries>([
    ["TICKA", decliningSeries()],
    ["TICKB", risingSeries()],
    ["PEER1", mildDeclineSeries()],
  ]);

  const tickerA: FeedRawTrade[] = [];
  const buyDates = [
    ["2026-07-06", "2026-07-13"],
    ["2026-07-20", "2026-07-24"],
    ["2026-08-03", "2026-08-10"],
    ["2026-08-24", "2026-08-27"],
  ] as const;
  for (let i = 0; i < buyDates.length; i++) {
    const [tx, disc] = buyDates[i]!;
    tickerA.push(
      makeBuy({
        id: `a-${i}`,
        personKey: "congress:x",
        person: "Senator X",
        ticker: "TICKA",
        transactionDate: tx,
        disclosureDate: disc,
        hasSectorOverlap: true,
        overlapMatchType: "direct",
        overlapMemberLabel: "Nuclear power",
        overlapTickerLabel: "Nuclear power generation",
        disclosedMin: i === 3 ? 100001 : 15001,
        disclosedMax: i === 3 ? 250000 : 50000,
      }),
    );
  }

  // Prior small buys so latest is unusually large
  for (let i = 0; i < 5; i++) {
    tickerA.push(
      makeBuy({
        id: `a-hist-${i}`,
        personKey: "congress:x",
        person: "Senator X",
        ticker: "OTHER",
        transactionDate: `2026-01-0${i + 1}`,
        disclosureDate: `2026-01-0${i + 1}`,
        disclosedMin: 1001,
        disclosedMax: 15000,
      }),
    );
  }

  const tickerB: FeedRawTrade[] = [];
  for (let i = 0; i < 8; i++) {
    tickerB.push(
      makeBuy({
        id: `b-${i}`,
        personKey: `congress:m${i}`,
        person: `Member ${i}`,
        source: i % 2 === 0 ? "senate" : "house",
        ticker: "TICKB",
        transactionDate: `2026-08-${String(i + 1).padStart(2, "0")}`,
        disclosureDate: `2026-08-${String(i + 10).padStart(2, "0")}`,
        hasSectorOverlap: false,
      }),
    );
  }

  const rows = rankFeedTickers([...tickerA, ...tickerB], seriesMap, {
    timeframe: "3m",
    now,
  });

  const a = rows.find((r) => r.ticker === "TICKA");
  const b = rows.find((r) => r.ticker === "TICKB");
  assert.ok(a, "TICKA should appear");
  assert.ok(b, "TICKB should appear");
  assert.ok(
    a!.score > b!.score * 1.5,
    `TICKA ${a!.score} should substantially beat TICKB ${b!.score}`,
  );
  assert.equal(a!.strongestBuyer?.person, "Senator X");
  assert.equal(a!.strongestBuyer?.hasSectorOverlap, true);
  assert.ok((a!.strongestBuyer?.buyCount ?? 0) >= 4);
  assert.ok(a!.strongestBuyer?.isAveragingDown === true || (a!.strongestBuyer?.lowerPriceRepeatBuys ?? 0) > 0);
  assert.equal(b!.distinctBuyers, 8);
  assert.ok(b!.distinctOverlapBuyers === 0);
  assert.ok(a!.whyNoteworthy.some((l) => /overlap/i.test(l)));
  assert.ok(
    !a!.whyNoteworthy.some((l) => /\d+ distinct buyers?/i.test(l)),
    "should not headline distinct buyer count",
  );
}

function testBuyerWhyLines() {
  const lines = buildBuyerWhyLines({
    person: "Senator A",
    source: "senate",
    hasSectorOverlap: true,
    overlapBand: "high",
    overlapSimilarity: 0.94,
    overlapMemberLabel: "Nuclear power",
    overlapTickerLabel: "Nuclear power generation",
    buyCount: 4,
    consecutiveStreak: 4,
    lowerPriceRepeatBuys: 3,
    declineSinceFirstBuyPct: -21,
    downtrendBuys: 3,
    unusuallyLargeBuys: 1,
    latestDisclosure: "2026-08-27",
    relativeSectorReturn: -15,
    relativeMarketReturn: -18,
    return20d: -22,
    officerTitle: null,
  });
  assert.ok(lines.some((l) => /congressional sector exposure overlaps/i.test(l)));
  assert.ok(lines.some((l) => l.includes("0.94")));
  assert.ok(lines.some((l) => /4 times/i.test(l) || /4 consecutive/i.test(l)));
  assert.ok(lines.some((l) => /lower prices/i.test(l)));
  assert.ok(lines.some((l) => /underperformed its sector/i.test(l)));

  const strongest: FeedBuyerTickerSignal = {
    person: "Senator A",
    personKey: "congress:a",
    source: "senate",
    memberSlug: "a",
    officerTitle: null,
    score: 91,
    hasSectorOverlap: true,
    overlapBand: "high",
    overlapMatchType: "semantic",
    overlapSimilarity: 0.94,
    overlapMemberLabel: "Nuclear power",
    overlapTickerLabel: "Nuclear power generation",
    buyCount: 4,
    consecutiveStreak: 4,
    lowerPriceRepeatBuys: 3,
    declineSinceFirstBuyPct: -21,
    isAveragingDown: true,
    downtrendBuys: 3,
    unusuallyLargeBuys: 1,
    avgRecencyWeight: 0.9,
    latestDisclosure: "2026-08-27",
    occasions: [],
    whyLines: lines,
  };
  const why = buildWhyNoteworthy(strongest, {
    additionalOverlapBuyers: 1,
    relativeSectorReturn: -15,
    relativeMarketReturn: -18,
    return20d: -22,
  });
  assert.ok(why.some((l) => /\+1 additional sector-overlap/i.test(l)));
}

function testScoreBuyerTickerOverlapAmplifies() {
  const baseOccasions = [
    {
      key: "1",
      person: "X",
      personKey: "x",
      memberSlug: null,
      source: "senate" as const,
      ticker: "T",
      company: null,
      transactionDate: "2026-08-01",
      disclosureDate: "2026-08-05",
      amountRange: null,
      disclosedMin: 1001,
      disclosedMax: 15000,
      exactValue: null,
      purchaseEstimate: 8000,
      purchaseEstimateIsApproximate: true,
      priceAtTrade: 100,
      return20dBefore: -12,
      boughtDuringDowntrend: true,
      personSizeRatio: 1,
      isUnusuallyLarge: false,
      positionKind: "new" as const,
      isAveragingDownStep: false,
      hasSectorOverlap: true,
      overlapMatchType: "direct" as const,
      overlapSimilarity: null,
      overlapMemberLabel: "A",
      overlapTickerLabel: "B",
      officerTitle: null,
      filingUrl: null,
      recencyWeight: 0.8,
    },
  ];

  const single = scoreBuyerTicker({
    occasions: baseOccasions,
    consecutiveStreak: 1,
    lowerPriceRepeatBuys: 0,
    declineSinceFirstBuyPct: null,
    isAveragingDown: false,
    hasSectorOverlap: true,
    overlapBand: "direct",
    overlapWeight: FEED_WEIGHTS.overlapDirect,
    relativeWeaknessPct: -5,
    isCurrentDowntrend: true,
    activityRatio: 1,
    source: "senate",
    officerTitle: null,
  });

  const repeated = scoreBuyerTicker({
    occasions: [
      ...baseOccasions,
      { ...baseOccasions[0]!, key: "2", priceAtTrade: 91, isAveragingDownStep: true, transactionDate: "2026-08-10", disclosureDate: "2026-08-12", positionKind: "adding", personSizeRatio: 1.2 },
      { ...baseOccasions[0]!, key: "3", priceAtTrade: 84, isAveragingDownStep: true, transactionDate: "2026-08-18", disclosureDate: "2026-08-20", positionKind: "adding", personSizeRatio: 1.1 },
      { ...baseOccasions[0]!, key: "4", priceAtTrade: 78, isAveragingDownStep: true, transactionDate: "2026-08-25", disclosureDate: "2026-08-27", positionKind: "adding", personSizeRatio: 3.2, isUnusuallyLarge: true },
    ],
    consecutiveStreak: 4,
    lowerPriceRepeatBuys: 3,
    declineSinceFirstBuyPct: -22,
    isAveragingDown: true,
    hasSectorOverlap: true,
    overlapBand: "direct",
    overlapWeight: FEED_WEIGHTS.overlapDirect,
    relativeWeaknessPct: -15,
    isCurrentDowntrend: true,
    activityRatio: 2,
    source: "senate",
    officerTitle: null,
  });

  assert.ok(
    repeated > single * 1.8,
    `repeated ${repeated} should beat single ${single} substantially`,
  );
}

testStreaks();
testPurchaseEstimate();
testOverlapStrengthBands();
testAggregationDoesNotSumAllBuyers();
testOverlapRepeatBeatsManyUnrelatedBuyers();
testBuyerWhyLines();
testScoreBuyerTickerOverlapAmplifies();
console.log("feedActivity buyer-overlap rankFeed tests: ok");
