/**
 * Delete stored rows dated before 2026-01-01, then recompute member holdings.
 *
 *   npm run purge:pre2026-data
 */
import { createClient } from "@supabase/supabase-js";
import { syncMemberHoldings } from "./lib/compute-holdings.mjs";
import {
  PRICE_HISTORY_START,
  purgePriceBarsBefore,
} from "./lib/sync-stock-prices.mjs";

const CUTOFF = PRICE_HISTORY_START; // 2026-01-01

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

/**
 * Prefer a single date-filter delete; fall back to smaller month chunks on timeout.
 * @param {string} table
 * @param {string} column
 * @param {string} cutoff
 */
async function deleteBefore(table, column, cutoff) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .lt(column, cutoff);

  if (!error) {
    console.log(`  ${table}: deleted ${count ?? 0}`);
    return count ?? 0;
  }

  console.warn(`  ${table}: bulk delete failed (${error.message}); chunking…`);

  let total = 0;
  let cursor = "2000-01-01";
  while (cursor < cutoff) {
    const next = addMonths(cursor, 1);
    const end = next < cutoff ? next : cutoff;
    const chunk = await supabase
      .from(table)
      .delete({ count: "exact" })
      .gte(column, cursor)
      .lt(column, end);
    if (chunk.error) {
      throw new Error(`${table} ${cursor}..${end}: ${chunk.error.message}`);
    }
    total += chunk.count ?? 0;
    cursor = end;
  }
  console.log(`  ${table}: deleted ${total}`);
  return total;
}

/** @param {string} ymd @param {number} months */
function addMonths(ymd, months) {
  const [y, m] = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 10);
}

console.log(`Purging data before ${CUTOFF}…`);

const barsDeleted = await purgePriceBarsBefore(supabase, CUTOFF);
console.log(`  stock_price_bars: deleted ${barsDeleted}`);

await deleteBefore("news_article_ticker_moves", "window_start", CUTOFF);
await deleteBefore("news_articles", "published_at", CUTOFF);
await deleteBefore("congress_trades", "transaction_date", CUTOFF);
await deleteBefore("ceo_stock_purchases", "transaction_date", CUTOFF);

console.log("Recomputing member_stock_holdings…");
const holdings = await syncMemberHoldings(supabase);
console.log(
  `  holdings: ${holdings.members} members, ${holdings.positions} positions`,
);

console.log("Done.");
