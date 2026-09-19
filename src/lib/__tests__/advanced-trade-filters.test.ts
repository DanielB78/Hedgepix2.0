import assert from "node:assert/strict";
import {
  EMPTY_ADVANCED_FILTERS,
  filterTrades,
  matchesMemberSector,
  matchesTickerSector,
  normalizeTransactionType,
  parseAdvancedTradeFilters,
  tradeMatchesAdvancedFilters,
  type AdvancedTradeFilters,
  type TradeFilterContext,
} from "../advancedTradeFilters";
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

function unit(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (err) {
    console.error(`FAIL — ${name}`);
    throw err;
  }
}

unit("normalizeTransactionType maps purchase/sale", () => {
  assert.equal(normalizeTransactionType("purchase"), "buy");
  assert.equal(normalizeTransactionType("Sale"), "sale");
  assert.equal(normalizeTransactionType("exchange"), "other");
});

unit("parseAdvancedTradeFilters from query string", () => {
  const f = parseAdvancedTradeFilters(
    new URLSearchParams(
      "tx=buys&sectors=Semiconductors,Cybersecurity&sectorSrc=both&overlap=yes&tickers=NVDA,AMD",
    ),
  );
  assert.equal(f.transaction, "buys");
  assert.deepEqual(f.nicheLabels, ["Semiconductors", "Cybersecurity"]);
  assert.equal(f.sectorSource, "both");
  assert.equal(f.overlap, "overlap");
  assert.deepEqual(f.tickers, ["NVDA", "AMD"]);
});

unit("transaction filter buys only", () => {
  const ctx: TradeFilterContext = {
    memberSectors: {},
    tradeSectorOverlaps: {},
    allowMemberSectors: true,
  };
  const filters: AdvancedTradeFilters = {
    ...EMPTY_ADVANCED_FILTERS,
    transaction: "buys",
  };
  const rows = [
    trade({ id: "1", transaction_type: "purchase" }),
    trade({ id: "2", transaction_type: "sale" }),
  ];
  assert.equal(filterTrades(rows, filters, ctx).map((t) => t.id).join(","), "1");
});

unit("ticker sector OR within group", () => {
  // NVDA has AI semiconductors etc in curated map — use a known ticker
  assert.equal(matchesTickerSector("AAPL", ["Consumer electronics"]), true);
  assert.equal(matchesTickerSector("AAPL", ["Banking"]), false);
});

unit("member sector match", () => {
  assert.equal(
    matchesMemberSector(["Cybersecurity", "Banking"], ["Cybersecurity"]),
    true,
  );
  assert.equal(matchesMemberSector(["Banking"], ["Cybersecurity"]), false);
});

unit("both sector source requires ticker AND member", () => {
  const ctx: TradeFilterContext = {
    memberSectors: {
      "jane-example": ["Cybersecurity", "Defense technology"],
    },
    tradeSectorOverlaps: {},
    allowMemberSectors: true,
  };
  const filters: AdvancedTradeFilters = {
    ...EMPTY_ADVANCED_FILTERS,
    nicheLabels: ["Cybersecurity", "Semiconductors", "AI semiconductors"],
    sectorSource: "both",
  };
  // NVDA is semiconductors; member has cybersecurity — both Technology-related selected labels
  const t = trade({ id: "1", ticker: "NVDA" });
  assert.equal(tradeMatchesAdvancedFilters(t, filters, ctx), true);

  const noMember = trade({ id: "2", member_slug: "unknown-person", ticker: "NVDA" });
  assert.equal(tradeMatchesAdvancedFilters(noMember, filters, ctx), false);
});

unit("overlap filter uses precomputed results", () => {
  const ctx: TradeFilterContext = {
    memberSectors: {},
    tradeSectorOverlaps: {
      "1": {
        has_sector_overlap: true,
        match_type: "direct",
        member_label: "Semiconductors",
        ticker_label: "Semiconductors",
        similarity: 1,
      },
    },
    allowMemberSectors: true,
  };
  const filters: AdvancedTradeFilters = {
    ...EMPTY_ADVANCED_FILTERS,
    overlap: "overlap",
  };
  assert.equal(
    tradeMatchesAdvancedFilters(trade({ id: "1" }), filters, ctx),
    true,
  );
  assert.equal(
    tradeMatchesAdvancedFilters(trade({ id: "2" }), filters, ctx),
    false,
  );
});

unit("AND across groups", () => {
  const ctx: TradeFilterContext = {
    memberSectors: { "jane-example": ["Semiconductors"] },
    tradeSectorOverlaps: {
      "1": {
        has_sector_overlap: true,
        match_type: "direct",
        member_label: "Semiconductors",
        ticker_label: "Semiconductors",
        similarity: 1,
      },
    },
    allowMemberSectors: true,
  };
  const filters: AdvancedTradeFilters = {
    transaction: "buys",
    nicheLabels: ["Semiconductors", "AI semiconductors"],
    sectorSource: "ticker",
    overlap: "overlap",
    members: [],
    tickers: ["NVDA"],
  };
  assert.equal(
    tradeMatchesAdvancedFilters(trade({ id: "1", ticker: "NVDA" }), filters, ctx),
    true,
  );
  assert.equal(
    tradeMatchesAdvancedFilters(
      trade({ id: "1", ticker: "NVDA", transaction_type: "sale" }),
      filters,
      ctx,
    ),
    false,
  );
});

unit("insiders disallow member sector source", () => {
  const ctx: TradeFilterContext = {
    memberSectors: { "jane-example": ["Cybersecurity"] },
    tradeSectorOverlaps: {},
    allowMemberSectors: false,
  };
  const filters: AdvancedTradeFilters = {
    ...EMPTY_ADVANCED_FILTERS,
    nicheLabels: ["Cybersecurity"],
    sectorSource: "member",
  };
  // Forced to ticker-only → NVDA does not have Cybersecurity
  assert.equal(
    tradeMatchesAdvancedFilters(trade({ id: "1", ticker: "NVDA" }), filters, ctx),
    false,
  );
});

console.log("advanced trade filter unit tests passed");
