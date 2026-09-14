/**
 * 8-K / 8-K-A material event filings for the S&P 500 universe.
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
import { loadSp500Tickers } from "./sp500.js";
import {
  getSuccessfulPeriods,
  markFailed,
  markRunning,
  markSuccess,
  upsertChunks,
} from "./datasetState.js";

const SOURCE = "sec_8k";
const FORM_TYPES = new Set(["8-K", "8-K/A"]);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildFilingRow(row: MasterIndexRow, ticker: string | null): Record<string, unknown> {
  return {
    source_id: sourceId(row.formType, row.accession, row.cik),
    accession_number: row.accession,
    form_type: row.formType,
    company_name: row.companyName || null,
    cik: row.cik || null,
    ticker,
    filed_at: null,
    filing_date: row.dateFiled || null,
    items: null,
    description: null,
    filing_url: row.accession ? accessionToFilingUrl(row.accession) : null,
    raw_source: row as unknown as Record<string, unknown>,
  };
}

export type EightKUpdateOptions = {
  force?: boolean;
  only?: string;
  dryRun?: boolean;
  fromYear?: number;
};

export type EightKUpdateResult = {
  status: "success" | "failed";
  periods: number;
  rows: number;
  error: string | null;
};

export async function runEightKUpdate(
  supabase: SupabaseClient,
  opts: EightKUpdateOptions = {},
): Promise<EightKUpdateResult> {
  const quarters = yearQuartersFrom(opts.fromYear ?? 2026);
  const done =
    opts.force || opts.dryRun ? new Set<string>() : await getSuccessfulPeriods(supabase, SOURCE);

  let sp500: Set<string>;
  let tickerMap: Awaited<ReturnType<typeof loadCompanyTickers>>;
  try {
    sp500 = loadSp500Tickers();
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
    console.log(`[8-K] processing ${periodKey}`);
    try {
      if (!opts.dryRun) await markRunning(supabase, SOURCE, periodKey, url);
      const text = await secFetchText(url);
      const allRows = parseMasterIndex(text).filter((r) => FORM_TYPES.has(r.formType));

      const filingRows: Array<Record<string, unknown>> = [];
      for (const row of allRows) {
        const cik = normalizeCik(row.cik);
        const ticker = tickerMap.byCik.get(cik)?.ticker ?? null;
        if (!ticker || !sp500.has(ticker)) continue;
        filingRows.push(buildFilingRow(row, ticker));
      }

      if (opts.dryRun) {
        console.log(
          `[8-K dry-run] ${periodKey}: totalRows=${allRows.length} sp500Matched=${filingRows.length}`,
        );
      } else {
        const upserted = await upsertChunks(
          supabase,
          "sec_company_filings",
          filingRows,
          "source_id",
        );
        await markSuccess(supabase, SOURCE, periodKey, {
          sourceUrl: url,
          rowsExtracted: allRows.length,
          rowsUpserted: upserted,
        });
      }
      totalRows += filingRows.length;
      processed += 1;
    } catch (err) {
      lastError = errorMessage(err);
      console.error(`[8-K] FAILED ${periodKey}: ${lastError}`);
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
