/**
 * S-1 / 424B registered securities offering ingest from EDGAR full-index.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { accessionToFilingUrl, secFetchText } from "./edgarClient.js";
import {
  loadCompanyTickers,
  masterIndexUrl,
  normalizeCik,
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

const SOURCE = "sec_offerings";
const FORM_TYPES = new Set([
  "S-1",
  "S-1/A",
  "424B1",
  "424B2",
  "424B3",
  "424B4",
  "424B5",
]);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildOfferingRow(row: MasterIndexRow, ticker: string | null): Record<string, unknown> {
  return {
    source_id: sourceId("offering", row.accession),
    accession_number: row.accession,
    form_type: row.formType,
    issuer_name: row.companyName || null,
    cik: row.cik || null,
    ticker,
    filing_date: row.dateFiled || null,
    security_description: null,
    shares_offered: null,
    price: null,
    offering_size: null,
    filing_url: row.accession ? accessionToFilingUrl(row.accession) : null,
    raw_source: row as unknown as Record<string, unknown>,
  };
}

export type OfferingsUpdateOptions = {
  force?: boolean;
  only?: string;
  dryRun?: boolean;
  fromYear?: number;
};

export type OfferingsUpdateResult = {
  status: "success" | "failed";
  periods: number;
  rows: number;
  error: string | null;
};

export async function runOfferingsUpdate(
  supabase: SupabaseClient,
  opts: OfferingsUpdateOptions = {},
): Promise<OfferingsUpdateResult> {
  const quarters = yearQuartersFrom(opts.fromYear ?? 2026);
  const done =
    opts.force || opts.dryRun ? new Set<string>() : await getSuccessfulPeriods(supabase, SOURCE);

  let tickerMap: Awaited<ReturnType<typeof loadCompanyTickers>>;
  try {
    tickerMap = await loadCompanyTickers();
  } catch (err) {
    return { status: "failed", periods: 0, rows: 0, error: errorMessage(err) };
  }

  let totalRows = 0;
  let processed = 0;
  let lastError: string | null = null;

  for (const { year, quarter } of quarters) {
    const periodKey = `${year}q${quarter}`;
    if (opts.only && opts.only !== periodKey) continue;
    if (!opts.force && done.has(periodKey)) continue;

    const url = masterIndexUrl(year, quarter);
    console.log(`[offerings] processing ${periodKey}`);
    try {
      if (!opts.dryRun) await markRunning(supabase, SOURCE, periodKey, url);
      const text = await secFetchText(url);
      const rows = parseMasterIndex(text).filter((r) => FORM_TYPES.has(r.formType));
      const offeringRows = rows.map((row) => {
        const ticker = tickerMap.byCik.get(normalizeCik(row.cik))?.ticker ?? null;
        return buildOfferingRow(row, ticker);
      });

      if (opts.dryRun) {
        console.log(`[offerings dry-run] ${periodKey}: rows=${offeringRows.length}`);
      } else {
        const upserted = await upsertChunks(
          supabase,
          "sec_offerings",
          offeringRows,
          "source_id",
        );
        await markSuccess(supabase, SOURCE, periodKey, {
          sourceUrl: url,
          rowsExtracted: rows.length,
          rowsUpserted: upserted,
        });
      }
      totalRows += offeringRows.length;
      processed += 1;
    } catch (err) {
      lastError = errorMessage(err);
      console.error(`[offerings] FAILED ${periodKey}: ${lastError}`);
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
