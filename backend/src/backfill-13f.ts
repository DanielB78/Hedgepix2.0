import { loadConfig } from "./config.js";
import { createSupabase } from "./store/supabaseStore.js";
import { runThirteenFUpdate } from "./sec/thirteenF.js";

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
  console.log(`backfill-13f: fromYear=${args.fromYear} force=${args.force} dryRun=${args.dryRun}`);
  const supabase = createSupabase(loadConfig());
  const result = await runThirteenFUpdate(supabase, args);
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
