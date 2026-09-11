/**
 * One-off / ops helper: delete stock_price_bars before 2024-01-01.
 * Daily (1Day) bars only are stored going forward.
 *
 *   npm run purge:pre2024-prices
 */
import { createClient } from "@supabase/supabase-js";
import {
  PRICE_HISTORY_START,
  purgePre2024PriceBars,
} from "./lib/sync-stock-prices.mjs";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);
const deleted = await purgePre2024PriceBars(supabase);
console.log(
  `Deleted ${deleted} rows with bar_date < ${PRICE_HISTORY_START} from stock_price_bars`,
);
