import assert from "node:assert/strict";
import {
  isAllowedNewsDomain,
  loadNewsSourceAllowlist,
  normalizeNewsDomain,
} from "../news/newsSourceAllowlist.js";

function testNormalizeDomain() {
  assert.equal(normalizeNewsDomain("www.Reuters.com"), "reuters.com");
  assert.equal(normalizeNewsDomain("CNBC.com:443"), "cnbc.com");
  assert.equal(normalizeNewsDomain("  "), null);
  assert.equal(normalizeNewsDomain(null), null);
}

function testAllowlistLoaded() {
  const domains = loadNewsSourceAllowlist();
  assert.ok(domains.includes("reuters.com"));
  assert.ok(domains.includes("bloomberg.com"));
  assert.ok(domains.includes("techcrunch.com"));
  assert.ok(domains.includes("politico.com"));
  assert.ok(domains.includes("finance.yahoo.com"));
  assert.ok(domains.length >= 15);
}

function testAllowedMatching() {
  assert.equal(isAllowedNewsDomain("reuters.com"), true);
  assert.equal(isAllowedNewsDomain("www.reuters.com"), true);
  assert.equal(isAllowedNewsDomain("uk.reuters.com"), true);
  assert.equal(isAllowedNewsDomain("finance.yahoo.com"), true);
  assert.equal(isAllowedNewsDomain("www.finance.yahoo.com"), true);
  // yahoo.com alone is not listed — only finance.yahoo.com
  assert.equal(isAllowedNewsDomain("yahoo.com"), false);
  assert.equal(isAllowedNewsDomain("sports.yahoo.com"), false);
  assert.equal(isAllowedNewsDomain("espn.com"), false);
  assert.equal(isAllowedNewsDomain("nytimes.com"), false);
  assert.equal(isAllowedNewsDomain(null), false);
}

testNormalizeDomain();
testAllowlistLoaded();
testAllowedMatching();
console.log("news-source-allowlist unit tests passed");
