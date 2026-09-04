import assert from "node:assert/strict";
import { memberSlug, amountRange } from "../normalize.js";
import {
  isKadoaStockTrade,
  normalizeOwner,
  normalizeTransactionType,
  toCongressTradeFromKadoa,
} from "../kadoa/normalize.js";
import type { KadoaFiler, KadoaTrade } from "../kadoa/types.js";

function alwaysEquity(_ticker: string | null, _asset: string | null) {
  return Boolean(_ticker);
}

function neverEquity() {
  return false;
}

function testNormalizeHelpers() {
  assert.equal(memberSlug("Jane Doe"), "jane-doe");
  assert.equal(amountRange(1001, 15000), "$1,001 - $15,000");
  assert.equal(normalizeOwner("SP"), "spouse");
  assert.equal(normalizeOwner("JT"), "joint");
  assert.equal(normalizeOwner("DC"), "child");
  assert.equal(normalizeTransactionType("Sale (Partial)"), "sale");
  assert.equal(normalizeTransactionType("Exchange"), null);
}

function testKadoaStockFilter() {
  const stock: KadoaTrade = {
    id: "t1",
    ticker: "AAPL",
    asset_name: "Apple Inc Common Stock",
    asset_type: "ST",
    transaction_type: "Purchase",
    transaction_date: "2024-01-01",
    filing_date: "2024-01-10",
  };
  assert.equal(isKadoaStockTrade(stock, alwaysEquity), true);

  const etf: KadoaTrade = {
    ...stock,
    id: "t2",
    ticker: "SPY",
    asset_name: "SPDR S&P 500 ETF Trust",
    asset_type: "ST",
  };
  assert.equal(isKadoaStockTrade(etf, neverEquity), false);

  const bond: KadoaTrade = {
    ...stock,
    id: "t3",
    ticker: "GS",
    asset_name: "Municipal Bond",
    asset_type: "Municipal Security",
  };
  assert.equal(isKadoaStockTrade(bond, alwaysEquity), false);

  const exchange: KadoaTrade = {
    ...stock,
    id: "t4",
    transaction_type: "Exchange",
  };
  assert.equal(isKadoaStockTrade(exchange, alwaysEquity), false);
}

function testKadoaNormalize() {
  const filer: KadoaFiler = {
    id: "house_jane_doe",
    full_name: "Jane Doe",
    chamber: "house",
    branch: "congress",
  };
  const trade: KadoaTrade = {
    id: "house_1_t0",
    ticker: "NVDA",
    asset_name: "NVIDIA Corp",
    asset_type: "ST",
    transaction_type: "Sale (Full)",
    amount_range_low: 1001,
    amount_range_high: 15000,
    transaction_date: "2026-08-01",
    filing_date: "2026-08-10",
    owner: "SP",
    source_id: "house_clerk",
  };
  const out = toCongressTradeFromKadoa(trade, filer, "house");
  assert.equal(out.sourceId, "kadoa:house_1_t0");
  assert.equal(out.chamber, "house");
  assert.equal(out.member, "Jane Doe");
  assert.equal(out.transactionType, "sale");
  assert.equal(out.owner, "spouse");
  assert.equal(out.ticker, "NVDA");
}

testNormalizeHelpers();
testKadoaStockFilter();
testKadoaNormalize();
console.log("unit tests passed");
