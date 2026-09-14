/**
 * Form 13F structured data set ingest.
 * Loads quarterly/period bulk ZIPs, upserts holdings, and derives
 * manager+cusip position changes vs the prior reported period.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accessionToFilingUrl, downloadToFile, secFetchText, unzipToDir } from "./edgarClient.js";
import {
  normalizeCik,
  normalizeCusip,
  parseNumber,
  resolveIssuerTicker,
  sourceId,
} from "./identifiers.js";
import {
  getSuccessfulPeriods,
  markFailed,
  markRunning,
  markSuccess,
  upsertChunks,
} from "./datasetState.js";
import { findFileCaseInsensitive, parseSecTsvDate, readTsvFile, type TsvRow } from "./tsv.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SOURCE = "sec_13f";
const INDEX_URL = "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets";
const ZIP_HREF_RE =
  /href="(\/files\/structureddata\/data\/form-13f-data-sets\/([^"]+?\.zip))"/gi;

export type ThirteenFPeriod = {
  periodKey: string;
  url: string;
};

export type PositionChangeType =
  | "NEW_POSITION"
  | "INCREASED"
  | "REDUCED"
  | "EXITED"
  | "UNCHANGED";

/** Pure classification of a manager/cusip position change (unit-testable). */
export function classifyPositionChange(
  priorShares: number | null | undefined,
  currentShares: number | null | undefined,
): PositionChangeType {
  const prior = priorShares ?? 0;
  const current = currentShares ?? 0;
  if (prior <= 0 && current > 0) return "NEW_POSITION";
  if (current <= 0 && prior > 0) return "EXITED";
  if (current > prior) return "INCREASED";
  if (current < prior) return "REDUCED";
  return "UNCHANGED";
}

function periodContainsYearOrLater(periodKey: string, fromYear: number): boolean {
  const years = [...periodKey.matchAll(/(19|20)\d{2}/g)].map((m) => Number(m[0]));
  if (years.length === 0) return false;
  return years.some((y) => y >= fromYear);
}

export async function list13FPeriods(fromYear = 2026): Promise<ThirteenFPeriod[]> {
  const html = await secFetchText(INDEX_URL);
  const byPeriod = new Map<string, ThirteenFPeriod>();
  for (const match of html.matchAll(ZIP_HREF_RE)) {
    const path = match[1]!;
    const base = match[2]!.replace(/\.zip$/i, "");
    const periodKey = base.toLowerCase();
    if (!periodContainsYearOrLater(periodKey, fromYear)) continue;
    byPeriod.set(periodKey, { periodKey, url: `https://www.sec.gov${path}` });
  }
  return [...byPeriod.values()].sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}

type FilingRow = Record<string, unknown>;
type HoldingRow = Record<string, unknown> & {
  manager_cik: string;
  manager_name: string | null;
  report_period: string | null;
  cusip: string | null;
  ticker: string | null;
  issuer_name: string | null;
  shares: number | null;
  value_usd: number | null;
};

async function discoverTsv(dir: string, name: string): Promise<TsvRow[]> {
  const path = await findFileCaseInsensitive(dir, name);
  if (!path) return [];
  return (await readTsvFile(path)).rows;
}

async function process13FPeriod(
  period: ThirteenFPeriod,
  dryRun: boolean,
): Promise<{ filings: FilingRow[]; holdings: HoldingRow[] }> {
  const cacheDir = resolve(__dirname, "../../.cache/sec-13f", period.periodKey);
  const zipPath = join(cacheDir, `${period.periodKey}.zip`);
  const extractDir = join(cacheDir, "extract");

  await downloadToFile(period.url, zipPath, { minBytes: 10_000 });
  await unzipToDir(zipPath, extractDir);

  const [submissionRows, coverRows, infoRows] = await Promise.all([
    discoverTsv(extractDir, "SUBMISSION.tsv"),
    discoverTsv(extractDir, "COVERPAGE.tsv"),
    discoverTsv(extractDir, "INFOTABLE.tsv"),
  ]);
  if (infoRows.length === 0) {
    throw new Error(`INFOTABLE.tsv missing or empty for period ${period.periodKey}`);
  }

  const submissionByAcc = new Map<string, TsvRow>();
  for (const row of submissionRows) submissionByAcc.set(row.ACCESSION_NUMBER ?? "", row);
  const coverByAcc = new Map<string, TsvRow>();
  for (const row of coverRows) coverByAcc.set(row.ACCESSION_NUMBER ?? "", row);

  const filingsByAcc = new Map<string, FilingRow>();
  const holdings: HoldingRow[] = [];

  for (const info of infoRows) {
    const acc = (info.ACCESSION_NUMBER ?? "").trim();
    if (!acc) continue;
    const sub = submissionByAcc.get(acc);
    const cover = coverByAcc.get(acc);
    const managerCik = normalizeCik(sub?.CIK);
    if (!managerCik) continue;
    const managerName = (cover?.FILINGMANAGER_NAME ?? "").trim() || null;
    const reportPeriod =
      parseSecTsvDate(sub?.PERIODOFREPORT) ?? parseSecTsvDate(cover?.REPORTCALENDARORQUARTER);
    const filingDate = parseSecTsvDate(sub?.FILING_DATE);
    const cusip = normalizeCusip(info.CUSIP);
    const issuerName = (info.NAMEOFISSUER ?? "").trim() || null;
    const ticker = await resolveIssuerTicker(issuerName);
    const shares = parseNumber(info.SSHPRNAMT);
    const valueUsd = parseNumber(info.VALUE);
    const infotableSk = (info.INFOTABLE_SK ?? "").trim();
    const sid = sourceId(acc, infotableSk || `${cusip ?? ""}|${issuerName ?? ""}`);

    holdings.push({
      source_id: sid,
      accession_number: acc,
      manager_cik: managerCik,
      manager_name: managerName,
      report_period: reportPeriod,
      filing_date: filingDate,
      issuer_name: issuerName,
      title_of_class: (info.TITLEOFCLASS ?? "").trim() || null,
      cusip,
      ticker,
      shares,
      value_usd: valueUsd,
      put_call: (info.PUTCALL ?? "").trim() || null,
      investment_discretion: (info.INVESTMENTDISCRETION ?? "").trim() || null,
      voting_sole: parseNumber(info.VOTING_AUTH_SOLE),
      voting_shared: parseNumber(info.VOTING_AUTH_SHARED),
      voting_none: parseNumber(info.VOTING_AUTH_NONE),
      dataset_period: period.periodKey,
      raw_source: info,
    });

    if (!filingsByAcc.has(acc)) {
      filingsByAcc.set(acc, {
        accession_number: acc,
        manager_cik: managerCik,
        manager_name: managerName,
        report_period: reportPeriod,
        filing_date: filingDate,
        form_type: (sub?.SUBMISSIONTYPE ?? "13F").trim() || "13F",
        filing_url: accessionToFilingUrl(acc),
        dataset_period: period.periodKey,
        raw_source: (sub ?? cover ?? null) as unknown as Record<string, unknown> | null,
      });
    }
  }

  if (dryRun) {
    console.log(
      `[13F dry-run] ${period.periodKey}: filings=${filingsByAcc.size} holdings=${holdings.length}`,
    );
  }

  return { filings: [...filingsByAcc.values()], holdings };
}

type PriorAgg = { shares: number; valueUsd: number };

async function computePositionChanges(
  supabase: SupabaseClient,
  holdings: HoldingRow[],
): Promise<Array<Record<string, unknown>>> {
  type CurrentAgg = {
    managerCik: string;
    managerName: string | null;
    reportPeriod: string;
    cusip: string;
    ticker: string | null;
    issuerName: string | null;
    shares: number;
    valueUsd: number;
  };

  const currentMap = new Map<string, CurrentAgg>();
  for (const h of holdings) {
    if (!h.manager_cik || !h.cusip || !h.report_period) continue;
    const key = `${h.manager_cik}|${h.cusip}|${h.report_period}`;
    const shares = h.shares ?? 0;
    const valueUsd = h.value_usd ?? 0;
    const existing = currentMap.get(key);
    if (existing) {
      existing.shares += shares;
      existing.valueUsd += valueUsd;
    } else {
      currentMap.set(key, {
        managerCik: h.manager_cik,
        managerName: h.manager_name,
        reportPeriod: h.report_period,
        cusip: h.cusip,
        ticker: h.ticker,
        issuerName: h.issuer_name,
        shares,
        valueUsd,
      });
    }
  }

  if (currentMap.size === 0) return [];

  const managerCiks = [...new Set([...currentMap.values()].map((a) => a.managerCik))];
  const { data: priorRows, error } = await supabase
    .from("sec_13f_holdings")
    .select("manager_cik,cusip,report_period,shares,value_usd")
    .in("manager_cik", managerCiks);
  if (error) throw new Error(`sec_13f_holdings prior read failed: ${error.message}`);

  const priorByManagerCusip = new Map<string, Map<string, PriorAgg>>();
  for (const row of priorRows ?? []) {
    const managerCik = row.manager_cik ? String(row.manager_cik) : null;
    const cusip = row.cusip ? String(row.cusip) : null;
    const period = row.report_period ? String(row.report_period) : null;
    if (!managerCik || !cusip || !period) continue;
    const key = `${managerCik}|${cusip}`;
    const periodMap = priorByManagerCusip.get(key) ?? new Map<string, PriorAgg>();
    const entry = periodMap.get(period) ?? { shares: 0, valueUsd: 0 };
    entry.shares += Number(row.shares ?? 0);
    entry.valueUsd += Number(row.value_usd ?? 0);
    periodMap.set(period, entry);
    priorByManagerCusip.set(key, periodMap);
  }

  const changes: Array<Record<string, unknown>> = [];
  for (const agg of currentMap.values()) {
    const periodMap = priorByManagerCusip.get(`${agg.managerCik}|${agg.cusip}`);
    let priorPeriod: string | null = null;
    let priorShares: number | null = null;
    let priorValue: number | null = null;
    if (periodMap) {
      const earlierPeriods = [...periodMap.keys()]
        .filter((p) => p < agg.reportPeriod)
        .sort()
        .reverse();
      if (earlierPeriods.length > 0) {
        priorPeriod = earlierPeriods[0]!;
        const entry = periodMap.get(priorPeriod)!;
        priorShares = entry.shares;
        priorValue = entry.valueUsd;
      }
    }

    const changeType = classifyPositionChange(priorShares, agg.shares);
    const shareChange = agg.shares - (priorShares ?? 0);
    const shareChangePct =
      priorShares && priorShares !== 0 ? (shareChange / priorShares) * 100 : null;
    const valueChange = agg.valueUsd - (priorValue ?? 0);

    changes.push({
      source_id: sourceId("13f-change", agg.managerCik, agg.cusip, agg.reportPeriod),
      manager_cik: agg.managerCik,
      manager_name: agg.managerName,
      report_period: agg.reportPeriod,
      prior_period: priorPeriod,
      cusip: agg.cusip,
      ticker: agg.ticker,
      issuer_name: agg.issuerName,
      change_type: changeType,
      shares: agg.shares,
      prior_shares: priorShares,
      share_change: shareChange,
      share_change_pct: shareChangePct,
      value_usd: agg.valueUsd,
      prior_value_usd: priorValue,
      value_change: valueChange,
    });
  }
  return changes;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type ThirteenFUpdateOptions = {
  force?: boolean;
  only?: string;
  dryRun?: boolean;
  fromYear?: number;
};

export type ThirteenFUpdateResult = {
  status: "success" | "failed";
  periods: number;
  rows: number;
  error: string | null;
};

export async function runThirteenFUpdate(
  supabase: SupabaseClient,
  opts: ThirteenFUpdateOptions = {},
): Promise<ThirteenFUpdateResult> {
  let periods: ThirteenFPeriod[];
  try {
    periods = await list13FPeriods(opts.fromYear ?? 2026);
  } catch (err) {
    return { status: "failed", periods: 0, rows: 0, error: errorMessage(err) };
  }

  if (opts.only) {
    periods = periods.filter((p) => p.periodKey === opts.only);
  }

  const done =
    opts.force || opts.dryRun ? new Set<string>() : await getSuccessfulPeriods(supabase, SOURCE);

  let totalRows = 0;
  let processed = 0;
  let lastError: string | null = null;

  for (const period of periods) {
    if (!opts.force && done.has(period.periodKey)) continue;
    console.log(`[13F] processing ${period.periodKey}`);
    try {
      if (!opts.dryRun) await markRunning(supabase, SOURCE, period.periodKey, period.url);
      const { filings, holdings } = await process13FPeriod(period, opts.dryRun ?? false);

      let rows = filings.length + holdings.length;
      if (!opts.dryRun) {
        await upsertChunks(supabase, "sec_13f_filings", filings, "accession_number");
        await upsertChunks(supabase, "sec_13f_holdings", holdings, "source_id");
        const changes = await computePositionChanges(supabase, holdings);
        if (changes.length > 0) {
          await upsertChunks(supabase, "sec_13f_position_changes", changes, "source_id");
        }
        rows += changes.length;
        await markSuccess(supabase, SOURCE, period.periodKey, {
          sourceUrl: period.url,
          rowsExtracted: holdings.length,
          rowsUpserted: rows,
        });
      }
      totalRows += rows;
      processed += 1;
    } catch (err) {
      lastError = errorMessage(err);
      console.error(`[13F] FAILED ${period.periodKey}: ${lastError}`);
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