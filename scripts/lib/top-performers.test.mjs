import assert from "node:assert/strict";
import {
  parsePerformerPeriod,
  performerCutoffDate,
  rankBuyPerformers,
} from "../../src/lib/topPerformers.ts";

assert.equal(parsePerformerPeriod("6m"), "6m");
assert.equal(parsePerformerPeriod("month"), "1m");
assert.equal(parsePerformerPeriod(undefined), "2026");
assert.equal(performerCutoffDate("2026"), "2026-01-01");

const ranked = rankBuyPerformers(
  [
    {
      key: "ceo:alice",
      name: "Alice",
      kind: "ceo",
      memberSlug: null,
      ticker: "AAA",
      transactionDate: "2026-01-10",
    },
    {
      key: "congress:bob",
      name: "Bob",
      kind: "senate",
      memberSlug: "bob",
      ticker: "BBB",
      transactionDate: "2026-01-10",
    },
    {
      key: "congress:bob",
      name: "Bob",
      kind: "senate",
      memberSlug: "bob",
      ticker: "CCC",
      transactionDate: "2026-02-01",
    },
  ],
  new Map([
    ["AAA|2026-01-10", 100],
    ["BBB|2026-01-10", 50],
    ["CCC|2026-02-01", 200],
  ]),
  new Map([
    ["AAA", 110],
    ["BBB", 75],
    ["CCC", 180],
  ]),
  5,
);

assert.equal(ranked[0].name, "Bob");
assert.ok(Math.abs(ranked[0].avgReturnPct - 20) < 1e-9);
assert.equal(ranked[1].name, "Alice");
assert.ok(Math.abs(ranked[1].avgReturnPct - 10) < 1e-9);

console.log("topPerformers unit tests passed");
