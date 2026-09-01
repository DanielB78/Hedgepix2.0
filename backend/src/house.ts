import { fetchAllHouse } from "../vendor/congress-trading-pipeline/house/src/fetcher/houseFetcher.js";
import { normalizeAll as upstreamNormalize } from "../vendor/congress-trading-pipeline/house/src/transformer/normalize.js";
import { generateId } from "../vendor/congress-trading-pipeline/house/src/utils/dedup.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAll } from "./normalize.js";
import { upsertTrades } from "./store/supabaseStore.js";
import type { ChamberRunStats, UpstreamTransaction } from "./types.js";

export type HouseUpdateOptions = {
  /** Annual House archives to download (defaults to current year only). */
  archiveYears?: number[];
};

export async function runHouseUpdate(
  supabase: SupabaseClient,
  fromDate: string,
  toDate: string,
  options: HouseUpdateOptions = {},
): Promise<ChamberRunStats> {
  const archiveYears = options.archiveYears;
  console.log(
    archiveYears
      ? `[House] Fetching archives ${archiveYears.join(", ")}…`
      : "[House] Fetching disclosure index…",
  );

  try {
    const fetchResult = await fetchAllHouse(
      fromDate,
      toDate,
      archiveYears ? { years: archiveYears } : undefined,
    );

    if (!fetchResult.success && fetchResult.records.length === 0) {
      const msg = fetchResult.error ?? "House fetch failed with no records";
      console.error(`[House] FAILED: ${msg}`);
      return {
        chamber: "house",
        status: "failed",
        fetched: 0,
        normalized: 0,
        newCount: 0,
        updatedCount: 0,
        errors: 1,
        errorMessage: msg,
      };
    }

    if (fetchResult.error) {
      console.warn(`[House] Partial fetch: ${fetchResult.error}`);
    }

    console.log(`[House] Found ${fetchResult.records.length} raw transaction rows`);

    const upstreamNormalized = upstreamNormalize(fetchResult.records);
    const withIds: UpstreamTransaction[] = upstreamNormalized.map((t) => ({
      ...t,
      id: generateId(t),
    }));

    console.log(`[House] ${withIds.length} transactions normalized`);

    const trades = normalizeAll(withIds, "house");
    const upsert = await upsertTrades(supabase, trades);

    console.log(`[House] ${upsert.newCount} new transactions inserted`);
    console.log(`[House] ${upsert.updatedCount} existing transactions updated`);

    return {
      chamber: "house",
      status: "success",
      fetched: fetchResult.records.length,
      normalized: trades.length,
      newCount: upsert.newCount,
      updatedCount: upsert.updatedCount,
      errors: upsert.errors + (fetchResult.error ? 1 : 0),
      errorMessage: fetchResult.error,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[House] FAILED: ${message}`);
    return {
      chamber: "house",
      status: "failed",
      fetched: 0,
      normalized: 0,
      newCount: 0,
      updatedCount: 0,
      errors: 1,
      errorMessage: message,
    };
  }
}
