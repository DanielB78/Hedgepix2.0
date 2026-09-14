/**
 * Backfills the EDGAR full-index-driven "company filings" family:
 * 8-K material events, 10-Q/10-K fundamentals, and S-1/424B offerings.
 */
import { loadConfig } from "./config.js";
import { createSupabase } from "./store/supabaseStore.js";
import { runEightKUpdate } from "./sec/eightK.js";
import { runFundamentalsUpdate } from "./sec/fundamentals.js";
import { runOfferingsUpdate } from "./sec/offerings.js";

function parseArgs(argv: string[]) {
  const fromYearIdx = argv.indexOf("--from-year");
  const fromYear = fromYearIdx >= 0 ? Number.parseInt(argv[fromYearIdx + 1] ?? "2026", 10) : 2026;
  const onlyIdx = argv.indexOf("--only");
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : undefined;
  const force = argv.includes("--force");
  const dryRun = argv.includes("--dry-run");
  return { fromYear, only, force, dryRun };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `backfill-company-filings: fromYear=${args.fromYear} force=${args.force} dryRun=${args.dryRun}`,
  );
  const supabase = createSupabase(loadConfig());

  const eightK = await runEightKUpdate(supabase, args);
  console.log("8-K:", JSON.stringify(eightK));

  const fundamentals = await runFundamentalsUpdate(supabase, args);
  console.log("fundamentals:", JSON.stringify(fundamentals));

  const offerings = await runOfferingsUpdate(supabase, args);
  console.log("offerings:", JSON.stringify(offerings));

  if (eightK.status === "failed" && fundamentals.status === "failed" && offerings.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
