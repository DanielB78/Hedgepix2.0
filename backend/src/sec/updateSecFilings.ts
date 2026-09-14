/**
 * Orchestrates all SEC filing ingest pipelines. Each source runs
 * independently and failures are isolated so a single broken source never
 * blocks the others (or the rest of the daily `update.ts` run).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { runThirteenFUpdate, type ThirteenFUpdateResult } from "./thirteenF.js";
import { runOwnership13Update, type Ownership13UpdateResult } from "./ownership13D13G.js";
import { runForm144Update, type Form144UpdateResult } from "./form144.js";
import { runEightKUpdate, type EightKUpdateResult } from "./eightK.js";
import { runFundamentalsUpdate, type FundamentalsUpdateResult } from "./fundamentals.js";
import { runOfferingsUpdate, type OfferingsUpdateResult } from "./offerings.js";
import { runNportUpdate, type NportUpdateResult } from "./nport.js";

export type SecSourceResult = {
  status: "SUCCESS" | "FAILED";
  periods: number;
  rows: number;
  error: string | null;
};

export type SecFilingsUpdateSummary = {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  sources: {
    thirteenF: SecSourceResult;
    ownership13DG: SecSourceResult;
    form144: SecSourceResult;
    eightK: SecSourceResult;
    fundamentals: SecSourceResult;
    offerings: SecSourceResult;
    nport: SecSourceResult;
  };
};

export type SecFilingsUpdateOptions = {
  force?: boolean;
  dryRun?: boolean;
  fromYear?: number;
};

function toSourceResult(result: {
  status: "success" | "failed";
  periods: number;
  rows: number;
  error: string | null;
}): SecSourceResult {
  return {
    status: result.status === "success" ? "SUCCESS" : "FAILED",
    periods: result.periods,
    rows: result.rows,
    error: result.error,
  };
}

async function runIsolated<T extends { status: "success" | "failed"; periods: number; rows: number; error: string | null }>(
  label: string,
  fn: () => Promise<T>,
): Promise<SecSourceResult> {
  try {
    const result = await fn();
    if (result.status === "failed") {
      console.error(`[SEC/${label}] FAILED: ${result.error ?? "unknown error"}`);
    } else {
      console.log(`[SEC/${label}] SUCCESS: periods=${result.periods} rows=${result.rows}`);
    }
    return toSourceResult(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[SEC/${label}] FAILED (uncaught): ${message}`);
    return { status: "FAILED", periods: 0, rows: 0, error: message };
  }
}

/**
 * Run every SEC filing pipeline once, in order (13F → 13D/G → 144 → 8-K →
 * fundamentals → offerings → N-PORT). Each source is fully isolated: one
 * failing does not prevent the others from running.
 */
export async function runSecFilingsUpdate(
  supabase: SupabaseClient,
  opts: SecFilingsUpdateOptions = {},
): Promise<SecFilingsUpdateSummary> {
  const common = { force: opts.force, dryRun: opts.dryRun, fromYear: opts.fromYear };

  const thirteenF = await runIsolated<ThirteenFUpdateResult>("13F", () =>
    runThirteenFUpdate(supabase, common),
  );
  const ownership13DG = await runIsolated<Ownership13UpdateResult>("13D/G", () =>
    runOwnership13Update(supabase, common),
  );
  const form144 = await runIsolated<Form144UpdateResult>("144", () =>
    runForm144Update(supabase, common),
  );
  const eightK = await runIsolated<EightKUpdateResult>("8-K", () =>
    runEightKUpdate(supabase, common),
  );
  const fundamentals = await runIsolated<FundamentalsUpdateResult>("fundamentals", () =>
    runFundamentalsUpdate(supabase, common),
  );
  const offerings = await runIsolated<OfferingsUpdateResult>("offerings", () =>
    runOfferingsUpdate(supabase, common),
  );
  const nport = await runIsolated<NportUpdateResult>("N-PORT", () =>
    runNportUpdate(supabase, common),
  );

  const sources = {
    thirteenF,
    ownership13DG,
    form144,
    eightK,
    fundamentals,
    offerings,
    nport,
  };

  const statuses = Object.values(sources).map((s) => s.status);
  const status: SecFilingsUpdateSummary["status"] = statuses.every((s) => s === "SUCCESS")
    ? "SUCCESS"
    : statuses.every((s) => s === "FAILED")
      ? "FAILED"
      : "PARTIAL";

  return { status, sources };
}
