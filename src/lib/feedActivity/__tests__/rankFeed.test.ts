/**
 * Unit tests for refined Feed streak + ranking logic.
 * Run: npx tsx src/lib/feedActivity/__tests__/rankFeed.test.ts
 */

import assert from "node:assert/strict";
import {
  buildWhyNoteworthy,
  computeBuyStreaks,
  purchaseSizeEstimate,
  rankFeedTickers,
  type FeedRawTrade,
} from "../rankFeed";
import type { PriceSeries } from "@/lib/findTrades/derivedMetrics";
import type { FeedScoreComponents } from "../types";

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
    purchaseSizeEstimate({ exactValue: 100000, disclosedMin: null, disclosedMax: null }),
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
  for (let i = 0; i < 120; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    out.push({
      date: d.toISOString().slice(0, 10),
      close: 100 - i * 0.35,
    });
  }
  return out;
}

function flatSeries(): PriceSeries {
  const out: PriceSeries = [];
  const start = new Date("2025-12-01T00:00:00Z");
  for (let i = 0; i < 120; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    out.push({ date: d.toISOString().slice(0, 10), close: 50 });
  }
  return out;
}

function testRankingPrefersDistinctBuyers() {
  const series = decliningSeries();
  const seriesMap = new Map([
    ["XYZ", series],
    ["AAA", flatSeries()],
  ]);
  // Add peer tickers for sector cross-section
  seriesMap.set("PEER1", decliningSeries().map((b) => ({ ...b, close: b.close + 20 })));
  const now = new Date("2026-09-01T00:00:00Z");

  const multiBuyer: FeedRawTrade[] = [
    makeBuy({
      id: "1",
      personKey: "congress:a",
      person: "Senator A",
      ticker: "XYZ",
      transactionDate: "2026-08-02",
      disclosureDate: "2026-08-10",
      hasSectorOverlap: true,
      overlapMatchType: "direct",
      disclosedMin: 50001,
      disclosedMax: 100000,
    }),
    makeBuy({
      id: "2",
      personKey: "congress:a",
      person: "Senator A",
      ticker: "XYZ",
      transactionDate: "2026-08-12",
      disclosureDate: "2026-08-18",
      hasSectorOverlap: true,
      overlapMatchType: "direct",
      disclosedMin: 100001,
      disclosedMax: 250000,
    }),
    makeBuy({
      id: "3",
      personKey: "congress:b",
      person: "Rep B",
      source: "house",
      ticker: "XYZ",
      transactionDate: "2026-08-15",
      disclosureDate: "2026-08-20",
      hasSectorOverlap: true,
      overlapMatchType: "embedding",
    }),
    makeBuy({
      id: "4",
      personKey: "insider:c",
      person: "Insider C",
      source: "insider",
      ticker: "XYZ",
      transactionDate: "2026-08-20",
      disclosureDate: "2026-08-21",
      exactValue: 250000,
      disclosedMin: null,
      disclosedMax: null,
    }),
    makeBuy({
      id: "5",
      personKey: "insider:c",
      person: "Insider C",
      source: "insider",
      ticker: "XYZ",
      transactionDate: "2026-08-25",
      disclosureDate: "2026-08-26",
      exactValue: 50000,
      disclosedMin: null,
      disclosedMax: null,
    }),
  ];

  // Historical small buys for insider C so 250k is unusual
  for (let i = 0; i < 4; i++) {
    multiBuyer.push(
      makeBuy({
        id: `hist-c-${i}`,
        personKey: "insider:c",
        person: "Insider C",
        source: "insider",
        ticker: "OTHER",
        transactionDate: `2026-01-0${i + 1}`,
        disclosureDate: `2026-01-0${i + 1}`,
        exactValue: 40000,
        disclosedMin: null,
        disclosedMax: null,
      }),
    );
  }

  const singleBuyer: FeedRawTrade[] = [];
  for (let i = 0; i < 5; i++) {
    singleBuyer.push(
      makeBuy({
        id: `s${i}`,
        personKey: "congress:solo",
        person: "Solo",
        ticker: "AAA",
        transactionDate: `2026-08-0${i + 1}`,
        disclosureDate: `2026-08-1${i}`,
      }),
    );
  }

  const rows = rankFeedTickers([...multiBuyer, ...singleBuyer], seriesMap, {
    timeframe: "3m",
    now,
  });

  assert.ok(rows.length >= 1);
  const xyz = rows.find((r) => r.ticker === "XYZ");
  assert.ok(xyz, "XYZ should rank");
  assert.ok(xyz!.distinctBuyers >= 3);
  assert.ok(xyz!.activeSourceTypes.length >= 2);
  assert.ok(xyz!.buyersLast30d >= 3);
  assert.ok(xyz!.whyNoteworthy.length > 0);
  assert.ok(xyz!.components.activity_ratio != null);

  const aaa = rows.find((r) => r.ticker === "AAA");
  if (aaa && xyz) {
    // Multi-buyer cross-source declining ticker should outrank single-buyer flat
    assert.ok(
      xyz.score > aaa.score,
      `expected XYZ ${xyz.score} > AAA ${aaa.score}`,
    );
  }
}

function testWhyNoteworthy() {
  const c: FeedScoreComponents = {
    buy_occasions: 9,
    distinct_buyers: 5,
    repeat_buyers: 3,
    max_consecutive_streak: 4,
    sector_overlap_buyers: 2,
    downtrend_buys: 6,
    buyers_last_14d: 3,
    buyers_last_30d: 4,
    buys_last_14d: 5,
    buys_last_30d: 7,
    unusually_large_buys: 2,
    averaging_down_buyers: 2,
    new_position_buyers: 2,
    adding_buyers: 3,
    return_20d: -18,
    benchmark_return_20d: 1,
    relative_market_return_20d: -19,
    sector_benchmark_return_20d: -4,
    relative_sector_return_20d: -14,
    activity_ratio: 4.2,
    active_source_types: ["House", "Insider"],
    avg_recency_weight: 0.8,
  };
  const lines = buildWhyNoteworthy(c);
  assert.ok(lines.some((l) => l.includes("5 distinct")));
  assert.ok(lines.some((l) => l.includes("underperformed its sector")));
  assert.ok(lines.some((l) => l.includes("4.2×")));
  assert.ok(lines.some((l) => l.includes("House + Insider")));
}

testStreaks();
testPurchaseEstimate();
testRankingPrefersDistinctBuyers();
testWhyNoteworthy();
console.log("feedActivity refined rankFeed tests: ok");
