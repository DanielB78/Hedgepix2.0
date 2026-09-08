import assert from "node:assert/strict";
import {
  isCeoOfficerTitle,
  isOfficerRelationship,
  isPublicStockSecurityTitle,
} from "../sec/ceoFilter.js";
import {
  filingUrlFor,
  normalizeTicker,
  parseNumber,
  parseSecDate,
  sourceIdFor,
} from "../sec/extract.js";

assert.equal(isOfficerRelationship("Officer"), true);
assert.equal(isOfficerRelationship("Director,Officer"), true);
assert.equal(isOfficerRelationship("Director"), false);

assert.equal(
  isCeoOfficerTitle("Chief Executive Officer", "Officer"),
  true,
);
assert.equal(isCeoOfficerTitle("President & CEO", "Officer,Director"), true);
assert.equal(isCeoOfficerTitle("CEO and President", "Officer"), true);
assert.equal(isCeoOfficerTitle("CFO", "Officer"), false);
assert.equal(isCeoOfficerTitle("Vice President", "Officer"), false);
assert.equal(isCeoOfficerTitle("Chief Executive Officer", "Director"), false);
assert.equal(isCeoOfficerTitle("Vice CEO", "Officer"), false);

assert.equal(isPublicStockSecurityTitle("Common Stock"), true);
assert.equal(
  isPublicStockSecurityTitle("Class A Ordinary Share, par value US$0.0001"),
  true,
);
assert.equal(isPublicStockSecurityTitle("Stock Option (Right to Buy)"), false);

assert.equal(parseSecDate("30-JUN-2026"), "2026-06-30");
assert.equal(parseSecDate("2026-06-23"), "2026-06-23");
assert.equal(parseNumber("12,000.5"), 12000.5);
assert.equal(normalizeTicker("aapl"), "AAPL");
assert.equal(normalizeTicker("NONE"), null);

const url = filingUrlFor("0001659494", "0001104659-26-079099");
assert.equal(
  url,
  "https://www.sec.gov/Archives/edgar/data/1659494/000110465926079099/0001104659-26-079099-index.html",
);

const id = sourceIdFor("0001104659-26-079099", "9016245", "0002029760");
assert.ok(id.startsWith("sec4:"));
assert.equal(id, sourceIdFor("0001104659-26-079099", "9016245", "0002029760"));

console.log("ceo-buys unit tests passed");
