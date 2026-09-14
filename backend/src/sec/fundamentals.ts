/**
 * 10-Q / 10-K fundamentals ingest (S&P 500 scope).
 * Filing metadata comes from the EDGAR full-index; a limited number of
 * companies per run also get XBRL companyfacts fetched to extract core
 * financial statement figures + YoY deltas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { accessionToFilingUrl, secFetchJson, secFetchText } from "./edgarClient.js";
import {
  loadCompanyTickers,
  masterIndexUrl,
  normalizeCik,
  padCik,
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

const SOURCE = "sec_fundamentals";
const FORM_TYPES = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A"]);
const DEFAULT_COMPANYFACTS_LIMIT = 20;

type XbrlFact = {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
};

type CompanyFacts = {
  cik?: number;
  entityName?: string;
  facts?: {
    "us-gaap"?: Record<string, { units?: Record<string, XbrlFact[]> }>;
  };
};

const CONCEPTS = {
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
  ],
  net_income: ["NetIncomeLoss"],
  operating_income: ["OperatingIncomeLoss"],
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
  total_assets: ["Assets"],
  total_liabilities: ["Liabilities"],
  debt: ["LongTermDebt", "LongTermDebtNoncurrent"],
  operating_cash_flow: ["NetCashProvidedByUsedInOperatingActivities"],
  eps: ["EarningsPerShareDiluted"],
} as const;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildFilingRow(row: MasterIndexRow, ticker: string): Record<string, unknown> {
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

function getConceptSeries(cf: CompanyFacts, names: readonly string[]): XbrlFact[] | null {
  const usGaap = cf.facts?.["us-gaap"];
  if (!usGaap) return null;
  for (const name of names) {
    const entries = usGaap[name]?.units?.USD ?? usGaap[name]?.units?.["USD/shares"];
    if (entries && entries.length > 0) return entries;
  }
  return null;
}

function latestFact(entries: XbrlFact[]): XbrlFact | null {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => a.end.localeCompare(b.end)).at(-1) ?? null;
}

function findYoyFact(entries: XbrlFact[], latest: XbrlFact): XbrlFact | null {
  const latestEndMs = new Date(latest.end).getTime();
  const latestDurationDays = latest.start
    ? (latestEndMs - new Date(latest.start).getTime()) / 86_400_000
    : null;
  let best: XbrlFact | null = null;
  let bestDiff = Infinity;
  for (const entry of entries) {
    if (entry.accn === latest.accn && entry.end === latest.end) continue;
    const endMs = new Date(entry.end).getTime();
    const daysBefore = (latestEndMs - endMs) / 86_400_000;
    if (daysBefore < 300 || daysBefore > 430) continue;
    if (latestDurationDays != null) {
      if (!entry.start) continue;
      const durationDays = (endMs - new Date(entry.start).getTime()) / 86_400_000;
      if (Math.abs(durationDays - latestDurationDays) > 20) continue;
    }
    const diff = Math.abs(daysBefore - 365);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = entry;
    }
  }
  return best;
}

type ConceptValue = { latest: number | null; prior: number | null; yoyPct: number | null };

function readConceptValue(
  cf: CompanyFacts,
  names: readonly string[],
  anchorAccn: string,
): ConceptValue {
  const series = getConceptSeries(cf, names);
  if (!series) return { latest: null, prior: null, yoyPct: null };
  const match = series.find((e) => e.accn === anchorAccn) ?? null;
  if (!match) return { latest: null, prior: null, yoyPct: null };
  const prior = findYoyFact(series, match);
  const yoyPct = prior && prior.val !== 0 ? ((match.val - prior.val) / Math.abs(prior.val)) * 100 : null;
  return { latest: match.val, prior: prior?.val ?? null, yoyPct };
}

async function fetchFundamentalsForCik(
  cik: string,
  ticker: string,
  companyName: string | null,
): Promise<Array<Record<string, unknown>>> {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`;
  const cf = await secFetchJson<CompanyFacts>(url);

  const anchorSeries = getConceptSeries(cf, CONCEPTS.revenue) ?? getConceptSeries(cf, CONCEPTS.net_income);
  const anchor = anchorSeries ? latestFact(anchorSeries) : null;
  if (!anchor) return [];

  const revenue = readConceptValue(cf, CONCEPTS.revenue, anchor.accn);
  const netIncome = readConceptValue(cf, CONCEPTS.net_income, anchor.accn);
  const operatingIncome = readConceptValue(cf, CONCEPTS.operating_income, anchor.accn);
  const cash = readConceptValue(cf, CONCEPTS.cash, anchor.accn);
  const totalAssets = readConceptValue(cf, CONCEPTS.total_assets, anchor.accn);
  const totalLiabilities = readConceptValue(cf, CONCEPTS.total_liabilities, anchor.accn);
  const debt = readConceptValue(cf, CONCEPTS.debt, anchor.accn);
  const operatingCashFlow = readConceptValue(cf, CONCEPTS.operating_cash_flow, anchor.accn);
  const eps = readConceptValue(cf, CONCEPTS.eps, anchor.accn);

  return [
    {
      source_id: sourceId("fundamentals", cik, anchor.accn),
      cik,
      ticker,
      company_name: companyName,
      form_type: anchor.form,
      accession_number: anchor.accn,
      period_end: anchor.end,
      filed_at: anchor.filed ? new Date(anchor.filed).toISOString() : null,
      revenue: revenue.latest,
      net_income: netIncome.latest,
      operating_income: operatingIncome.latest,
      cash: cash.latest,
      total_assets: totalAssets.latest,
      total_liabilities: totalLiabilities.latest,
      debt: debt.latest,
      operating_cash_flow: operatingCashFlow.latest,
      eps: eps.latest,
      revenue_yoy_pct: revenue.yoyPct,
      net_income_yoy_pct: netIncome.yoyPct,
      eps_yoy_pct: eps.yoyPct,
      cash_change: cash.latest != null && cash.prior != null ? cash.latest - cash.prior : null,
      debt_change: debt.latest != null && debt.prior != null ? debt.latest - debt.prior : null,
      filing_url: accessionToFilingUrl(anchor.accn),
      raw_source: null,
    },
  ];
}

export type FundamentalsUpdateOptions = {
  force?: boolean;
  only?: string;
  dryRun?: boolean;
  fromYear?: number;
  companyFactsLimit?: number;
};

export type FundamentalsUpdateResult = {
  status: "success" | "failed";
  periods: number;
  rows: number;
  error: string | null;
};

export async function runFundamentalsUpdate(
  supabase: SupabaseClient,
  opts: FundamentalsUpdateOptions = {},
): Promise<FundamentalsUpdateResult> {
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
  const matchedCiks = new Map<string, { ticker: string; companyName: string | null }>();

  for (const { year, quarter } of quarters) {
    const periodKey = `${year}q${quarter}`;
    if (opts.only && opts.only !== periodKey) continue;
    if (!opts.force && done.has(periodKey)) continue;

    const url = masterIndexUrl(year, quarter);
    console.log(`[fundamentals] processing ${periodKey}`);
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
        matchedCiks.set(cik, { ticker, companyName: row.companyName || null });
      }

      if (opts.dryRun) {
        console.log(
          `[fundamentals dry-run] ${periodKey}: totalRows=${allRows.length} sp500Matched=${filingRows.length}`,
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
      console.error(`[fundamentals] FAILED ${periodKey}: ${lastError}`);
      if (!opts.dryRun) await markFailed(supabase, SOURCE, periodKey, err, url);
    }
  }

  const limit = opts.force
    ? matchedCiks.size
    : Math.min(opts.companyFactsLimit ?? DEFAULT_COMPANYFACTS_LIMIT, matchedCiks.size);
  const toFetch = [...matchedCiks.entries()].slice(0, limit);
  console.log(`[fundamentals] fetching companyfacts for ${toFetch.length} companies`);

  let fundamentalsRows = 0;
  for (const [cik, info] of toFetch) {
    try {
      const rows = await fetchFundamentalsForCik(cik, info.ticker, info.companyName);
      if (opts.dryRun) {
        console.log(`[fundamentals dry-run] ${info.ticker}: ${rows.length} fundamentals row(s)`);
        continue;
      }
      if (rows.length > 0) {
        fundamentalsRows += await upsertChunks(
          supabase,
          "sec_company_fundamentals",
          rows,
          "source_id",
        );
      }
    } catch (err) {
      console.error(`[fundamentals] companyfacts failed for ${info.ticker}: ${errorMessage(err)}`);
    }
  }
  totalRows += fundamentalsRows;

  return {
    status: lastError && processed === 0 ? "failed" : "success",
    periods: processed,
    rows: totalRows,
    error: lastError,
  };
}
