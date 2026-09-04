/**
 * Mock-backed integration checks for upsert counting and content source IDs.
 */
import assert from "node:assert/strict";
import { toCongressTradeFromInsiderWatch } from "../insiderwatch/normalize.js";
import { toDbRow } from "../store/supabaseStore.js";
import type { CongressTrade } from "../types.js";
import type { InsiderWatchCsvRow } from "../insiderwatch/types.js";

type Row = ReturnType<typeof toDbRow>;

class MemoryStore {
  rows = new Map<string, Row & { first_seen_at: string }>();

  async upsert(trades: CongressTrade[]) {
    const now = new Date().toISOString();
    let newCount = 0;
    let updatedCount = 0;
    for (const trade of trades) {
      const row = toDbRow(trade, now, true);
      const existing = this.rows.get(row.source_hash);
      if (existing) {
        this.rows.set(row.source_hash, {
          ...row,
          first_seen_at: existing.first_seen_at,
        });
        updatedCount += 1;
      } else {
        this.rows.set(row.source_hash, { ...row, first_seen_at: now });
        newCount += 1;
      }
    }
    return { newCount, updatedCount, total: this.rows.size };
  }
}

function sample(
  filingId: string,
  chamber: "house" | "senate",
  ticker: string,
): CongressTrade {
  const row: InsiderWatchCsvRow = {
    chamber,
    member: "Test Member",
    member_slug: "test-member",
    ticker,
    asset: `${ticker} Inc`,
    action: "buy",
    amount_range: "$1,001 - $15,000",
    amount_min_usd: "1001",
    transaction_date: "08/01/2026",
    filed_date: "8/10/2026",
    disclosure_lag_days: "9",
    owner: "Self",
    filing_id: filingId,
  };
  return toCongressTradeFromInsiderWatch(row, 0);
}

async function main() {
  const store = new MemoryStore();
  const batch1 = [
    sample("f1", "house", "AAA"),
    sample("f2", "house", "BBB"),
    sample("f3", "senate", "AAA"),
  ];

  const r1 = await store.upsert(batch1);
  assert.equal(r1.newCount, 3);
  assert.equal(r1.total, 3);
  assert.ok([...store.rows.keys()].every((h) => h.startsWith("trade:")));

  const r2 = await store.upsert([
    sample("f1", "house", "AAA"),
    sample("f2", "house", "BBB"),
    sample("f4", "house", "CCC"),
  ]);
  assert.equal(r2.newCount, 1);
  assert.equal(r2.updatedCount, 2);
  assert.equal(r2.total, 4);

  console.log("integration mock tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
