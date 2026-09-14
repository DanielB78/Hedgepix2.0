/**
 * Track which SEC dataset periods / EDGAR index windows were processed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type IngestStatus = "success" | "failed" | "running";

export async function getSuccessfulPeriods(
  supabase: SupabaseClient,
  source: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("sec_ingest_state")
    .select("period_key")
    .eq("source", source)
    .eq("status", "success");
  if (error) throw new Error(`sec_ingest_state read failed: ${error.message}`);
  return new Set((data ?? []).map((r) => String(r.period_key)));
}

export async function markRunning(
  supabase: SupabaseClient,
  source: string,
  periodKey: string,
  sourceUrl?: string,
): Promise<void> {
  const { error } = await supabase.from("sec_ingest_state").upsert(
    {
      source,
      period_key: periodKey,
      status: "running",
      source_url: sourceUrl ?? null,
      last_error: null,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source,period_key" },
  );
  if (error) throw new Error(`sec_ingest_state running: ${error.message}`);
}

export async function markSuccess(
  supabase: SupabaseClient,
  source: string,
  periodKey: string,
  opts: {
    sourceUrl?: string;
    rowsExtracted?: number;
    rowsUpserted?: number;
    meta?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const { error } = await supabase.from("sec_ingest_state").upsert(
    {
      source,
      period_key: periodKey,
      status: "success",
      source_url: opts.sourceUrl ?? null,
      rows_extracted: opts.rowsExtracted ?? 0,
      rows_upserted: opts.rowsUpserted ?? 0,
      last_error: null,
      meta: opts.meta ?? null,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source,period_key" },
  );
  if (error) throw new Error(`sec_ingest_state success: ${error.message}`);
}

export async function markFailed(
  supabase: SupabaseClient,
  source: string,
  periodKey: string,
  err: unknown,
  sourceUrl?: string,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const { error } = await supabase.from("sec_ingest_state").upsert(
    {
      source,
      period_key: periodKey,
      status: "failed",
      source_url: sourceUrl ?? null,
      last_error: message.slice(0, 2000),
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source,period_key" },
  );
  if (error) throw new Error(`sec_ingest_state failed: ${error.message}`);
}

/** Collapse duplicate conflict keys within a batch (Postgres rejects multi-row ON CONFLICT on the same key). */
export function dedupeByConflictKey<T extends Record<string, unknown>>(
  rows: T[],
  onConflict: string,
): T[] {
  const keys = onConflict.split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return rows;
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = keys.map((k) => String(row[k] ?? "")).join("\0");
    map.set(key, row);
  }
  return [...map.values()];
}

export async function upsertChunks<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  rows: T[],
  onConflict: string,
  chunkSize = 200,
): Promise<number> {
  const unique = dedupeByConflictKey(rows, onConflict);
  let upserted = 0;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from(table)
      .upsert(chunk as Record<string, unknown>[], { onConflict, count: "exact" });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    upserted += count ?? chunk.length;
  }
  return upserted;
}
