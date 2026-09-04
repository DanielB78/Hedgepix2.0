import assert from "node:assert/strict";
import { loadKadoaCongressStockTrades } from "../kadoa/load.js";

async function main() {
  const dataDir = process.env.KADOA_DATA_DIR?.trim();
  if (!dataDir) {
    console.log("kadoa-load test skipped (set KADOA_DATA_DIR to run)");
    return;
  }

  const { trades, stats } = await loadKadoaCongressStockTrades({ dataDir });
  assert.ok(stats.kadoaRowsLoaded > 0, "expected Kadoa rows");
  assert.ok(stats.houseSenateRows > 0, "expected House/Senate rows");
  assert.ok(stats.stockRowsRetained > 0, "expected stock rows");
  assert.equal(trades.length, stats.stockRowsRetained);
  assert.ok(
    trades.every((t) => t.chamber === "house" || t.chamber === "senate"),
  );
  assert.ok(trades.every((t) => t.ticker && /^[A-Z]{1,5}(\.[A-Z])?$/.test(t.ticker)));
  assert.ok(
    !trades.some((t) => ["SPY", "QQQ", "TLT", "HYG"].includes(t.ticker ?? "")),
    "ETF tickers must not be retained",
  );
  console.log(
    `kadoa-load test passed (${stats.stockRowsRetained} stocks from ${stats.kadoaRowsLoaded} rows)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
