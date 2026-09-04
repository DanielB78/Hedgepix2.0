import assert from "node:assert/strict";
import { memberSlug, amountRange } from "../normalize.js";
import {
  isKadoaStockTrade,
  normalizeOwner,
  normalizeTransactionType,
  toCongressTradeFromKadoa,
} from "../kadoa/normalize.js";
import {
  computeFiledCutoff,
  loadInsiderWatchStockTrades,
} from "../insiderwatch/load.js";
import { toCongressTradeFromInsiderWatch } from "../insiderwatch/normalize.js";
import { parseCsv } from "../insiderwatch/csv.js";
import {
  parseAmountRangeLabel,
  parseFlexibleDate,
  stableContentSourceId,
} from "../tradeIdentity.js";
import type { KadoaFiler, KadoaTrade } from "../kadoa/types.js";
import type { InsiderWatchCsvRow } from "../insiderwatch/types.js";

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
  assert.equal(parseFlexibleDate("9/2/2026"), "2026-09-02");
  assert.equal(parseFlexibleDate("08/13/2026"), "2026-08-13");
  assert.deepEqual(parseAmountRangeLabel("$1,001 - $15,000"), {
    low: 1001,
    high: 15000,
  });
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

function testCrossSourceIdentity() {
  const filer: KadoaFiler = {
    id: "house_jane_doe",
    full_name: "Jane Doe",
    chamber: "house",
    branch: "congress",
  };
  const kadoaTrade: KadoaTrade = {
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
  const fromKadoa = toCongressTradeFromKadoa(kadoaTrade, filer, "house");
  assert.match(fromKadoa.sourceId, /^trade:[a-f0-9]{32}$/);

  const iwRow: InsiderWatchCsvRow = {
    chamber: "house",
    member: "Jane Doe",
    member_slug: "jane-doe",
    ticker: "NVDA",
    asset: "NVIDIA Corp",
    action: "sell",
    amount_range: "$1,001 - $15,000",
    amount_min_usd: "1001",
    transaction_date: "08/01/2026",
    filed_date: "8/10/2026",
    disclosure_lag_days: "9",
    owner: "SP",
    filing_id: "houseFd-1",
  };
  const fromIw = toCongressTradeFromInsiderWatch(iwRow, 0);
  assert.equal(fromIw.sourceId, fromKadoa.sourceId);
  assert.equal(fromIw.transactionDate, "2026-08-01");
  assert.equal(fromIw.disclosureDate, "2026-08-10");
}

function testCutoff() {
  assert.equal(
    computeFiledCutoff({
      lastSuccessAt: "2026-09-04T12:00:00.000Z",
      overlapDays: 3,
      initialLookbackDays: 14,
    }),
    "2026-09-01",
  );
  assert.equal(
    computeFiledCutoff({
      lastSuccessAt: null,
      overlapDays: 3,
      initialLookbackDays: 14,
      now: new Date("2026-09-04T12:00:00Z"),
    }),
    "2026-08-21",
  );
}

function testCsvAndLoad() {
  const csv = `chamber,member,member_slug,ticker,asset,action,amount_range,amount_min_usd,transaction_date,filed_date,disclosure_lag_days,owner,filing_id
house,Jane Doe,jane-doe,AAPL,"Apple Inc. - Common Stock",buy,"$1,001 - $15,000",1001,08/13/2026,9/2/2026,20,,houseFd-1
house,Jane Doe,jane-doe,SPY,"SPDR S&P 500 ETF Trust",buy,"$1,001 - $15,000",1001,08/13/2026,9/2/2026,20,,houseFd-2
executive,Someone,someone,AAPL,"Apple Inc.",buy,"$1,001 - $15,000",1001,08/13/2026,9/2/2026,20,,oge-1
house,Old Trade,old-trade,MSFT,"Microsoft",sell,"$1,001 - $15,000",1001,01/01/2026,1/2/2026,1,,houseFd-3
`;
  const parsed = parseCsv(csv);
  assert.equal(parsed.length, 4);

  return loadInsiderWatchStockTrades({
    lastSuccessAt: "2026-09-04T00:00:00.000Z",
    overlapDays: 3,
    initialLookbackDays: 14,
    csvText: csv,
  }).then(({ trades, stats }) => {
    assert.equal(stats.rowsDownloaded, 4);
    assert.equal(stats.rowsAfterDateFilter, 3); // filed >= 2026-09-01
    assert.equal(stats.stockRowsRetained, 1);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].ticker, "AAPL");
    assert.equal(trades[0].transactionType, "purchase");
  });
}

function testStableIdHelper() {
  const a = stableContentSourceId({
    chamber: "house",
    member: "Jane Doe",
    ticker: "AAPL",
    transactionType: "purchase",
    amountLow: 1001,
    amountHigh: 15000,
    transactionDate: "2026-08-13",
    owner: null,
  });
  const b = stableContentSourceId({
    chamber: "house",
    member: "Jane Doe",
    memberSlug: "jane-doe",
    ticker: "AAPL",
    transactionType: "purchase",
    amountLow: 1001,
    amountHigh: 15000,
    transactionDate: "2026-08-13",
    owner: null,
  });
  assert.equal(a, b);
}

testNormalizeHelpers();
testKadoaStockFilter();
testCrossSourceIdentity();
testCutoff();
testStableIdHelper();
testCsvAndLoad()
  .then(() => {
    console.log("unit tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
