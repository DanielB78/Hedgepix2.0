import assert from "node:assert/strict";
import {
  overlapActivityAsTrending,
  rankSectorOverlapActivity,
} from "../sectorOverlapActivity";
import type { SectorOverlapResult } from "../sectorOverlap";
import type { CongressTrade } from "../types";

function trade(
  partial: Partial<CongressTrade> & Pick<CongressTrade, "id">,
): CongressTrade {
  return {
    member: "Jane Example",
    member_slug: "jane-example",
    chamber: "house",
    state: "CA",
    ticker: "NVDA",
    asset: "NVIDIA",
    transaction_type: "purchase",
    amount_low: 1001,
    amount_high: 15000,
    amount_range: "$1,001 - $15,000",
    transaction_date: "2026-08-01",
    disclosure_date: "2026-08-29",
    est_price: null,
    recent_price: null,
    recent_price_date: null,
    perf_pct: null,
    realized_return_pct: null,
    outcome: null,
    filing_portal: null,
    first_seen_at: "2026-08-29T00:00:00Z",
    last_seen_at: "2026-08-29T00:00:00Z",
    ...partial,
  };
}

function overlap(
  partial?: Partial<SectorOverlapResult>,
): SectorOverlapResult {
  return {
    has_sector_overlap: true,
    match_type: "direct",
    member_label: "AI semiconductors",
    ticker_label: "AI semiconductors",
    similarity: 1,
    ...partial,
  };
}

function unit(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (err) {
    console.error(`FAIL — ${name}`);
    throw err;
  }
}

unit("counts distinct member+ticker+date occasions", () => {
  const overlaps = {
    a1: overlap(),
    a2: overlap(), // same member/ticker/date as a1 → one occasion
    a3: overlap(),
    b1: overlap(),
    c1: overlap({ has_sector_overlap: false }),
  };
  const rows = rankSectorOverlapActivity(
    [
      trade({
        id: "a1",
        member_slug: "a",
        member: "A",
        ticker: "NVDA",
        transaction_date: "2026-08-03",
      }),
      trade({
        id: "a2",
        member_slug: "a",
        member: "A",
        ticker: "NVDA",
        transaction_date: "2026-08-03",
      }),
      trade({
        id: "a3",
        member_slug: "a",
        member: "A",
        ticker: "NVDA",
        transaction_date: "2026-08-10",
      }),
      trade({
        id: "b1",
        member_slug: "b",
        member: "B",
        ticker: "NVDA",
        transaction_date: "2026-08-10",
      }),
      trade({
        id: "c1",
        member_slug: "c",
        member: "C",
        ticker: "NVDA",
        transaction_date: "2026-08-11",
      }),
    ],
    overlaps,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.ticker, "NVDA");
  assert.equal(rows[0]!.overlapBuyOccasions, 3);
  assert.equal(rows[0]!.uniqueMembers, 2);
});

unit("ignores sales even with overlap", () => {
  const overlaps = { s1: overlap() };
  const rows = rankSectorOverlapActivity(
    [
      trade({
        id: "s1",
        transaction_type: "sale",
        ticker: "MSFT",
      }),
    ],
    overlaps,
  );
  assert.equal(rows.length, 0);
});

unit("ranks by occasions then members then recency", () => {
  const overlaps = {
    n1: overlap(),
    n2: overlap(),
    n3: overlap(),
    m1: overlap(),
    m2: overlap(),
  };
  const rows = rankSectorOverlapActivity(
    [
      trade({
        id: "n1",
        member_slug: "a",
        ticker: "NVDA",
        transaction_date: "2026-08-01",
      }),
      trade({
        id: "n2",
        member_slug: "a",
        ticker: "NVDA",
        transaction_date: "2026-08-02",
      }),
      trade({
        id: "n3",
        member_slug: "b",
        ticker: "NVDA",
        transaction_date: "2026-08-03",
      }),
      trade({
        id: "m1",
        member_slug: "d",
        ticker: "MSFT",
        transaction_date: "2026-08-10",
      }),
      trade({
        id: "m2",
        member_slug: "e",
        ticker: "MSFT",
        transaction_date: "2026-08-11",
      }),
    ],
    overlaps,
  );
  assert.deepEqual(
    rows.map((r) => r.ticker),
    ["NVDA", "MSFT"],
  );
  assert.equal(rows[0]!.overlapBuyOccasions, 3);
  assert.equal(rows[1]!.overlapBuyOccasions, 2);
});

unit("adapts to trending ticker shape", () => {
  const t = overlapActivityAsTrending({
    ticker: "NVDA",
    asset: "NVIDIA",
    overlapBuyOccasions: 7,
    uniqueMembers: 4,
    latestPurchaseDate: "2026-08-10",
    occasions: [],
  });
  assert.equal(t.totalTrades, 7);
  assert.equal(t.uniqueMembers, 4);
});

console.log("sector overlap activity unit tests passed");
