import type { SupabaseClient } from "@supabase/supabase-js";
import type { CeoStockPurchase } from "../sec/types.js";

export type CeoDbRow = {
  source_id: string;
  accession_number: string;
  nonderiv_trans_sk: string;
  reporting_owner_cik: string | null;
  issuer_cik: string | null;
  ceo_name: string;
  officer_title: string | null;
  issuer_name: string | null;
  ticker: string | null;
  security_title: string | null;
  transaction_date: string | null;
  filing_date: string | null;
  shares_purchased: number | null;
  price_per_share: number | null;
  shares_owned_after: number | null;
  ownership_type: string | null;
  filing_url: string | null;
  form_type: string;
  quarter: string;
  raw_source: unknown;
  updated_at: string;
};

const UPSERT_CHUNK = 200;
const BUCKET = "ceo-buys";
const PURCHASES_OBJECT = "purchases.json";
const QUARTERS_OBJECT = "quarters.json";

function quarterObject(quarter: string) {
  return `by-quarter/${quarter}.json`;
}

function storageRow(row: CeoDbRow): Record<string, unknown> {
  // Omit bulky raw_source from the public snapshot.
  const { raw_source: _raw, ...rest } = row;
  return {
    ...rest,
    id: row.source_id,
    created_at: row.updated_at,
  };
}

export function toCeoDbRow(
  purchase: CeoStockPurchase,
  nowIso: string,
): CeoDbRow {
  return {
    source_id: purchase.sourceId,
    accession_number: purchase.accessionNumber,
    nonderiv_trans_sk: purchase.nonderivTransSk,
    reporting_owner_cik: purchase.reportingOwnerCik,
    issuer_cik: purchase.issuerCik,
    ceo_name: purchase.ceoName,
    officer_title: purchase.officerTitle,
    issuer_name: purchase.issuerName,
    ticker: purchase.ticker,
    security_title: purchase.securityTitle,
    transaction_date: purchase.transactionDate,
    filing_date: purchase.filingDate,
    shares_purchased: purchase.sharesPurchased,
    price_per_share: purchase.pricePerShare,
    shares_owned_after: purchase.sharesOwnedAfter,
    ownership_type: purchase.ownershipType,
    filing_url: purchase.filingUrl,
    form_type: purchase.formType,
    quarter: purchase.quarter,
    raw_source: purchase.rawSource,
    updated_at: nowIso,
  };
}

let tableAvailable: boolean | null = null;

export async function ceoTableAvailable(
  supabase: SupabaseClient,
): Promise<boolean> {
  if (tableAvailable != null) return tableAvailable;
  const { error } = await supabase
    .from("ceo_stock_purchases")
    .select("source_id")
    .limit(1);
  tableAvailable = !error;
  if (!tableAvailable) {
    console.warn(
      "[ceo-buys] Table ceo_stock_purchases not found — using Supabase Storage fallback. Apply supabase/migrations/20260908160000_ceo_stock_purchases.sql when convenient.",
    );
  }
  return tableAvailable;
}

async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.storage.listBuckets();
  if (data?.some((b) => b.name === BUCKET)) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 104857600,
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Failed to create storage bucket: ${error.message}`);
  }
}

async function downloadJson<T>(
  supabase: SupabaseClient,
  object: string,
  fallback: T,
): Promise<T> {
  const { data, error } = await supabase.storage.from(BUCKET).download(object);
  if (error || !data) return fallback;
  const text = await data.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

async function uploadJson(
  supabase: SupabaseClient,
  object: string,
  value: unknown,
): Promise<void> {
  await ensureBucket(supabase);
  const body = JSON.stringify(value);
  const { error } = await supabase.storage.from(BUCKET).upload(object, body, {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed (${object}): ${error.message}`);
}

export async function upsertCeoPurchases(
  supabase: SupabaseClient,
  purchases: CeoStockPurchase[],
): Promise<{ upserted: number; errors: number; via: "table" | "storage" }> {
  if (purchases.length === 0) return { upserted: 0, errors: 0, via: "table" };
  const nowIso = new Date().toISOString();
  const byId = new Map<string, CeoDbRow>();
  for (const p of purchases) {
    byId.set(p.sourceId, toCeoDbRow(p, nowIso));
  }
  const rows = [...byId.values()];

  if (await ceoTableAvailable(supabase)) {
    let upserted = 0;
    let errors = 0;
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const slice = rows.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase
        .from("ceo_stock_purchases")
        .upsert(slice, { onConflict: "source_id" });
      if (error) {
        errors += 1;
        console.error(`[ceo-buys] upsert chunk failed: ${error.message}`);
        continue;
      }
      upserted += slice.length;
    }
    // Keep storage snapshot in sync for public fallback readers.
    await mergePurchasesIntoStorage(supabase, rows).catch((err) => {
      console.warn(
        `[ceo-buys] storage mirror failed: ${err instanceof Error ? err.message : err}`,
      );
    });
    return { upserted, errors, via: "table" };
  }

  await mergePurchasesIntoStorage(supabase, rows);
  return { upserted: rows.length, errors: 0, via: "storage" };
}

async function mergePurchasesIntoStorage(
  supabase: SupabaseClient,
  rows: CeoDbRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const quarter = rows[0]!.quarter;
  const stored = rows.map(storageRow);
  await uploadJson(supabase, quarterObject(quarter), stored);
  await rebuildPurchasesSnapshot(supabase);
}

async function rebuildPurchasesSnapshot(
  supabase: SupabaseClient,
): Promise<void> {
  await ensureBucket(supabase);
  const { data: files, error } = await supabase.storage
    .from(BUCKET)
    .list("by-quarter", { limit: 1000 });
  if (error) throw new Error(`list by-quarter failed: ${error.message}`);
  const names = (files ?? [])
    .map((f) => f.name)
    .filter((n) => n.endsWith(".json"))
    .sort();
  const all: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const rows = await downloadJson<Record<string, unknown>[]>(
      supabase,
      `by-quarter/${name}`,
      [],
    );
    for (const row of rows) {
      const id = String(row.source_id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      all.push(row);
    }
  }
  all.sort((a, b) => {
    const fd = String(b.filing_date ?? "").localeCompare(String(a.filing_date ?? ""));
    if (fd !== 0) return fd;
    return String(b.transaction_date ?? "").localeCompare(
      String(a.transaction_date ?? ""),
    );
  });
  await uploadJson(supabase, PURCHASES_OBJECT, all);
}

export async function getSuccessfulQuarters(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  if (await ceoTableAvailable(supabase)) {
    const { data, error } = await supabase
      .from("ceo_buys_quarters")
      .select("quarter")
      .eq("status", "success");
    if (error) {
      throw new Error(`Failed to read ceo_buys_quarters: ${error.message}`);
    }
    return new Set((data ?? []).map((r) => String(r.quarter)));
  }
  const quarters = await downloadJson<Record<string, { status?: string }>>(
    supabase,
    QUARTERS_OBJECT,
    {},
  );
  return new Set(
    Object.entries(quarters)
      .filter(([, v]) => v?.status === "success")
      .map(([q]) => q),
  );
}

async function patchQuarterStorage(
  supabase: SupabaseClient,
  quarter: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const quarters = await downloadJson<Record<string, Record<string, unknown>>>(
    supabase,
    QUARTERS_OBJECT,
    {},
  );
  quarters[quarter] = { ...(quarters[quarter] ?? {}), ...patch };
  await uploadJson(supabase, QUARTERS_OBJECT, quarters);
}

export async function markQuarterRunning(
  supabase: SupabaseClient,
  quarter: string,
  zipUrl: string,
): Promise<void> {
  const now = new Date().toISOString();
  if (await ceoTableAvailable(supabase)) {
    const { error } = await supabase.from("ceo_buys_quarters").upsert({
      quarter,
      status: "running",
      zip_url: zipUrl,
      started_at: now,
      last_error: null,
      updated_at: now,
    });
    if (error) throw new Error(error.message);
    return;
  }
  await patchQuarterStorage(supabase, quarter, {
    status: "running",
    zip_url: zipUrl,
    started_at: now,
    last_error: null,
    updated_at: now,
  });
}

export async function markQuarterSuccess(
  supabase: SupabaseClient,
  quarter: string,
  stats: { rowsExtracted: number; rowsUpserted: number },
): Promise<void> {
  const now = new Date().toISOString();
  if (await ceoTableAvailable(supabase)) {
    const { error } = await supabase.from("ceo_buys_quarters").upsert({
      quarter,
      status: "success",
      rows_extracted: stats.rowsExtracted,
      rows_upserted: stats.rowsUpserted,
      finished_at: now,
      last_error: null,
      updated_at: now,
    });
    if (error) throw new Error(error.message);
    return;
  }
  await patchQuarterStorage(supabase, quarter, {
    status: "success",
    rows_extracted: stats.rowsExtracted,
    rows_upserted: stats.rowsUpserted,
    finished_at: now,
    last_error: null,
    updated_at: now,
  });
}

export async function markQuarterFailed(
  supabase: SupabaseClient,
  quarter: string,
  message: string,
): Promise<void> {
  const now = new Date().toISOString();
  if (await ceoTableAvailable(supabase)) {
    const { error } = await supabase.from("ceo_buys_quarters").upsert({
      quarter,
      status: "failed",
      finished_at: now,
      last_error: message.slice(0, 2000),
      updated_at: now,
    });
    if (error) throw new Error(error.message);
    return;
  }
  await patchQuarterStorage(supabase, quarter, {
    status: "failed",
    finished_at: now,
    last_error: message.slice(0, 2000),
    updated_at: now,
  });
}

export async function assertCeoSinkReady(
  supabase: SupabaseClient,
): Promise<"table" | "storage"> {
  if (await ceoTableAvailable(supabase)) return "table";
  await ensureBucket(supabase);
  return "storage";
}
