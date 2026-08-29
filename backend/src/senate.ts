import { fetchAll } from "../vendor/congress-trading-pipeline/senate/src/fetcher/senateFetcher.js";
import { parseHtml } from "../vendor/congress-trading-pipeline/senate/src/parser/index.js";
import { normalizeAll as upstreamNormalize } from "../vendor/congress-trading-pipeline/senate/src/transformer/normalize.js";
import { generateId } from "../vendor/congress-trading-pipeline/senate/src/utils/dedup.js";
import { toErrorMessage } from "../vendor/congress-trading-pipeline/senate/src/utils/errors.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAll } from "./normalize.js";
import { upsertTrades } from "./store/supabaseStore.js";
import type { ChamberRunStats, UpstreamTransaction } from "./types.js";

export async function runSenateUpdate(
  supabase: SupabaseClient,
  fromDate: string,
  toDate: string,
): Promise<ChamberRunStats> {
  console.log("[Senate] Fetching disclosures...");

  try {
    const fetchResult = await fetchAll(fromDate, toDate);

    if (!fetchResult.success && fetchResult.records.length === 0) {
      const msg = fetchResult.error ?? "Senate fetch failed with no records";
      console.error(`[Senate] FAILED: ${msg}`);
      return {
        chamber: "senate",
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
      console.warn(`[Senate] Partial fetch: ${fetchResult.error}`);
    }

    let parsedRecords = fetchResult.records;

    const structuredEmpty =
      parsedRecords.length > 0 &&
      parsedRecords.every((r) => !r.asset_name.trim());

    if (structuredEmpty) {
      console.warn(
        "[Senate] Structured parse produced no asset names — attempting HTML fallback",
      );
      try {
        const htmlHits = parsedRecords
          .map((r) => r.raw_json)
          .filter((j): j is Record<string, unknown> => !!j["html"])
          .map((j) => j["html"] as string);

        if (htmlHits.length > 0) {
          parsedRecords = parseHtml(htmlHits.join("\n"));
          console.log(
            `[Senate] HTML fallback produced ${parsedRecords.length} records`,
          );
        } else {
          console.warn(
            "[Senate] No html field in raw_json — cannot fall back to HTML parser",
          );
        }
      } catch (err) {
        console.error(`[Senate] HTML fallback failed: ${toErrorMessage(err)}`);
      }
    }

    console.log(`[Senate] Found ${parsedRecords.length} raw transaction rows`);

    const upstreamNormalized = upstreamNormalize(parsedRecords);
    const withIds: UpstreamTransaction[] = upstreamNormalized.map((t) => ({
      ...t,
      id: generateId(t),
    }));

    console.log(`[Senate] ${withIds.length} transactions normalized`);

    const trades = normalizeAll(withIds, "senate");
    const upsert = await upsertTrades(supabase, trades);

    console.log(`[Senate] ${upsert.newCount} new transactions inserted`);
    console.log(`[Senate] ${upsert.updatedCount} existing transactions updated`);

    return {
      chamber: "senate",
      status: "success",
      fetched: parsedRecords.length,
      normalized: trades.length,
      newCount: upsert.newCount,
      updatedCount: upsert.updatedCount,
      errors: upsert.errors + (fetchResult.error ? 1 : 0),
      errorMessage: fetchResult.error,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Senate] FAILED: ${message}`);
    return {
      chamber: "senate",
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
