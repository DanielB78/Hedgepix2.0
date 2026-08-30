import { strict as assert } from "node:assert";
import {
  addDays,
  isLikelyListedEquity,
  normalizeTicker,
} from "./equity-tickers.mjs";

assert.equal(normalizeTicker(" aapl "), "AAPL");
assert.equal(normalizeTicker(""), null);
assert.equal(normalizeTicker(null), null);

assert.equal(isLikelyListedEquity("AAPL", "Apple Inc. - Common Stock"), true);
assert.equal(isLikelyListedEquity("BRK.B", "Berkshire Hathaway Class B"), true);
assert.equal(isLikelyListedEquity("SPY", "SPDR S&P 500 ETF Trust"), true);
assert.equal(
  isLikelyListedEquity("HYG", "iShares iBoxx $ High Yield Corporate Bond ETF"),
  true,
  "listed bond ETFs should be priced",
);
assert.equal(
  isLikelyListedEquity("IEF", "iShares 7-10 Year Treasury Bond ETF"),
  true,
);
assert.equal(
  isLikelyListedEquity("GBIL", "Goldman Sachs Access Treasury 0-1 Year ETF"),
  true,
);
assert.equal(
  isLikelyListedEquity("CPT", "Camden Property Trust Common Stock"),
  true,
  "\"ust \" must not match Trust",
);
assert.equal(
  isLikelyListedEquity(
    "FTGC",
    "First Trust Global Tactical Commodity Strategy Fund",
  ),
  true,
);
assert.equal(
  isLikelyListedEquity(
    "USIG",
    "iShares Broad USD Investment Grade Corporate Bond",
  ),
  true,
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
