import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BackendConfig } from "../config.js";
import { PROVIDER } from "../config.js";
import { amountRange, memberSlug } from "../normalize.js";
import type { CongressTrade, UpsertStats } from "../types.js";

export type DbTradeRow = {
  source_hash: string;
  member: string;
  member_slug: string;
  chamber: "house" | "senate";
  ticker: string | null;
  asset: string;
  asset_type: string | null;
  transaction_type: "purchase" | "sale";
  amount_low: number | null;
  amount_high: number | null;
  amount_range: string | null;
  transaction_date: string;
  disclosure_date: string;
  owner: string | null;
  filing_portal: string;
  raw_source: unknown;
  last_seen_at: string;
  updated_at: string;
};

export function createSupabase(config: BackendConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function filingPortal(chamber: CongressTrade["chamber"]): string {
  return chamber === "house"
    ? "https://disclosures-clerk.house.gov/FinancialDisclosure"
    : "https://efdsearch.senate.gov/search/";
}

export function toDbRow(trade: CongressTrade, nowIso: string): DbTradeRow {
  return {
    source_hash: trade.sourceId,
    member: trade.member,
    member_slug: memberSlug(trade.member),
    chamber: trade.chamber,
    ticker: trade.ticker,
    asset: trade.assetName,
    asset_type: trade.assetType,
    transaction_type: trade.transactionType,
    amount_low: trade.amountLow,
    amount_high: trade.amountHigh,
    amount_range: amountRange(trade.amountLow, trade.amountHigh),
    transaction_date: trade.transactionDate,
    disclosure_date: trade.disclosureDate,
    owner: trade.owner,
    filing_portal: filingPortal(trade.chamber),
    raw_source: trade.rawSource ?? null,
    last_seen_at: nowIso,
    updated_at: nowIso,
  };
}

const UPSERT_CHUNK = 200;

export async function upsertTrades(
  supabase: SupabaseClient,
  trades: CongressTrade[],
): Promise<UpsertStats> {
  if (trades.length === 0) {
    return { fetched: 0, newCount: 0, updatedCount: 0, errors: 0 };
  }

  const nowIso = new Date().toISOString();
  const rows = trades.map((t) => toDbRow(t, nowIso));
  const hashes = rows.map((r) => r.source_hash);

  const existing = new Set<string>();
  for (let i = 0; i < hashes.length; i += UPSERT_CHUNK) {
    const slice = hashes.slice(i, i + UPSERT_CHUNK);
    const { data, error } = await supabase
      .from("congress_trades")
      .select("source_hash")
      .in("source_hash", slice);
    if (error) {
      throw new Error(`Failed to query existing trades: ${error.message}`);
    }
    for (const row of data ?? []) {
      existing.add(row.source_hash as string);
    }
  }

  let newCount = 0;
  let updatedCount = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const slice = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from("congress_trades")
      .upsert(slice, { onConflict: "source_hash" });

    if (error) {
      errors += 1;
      console.error(`[store] Upsert chunk failed: ${error.message}`);
      continue;
    }

    for (const row of slice) {
      if (existing.has(row.source_hash)) updatedCount += 1;
      else newCount += 1;
    }
  }

  return {
    fetched: trades.length,
    newCount,
    updatedCount,
    errors,
  };
}

export async function getLastSuccessAt(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("congress_sync_state")
    .select("last_success_at")
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read sync state: ${error.message}`);
  }
  return (data?.last_success_at as string | null) ?? null;
}

export async function startSyncRun(
  supabase: SupabaseClient,
): Promise<string> {
  const attemptedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("congress_sync_runs")
    .insert({
      provider: PROVIDER,
      mode: "manual",
      status: "running",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create sync run");
  }

  await supabase.from("congress_sync_state").upsert({
    provider: PROVIDER,
    last_attempt_at: attemptedAt,
    last_error: null,
  });

  return data.id as string;
}

export async function finishSyncRunSuccess(
  supabase: SupabaseClient,
  runId: string,
  stats: {
    rowsReceived: number;
    rowsUpserted: number;
    latestDisclosure: string | null;
    latestTransaction: string | null;
    partialError: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();

  await supabase
    .from("congress_sync_runs")
    .update({
      status: "success",
      rows_received: stats.rowsReceived,
      rows_upserted: stats.rowsUpserted,
      error_message: stats.partialError,
      finished_at: now,
    })
    .eq("id", runId);

  const statePatch: Record<string, unknown> = {
    provider: PROVIDER,
    last_attempt_at: now,
    last_success_at: now,
    last_rows_received: stats.rowsReceived,
    last_rows_upserted: stats.rowsUpserted,
    last_error: stats.partialError,
  };
  if (stats.latestDisclosure) {
    statePatch.latest_seen_disclosure_date = stats.latestDisclosure;
  }
  if (stats.latestTransaction) {
    statePatch.latest_seen_transaction_date = stats.latestTransaction;
  }

  await supabase.from("congress_sync_state").upsert(statePatch);
}

export async function finishSyncRunFailed(
  supabase: SupabaseClient,
  runId: string,
  message: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("congress_sync_runs")
    .update({
      status: "failed",
      error_message: message,
      finished_at: now,
    })
    .eq("id", runId);

  await supabase.from("congress_sync_state").upsert({
    provider: PROVIDER,
    last_attempt_at: now,
    last_error: message,
  });
}
