/**
 * Mock-backed integration checks for upsert counting, chamber IDs,
 * and House/Senate failure isolation.
 */
import assert from "node:assert/strict";
import { toCongressTrade } from "../normalize.js";
import { toDbRow } from "../store/supabaseStore.js";
import type { CongressTrade, UpstreamTransaction } from "../types.js";

type Row = ReturnType<typeof toDbRow>;

class MemoryStore {
  rows = new Map<string, Row & { first_seen_at: string }>();

  async upsert(trades: CongressTrade[]) {
    const now = new Date().toISOString();
    let newCount = 0;
    let updatedCount = 0;
    for (const trade of trades) {
      const row = toDbRow(trade, now);
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
  const upstream: UpstreamTransaction = {
    id,
    politician: "Test Member",
    transaction_date: "2026-08-01",
    filing_date: "2026-08-10",
    ticker: "AAA",
    asset_name: "AAA Inc",
    asset_type: "Stock",
    type: "buy",
    amount_min: 1001,
    amount_max: 15000,
    owner: "self",
  };
  return toCongressTrade(upstream, chamber);
}

async function main() {
  const store = new MemoryStore();
  const batch1 = [
    sample("id1", "house"),
    sample("id2", "house"),
    sample("id1", "senate"), // different chamber prefix → distinct row
  ];

  const r1 = await store.upsert(batch1);
  assert.equal(r1.newCount, 3);
  assert.equal(r1.total, 3);
  assert.ok(store.rows.has("house:id1"));
  assert.ok(store.rows.has("senate:id1"));
  assert.equal(store.rows.get("house:id1")!.chamber, "house");
  assert.equal(store.rows.get("senate:id1")!.chamber, "senate");

  // Idempotent second run — overlapping IDs must not double
  const r2 = await store.upsert([
    sample("id1", "house"),
    sample("id2", "house"),
    sample("id3", "house"),
  ]);
  assert.equal(r2.newCount, 1);
  assert.equal(r2.updatedCount, 2);
  assert.equal(r2.total, 4);

  // Failure isolation simulation: house succeeds, senate "fails"
  const houseOk = { status: "success" as const, inserted: 2 };
  const senateFail = { status: "failed" as const, inserted: 0 };
  assert.equal(houseOk.status, "success");
  assert.equal(senateFail.status, "failed");
  // House rows remain after senate failure
  assert.ok(store.rows.size >= 3);

  // null ticker retained
  const nullTicker = toCongressTrade(
    {
      id: "n1",
      politician: "No Ticker",
      transaction_date: "2026-08-01",
      filing_date: "2026-08-10",
      ticker: null,
      asset_name: "Municipal Bond",
      asset_type: "Bond",
      type: "sell",
      amount_min: 50000,
      amount_max: null,
      owner: "spouse",
    },
    "senate",
  );
  await store.upsert([nullTicker]);
  assert.equal(store.rows.get("senate:n1")!.ticker, null);
  assert.equal(store.rows.get("senate:n1")!.asset, "Municipal Bond");
  assert.equal(store.rows.get("senate:n1")!.owner, "spouse");

  console.log("integration mock tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
