/**
 * Form N-PORT holdings ingest.
 *
 * N-PORT bulk data sets are enormous (multi-GB unzipped across ~30 TSV
 * files). We deliberately never load the full holdings universe into
 * memory: FUND_REPORTED_HOLDING.tsv and IDENTIFIERS.tsv are streamed
 * line-by-line and only rows that resolve to a known S&P 500 ticker
 * (via IDENTIFIERS.tsv ticker, or a CUSIP already seen in our 13F
 * holdings for an S&P 500 name) are kept.
 */
import { dirname, join, resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accessionToFilingUrl, downloadToFile, secFetchText, unzipToDir } from "./edgarClient.js";
import {
  normalizeCik,
  normalizeCusip,
  normalizeTicker,
  parseNumber,
  sourceId,
} from "./identifiers.js";
import { loadSp500Tickers } from "./sp500.js";
import {
  getSuccessfulPeriods,
  markFailed,
  markRunning,
  markSuccess,
  upsertChunks,
} from "./datasetState.js";
import { parseSecTsvDate, readTsvFile, streamTsvRows, type TsvRow } from "./tsv.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SOURCE = "sec_nport";
const INDEX_URL = "https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets";
const ZIP_HREF_RE = /href="(\/files\/dera\/data\/form-n-port-data-sets\/([^"]+?\.zip))"/gi;
const FLUSH_SIZE = 500;

export type NportPeriod = {
  periodKey: string;
  url: string;
};

function periodContainsYearOrLater(periodKey: string, fromYear: number): boolean {
  const years = [...periodKey.matchAll(/(19|20)\d{2}/g)].map((m) => Number(m[0]));
  if (years.length === 0) return false;
  return years.some((y) => y >= fromYear);
}

export async function listNportPeriods(fromYear = 2026): Promise<NportPeriod[]> {
  const html = await secFetchText(INDEX_URL);
  const byPeriod = new Map<string, NportPeriod>();
  for (const match of html.matchAll(ZIP_HREF_RE)) {
    const path = match[1]!;
    const base = match[2]!.replace(/\.zip$/i, "");
    const periodKey = base.toLowerCase();
    if (!periodContainsYearOrLater(periodKey, fromYear)) continue;
    byPeriod.set(periodKey, { periodKey, url: `https://www.sec.gov${path}` });
  }
  return [...byPeriod.values()].sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function findFileByHeaderHint(
  dir: string,
  preferredName: string,
  requiredHeaders: string[],
): Promise<string | null> {
  const entries = await readdir(dir);
  const tsvFiles = entries.filter((e) => e.toLowerCase().endsWith(".tsv"));
  console.log(`[N-PORT] discovered files in ${dir}: ${tsvFiles.join(", ")}`);

  const preferred = tsvFiles.find((e) => e.toLowerCase() === preferredName.toLowerCase());
  if (preferred) return join(dir, preferred);

  for (const file of tsvFiles) {
    const path = join(dir, file);
    const { readTsvHeader } = await import("./tsv.js");
    const headers = (await readTsvHeader(path)).map((h) => h.toUpperCase());
    if (requiredHeaders.every((h) => headers.includes(h))) {
      console.log(`[N-PORT] using ${file} as fallback for required headers [${requiredHeaders.join(", ")}]`);
      return path;
    }
  }
  return null;
}

async function loadCusipTickerMap(
  supabase: SupabaseClient,
  sp500: Set<string>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data, error } = await supabase
      .from("sec_13f_holdings")
      .select("cusip,ticker")
      .not("cusip", "is", null)
      .not("ticker", "is", null)
      .limit(20_000);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const ticker = normalizeTicker(row.ticker as string | null);
      const cusip = normalizeCusip(row.cusip as string | null);
      if (ticker && cusip && sp500.has(ticker)) map.set(cusip, ticker);
    }
  } catch (err) {
    console.warn(`[N-PORT] failed to preload cusip->ticker map from sec_13f_holdings: ${errorMessage(err)}`);
  }
  return map;
}

async function buildTickerByHoldingId(
  identifiersPath: string,
  sp500: Set<string>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for await (const row of streamTsvRows(identifiersPath)) {
    const ticker = normalizeTicker(row.IDENTIFIER_TICKER);
    if (!ticker || !sp500.has(ticker)) continue;
    const holdingId = (row.HOLDING_ID ?? "").trim();
    if (!holdingId) continue;
    map.set(holdingId, ticker);
  }
  return map;
}

async function processNportPeriod(
  supabase: SupabaseClient,
  period: NportPeriod,
  dryRun: boolean,
): Promise<number> {
  const cacheDir = resolve(__dirname, "../../.cache/sec-nport", period.periodKey);
  const zipPath = join(cacheDir, `${period.periodKey}.zip`);
  const extractDir = join(cacheDir, "extract");

  await downloadToFile(period.url, zipPath, { minBytes: 100_000 });
  await unzipToDir(zipPath, extractDir);

  const sp500 = loadSp500Tickers();
  const cusipTickerMap = await loadCusipTickerMap(supabase, sp500);

  const identifiersPath = await findFileByHeaderHint(extractDir, "IDENTIFIERS.tsv", [
    "HOLDING_ID",
    "IDENTIFIER_TICKER",
  ]);
  const tickerByHoldingId = identifiersPath
    ? await buildTickerByHoldingId(identifiersPath, sp500)
    : new Map<string, string>();
  console.log(`[N-PORT] ${period.periodKey}: resolved ${tickerByHoldingId.size} S&P 500 ticker identifiers`);

  const holdingsPath = await findFileByHeaderHint(extractDir, "FUND_REPORTED_HOLDING.tsv", [
    "ACCESSION_NUMBER",
    "HOLDING_ID",
    "ISSUER_CUSIP",
  ]);
  if (!holdingsPath) {
    console.warn(`[N-PORT] ${period.periodKey}: no holdings-like TSV found, skipping`);
    return 0;
  }

  const [registrantRows, submissionRows] = await Promise.all([
    readTsvFile(join(extractDir, "REGISTRANT.tsv")).catch(() => ({ headers: [], rows: [] as TsvRow[] })),
    readTsvFile(join(extractDir, "SUBMISSION.tsv")).catch(() => ({ headers: [], rows: [] as TsvRow[] })),
  ]);
  const registrantByAcc = new Map<string, TsvRow>();
  for (const row of registrantRows.rows) registrantByAcc.set(row.ACCESSION_NUMBER ?? "", row);
  const submissionByAcc = new Map<string, TsvRow>();
  for (const row of submissionRows.rows) submissionByAcc.set(row.ACCESSION_NUMBER ?? "", row);

  let kept = 0;
  let buffer: Array<Record<string, unknown>> = [];

  const flush = async () => {
    if (buffer.length === 0) return;
    if (!dryRun) {
      await upsertChunks(supabase, "sec_nport_holdings", buffer, "source_id");
    }
    buffer = [];
  };

  for await (const row of streamTsvRows(holdingsPath)) {
    const cusip = normalizeCusip(row.ISSUER_CUSIP);
    const holdingId = (row.HOLDING_ID ?? "").trim();
    const ticker = tickerByHoldingId.get(holdingId) ?? (cusip ? cusipTickerMap.get(cusip) ?? null : null);
    if (!ticker) continue;

    const acc = (row.ACCESSION_NUMBER ?? "").trim();
    const registrant = registrantByAcc.get(acc);
    const submission = submissionByAcc.get(acc);
    const reportDate =
      parseSecTsvDate(submission?.REPORT_ENDING_PERIOD) ?? parseSecTsvDate(submission?.REPORT_DATE);

    buffer.push({
      source_id: sourceId("nport", acc, holdingId),
      accession_number: acc || null,
      fund_name: (registrant?.REGISTRANT_NAME ?? "").trim() || null,
      fund_cik: registrant?.CIK ? normalizeCik(registrant.CIK) : null,
      report_date: reportDate,
      issuer_name: (row.ISSUER_NAME ?? "").trim() || null,
      security_name: (row.ISSUER_TITLE ?? "").trim() || null,
      cusip,
      ticker,
      shares: parseNumber(row.BALANCE),
      value_usd: parseNumber(row.CURRENCY_VALUE),
      pct_portfolio: parseNumber(row.PERCENTAGE),
      dataset_period: period.periodKey,
      raw_source: row,
    });
    kept += 1;

    if (buffer.length >= FLUSH_SIZE) await flush();
  }
  await flush();

  console.log(`[N-PORT] ${period.periodKey}: kept ${kept} S&P 500-matched holdings`);
  return kept;
}

export type NportUpdateOptions = {
  force?: boolean;
  only?: string;
  dryRun?: boolean;
  fromYear?: number;
};

export type NportUpdateResult = {
  status: "success" | "failed";
  periods: number;
  rows: number;
  error: string | null;
};

export async function runNportUpdate(
  supabase: SupabaseClient,
  opts: NportUpdateOptions = {},
): Promise<NportUpdateResult> {
  let periods: NportPeriod[];
  try {
    periods = await listNportPeriods(opts.fromYear ?? 2026);
  } catch (err) {
    return { status: "failed", periods: 0, rows: 0, error: errorMessage(err) };
  }

  if (opts.only) periods = periods.filter((p) => p.periodKey === opts.only);

  const done =
    opts.force || opts.dryRun ? new Set<string>() : await getSuccessfulPeriods(supabase, SOURCE);

  let totalRows = 0;
  let processed = 0;
  let lastError: string | null = null;

  for (const period of periods) {
    if (!opts.force && done.has(period.periodKey)) continue;
    console.log(`[N-PORT] processing ${period.periodKey}`);
    try {
      if (!opts.dryRun) await markRunning(supabase, SOURCE, period.periodKey, period.url);
      const rows = await processNportPeriod(supabase, period, opts.dryRun ?? false);
      totalRows += rows;
      processed += 1;
      if (!opts.dryRun) {
        await markSuccess(supabase, SOURCE, period.periodKey, {
          sourceUrl: period.url,
          rowsUpserted: rows,
        });
      }
    } catch (err) {
      lastError = errorMessage(err);
      console.error(`[N-PORT] FAILED ${period.periodKey}: ${lastError}`);
      if (!opts.dryRun) await markFailed(supabase, SOURCE, period.periodKey, err, period.url);
    }
  }

  return {
    status: lastError && processed === 0 ? "failed" : "success",
    periods: processed,
    rows: totalRows,
    error: lastError,
  };
}
