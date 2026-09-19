/**
 * Unit tests for universal search scoring.
 * Run: npx tsx src/lib/__tests__/universalSearch.test.ts
 */
import assert from "node:assert/strict";
import {
  clearUniversalSearchCache,
  searchUniversal,
} from "../universalSearch";

async function main() {
  clearUniversalSearchCache();

  const nv = await searchUniversal("nv", { tickers: 5, people: 5 });
  assert.ok(nv.tickers.length > 0, "expected ticker hits for nv");
  assert.equal(nv.tickers[0]!.symbol, "NVDA");
  assert.ok(nv.tickers[0]!.href.includes("/stocks/NVDA"));

  const nvidia = await searchUniversal("nvidia", { tickers: 5, people: 5 });
  assert.ok(nvidia.tickers.some((t) => t.symbol === "NVDA"));

  const empty = await searchUniversal("   ");
  assert.equal(empty.tickers.length, 0);
  assert.equal(empty.people.length, 0);

  const nonsense = await searchUniversal("zzzxqnotarealticker999");
  assert.equal(nonsense.tickers.length, 0);

  console.log("universalSearch tests: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
