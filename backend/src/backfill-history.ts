import { addYears, format, parseISO } from "date-fns";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { runHouseUpdate } from "./house.js";
import { runSenateUpdate } from "./senate.js";
import {
  checkOcrMyPdfAvailable,
  printOcrSetupInstructions,
} from "./house-ocr.js";
import {
  emptyHousePdfStats,
  mergeHousePdfStats,
  printHousePdfStats,
} from "./house-pdf-stats.js";
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

/** Earliest calendar year for one-time historical House archive backfill. */
export const HISTORY_START_YEAR = 2012;

/** Split [start, end] into yearly windows for Senate backfills. */
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

/** Inclusive list of House archive years to download (oldest → newest). */
export function houseArchiveYears(
  startYear: number,
  endYear: number,
): number[] {
  const years: number[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }
  return years;
}

/** Newest-first House archive years — preferred for historical backfill. */
export function houseArchiveYearsNewestFirst(
  startYear: number,
  endYear: number,
): number[] {
  return houseArchiveYears(startYear, endYear).reverse();
}

/** Clip an overall backfill range to one calendar year. */
export function yearDateBounds(
  year: number,
  overallFrom: string,
  overallTo: string,
): { fromDate: string; toDate: string } {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  return {
    fromDate: overallFrom > yearStart ? overallFrom : yearStart,
    toDate: overallTo < yearEnd ? overallTo : yearEnd,
  };
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

function printHouseYearSummary(
  year: number,
  fromDate: string,
  toDate: string,
  house: ChamberRunStats,
): void {
  console.log(`House ${year}: ${fromDate} → ${toDate}`);
  console.log(
    `  fetched ${house.fetched}, new ${house.newCount}, updated ${house.updatedCount}`,
  );
  console.log("");
}

async function main(): Promise<void> {
  const houseOnly = process.argv.includes("--house-only");

  console.log(
    houseOnly
      ? "START HOUSE HISTORICAL BACKFILL"
      : "START HISTORICAL BACKFILL",
  );
  console.log(`Collecting stock transactions from ${HISTORY_START_DATE} onward`);
  if (houseOnly) console.log("Mode: House archives only");
  console.log("");

  let runId: string | null = null;
  let supabase: ReturnType<typeof createSupabase> | null = null;

  try {
    const config = loadConfig();
    supabase = createSupabase(config);
    runId = await startSyncRun(supabase, "backfill");

    const endDate = isoDate(new Date());
    const endYear = new Date().getFullYear();
    const houseYears = houseArchiveYearsNewestFirst(HISTORY_START_YEAR, endYear);
    const senateWindows = historyDateWindows(HISTORY_START_DATE, endDate);

    let totalNew = 0;
    let totalUpdated = 0;
    let totalFetched = 0;
    let housePdfStats = emptyHousePdfStats();

    console.log(
      `House archives (newest first): ${houseYears[0]}FD.zip → ${houseYears[houseYears.length - 1]}FD.zip (${houseYears.length} years)`,
    );
    console.log("");

    const ocrAvailability = await checkOcrMyPdfAvailable();
    if (ocrAvailability.available) {
      console.log(
        `OCRmyPDF available (${ocrAvailability.command?.label ?? "ocrmypdf"}${ocrAvailability.version ? `: ${ocrAvailability.version}` : ""})`,
      );
      console.log(
        "Scanned House PDFs will use OCR only when normal text extraction finds no transactions.",
      );
    } else {
      printOcrSetupInstructions();
    }
    console.log("");

    for (const [index, year] of houseYears.entries()) {
      const bounds = yearDateBounds(year, HISTORY_START_DATE, endDate);
      console.log(
        `House year ${index + 1}/${houseYears.length}: ${year} (${bounds.fromDate} → ${bounds.toDate})`,
      );
      const house = await runHouseUpdate(supabase, bounds.fromDate, bounds.toDate, {
        archiveYears: [year],
        enableOcrFallback: ocrAvailability.available,
      });
      printHouseYearSummary(year, bounds.fromDate, bounds.toDate, house);

      totalNew += house.newCount;
      totalUpdated += house.updatedCount;
      totalFetched += house.fetched;
      if (house.housePdfStats) {
        housePdfStats = mergeHousePdfStats(housePdfStats, house.housePdfStats);
      }
    }

    printHousePdfStats(housePdfStats);

    console.log(`Senate windows: ${senateWindows.length}`);
    console.log("");

    if (!houseOnly) {
      for (const [index, window] of senateWindows.entries()) {
        console.log(
          `Senate window ${index + 1}/${senateWindows.length}: ${window.fromDate} → ${window.toDate}`,
        );
        const senate = await runSenateUpdate(
          supabase,
          window.fromDate,
          window.toDate,
        );

        console.log(`${window.fromDate} → ${window.toDate}`);
        console.log(
          `  Senate — fetched ${senate.fetched}, new ${senate.newCount}, updated ${senate.updatedCount}`,
        );
        console.log("");

        totalNew += senate.newCount;
        totalUpdated += senate.updatedCount;
        totalFetched += senate.fetched;
      }
    } else {
      console.log("Skipping Senate windows (--house-only)");
      console.log("");
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
    console.log(
      houseOnly ? "HOUSE HISTORICAL BACKFILL COMPLETE" : "HISTORICAL BACKFILL COMPLETE",
    );
    console.log("========================================");
    console.log(`House archive years: ${houseYears.length}`);
    if (!houseOnly) {
      console.log(`Senate windows processed: ${senateWindows.length}`);
    }
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
