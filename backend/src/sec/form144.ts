/**
 * Form 144 (proposed sale of restricted/control securities) ingest from
 * EDGAR full-index. NOTE: these are *proposed* sales only — a Form 144
 * filing does not guarantee the sale was executed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { accessionToFilingUrl, secFetchText } from "./edgarClient.js";
import {
  masterIndexUrl,
  parseMasterIndex,
  sourceId,
  yearQuartersFrom,
  type MasterIndexRow,
} from "./identifiers.js";
import {
  getSuccessfulPeriods,
  markFailed,
  markRunning,
  markSuccess,
  upsertChunks,
} from "./datasetState.js";

const SOURCE = "sec_form144";
const FORM_TYPES = new Set(["144", "144/A"]);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildForm144Row(row: MasterIndexRow): Record<string, unknown> {
  return {
    source_id: sourceId("144", row.accession, row.cik),
    accession_number: row.accession,
    filing_date: row.dateFiled || null,
    // The full-index only exposes the filer (seller); proposed sale date and
    // issuer detail require parsing the underlying filing document.
    proposed_sale_date: null,
    filer_name: row.companyName || null,
    filer_cik: row.cik || null,
    issuer_name: null,
    issuer_cik: null,
    ticker: null,
    shares_proposed: null,
    aggregate_market_value: null,
    broker: null,
    filing_url: row.accession ? accessionToFilingUrl(row.accession) : null,
    raw_source: row as unknown as Record<string, unknown>,
  };
}

export type Form144UpdateOptions = {
  force?: boolean;
  only?: string;
  dryRun?: boolean;
  fromYear?: number;
};

export type Form144UpdateResult = {
  status: "success" | "failed";
  periods: number;
  rows: number;
  error: string | null;
};

export async function runForm144Update(
  supabase: SupabaseClient,
  opts: Form144UpdateOptions = {},
): Promise<Form144UpdateResult> {
  const quarters = yearQuartersFrom(opts.fromYear ?? 2026);
  const done =
    opts.force || opts.dryRun ? new Set<string>() : await getSuccessfulPeriods(supabase, SOURCE);

  let totalRows = 0;
  let processed = 0;
  let lastError: string | null = null;

  for (const { year, quarter } of quarters) {
    const periodKey = `${year}q${quarter}`;
    if (opts.only && opts.only !== periodKey) continue;
    if (!opts.force && done.has(periodKey)) continue;

    const url = masterIndexUrl(year, quarter);
    console.log(`[144] processing ${periodKey}`);
    try {
      if (!opts.dryRun) await markRunning(supabase, SOURCE, periodKey, url);
      const text = await secFetchText(url);
      const rows = parseMasterIndex(text).filter((r) => FORM_TYPES.has(r.formType));
      const salesRows = rows.map(buildForm144Row);

      if (opts.dryRun) {
        console.log(`[144 dry-run] ${periodKey}: rows=${salesRows.length}`);
      } else {
        const upserted = await upsertChunks(
          supabase,
          "sec_form144_sales",
          salesRows,
          "source_id",
        );
        await markSuccess(supabase, SOURCE, periodKey, {
          sourceUrl: url,
          rowsExtracted: rows.length,
          rowsUpserted: upserted,
        });
      }
      totalRows += salesRows.length;
      processed += 1;
    } catch (err) {
      lastError = errorMessage(err);
      console.error(`[144] FAILED ${periodKey}: ${lastError}`);
      if (!opts.dryRun) await markFailed(supabase, SOURCE, periodKey, err, url);
    }
  }

  return {
    status: lastError && processed === 0 ? "failed" : "success",
    periods: processed,
    rows: totalRows,
    error: lastError,
  };
}
