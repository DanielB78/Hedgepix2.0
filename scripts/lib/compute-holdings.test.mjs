import { strict as assert } from "node:assert";
import {
  applyTransaction,
  computeMemberHoldings,
  displayPositionRange,
  isCurrentHolding,
  isEligibleHoldingsTrade,
  resolveAmountRange,
} from "./compute-holdings.mjs";

function trade(overrides) {
  return {
    member: "Jane Doe",
    member_slug: "jane-doe",
    ticker: "AAPL",
    asset: "Apple Inc. Common Stock",
    is_listed_equity: true,
    transaction_type: "purchase",
    amount_low: 1000,
    amount_high: 15000,
    transaction_date: "2020-06-01",
    disclosure_date: "2020-07-01",
    ...overrides,
  };
}

assert.deepEqual(resolveAmountRange(1000, 15000), { low: 1000, high: 15000 });
assert.deepEqual(resolveAmountRange(null, 50000), { low: 50000, high: 50000 });
assert.equal(resolveAmountRange(null, null), null);

const acc = { positionLow: 0, positionHigh: 0 };
applyTransaction(acc, "purchase", { low: 1000, high: 15000 });
assert.equal(acc.positionLow, 1000);
assert.equal(acc.positionHigh, 15000);
applyTransaction(acc, "sale", { low: 1000, high: 15000 });
assert.equal(acc.positionLow, -14000);
assert.equal(acc.positionHigh, 14000);
assert.equal(isCurrentHolding(acc.positionLow, acc.positionHigh), false);

const open = computeMemberHoldings([
  trade({ amount_low: 50000, amount_high: 100000, transaction_date: "2024-01-01" }),
]);
assert.equal(open.length, 1);
assert.equal(open[0].positionLow, 50000);
assert.equal(open[0].positionHigh, 100000);

const soldOut = computeMemberHoldings([
  trade({ amount_low: 1000, amount_high: 15000, transaction_date: "2024-01-01" }),
  trade({
    transaction_type: "sale",
    amount_low: 1000,
    amount_high: 15000,
    transaction_date: "2024-06-01",
  }),
]);
assert.equal(soldOut.length, 0, "fully sold positions should disappear");

const partial = computeMemberHoldings([
  trade({ amount_low: 50000, amount_high: 100000, transaction_date: "2024-01-01" }),
  trade({
    transaction_type: "sale",
    amount_low: 1000,
    amount_high: 15000,
    transaction_date: "2024-06-01",
  }),
]);
assert.equal(partial.length, 1);
assert.equal(partial[0].positionLow, 35000);
assert.equal(partial[0].positionHigh, 99000);

assert.equal(
  isEligibleHoldingsTrade(
    trade({ asset: "Washington ST 5% Go Utx Due 08/01/30", is_listed_equity: false }),
  ),
  false,
  "bonds must be excluded",
);

assert.equal(
  isEligibleHoldingsTrade(trade({ transaction_date: "2011-12-31" })),
  false,
  "pre-2012 trades are excluded",
);

const deduped = computeMemberHoldings([
  trade({ amount_low: 1000, amount_high: 15000 }),
  trade({ amount_low: 1000, amount_high: 15000 }),
]);
assert.equal(deduped[0].positionLow, 2000);
assert.equal(deduped[0].positionHigh, 30000);

assert.deepEqual(displayPositionRange(-1000, 5000), { low: 0, high: 5000 });

console.log("compute-holdings tests passed");
