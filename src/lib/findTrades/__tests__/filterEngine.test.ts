/**
 * Unit tests for Find Trades filter engine + trend helpers.
 * Run: npx tsx src/lib/findTrades/__tests__/filterEngine.test.ts
 */

import assert from "node:assert/strict";
import {
  evaluateCondition,
  filterFindTrades,
  tradeMatchesQuery,
} from "../filterEngine";
import {
  classifyTrend,
  initEmptyMetrics,
  windowReturn,
  computeDerivedMetrics,
  type PriceSeries,
} from "../derivedMetrics";
import type { FindTradeRow, FindTradesQuery } from "../types";

function baseRow(overrides: Partial<FindTradeRow> = {}): FindTradeRow {
  return {
    ...initEmptyMetrics({
      id: "t1",
      source: "senate",
      person: "Jane Smith",
      personKey: "congress:jane-smith",
      memberSlug: "jane-smith",
      chamber: "senate",
      state: "CA",
      officerTitle: null,
      ticker: "NVDA",
      company: "NVIDIA",
      transactionType: "buy",
      transactionDate: "2026-04-03",
      disclosureDate: "2026-04-10",
      disclosedMin: 50001,
      disclosedMax: 100000,
      amountRange: "$50,001–$100,000",
      exactValue: null,
      exactShares: null,
      exactPrice: null,
      tickerGeneralSector: "Technology",
      tickerIndustryLabels: ["AI semiconductors"],
      memberIndustryLabels: ["Cybersecurity"],
      memberGeneralSectors: ["Technology"],
      hasSectorOverlap: true,
      overlapMatchType: "direct",
      overlapSimilarity: 0.92,
      overlapMemberLabel: "Cybersecurity",
      overlapTickerLabel: "AI semiconductors",
      filingUrl: null,
    }),
    ...overrides,
  };
}

function testFilterBasics() {
  const row = baseRow();
  assert.equal(
    evaluateCondition(row, {
      id: "1",
      fieldId: "source",
      operator: "equals",
      value: "senate",
    }),
    true,
  );
  assert.equal(
    evaluateCondition(row, {
      id: "2",
      fieldId: "source",
      operator: "equals",
      value: "house",
    }),
    false,
  );
  assert.equal(
    evaluateCondition(row, {
      id: "3",
      fieldId: "disclosed_min",
      operator: "gte",
      value: 50000,
    }),
    true,
  );
  assert.equal(
    evaluateCondition(row, {
      id: "4",
      fieldId: "ticker",
      operator: "equals",
      value: "nvda",
    }),
    true,
  );
  assert.equal(
    evaluateCondition(row, {
      id: "5",
      fieldId: "exact_price",
      operator: "gte",
      value: 0,
    }),
    false,
    "null exact price must not match numeric filter",
  );
  assert.equal(
    evaluateCondition(row, {
      id: "6",
      fieldId: "exact_price",
      operator: "is_not_set",
      value: null,
    }),
    true,
  );
}

function testAndOrQuery() {
  const rows = [
    baseRow({ id: "a", ticker: "NVDA" }),
    baseRow({ id: "b", ticker: "AMD", source: "house", chamber: "house" }),
    baseRow({
      id: "c",
      ticker: "AAPL",
      source: "senate",
      transactionType: "sale",
    }),
  ];

  const query: FindTradesQuery = {
    nodes: [
      {
        type: "condition",
        condition: {
          id: "s",
          fieldId: "source",
          operator: "one_of",
          value: ["house", "senate"],
        },
      },
      {
        type: "or_group",
        id: "or1",
        conditions: [
          {
            id: "t1",
            fieldId: "ticker",
            operator: "equals",
            value: "NVDA",
          },
          {
            id: "t2",
            fieldId: "ticker",
            operator: "equals",
            value: "AMD",
          },
        ],
      },
      {
        type: "condition",
        condition: {
          id: "buy",
          fieldId: "transaction_type",
          operator: "equals",
          value: "buy",
        },
      },
    ],
  };

  const matched = filterFindTrades(rows, query);
  assert.deepEqual(
    matched.map((r) => r.id).sort(),
    ["a", "b"],
  );
  assert.equal(tradeMatchesQuery(rows[2]!, query), false);
}

function testWindowedReturnFilter() {
  const row = baseRow({
    returnBefore: { "20": -14.2, "5": -3 },
  });
  assert.equal(
    evaluateCondition(row, {
      id: "r",
      fieldId: "return_before",
      operator: "lte",
      value: -10,
      params: { window: "20" },
    }),
    true,
  );
  assert.equal(
    evaluateCondition(row, {
      id: "r2",
      fieldId: "return_before",
      operator: "lte",
      value: -10,
      params: { window: "5" },
    }),
    false,
  );
}

function testTrendHelpers() {
  assert.equal(classifyTrend(5), "up");
  assert.equal(classifyTrend(-2), "down");
  assert.equal(classifyTrend(0.1), "flat");
  assert.equal(classifyTrend(null), null);

  const series: PriceSeries = [
    { date: "2026-01-01", close: 100 },
    { date: "2026-01-10", close: 90 },
    { date: "2026-01-20", close: 80 },
    { date: "2026-01-30", close: 85 },
  ];
  const before = windowReturn(series, "2026-01-20", 20, "before");
  assert.ok(before != null && before < 0);
  const after = windowReturn(series, "2026-01-20", 10, "after");
  assert.ok(after != null && after > 0);
}

function testDerivedActivity() {
  const rows = [
    baseRow({
      id: "b1",
      transactionDate: "2026-01-10",
      disclosureDate: "2026-01-12",
    }),
    baseRow({
      id: "b2",
      transactionDate: "2026-01-20",
      disclosureDate: "2026-01-22",
    }),
    baseRow({
      id: "b3",
      transactionDate: "2026-02-01",
      disclosureDate: "2026-02-03",
    }),
  ];
  const series = new Map<string, PriceSeries>([
    [
      "NVDA",
      [
        { date: "2025-12-01", close: 100 },
        { date: "2026-01-10", close: 80 },
        { date: "2026-01-20", close: 70 },
        { date: "2026-02-01", close: 65 },
        { date: "2026-02-10", close: 90 },
      ],
    ],
  ]);
  const latest = new Map([["NVDA", 90]]);
  computeDerivedMetrics(rows, series, latest);

  const last = rows[2]!;
  assert.ok((last.daysSincePreviousBuy ?? 0) > 0);
  assert.equal(last.consecutiveBuys, 3);
  assert.equal(last.additionalBuyAfterDecline, true);
  assert.ok((last.priorBuys["30"] ?? 0) >= 2);
  assert.ok(last.returnSincePreviousBuy != null);
  assert.ok((last.returnSincePreviousBuy ?? 0) < 0);
}

testFilterBasics();
testAndOrQuery();
testWindowedReturnFilter();
testTrendHelpers();
testDerivedActivity();
console.log("findTrades filterEngine tests: ok");
