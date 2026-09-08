import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { loadConfig } from "./config.js";
import {
  cachePaths,
  downloadQuarterZip,
  listSecQuarters,
  unzipToDir,
  writeQuarterMarker,
} from "./sec/download.js";
import { extractCeoPurchasesFromDir } from "./sec/extract.js";
import { createSupabase } from "./store/supabaseStore.js";
import {
  assertCeoSinkReady,
  getSuccessfulQuarters,
  markQuarterFailed,
  markQuarterRunning,
  markQuarterSuccess,
  upsertCeoPurchases,
} from "./store/ceoBuysStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]) {
  const onlyIdx = argv.indexOf("--only");
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1]?.toLowerCase() : null;
  const force = argv.includes("--force");
  const fromYearIdx = argv.indexOf("--from-year");
  const fromYear =
    fromYearIdx >= 0
      ? Number.parseInt(argv[fromYearIdx + 1] ?? "2012", 10)
      : 2012;
  const keepExtract = argv.includes("--keep-extract");
  const dryRun = argv.includes("--dry-run");
  return { only, force, fromYear, keepExtract, dryRun };
}

async function processQuarter(opts: {
  supabase: ReturnType<typeof createSupabase>;
  quarter: string;
  url: string;
  cacheRoot: string;
  force: boolean;
  keepExtract: boolean;
  dryRun: boolean;
}): Promise<{ extracted: number; upserted: number }> {
  const { supabase, quarter, url, cacheRoot, force, keepExtract, dryRun } =
    opts;
  const paths = cachePaths(cacheRoot, quarter);
  console.log(`\n=== ${quarter} ===`);
  console.log(`ZIP ${url}`);

  if (!dryRun) {
    await markQuarterRunning(supabase, quarter, url);
  }

  try {
    await downloadQuarterZip(
      { quarter, path: "", url },
      paths.zip,
    );
    await unzipToDir(paths.zip, paths.extractDir);
    const { purchases, stats } = await extractCeoPurchasesFromDir(
      paths.extractDir,
      quarter,
    );
    console.log(
      `extract: submissions=${stats.submissions} tx=${stats.transactions} codeP=${stats.codeP} kept=${stats.kept}`,
    );

    let upserted = 0;
    if (dryRun) {
      console.log(`dry-run: would upsert ${purchases.length} rows`);
      // Print a few samples for manual Form 4 verification.
      for (const p of purchases.slice(0, 5)) {
        console.log(
          `  sample ${p.ticker} ${p.ceoName} ${p.sharesPurchased}@${p.pricePerShare} ${p.transactionDate} ${p.filingUrl}`,
        );
      }
    } else {
      const result = await upsertCeoPurchases(supabase, purchases);
      upserted = result.upserted;
      if (result.errors > 0) {
        throw new Error(`Upsert reported ${result.errors} chunk error(s)`);
      }
      await markQuarterSuccess(supabase, quarter, {
        rowsExtracted: purchases.length,
        rowsUpserted: upserted,
      });
      await writeQuarterMarker(paths.marker, {
        quarter,
        url,
        extracted: purchases.length,
        upserted,
        finishedAt: new Date().toISOString(),
      });
      console.log(`upserted ${upserted}`);
    }

    if (!keepExtract) {
      await rm(paths.extractDir, { recursive: true, force: true });
    }
    return { extracted: purchases.length, upserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!dryRun) {
      await markQuarterFailed(supabase, quarter, message).catch(() => undefined);
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log("START backfill-ceo-buys");
  console.log(
    `fromYear=${args.fromYear} only=${args.only ?? "(all)"} force=${args.force} dryRun=${args.dryRun}`,
  );

  const config = loadConfig();
  const supabase = createSupabase(config);
  if (!args.dryRun) {
    const sink = await assertCeoSinkReady(supabase);
    console.log(`sink=${sink}`);
  }

  const cacheRoot = resolve(__dirname, "../.cache/sec-insider");
  let quarters = await listSecQuarters(args.fromYear);
  if (args.only) {
    quarters = quarters.filter((q) => q.quarter === args.only);
    if (quarters.length === 0) {
      // Allow forcing a known URL pattern when index scrape misses a quarter.
      const q = args.only;
      const year = Number(q.slice(0, 4));
      if (!/^\d{4}q[1-4]$/.test(q) || year < args.fromYear) {
        throw new Error(`Quarter not found: ${args.only}`);
      }
      const structured = `https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/${q}_form345.zip`;
      const dsi = `https://www.sec.gov/files/datastandardsinnovation/data/insider-transactions-data-sets/${q}_form345.zip`;
      quarters = [{ quarter: q, path: "", url: year >= 2026 && q.endsWith("q2") ? dsi : structured }];
      // Prefer probing both if needed inside download.
      console.warn(`Quarter ${q} not on index page; trying ${quarters[0]!.url}`);
    }
  }

  const done = args.force || args.dryRun
    ? new Set<string>()
    : await getSuccessfulQuarters(supabase);

  let processed = 0;
  let skipped = 0;
  let extractedTotal = 0;
  let upsertedTotal = 0;

  for (const ref of quarters) {
    if (!args.force && done.has(ref.quarter)) {
      skipped += 1;
      console.log(`skip ${ref.quarter} (already success)`);
      continue;
    }
    // Try primary URL; on 404 flip between structureddata / datastandardsinnovation.
    let url = ref.url;
    try {
      const result = await processQuarter({
        supabase,
        quarter: ref.quarter,
        url,
        cacheRoot,
        force: args.force,
        keepExtract: args.keepExtract,
        dryRun: args.dryRun,
      });
      processed += 1;
      extractedTotal += result.extracted;
      upsertedTotal += result.upserted;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("404") || message.includes("Download failed 404")) {
        const alt = url.includes("datastandardsinnovation")
          ? url.replace(
              "/files/datastandardsinnovation/",
              "/files/structureddata/",
            )
          : url.replace(
              "/files/structureddata/",
              "/files/datastandardsinnovation/",
            );
        if (alt !== url) {
          console.warn(`retry ${ref.quarter} via ${alt}`);
          const result = await processQuarter({
            supabase,
            quarter: ref.quarter,
            url: alt,
            cacheRoot,
            force: args.force,
            keepExtract: args.keepExtract,
            dryRun: args.dryRun,
          });
          processed += 1;
          extractedTotal += result.extracted;
          upsertedTotal += result.upserted;
          continue;
        }
      }
      console.error(`FAILED ${ref.quarter}: ${message}`);
      throw err;
    }
  }

  console.log("\nDONE backfill-ceo-buys");
  console.log(
    `processed=${processed} skipped=${skipped} extracted=${extractedTotal} upserted=${upsertedTotal}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
