import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { loadKadoaCongressStockTrades, printKadoaLoadStats } from "./kadoa/load.js";
import {
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
 * Incremental refresh from the Kadoa dataset (upsert only, no clear).
 * Prefer `npm run backfill-kadoa` for the one-time migration/replace.
 */
async function main(): Promise<void> {
  console.log("START UPDATE (Kadoa)");
  console.log("");

  let runId: string | null = null;
  let supabase: ReturnType<typeof createSupabase> | null = null;

  try {
    const config = loadConfig();
    supabase = createSupabase(config);
    runId = await startSyncRun(supabase, "manual");

    const refresh = process.env.KADOA_REFRESH === "1";
    const { trades, stats } = await loadKadoaCongressStockTrades({ refresh });

    console.log(
      `Upserting ${trades.length.toLocaleString("en-US")} House/Senate stock trades…`,
    );
    const upsert = await upsertTrades(supabase, trades);

    printKadoaLoadStats(stats, {
      newCount: upsert.newCount,
      updatedCount: upsert.updatedCount,
      duplicatesSkipped: upsert.updatedCount,
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

    console.log("Syncing missing stock price bars (Alpaca IEX)…");
    const prices = await syncPricesAfterTrades(supabase);
    console.log("STOCK PRICE DATA");
    console.log(`Status: ${prices.status}`);
    console.log(`Tickers checked: ${prices.tickersChecked}`);
    console.log(`Tickers updated: ${prices.tickersUpdated}`);
    console.log(`New daily bars: ${prices.newDailyBars}`);
    console.log("");

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
    console.log("========================================");
    console.log("CONGRESS TRADE UPDATE COMPLETE");
    console.log("========================================");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`UPDATE FAILED: ${message}`);
    if (supabase && runId) {
      try {
        await finishSyncRunFailed(supabase, runId, message);
      } catch (finishErr) {
        console.error(
          `Also failed to record sync failure: ${
            finishErr instanceof Error ? finishErr.message : String(finishErr)
          }`,
        );
      }
    }
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("update.ts") ||
    process.argv[1].endsWith("update.js"));

if (isDirectRun) {
  void main();
}
