/**
 * CLI: classify tickers into ticker_profiles (sector + industry).
 *
 *   npm run sync:ticker-profiles --prefix backend
 *   npm run sync:ticker-profiles --prefix backend -- --force
 */
import { loadConfig } from "../src/config.js";
import { createSupabase } from "../src/store/supabaseStore.js";
import { syncTickerProfiles } from "../src/tickers/syncTickerProfiles.js";

async function main() {
  const force = process.argv.includes("--force");
  const config = loadConfig();
  const supabase = createSupabase(config);
  console.log("Syncing ticker profiles…", force ? "(force)" : "");
  const summary = await syncTickerProfiles(supabase, {
    force,
    secLimit: Number.parseInt(process.env.TICKER_PROFILE_SEC_LIMIT ?? "120", 10),
  });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status === "FAILED") process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
