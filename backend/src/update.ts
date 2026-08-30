import { format, subDays } from "date-fns";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { runHouseUpdate } from "./house.js";
import { runSenateUpdate } from "./senate.js";
import {
  createSupabase,
  finishSyncRunFailed,
  finishSyncRunSuccess,
  getLastSuccessAt,
  startSyncRun,
} from "./store/supabaseStore.js";
import type { ChamberRunStats } from "./types.js";

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

function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function calculateDateWindow(options: {
  lastSuccessAt: string | null;
  initialBackfillDays: number;
  syncOverlapDays: number;
  now?: Date;
}): { fromDate: string; toDate: string } {
  const now = options.now ?? new Date();
  const toDate = isoDate(now);

  if (!options.lastSuccessAt) {
    return {
      fromDate: isoDate(subDays(now, options.initialBackfillDays)),
      toDate,
    };
  }

  const lastSuccess = new Date(options.lastSuccessAt);
  const from = subDays(lastSuccess, options.syncOverlapDays);
  return {
    fromDate: isoDate(from),
    toDate,
  };
}

function printChamberBlock(label: string, stats: ChamberRunStats): void {
  const statusLine =
    stats.status === "success"
      ? `${label}: SUCCESS`
      : `${label}: FAILED${stats.errorMessage ? ` — ${stats.errorMessage}` : ""}`;

  console.log(statusLine);
  console.log(`Fetched:     ${stats.fetched}`);
  console.log(`New:         ${stats.newCount}`);
  console.log(`Updated:     ${stats.updatedCount}`);
  console.log(`Errors:      ${stats.errors}`);
  console.log("");
}

function printPriceBlock(prices: PriceSummary): void {
  console.log("STOCK PRICE DATA");
  console.log(`Status: ${prices.status}`);
  console.log(`Tickers checked: ${prices.tickersChecked}`);
  console.log(`Tickers updated: ${prices.tickersUpdated}`);
  console.log(`New daily bars: ${prices.newDailyBars}`);
  console.log(`Skipped unsupported assets: ${prices.skippedUnsupported}`);
  console.log(`Skipped (no Alpaca history): ${prices.skippedNoHistory}`);
  console.log(`Errors: ${prices.errors}`);
  if (prices.errorMessages?.length) {
    for (const message of prices.errorMessages.slice(0, 8)) {
      console.log(`  - ${message}`);
    }
  }
  console.log("");
}

function printSummary(
  fromDate: string,
  toDate: string,
  house: ChamberRunStats,
  senate: ChamberRunStats,
  prices: PriceSummary,
): void {
  const totalNew = house.newCount + senate.newCount;
  const anySuccess = house.status === "success" || senate.status === "success";
  const bothFailed = house.status === "failed" && senate.status === "failed";

  console.log("========================================");
  console.log("CONGRESS TRADE UPDATE COMPLETE");
  console.log("========================================");
  console.log("");
  console.log("Date range:");
  console.log(`${fromDate} → ${toDate}`);
  console.log("");
  console.log("HOUSE");
  printChamberBlock("HOUSE", house);
  console.log("SENATE");
  printChamberBlock("SENATE", senate);
  console.log(`TOTAL NEW TRADES: ${totalNew}`);
  console.log("");
  printPriceBlock(prices);

  if (bothFailed) {
    console.log("BOTH CHAMBERS FAILED — Supabase may be unchanged.");
  } else if (!anySuccess) {
    console.log("Update finished with failures.");
  } else if (house.status === "failed" || senate.status === "failed") {
    console.log("PARTIAL SUCCESS — one chamber failed (see above).");
    console.log("Valid transactions from the successful chamber were kept.");
  } else if (prices.status === "FAILED") {
    console.log("Congress trades: SUCCESS");
    console.log("Stock prices: FAILED");
    console.log(
      "Congressional data was stored; price ingest did not roll back trades.",
    );
  } else if (prices.status === "SKIPPED") {
    console.log(
      "Congressional data stored. Stock prices skipped (Alpaca keys not set).",
    );
  } else {
    console.log("Supabase successfully updated.");
  }
  console.log("========================================");
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

async function main(): Promise<void> {
  console.log("START UPDATE");
  console.log("");

  let runId: string | null = null;
  let supabase: ReturnType<typeof createSupabase> | null = null;

  try {
    const config = loadConfig();
    supabase = createSupabase(config);

    runId = await startSyncRun(supabase);
    const lastSuccessAt = await getLastSuccessAt(supabase);
    const { fromDate, toDate } = calculateDateWindow({
      lastSuccessAt,
      initialBackfillDays: config.initialBackfillDays,
      syncOverlapDays: config.syncOverlapDays,
    });

    console.log(
      lastSuccessAt
        ? `Last successful sync: ${lastSuccessAt}`
        : "No prior successful sync — using initial backfill window",
    );
    console.log(`Date window: ${fromDate} → ${toDate}`);
    console.log("");

    const house = await runHouseUpdate(supabase, fromDate, toDate);
    console.log("");
    const senate = await runSenateUpdate(supabase, fromDate, toDate);
    console.log("");

    const rowsReceived = house.fetched + senate.fetched;
    const rowsUpserted =
      house.newCount +
      house.updatedCount +
      senate.newCount +
      senate.updatedCount;

    const failureMessages = [house, senate]
      .filter((s) => s.status === "failed")
      .map((s) => `${s.chamber.toUpperCase()}: ${s.errorMessage ?? "failed"}`);

    const bothFailed = house.status === "failed" && senate.status === "failed";
    const partialError =
      failureMessages.length > 0 ? failureMessages.join(" | ") : null;

    if (bothFailed) {
      await finishSyncRunFailed(
        supabase,
        runId,
        partialError ?? "House and Senate both failed",
      );
    } else {
      await finishSyncRunSuccess(supabase, runId, {
        rowsReceived,
        rowsUpserted,
        latestDisclosure: toDate,
        latestTransaction: null,
        partialError:
          house.status === "failed" || senate.status === "failed"
            ? partialError
            : null,
      });
    }

    // Price sync is independent: chamber success is not rolled back if Alpaca fails.
    let prices: PriceSummary = {
      status: "SKIPPED",
      tickersChecked: 0,
      tickersUpdated: 0,
      newDailyBars: 0,
      skippedUnsupported: 0,
      skippedNoHistory: 0,
      errors: 0,
    };
    if (!bothFailed) {
      console.log("Syncing stock price bars (Alpaca IEX)…");
      prices = await syncPricesAfterTrades(supabase);
      console.log("");
    }

    printSummary(fromDate, toDate, house, senate, prices);

    if (bothFailed) {
      process.exitCode = 1;
    } else if (house.status === "failed" || senate.status === "failed") {
      process.exitCode = 2;
    }
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
