/**
 * Run news → sector → S&P 500 ticker abnormal-move checks only.
 *
 *   cd backend && npm run check-news-ticker-moves
 */
import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { checkNewsTickerAbnormalMoves } from "../src/store/tickerMoveStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../.env") });

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Checking news article ticker abnormal moves…");
  const stats = await checkNewsTickerAbnormalMoves(supabase);
  console.log(stats);

  const { data, error } = await supabase
    .from("news_article_ticker_moves")
    .select(
      "ticker, event_return_pct, historical_typical_move_pct, abnormality_ratio, is_abnormal, window_hours, checked_at",
    )
    .eq("is_abnormal", true)
    .order("abnormality_ratio", { ascending: false })
    .limit(20);
  if (error) {
    console.warn(`Could not list abnormal rows: ${error.message}`);
  } else {
    console.log(`\nTop abnormal flags (${data?.length ?? 0}):`);
    for (const row of data ?? []) {
      console.log(
        `  ${row.ticker}\treturn=${row.event_return_pct?.toFixed?.(2) ?? row.event_return_pct}%\ttypical=${row.historical_typical_move_pct?.toFixed?.(2) ?? row.historical_typical_move_pct}%\tratio=${row.abnormality_ratio?.toFixed?.(2) ?? row.abnormality_ratio}\twindow_h=${row.window_hours}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
