import { addYears, format, parseISO } from "date-fns";
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
  startSyncRun,
} from "./store/supabaseStore.js";
import type { ChamberRunStats } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Earliest year for one-time historical stock backfill. */
export const HISTORY_START_DATE = "2012-01-01";

type HoldingsSummary = {
  members: number;
  positions: number;
};

function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Split [start, end] into yearly windows for long-running backfills. */
export function historyDateWindows(
  startDate: string,
  endDate: string,
): Array<{ fromDate: string; toDate: string }> {
  const windows: Array<{ fromDate: string; toDate: string }> = [];
  let cursor = parseISO(startDate);
  const end = parseISO(endDate);

  while (cursor <= end) {
    const windowEnd = addYears(cursor, 1);
    const cappedEnd = windowEnd > end ? end : windowEnd;
    windows.push({
      fromDate: isoDate(cursor),
      toDate: isoDate(cappedEnd),
    });
    cursor = addYears(cursor, 1);
    cursor.setDate(cursor.getDate() + 1);
  }

  return windows;
}

async function syncHoldingsAfterTrades(
  supabase: ReturnType<typeof createSupabase>,
): Promise<HoldingsSummary | null> {
  try {
    const modulePath = resolve(__dirname, "../../scripts/lib/compute-holdings.mjs");
    const mod = (await import(pathToFileURL(modulePath).href)) as {
      refreshListedEquityFlags: (
        client: ReturnType<typeof createSupabase>,
      ) => Promise<{ updated: number }>;
      syncMemberHoldings: (
        client: ReturnType<typeof createSupabase>,
      ) => Promise<HoldingsSummary>;
    };

    const flags = await mod.refreshListedEquityFlags(supabase);
    if (flags.updated > 0) {
      console.log(`Refreshed is_listed_equity on ${flags.updated} existing rows`);
    }

    return await mod.syncMemberHoldings(supabase);
  } catch (err) {
    console.error(
      `Holdings sync failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function printWindowSummary(
  label: string,
  fromDate: string,
  toDate: string,
  house: ChamberRunStats,
  senate: ChamberRunStats,
): void {
  console.log(`${label}: ${fromDate} → ${toDate}`);
  console.log(
    `  House — fetched ${house.fetched}, new ${house.newCount}, updated ${house.updatedCount}`,
  );
  console.log(
    `  Senate — fetched ${senate.fetched}, new ${senate.newCount}, updated ${senate.updatedCount}`,
  );
  console.log("");
}

async function main(): Promise<void> {
  console.log("START HISTORICAL BACKFILL");
  console.log(`Collecting stock transactions from ${HISTORY_START_DATE} onward`);
  console.log("");

  let runId: string | null = null;
  let supabase: ReturnType<typeof createSupabase> | null = null;

  try {
    const config = loadConfig();
    supabase = createSupabase(config);
    runId = await startSyncRun(supabase, "backfill");

    const endDate = isoDate(new Date());
    const windows = historyDateWindows(HISTORY_START_DATE, endDate);

    let totalNew = 0;
    let totalUpdated = 0;
    let totalFetched = 0;

    for (const [index, window] of windows.entries()) {
      console.log(
        `Window ${index + 1}/${windows.length}: ${window.fromDate} → ${window.toDate}`,
      );
      const house = await runHouseUpdate(
        supabase,
        window.fromDate,
        window.toDate,
      );
      const senate = await runSenateUpdate(
        supabase,
        window.fromDate,
        window.toDate,
      );

      printWindowSummary("Done", window.fromDate, window.toDate, house, senate);

      totalNew += house.newCount + senate.newCount;
      totalUpdated += house.updatedCount + senate.updatedCount;
      totalFetched += house.fetched + senate.fetched;
    }

    console.log("Recomputing member holdings…");
    const holdings = await syncHoldingsAfterTrades(supabase);

    await finishSyncRunSuccess(supabase, runId, {
      rowsReceived: totalFetched,
      rowsUpserted: totalNew + totalUpdated,
      latestDisclosure: endDate,
      latestTransaction: null,
      partialError: null,
    });

    console.log("========================================");
    console.log("HISTORICAL BACKFILL COMPLETE");
    console.log("========================================");
    console.log(`Windows processed: ${windows.length}`);
    console.log(`Total fetched rows: ${totalFetched}`);
    console.log(`Total new trades: ${totalNew}`);
    console.log(`Total updated trades: ${totalUpdated}`);
    if (holdings) {
      console.log(
        `Holdings refreshed: ${holdings.positions} positions across ${holdings.members} members`,
      );
    } else {
      console.log("Holdings refresh failed — trades were still stored.");
    }
    console.log("========================================");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`BACKFILL FAILED: ${message}`);
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
  (process.argv[1].endsWith("backfill-history.ts") ||
    process.argv[1].endsWith("backfill-history.js"));

if (isDirectRun) {
  void main();
}

export { syncHoldingsAfterTrades };
