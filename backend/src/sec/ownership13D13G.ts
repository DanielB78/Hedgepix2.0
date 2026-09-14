/**
 * Schedule 13D / 13G (large beneficial ownership) ingest from EDGAR full-index.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { accessionToFilingUrl, secFetchText } from "./edgarClient.js";
import {
  masterIndexUrl,
  parseMasterIndex,
  resolveIssuerTicker,
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

const SOURCE = "sec_13dg";
const FORM_RE = /^SC\s*13[DG](\/A)?$/i;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isTargetForm(formType: string): boolean {
  return FORM_RE.test(formType.trim());
}

async function buildOwnershipRow(row: MasterIndexRow): Promise<Record<string, unknown>> {
  const amendment = /\/A\s*$/.test(row.formType.trim());
  const ticker = await resolveIssuerTicker(row.companyName);
  return {
    source_id: sourceId("13dg", row.accession, row.cik),
    accession_number: row.accession,
    form_type: row.formType,
    filing_date: row.dateFiled || null,
    reporting_person: null,
    filer_cik: null,
    target_company: row.companyName || null,
    target_cik: row.cik || null,
    ticker,
    ownership_pct: null,
    shares_beneficially_owned: null,
    amendment,
    change_type: null,
    filing_url: row.accession ? accessionToFilingUrl(row.accession) : null,
    raw_source: row as unknown as Record<string, unknown>,
  };
}

export type Ownership13UpdateOptions = {
  force?: boolean;
  only?: string;
  dryRun?: boolean;
  fromYear?: number;
};

export type Ownership13UpdateResult = {
  status: "success" | "failed";
  periods: number;
  rows: number;
  error: string | null;
};

export async function runOwnership13Update(
  supabase: SupabaseClient,
  opts: Ownership13UpdateOptions = {},
): Promise<Ownership13UpdateResult> {
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
    console.log(`[13D/G] processing ${periodKey}`);
    try {
      if (!opts.dryRun) await markRunning(supabase, SOURCE, periodKey, url);
      const text = await secFetchText(url);
      const rows = parseMasterIndex(text).filter((r) => isTargetForm(r.formType));

      const ownershipRows: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        ownershipRows.push(await buildOwnershipRow(row));
      }

      if (opts.dryRun) {
        console.log(`[13D/G dry-run] ${periodKey}: rows=${ownershipRows.length}`);
      } else {
        const upserted = await upsertChunks(
          supabase,
          "sec_large_ownership_filings",
          ownershipRows,
          "source_id",
        );
        await markSuccess(supabase, SOURCE, periodKey, {
          sourceUrl: url,
          rowsExtracted: rows.length,
          rowsUpserted: upserted,
        });
      }
      totalRows += ownershipRows.length;
      processed += 1;
    } catch (err) {
      lastError = errorMessage(err);
      console.error(`[13D/G] FAILED ${periodKey}: ${lastError}`);
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
