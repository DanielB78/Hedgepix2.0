import assert from "node:assert/strict";
import { groupTradesByDisclosure } from "../groupTrades";
import { rankTrending } from "../trending";
import type { CongressTrade } from "../types";

function trade(
  partial: Partial<CongressTrade> & Pick<CongressTrade, "id">,
): CongressTrade {
  return {
    member: "Nancy Pelosi",
    member_slug: "nancy-pelosi",
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
    filing_portal: "https://example.com",
    first_seen_at: "2026-08-29T00:00:00Z",
    last_seen_at: "2026-08-29T00:00:00Z",
    ...partial,
  };
}

function testGrouping() {
  const groups = groupTradesByDisclosure([
    trade({ id: "1", ticker: "NVDA", transaction_type: "purchase" }),
    trade({ id: "2", ticker: "AAPL", transaction_type: "purchase" }),
    trade({ id: "3", ticker: "MSFT", transaction_type: "sale" }),
    trade({
      id: "4",
      member: "John Smith",
      member_slug: "john-smith",
      ticker: "NVDA",
      disclosure_date: "2026-08-29",
    }),
    trade({
      id: "5",
      ticker: "GOOG",
      disclosure_date: "2026-08-28",
      transaction_type: "sale",
    }),
  ]);

  assert.equal(groups.length, 3);
  const pelosiAug29 = groups.find((g) => g.key === "nancy-pelosi|2026-08-29");
  assert.ok(pelosiAug29);
  assert.equal(pelosiAug29!.trades.length, 3);
  assert.equal(pelosiAug29!.purchaseCount, 2);
  assert.equal(pelosiAug29!.saleCount, 1);
}

function testTrendingDistinctMembers() {
  const ranked = rankTrending([
    // NVDA: 2 members, 4 trades
    {
      ticker: "NVDA",
      asset: "NVIDIA",
      transaction_type: "purchase",
      member_slug: "a",
      disclosure_date: "2026-08-29",
    },
    {
      ticker: "NVDA",
      asset: "NVIDIA",
      transaction_type: "purchase",
      member_slug: "a",
      disclosure_date: "2026-08-28",
    },
    {
      ticker: "NVDA",
      asset: "NVIDIA",
      transaction_type: "sale",
      member_slug: "b",
      disclosure_date: "2026-08-27",
    },
    {
      ticker: "NVDA",
      asset: "NVIDIA",
      transaction_type: "sale",
      member_slug: "b",
      disclosure_date: "2026-08-26",
    },
    // MSFT: 3 members, 3 trades — should rank first
    {
      ticker: "MSFT",
      asset: "Microsoft",
      transaction_type: "purchase",
      member_slug: "x",
      disclosure_date: "2026-08-20",
    },
    {
      ticker: "MSFT",
      asset: "Microsoft",
      transaction_type: "purchase",
      member_slug: "y",
      disclosure_date: "2026-08-21",
    },
    {
      ticker: "MSFT",
      asset: "Microsoft",
      transaction_type: "sale",
      member_slug: "z",
      disclosure_date: "2026-08-22",
    },
  ]);

  assert.equal(ranked[0]!.ticker, "MSFT");
  assert.equal(ranked[0]!.uniqueMembers, 3);
  assert.equal(ranked[0]!.totalTrades, 3);
  assert.equal(ranked[0]!.buyMembers, 2);
  assert.equal(ranked[0]!.sellMembers, 1);

  assert.equal(ranked[1]!.ticker, "NVDA");
  assert.equal(ranked[1]!.uniqueMembers, 2);
  assert.equal(ranked[1]!.totalTrades, 4);
  assert.equal(ranked[1]!.buyMembers, 1);
  assert.equal(ranked[1]!.sellMembers, 1);
}

testGrouping();
testTrendingDistinctMembers();
console.log("frontend unit tests passed");
