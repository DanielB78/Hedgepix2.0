import { format, subDays } from "date-fns";
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

function printSummary(
  fromDate: string,
  toDate: string,
  house: ChamberRunStats,
  senate: ChamberRunStats,
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

  if (bothFailed) {
    console.log("BOTH CHAMBERS FAILED — Supabase may be unchanged.");
  } else if (!anySuccess) {
    console.log("Update finished with failures.");
  } else if (house.status === "failed" || senate.status === "failed") {
    console.log("PARTIAL SUCCESS — one chamber failed (see above).");
    console.log("Valid transactions from the successful chamber were kept.");
  } else {
    console.log("Supabase successfully updated.");
  }
  console.log("========================================");
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

    printSummary(fromDate, toDate, house, senate);

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
