import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import {
  assessAbnormality,
  computeEventWindow,
  evaluateTickerMove,
  measureEventMove,
  typicalHistoricalAbsMovePct,
} from "../news/abnormalMoves.js";
import type { AlpacaHourlyBar } from "../news/alpacaHourlyBars.js";
import {
  articleNaicsCodes,
  resetSp500NaicsMappingCache,
  tickersForNaicsCodes,
  loadSp500NaicsMapping,
} from "../news/sp500NaicsMapping.js";

function testEventWindow() {
  const published = new Date("2026-09-10T10:00:00Z");
  const early = computeEventWindow(
    published,
    new Date("2026-09-10T16:00:00Z"),
  );
  assert.equal(early.windowHours, 6);
  assert.equal(early.windowComplete, false);
  assert.equal(early.windowEnd.toISOString(), "2026-09-10T16:00:00.000Z");

  const late = computeEventWindow(
    published,
    new Date("2026-09-12T10:00:00Z"),
  );
  assert.equal(late.windowComplete, true);
  assert.equal(late.windowHours, 24);
  assert.equal(late.windowEnd.toISOString(), "2026-09-11T10:00:00.000Z");
}

function testMeasureUsesNextAvailableBar() {
  const bars: AlpacaHourlyBar[] = [
    { t: Date.parse("2026-09-10T13:00:00Z"), o: 100, h: 101, l: 99, c: 100.5, v: 1 },
    { t: Date.parse("2026-09-10T14:00:00Z"), o: 100.5, h: 102, l: 100, c: 101, v: 1 },
    { t: Date.parse("2026-09-10T15:00:00Z"), o: 101, h: 105, l: 101, c: 104, v: 1 },
  ];
  const m = measureEventMove(
    bars,
    Date.parse("2026-09-10T12:30:00Z"),
    Date.parse("2026-09-10T15:30:00Z"),
  );
  assert.ok(m);
  assert.equal(m!.startPrice, 100);
  assert.equal(m!.endPrice, 104);
  assert.equal(m!.spanBars, 2);
  assert.ok(Math.abs(m!.eventReturnPct - 4) < 1e-9);
}

function testTypicalMatchesSpan() {
  const start = Date.parse("2026-09-01T14:00:00Z");
  const bars: AlpacaHourlyBar[] = [];
  for (let i = 0; i < 40; i++) {
    bars.push({
      t: start + i * 3600_000,
      o: 100,
      h: 110,
      l: 90,
      c: 100 + (i % 3 === 2 ? 2 : 0.5),
      v: 1,
    });
  }
  const eventStart = start + 30 * 3600_000;
  assert.ok((typicalHistoricalAbsMovePct(bars, eventStart, 0) ?? 0) > 0);
  assert.ok((typicalHistoricalAbsMovePct(bars, eventStart, 2) ?? 0) > 0);
}

function testAbnormalMultiplier() {
  assert.equal(assessAbnormality(5, 1, 2.5).isAbnormal, true);
  assert.equal(assessAbnormality(2, 1, 2.5).isAbnormal, false);
}

function testEvaluateEndToEnd() {
  const published = new Date("2026-09-10T14:00:00Z");
  const bars: AlpacaHourlyBar[] = [];
  for (let i = 0; i < 200; i++) {
    bars.push({
      t: published.getTime() - (200 - i) * 3600_000,
      o: 100,
      h: 100.3,
      l: 99.7,
      c: 100.2,
      v: 1,
    });
  }
  bars.push({ t: published.getTime(), o: 100, h: 110, l: 100, c: 105, v: 1 });
  bars.push({
    t: published.getTime() + 3600_000,
    o: 105,
    h: 112,
    l: 105,
    c: 110,
    v: 1,
  });
  bars.push({
    t: published.getTime() + 2 * 3600_000,
    o: 110,
    h: 120,
    l: 110,
    c: 118,
    v: 1,
  });
  const now = new Date(published.getTime() + 2.5 * 3600_000);
  const result = evaluateTickerMove(bars, published, now, 2.5);
  assert.ok(result.measurement);
  assert.ok(result.measurement!.eventReturnPct > 10);
  assert.equal(result.assessment.isAbnormal, true);
}

function testTickerMappingFromFixture() {
  const tmp = resolve("/tmp/sp500-naics-test.json");
  writeFileSync(
    tmp,
    JSON.stringify({
      by_naics_code: {
        "51121": [
          { ticker: "MSFT", company: "Microsoft", rank: 1 },
          { ticker: "ORCL", company: "Oracle", rank: 1 },
        ],
        "52211": [
          { ticker: "JPM", company: "JPMorgan", rank: 1 },
          { ticker: "MSFT", company: "Microsoft", rank: 2 },
        ],
      },
    }),
  );
  resetSp500NaicsMappingCache();
  const mapping = loadSp500NaicsMapping(tmp);
  const tickers = tickersForNaicsCodes(["51121", "52211"], mapping);
  assert.deepEqual([...tickers.keys()].sort(), ["JPM", "MSFT", "ORCL"]);
  assert.deepEqual(tickers.get("MSFT")!.sort(), ["51121", "52211"]);
  unlinkSync(tmp);
  resetSp500NaicsMappingCache();
}

function testArticleCodes() {
  assert.deepEqual(
    articleNaicsCodes({
      sector_1_code: "51121",
      sector_2_code: "33411",
      sector_3_code: "51121",
    }),
    ["51121", "33411"],
  );
}

function testRealMappingLoads() {
  resetSp500NaicsMappingCache();
  const mapping = loadSp500NaicsMapping();
  assert.ok(mapping.size > 100);
  const soft = tickersForNaicsCodes(["51321"], mapping);
  assert.ok(soft.size >= 1);
  assert.ok([...soft.keys()].includes("MSFT"));
}

testEventWindow();
testMeasureUsesNextAvailableBar();
testTypicalMatchesSpan();
testAbnormalMultiplier();
testEvaluateEndToEnd();
testTickerMappingFromFixture();
testArticleCodes();
testRealMappingLoads();
console.log("abnormal-moves unit tests passed");
