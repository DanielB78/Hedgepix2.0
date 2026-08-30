import { strict as assert } from "node:assert";
import { formatUpdateSummary, toBarRows } from "./sync-stock-prices.mjs";

const rows = toBarRows("NVDA", [
  { t: "2026-08-20T04:00:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
  { t: "2026-08-20T04:00:00Z", o: 9, h: 9, l: 9, c: 9, v: 99 },
  { t: "2026-08-21T04:00:00Z", o: 2, h: 3, l: 1, c: 2.5, v: 20 },
]);
assert.equal(rows.length, 2);
assert.equal(rows[0].ticker, "NVDA");
assert.equal(rows[0].bar_date, "2026-08-20");
assert.equal(rows[0].close, 1.5);
assert.equal(rows[1].bar_date, "2026-08-21");
assert.equal(rows[0].source, "alpaca_iex");

const text = formatUpdateSummary({
  trades: {
    status: "SUCCESS",
    rowsReceived: 16,
    rowsUpserted: 16,
    tradeCountAfter: 100,
    houseReceived: 12,
    senateReceived: 4,
  },
  prices: {
    status: "SUCCESS",
    tickersChecked: 18,
    tickersUpdated: 15,
    newDailyBars: 93,
    skippedUnsupported: 3,
    skippedNoHistory: 0,
    errors: 0,
  },
});
assert.match(text, /HOUSE trades in batch: 12/);
assert.match(text, /SENATE trades in batch: 4/);
assert.match(text, /Tickers checked: 18/);
assert.match(text, /New daily bars: 93/);
assert.match(text, /Skipped unsupported assets: 3/);

const failedPrices = formatUpdateSummary({
  trades: { status: "SUCCESS", rowsReceived: 2, rowsUpserted: 2 },
  prices: {
    status: "FAILED",
    tickersChecked: 1,
    tickersUpdated: 0,
    newDailyBars: 0,
    skippedUnsupported: 0,
    skippedNoHistory: 0,
    errors: 1,
    errorMessages: ["Alpaca HTTP 401"],
  },
});
assert.match(failedPrices, /Congress trades: SUCCESS/);
assert.match(failedPrices, /Stock prices: FAILED/);
assert.doesNotMatch(
  failedPrices,
  /Congressional data was stored; price ingest did not roll back trades.\nSupabase successfully updated/,
);

console.log("sync-stock-prices tests passed");
