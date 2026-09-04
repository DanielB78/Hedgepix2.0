import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { loadKadoaCongressStockTrades, printKadoaLoadStats } from "./kadoa/load.js";
import {
  clearCongressTrades,
  createSupabase,
  finishSyncRunFailed,
  finishSyncRunSuccess,
  startSyncRun,
  upsertTrades,
} from "./store/supabaseStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type PriceSummary = {
  status: string;
  tickersChecked: number;
  tickersUpdated: number;
  newDailyBars: number;
  skippedUnsupported: number;
  skippedNoHistory: number;
  errors: number;
  errorMessages?: string[];
};

function parseArgs(argv: string[]) {
  // Default: clear prior congress_trades then import (full migration).
  const replace = !argv.includes("--no-clear");
  const refresh = argv.includes("--refresh") || process.env.KADOA_REFRESH === "1";
  const skipPrices = argv.includes("--skip-prices");
  const skipHoldings = argv.includes("--skip-holdings");
  const dataDirIdx = argv.indexOf("--data-dir");
  const dataDir =
    dataDirIdx >= 0 ? argv[dataDirIdx + 1] : process.env.KADOA_DATA_DIR;
  return {
    replace,
    refresh,
    skipPrices,
    skipHoldings,
    dataDir,
  };
}

async function syncPricesAfterTrades(
  supabase: ReturnType<typeof createSupabase>,
): Promise<PriceSummary> {
  try {
    const modulePath = resolve(
      __dirname,
      "../../scripts/lib/sync-stock-prices.mjs",
    );
    const mod = (await import(pathToFileURL(modulePath).href)) as {
      syncStockPrices: (
        client: ReturnType<typeof createSupabase>,
        opts: { apiKey?: string; apiSecret?: string },
      ) => Promise<PriceSummary>;
    };
    return await mod.syncStockPrices(supabase, {
      apiKey: process.env.ALPACA_API_KEY,
      apiSecret: process.env.ALPACA_API_SECRET,
    });
  } catch (err) {
    return {
      status: "FAILED",
      tickersChecked: 0,
      tickersUpdated: 0,
      newDailyBars: 0,
      skippedUnsupported: 0,
      skippedNoHistory: 0,
      errors: 1,
      errorMessages: [err instanceof Error ? err.message : String(err)],
    };
  }
}

async function syncHoldingsAfterTrades(
  supabase: ReturnType<typeof createSupabase>,
): Promise<{ members: number; positions: number } | null> {
  try {
    const modulePath = resolve(
      __dirname,
      "../../scripts/lib/compute-holdings.mjs",
    );
    const mod = (await import(pathToFileURL(modulePath).href)) as {
      refreshListedEquityFlags: (
        client: ReturnType<typeof createSupabase>,
      ) => Promise<{ updated: number }>;
      syncMemberHoldings: (
        client: ReturnType<typeof createSupabase>,
      ) => Promise<{ members: number; positions: number }>;
    };
    await mod.refreshListedEquityFlags(supabase);
    return await mod.syncMemberHoldings(supabase);
  } catch (err) {
    console.error(
      `Holdings sync failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Full Kadoa historical import: House+Senate stocks only → Supabase → holdings.
 * Safe to re-run (upsert on source_hash). Default clears prior trade rows first.
 */
export async function runKadoaBackfill(options?: {
  replace?: boolean;
  refresh?: boolean;
  dataDir?: string;
  skipPrices?: boolean;
  skipHoldings?: boolean;
}): Promise<void> {
  const replace = options?.replace !== false;
  const config = loadConfig();
  const supabase = createSupabase(config);
  const runId = await startSyncRun(supabase, "backfill");

  try {
    console.log("START KADOA BACKFILL");
    console.log(
      replace
        ? "Mode: REPLACE (clear congress_trades, then import)"
        : "Mode: UPSERT ONLY (--no-clear)",
    );
    console.log("");

    const { trades, stats } = await loadKadoaCongressStockTrades({
      dataDir: options?.dataDir,
      refresh: options?.refresh,
    });

    let cleared = 0;
    if (replace) {
      console.log("Clearing existing congress_trades…");
      cleared = await clearCongressTrades(supabase);
      console.log(`Cleared ${cleared.toLocaleString("en-US")} rows.`);
      console.log("");
    }

    console.log(
      `Upserting ${trades.length.toLocaleString("en-US")} stock trades…`,
    );
    const upsert = await upsertTrades(supabase, trades);
    const duplicatesSkipped = upsert.updatedCount;

    printKadoaLoadStats(stats, {
      cleared: replace ? cleared : undefined,
      newCount: upsert.newCount,
      updatedCount: upsert.updatedCount,
      duplicatesSkipped,
    });

    if (upsert.errors > 0) {
      throw new Error(`Upsert completed with ${upsert.errors} chunk error(s)`);
    }

    await finishSyncRunSuccess(supabase, runId, {
      rowsReceived: stats.kadoaRowsLoaded,
      rowsUpserted: upsert.newCount + upsert.updatedCount,
      latestDisclosure: stats.dateTo,
      latestTransaction: stats.dateTo,
      partialError: null,
    });

    if (!options?.skipHoldings) {
      console.log("Recomputing member holdings…");
      const holdings = await syncHoldingsAfterTrades(supabase);
      console.log("MEMBER HOLDINGS");
      if (holdings) {
        console.log(`Members with positions: ${holdings.members}`);
        console.log(`Open positions: ${holdings.positions}`);
      } else {
        console.log("Status: FAILED");
      }
      console.log("");
    }

    if (!options?.skipPrices) {
      console.log("Syncing missing stock price bars (Alpaca IEX)…");
      const prices = await syncPricesAfterTrades(supabase);
      console.log("STOCK PRICE DATA");
      console.log(`Status: ${prices.status}`);
      console.log(`Tickers checked: ${prices.tickersChecked}`);
      console.log(`Tickers updated: ${prices.tickersUpdated}`);
      console.log(`New daily bars: ${prices.newDailyBars}`);
      console.log(`Skipped unsupported assets: ${prices.skippedUnsupported}`);
      console.log(`Skipped (no Alpaca history): ${prices.skippedNoHistory}`);
      console.log(`Errors: ${prices.errors}`);
      console.log("");
    }

    console.log("Kadoa backfill complete.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`KADOA BACKFILL FAILED: ${message}`);
    try {
      await finishSyncRunFailed(supabase, runId, message);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    await runKadoaBackfill({
      replace: args.replace,
      refresh: args.refresh,
      dataDir: args.dataDir,
      skipPrices: args.skipPrices,
      skipHoldings: args.skipHoldings,
    });
  } catch {
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("backfill-kadoa.ts") ||
    process.argv[1].endsWith("backfill-kadoa.js"));

if (isDirectRun) {
  void main();
}
