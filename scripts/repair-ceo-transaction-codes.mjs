/**
 * Repair ceo_stock_purchases.transaction_code from raw_source.trans_code.
 *
 * Historical rows were upserted without the column (defaulted to P) while
 * raw_source still held the true Form 4 code (often S).
 *
 *   npm run repair:ceo-codes
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const PAGE = 1000;

let scanned = 0;
let fixed = 0;
let from = 0;

console.log("Repairing ceo_stock_purchases.transaction_code from raw_source…");

while (true) {
  const { data, error } = await supabase
    .from("ceo_stock_purchases")
    .select("id, transaction_code, raw_source")
    .order("id", { ascending: true })
    .range(from, from + PAGE - 1);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) break;

  const toS = [];
  const toP = [];
  for (const row of rows) {
    scanned += 1;
    const raw =
      row.raw_source &&
      typeof row.raw_source === "object" &&
      "trans_code" in row.raw_source
        ? String(row.raw_source.trans_code ?? "")
            .trim()
            .toUpperCase()
        : "";
    if (raw !== "P" && raw !== "S") continue;
    const col = String(row.transaction_code ?? "")
      .trim()
      .toUpperCase();
    if (col === raw) continue;
    if (raw === "S") toS.push(row.id);
    else toP.push(row.id);
  }

  for (const [code, ids] of [
    ["S", toS],
    ["P", toP],
  ]) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { error: upErr } = await supabase
        .from("ceo_stock_purchases")
        .update({ transaction_code: code })
        .in("id", chunk);
      if (upErr) throw new Error(upErr.message);
      fixed += chunk.length;
    }
  }

  process.stdout.write(`  scanned ${scanned}, fixed ${fixed}\r`);
  if (rows.length < PAGE) break;
  from += PAGE;
}

console.log(`\nDone. Scanned ${scanned}, fixed ${fixed}.`);
