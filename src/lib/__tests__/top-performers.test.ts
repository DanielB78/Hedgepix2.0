/**
 * Unit tests for Top Performers portfolio + top buys.
 * Run: npx tsx src/lib/__tests__/top-performers.test.ts
 */

import assert from "node:assert/strict";
import {
  dedupeSameDayBuys,
  parsePerformerPeriod,
  parsePerformerView,
  performerCutoffDate,
  performerPeriodLabel,
  rankPortfolioPeople,
  rankTopPerformingBuys,
} from "../topPerformers";

function testPeriods() {
  assert.equal(parsePerformerPeriod("1y"), "1y");
  assert.equal(parsePerformerPeriod("12m"), "1y");
  assert.equal(performerPeriodLabel("1m"), "1 Month");
  assert.equal(performerPeriodLabel("1y"), "1 Year");
  assert.equal(parsePerformerView("buys"), "buys");
  assert.equal(parsePerformerView(undefined), "portfolio");
  const cutoff = performerCutoffDate("1m");
  assert.match(cutoff, /^\d{4}-\d{2}-\d{2}$/);
}

function testDedupe() {
  const buys = [
    {
      key: "congress:a",
      name: "A",
      kind: "house" as const,
      memberSlug: "a",
      ticker: "XYZ",
      transactionDate: "2026-06-14",
    },
    {
      key: "congress:a",
      name: "A",
      kind: "house" as const,
      memberSlug: "a",
      ticker: "XYZ",
      transactionDate: "2026-06-14",
    },
    {
      key: "congress:a",
      name: "A",
      kind: "house" as const,
      memberSlug: "a",
      ticker: "XYZ",
      transactionDate: "2026-07-01",
    },
  ];
  const deduped = dedupeSameDayBuys(buys);
  assert.equal(deduped.length, 2);
}

function testPortfolioAndBuys() {
  const buys = [
    {
      key: "congress:b",
      name: "Senator B",
      kind: "senate" as const,
      memberSlug: "b",
      ticker: "AAA",
      transactionDate: "2026-06-01",
    },
    {
      key: "congress:a",
      name: "Rep A",
      kind: "house" as const,
      memberSlug: "a",
      ticker: "XYZ",
      transactionDate: "2026-06-14",
    },
    {
      key: "congress:a",
      name: "Rep A",
      kind: "house" as const,
      memberSlug: "a",
      ticker: "BBB",
      transactionDate: "2026-07-01",
    },
    {
      key: "congress:missing",
      name: "No Price",
      kind: "house" as const,
      memberSlug: "m",
      ticker: "GONE",
      transactionDate: "2026-06-01",
    },
  ];

  const entry = new Map<string, number>([
    ["XYZ|2026-06-14", 82.1],
    ["BBB|2026-07-01", 50],
    ["AAA|2026-06-01", 100],
  ]);
  const latest = new Map<string, number>([
    ["XYZ", 116.3],
    ["BBB", 40],
    ["AAA", 110],
  ]);
  const latestDates = new Map<string, string>([
    ["XYZ", "2026-09-18"],
    ["BBB", "2026-09-18"],
    ["AAA", "2026-09-18"],
  ]);

  const people = rankPortfolioPeople(buys, entry, latest, latestDates);
  assert.equal(people.length, 2);
  assert.equal(people[0]!.name, "Rep A");
  assert.equal(people[1]!.name, "Senator B");
  assert.ok(people[0]!.medianReturnPct !== undefined);
  assert.ok(people[0]!.worstReturnPct != null);
  assert.ok(people[0]!.bestReturnPct != null);

  const topBuys = rankTopPerformingBuys(buys, entry, latest, latestDates, 10);
  assert.equal(topBuys.length, 3);
  assert.equal(topBuys[0]!.ticker, "XYZ");
  assert.ok(topBuys[0]!.returnPct > 40);
  assert.equal(topBuys[0]!.sourceLabel, "House");
  assert.match(String(topBuys[0]!.referencePrice), /82\.1/);
  // Missing price ticker excluded (not treated as 0%)
  assert.ok(!topBuys.some((b) => b.ticker === "GONE"));
}

testPeriods();
testDedupe();
testPortfolioAndBuys();
console.log("top-performers.test.ts: ok");
