import assert from "node:assert/strict";
import { calculateDateWindow } from "../update.js";
import { toCongressTrade, memberSlug, amountRange } from "../normalize.js";
import type { UpstreamTransaction } from "../types.js";

function testDateWindow() {
  const now = new Date("2026-08-29T12:00:00Z");

  const first = calculateDateWindow({
    lastSuccessAt: null,
    initialBackfillDays: 90,
    syncOverlapDays: 7,
    now,
  });
  assert.equal(first.toDate, "2026-08-29");
  assert.equal(first.fromDate, "2026-05-31");

  const later = calculateDateWindow({
    lastSuccessAt: "2026-08-29T10:00:00.000Z",
    initialBackfillDays: 90,
    syncOverlapDays: 7,
    now,
  });
  assert.equal(later.fromDate, "2026-08-22");
  assert.equal(later.toDate, "2026-08-29");
}

function testNormalize() {
  const upstream: UpstreamTransaction = {
    id: "abc123deadbeef",
    politician: "Jane Doe",
    transaction_date: "2026-08-01",
    filing_date: "2026-08-10",
    ticker: "NVDA",
    asset_name: "NVIDIA Corp",
    asset_type: "Stock",
    type: "buy",
    amount_min: 1001,
    amount_max: 15000,
    owner: "self",
  };

  const trade = toCongressTrade(upstream, "house");
  assert.equal(trade.sourceId, "house:abc123deadbeef");
  assert.equal(trade.chamber, "house");
  assert.equal(trade.member, "Jane Doe");
  assert.equal(trade.transactionType, "purchase");
  assert.equal(trade.amountLow, 1001);
  assert.equal(trade.amountHigh, 15000);
  assert.equal(trade.disclosureDate, "2026-08-10");
  assert.equal(memberSlug("Jane Doe"), "jane-doe");
  assert.equal(amountRange(1001, 15000), "$1,001 - $15,000");

  const sell = toCongressTrade({ ...upstream, type: "sell", id: "x" }, "senate");
  assert.equal(sell.sourceId, "senate:x");
  assert.equal(sell.transactionType, "sale");
}

testDateWindow();
testNormalize();
console.log("unit tests passed");
