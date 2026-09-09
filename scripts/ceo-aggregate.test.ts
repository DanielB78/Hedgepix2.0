import assert from "node:assert/strict";
import {
  aggregateCeoActivity,
  filterCeoActivity,
} from "../src/lib/ceoAggregate";
import type { CeoStockPurchaseRow } from "../src/lib/types";

function row(
  partial: Partial<CeoStockPurchaseRow> &
    Pick<CeoStockPurchaseRow, "id" | "source_id" | "ceo_name">,
): CeoStockPurchaseRow {
  return {
    accession_number: "acc",
    officer_title: "CEO",
    issuer_name: "Test Co",
    ticker: "TEST",
    security_title: "Common Stock",
    transaction_date: "2026-01-02",
    filing_date: "2026-01-03",
    shares_purchased: 10,
    price_per_share: 5,
    shares_owned_after: 100,
    ownership_type: "D",
    filing_url: null,
    form_type: "4",
    quarter: "2026q1",
    transaction_code: "P",
    created_at: "2026-01-03T00:00:00Z",
    ...partial,
  };
}

const combined = aggregateCeoActivity([
  row({
    id: "1",
    source_id: "1",
    ceo_name: "Huang, Jack",
    ticker: "COE",
    shares_purchased: 60,
    price_per_share: 10,
    transaction_code: "P",
  }),
  row({
    id: "2",
    source_id: "2",
    ceo_name: "Huang, Jack",
    ticker: "COE",
    shares_purchased: 40,
    price_per_share: 20,
    transaction_code: "P",
  }),
  row({
    id: "3",
    source_id: "3",
    ceo_name: "Huang, Jack",
    ticker: "COE",
    shares_purchased: 15,
    price_per_share: 12,
    transaction_code: "S",
  }),
]);

assert.equal(combined.length, 2);
const buy = combined.find((c) => c.side === "purchase");
const sale = combined.find((c) => c.side === "sale");
assert.ok(buy);
assert.ok(sale);
assert.equal(buy.shares, 100);
assert.equal(buy.transaction_count, 2);
assert.equal(buy.price_per_share, 14);
assert.equal(sale.shares, 15);

assert.equal(filterCeoActivity(combined, "coe").length, 2);
assert.equal(filterCeoActivity(combined, "nobody").length, 0);

console.log("ceo aggregate unit tests passed");
