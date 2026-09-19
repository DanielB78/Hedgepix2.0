/**
 * Unit tests for Feed streak + ranking logic.
 * Run: npx tsx src/lib/feedActivity/__tests__/rankFeed.test.ts
 */

import assert from "node:assert/strict";
import {
  computeBuyStreaks,
  rankFeedTickers,
  type FeedRawTrade,
} from "../rankFeed";
import { FEED_WEIGHTS } from "../weights";
import type { PriceSeries } from "@/lib/findTrades/derivedMetrics";

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

  // Same-day duplicate occasions collapse
  const c = computeBuyStreaks([
    { txDate: "2026-01-01", isBuy: true, occasionKey: "c|X|2026-01-01" },
    { txDate: "2026-01-01", isBuy: true, occasionKey: "c|X|2026-01-01" },
    { txDate: "2026-01-02", isBuy: true, occasionKey: "c|X|2026-01-02" },
  ]);
  assert.equal(c.maxStreak, 2);
}

function makeBuy(
  overrides: Partial<FeedRawTrade> & Pick<FeedRawTrade, "id" | "personKey" | "ticker" | "transactionDate" | "disclosureDate">,
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
  for (let i = 0; i < 80; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    // skip weekends roughly
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    out.push({
      date: d.toISOString().slice(0, 10),
      close: 100 - i * 0.4,
    });
  }
  return out;
}

function testRanking() {
  const series = decliningSeries();
  const seriesMap = new Map([["XYZ", series]]);
  const now = new Date("2026-09-01T00:00:00Z");

  const trades: FeedRawTrade[] = [
    makeBuy({
      id: "1",
      personKey: "congress:a",
      person: "Senator A",
      ticker: "XYZ",
      transactionDate: "2026-07-02",
      disclosureDate: "2026-07-10",
      hasSectorOverlap: true,
      overlapMatchType: "direct",
    }),
    makeBuy({
      id: "2",
      personKey: "congress:a",
      person: "Senator A",
      ticker: "XYZ",
      transactionDate: "2026-07-23",
      disclosureDate: "2026-07-30",
      hasSectorOverlap: true,
      overlapMatchType: "direct",
    }),
    makeBuy({
      id: "3",
      personKey: "congress:a",
      person: "Senator A",
      ticker: "XYZ",
      transactionDate: "2026-08-12",
      disclosureDate: "2026-08-20",
      hasSectorOverlap: true,
      overlapMatchType: "direct",
    }),
    makeBuy({
      id: "4",
      personKey: "congress:b",
      person: "Rep B",
      source: "house",
      ticker: "XYZ",
      transactionDate: "2026-08-22",
      disclosureDate: "2026-08-28",
      hasSectorOverlap: true,
      overlapMatchType: "embedding",
    }),
    makeBuy({
      id: "5",
      personKey: "insider:c",
      person: "Insider C",
      source: "insider",
      ticker: "XYZ",
      transactionDate: "2026-08-10",
      disclosureDate: "2026-08-11",
      hasSectorOverlap: null,
    }),
    // Sale that should break streak for A if we had later buys — included for continuity
    {
      ...makeBuy({
        id: "sale",
        personKey: "congress:other",
        ticker: "XYZ",
        transactionDate: "2026-06-01",
        disclosureDate: "2026-06-05",
      }),
      transactionType: "sale",
    },
  ];

  const rows = rankFeedTickers(trades, seriesMap, {
    timeframe: "3m",
    now,
    filters: { source: "all" },
  });

  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.ticker, "XYZ");
  assert.equal(row.buyOccasions, 5);
  assert.equal(row.distinctBuyers, 3);
  assert.equal(row.repeatBuyers, 1); // Senator A has 3
  assert.equal(row.distinctOverlapBuyers, 2);
  assert.ok(row.isCurrentDowntrend);
  assert.ok(row.score > 0);

  // Score = 5*1 + 1*2 + 2*3 + downtrendBuys*1 + 3
  const expectedMin =
    5 * FEED_WEIGHTS.buyOccasion +
    1 * FEED_WEIGHTS.repeatBuyer +
    2 * FEED_WEIGHTS.overlapBuyer +
    FEED_WEIGHTS.currentDowntrend;
  assert.ok(row.score >= expectedMin);

  // Single buy ticker should be excluded
  const lonely = rankFeedTickers(
    [
      makeBuy({
        id: "lonely",
        personKey: "x",
        ticker: "LONE",
        transactionDate: "2026-08-01",
        disclosureDate: "2026-08-02",
      }),
    ],
    new Map([["LONE", series]]),
    { timeframe: "3m", now },
  );
  assert.equal(lonely.length, 0);
}

testStreaks();
testRanking();
console.log("feedActivity rankFeed tests: ok");
