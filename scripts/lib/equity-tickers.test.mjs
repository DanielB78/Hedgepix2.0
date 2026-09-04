import { strict as assert } from "node:assert";
import {
  addDays,
  isLikelyListedEquity,
  normalizeTicker,
} from "./equity-tickers.mjs";

assert.equal(normalizeTicker(" aapl "), "AAPL");
assert.equal(normalizeTicker(""), null);
assert.equal(normalizeTicker(null), null);
assert.equal(normalizeTicker("--"), null);

assert.equal(isLikelyListedEquity("AAPL", "Apple Inc. - Common Stock"), true);
assert.equal(isLikelyListedEquity("BRK.B", "Berkshire Hathaway Class B"), true);
assert.equal(
  isLikelyListedEquity("CPT", "Camden Property Trust Common Stock"),
  true,
  "REIT common stock should remain eligible",
);

assert.equal(
  isLikelyListedEquity("SPY", "SPDR S&P 500 ETF Trust"),
  false,
  "ETFs must be excluded",
);
assert.equal(
  isLikelyListedEquity("HYG", "iShares iBoxx $ High Yield Corporate Bond ETF"),
  false,
);
assert.equal(
  isLikelyListedEquity("QQQ", "Invesco QQQ Trust, Series 1"),
  false,
);
assert.equal(
  isLikelyListedEquity("VTI", "VANGUARD TOTAL STOCK MARKET INDEX ADM"),
  false,
);

assert.equal(
  isLikelyListedEquity("GS", "Washington ST 5% Go Utx Due 08/01/30"),
  false,
  "municipal CUSIP-style rows must not hit Alpaca",
);
assert.equal(isLikelyListedEquity(null, "Apple"), false);
assert.equal(isLikelyListedEquity("TOO-LONG-TICKER", "Apple"), false);
assert.equal(isLikelyListedEquity("COLPAL", "COLGATE PALMOLIVE LTD."), false);
assert.equal(
  isLikelyListedEquity("T", "United States Treasury Note 4.25% due 2034"),
  false,
);
assert.equal(
  isLikelyListedEquity("GS", "Pittsburgh, CA Successor Agency"),
  false,
);

assert.equal(addDays("2026-08-20", 1), "2026-08-21");
assert.equal(addDays("2026-01-01", -30), "2025-12-02");

console.log("equity-tickers tests passed");
