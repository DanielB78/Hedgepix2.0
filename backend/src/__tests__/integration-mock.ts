/**
 * Mock-backed integration checks for upsert counting and Kadoa source IDs.
 */
import assert from "node:assert/strict";
import { toCongressTradeFromKadoa } from "../kadoa/normalize.js";
import { toDbRow } from "../store/supabaseStore.js";
import type { CongressTrade } from "../types.js";
import type { KadoaFiler, KadoaTrade } from "../kadoa/types.js";

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

function sample(id: string, chamber: "house" | "senate"): CongressTrade {
  const filer: KadoaFiler = {
    id: `${chamber}_test_member`,
    full_name: "Test Member",
    chamber,
    branch: "congress",
  };
  const trade: KadoaTrade = {
    id,
    ticker: "AAA",
    asset_name: "AAA Inc",
    asset_type: "ST",
    transaction_type: "Purchase",
    amount_range_low: 1001,
    amount_range_high: 15000,
    transaction_date: "2026-08-01",
    filing_date: "2026-08-10",
    owner: "Self",
  };
  return toCongressTradeFromKadoa(trade, filer, chamber);
}

async function main() {
  const store = new MemoryStore();
  const batch1 = [
    sample("house_id1", "house"),
    sample("house_id2", "house"),
    sample("senate_id1", "senate"),
  ];

  const r1 = await store.upsert(batch1);
  assert.equal(r1.newCount, 3);
  assert.equal(r1.total, 3);
  assert.ok(store.rows.has("kadoa:house_id1"));
  assert.ok(store.rows.has("kadoa:senate_id1"));
  assert.equal(store.rows.get("kadoa:house_id1")!.chamber, "house");
  assert.equal(store.rows.get("kadoa:senate_id1")!.chamber, "senate");

  const r2 = await store.upsert([
    sample("house_id1", "house"),
    sample("house_id2", "house"),
    sample("house_id3", "house"),
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
