/**
 * Build / refresh ticker_profiles: sector + detailed industry labels.
 *
 * Sources (in order of preference for new tickers):
 * 1. Existing DB row (skip unless force)
 * 2. S&P 500 NAICS spreadsheet map
 * 3. SEC submissions SIC + description
 * 4. Keyword heuristics on company / asset name
 */
import { loadSp500NaicsMapping } from "../news/sp500NaicsMapping.js";
import {
  loadCompanyTickers,
  normalizeTicker,
  padCik,
} from "../sec/identifiers.js";
import { secFetchJson } from "../sec/edgarClient.js";
import { labelsFromNaics } from "./naicsLabels.js";
import { labelsFromSic, labelsFromText } from "./sicLabels.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TickerProfileRow = {
  ticker: string;
  company_name: string | null;
  cik: string | null;
  sector: string | null;
  industry: string | null;
  naics_code: string | null;
  naics_name: string | null;
  sic_code: string | null;
  sic_description: string | null;
  source: string;
  updated_at: string;
};

export type SyncTickerProfilesSummary = {
  status: "OK" | "FAILED" | "SKIPPED";
  discovered: number;
  seededFromMap: number;
  fromSec: number;
  fromHeuristic: number;
  upserted: number;
  skippedExisting: number;
  errors: number;
  errorMessages: string[];
};

type Sp500ByTicker = Map<
  string,
  { naics: string; company: string; rank: number }
>;

function invertSp500Map(): Sp500ByTicker {
  const byCode = loadSp500NaicsMapping();
  const out: Sp500ByTicker = new Map();
  for (const [naics, entries] of byCode.entries()) {
    for (const entry of entries) {
      const ticker = normalizeTicker(entry.ticker);
      if (!ticker) continue;
      const prev = out.get(ticker);
      // Prefer rank 1 (primary industry)
      if (!prev || entry.rank < prev.rank) {
        out.set(ticker, {
          naics,
          company: entry.company,
          rank: entry.rank,
        });
      }
    }
  }
  return out;
}

async function listTradeTickers(
  supabase: SupabaseClient,
): Promise<Map<string, string | null>> {
  /** ticker → best-effort company / asset name from disclosures */
  const names = new Map<string, string | null>();
  const page = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("congress_trades")
      .select("ticker, asset")
      .eq("is_listed_equity", true)
      .not("ticker", "is", null)
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const ticker = normalizeTicker(row.ticker as string | null);
      if (!ticker) continue;
      if (!names.has(ticker)) {
        names.set(ticker, (row.asset as string | null)?.trim() || null);
      }
    }
    if (rows.length < page) break;
    from += page;
  }

  // Also pull CEO tickers when present
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("ceo_stock_purchases")
      .select("ticker, issuer_name")
      .not("ticker", "is", null)
      .range(from, from + page - 1);
    if (error) {
      // Table may be empty / unavailable locally — ignore
      break;
    }
    const rows = data ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const ticker = normalizeTicker(row.ticker as string | null);
      if (!ticker) continue;
      if (!names.has(ticker)) {
        names.set(ticker, (row.issuer_name as string | null)?.trim() || null);
      }
    }
    if (rows.length < page) break;
    from += page;
  }

  return names;
}

async function existingProfiles(
  supabase: SupabaseClient,
  tickers: string[],
): Promise<Set<string>> {
  const have = new Set<string>();
  const chunk = 200;
  for (let i = 0; i < tickers.length; i += chunk) {
    const slice = tickers.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("ticker_profiles")
      .select("ticker, sector, source")
      .in("ticker", slice);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const ticker = String(row.ticker).toUpperCase();
      const source = String(row.source ?? "");
      const sector = row.sector as string | null;
      // Re-try stubs that never got a sector label
      if (source === "pending" && !sector) continue;
      have.add(ticker);
    }
  }
  return have;
}

type SecSubmission = {
  name?: string;
  sic?: string | number;
  sicDescription?: string;
  tickers?: string[];
  cik?: string;
};

async function fetchSecProfile(
  cik: string,
): Promise<{
  company: string | null;
  sic: string | null;
  sicDescription: string | null;
} | null> {
  try {
    const url = `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`;
    const json = await secFetchJson<SecSubmission>(url);
    return {
      company: json.name?.trim() || null,
      sic: json.sic != null ? String(json.sic).replace(/\D/g, "") : null,
      sicDescription: json.sicDescription?.trim() || null,
    };
  } catch {
    return null;
  }
}

function rowFromSp500(
  ticker: string,
  entry: { naics: string; company: string },
  cik: string | null,
): TickerProfileRow {
  const labels = labelsFromNaics(entry.naics);
  return {
    ticker,
    company_name: entry.company,
    cik,
    sector: labels?.sector ?? null,
    industry: labels?.industry ?? null,
    naics_code: entry.naics,
    naics_name: labels?.industry ?? null,
    sic_code: null,
    sic_description: null,
    source: "sp500_map",
    updated_at: new Date().toISOString(),
  };
}

export async function syncTickerProfiles(
  supabase: SupabaseClient,
  opts?: { force?: boolean; secLimit?: number },
): Promise<SyncTickerProfilesSummary> {
  const summary: SyncTickerProfilesSummary = {
    status: "OK",
    discovered: 0,
    seededFromMap: 0,
    fromSec: 0,
    fromHeuristic: 0,
    upserted: 0,
    skippedExisting: 0,
    errors: 0,
    errorMessages: [],
  };

  try {
    const force = opts?.force === true;
    const secLimit = opts?.secLimit ?? 80;
    const sp500 = invertSp500Map();
    const { byTicker } = await loadCompanyTickers();
    const tradeNames = await listTradeTickers(supabase);

    // Universe = S&P map ∪ trade/CEO tickers
    const universe = new Set<string>([
      ...sp500.keys(),
      ...tradeNames.keys(),
    ]);
    summary.discovered = universe.size;

    const tickers = [...universe].sort();
    const have = force
      ? new Set<string>()
      : await existingProfiles(supabase, tickers);

    const toUpsert: TickerProfileRow[] = [];
    let secFetches = 0;

    for (const ticker of tickers) {
      if (!force && have.has(ticker)) {
        summary.skippedExisting += 1;
        continue;
      }

      const cik = byTicker.get(ticker)?.cik ?? null;
      const secTitle = byTicker.get(ticker)?.title ?? null;
      const assetName = tradeNames.get(ticker) ?? null;

      // 1) S&P NAICS map
      const mapped = sp500.get(ticker);
      if (mapped) {
        toUpsert.push(rowFromSp500(ticker, mapped, cik));
        summary.seededFromMap += 1;
        continue;
      }

      // 2) SEC submissions SIC
      let sec: Awaited<ReturnType<typeof fetchSecProfile>> = null;
      if (cik && secFetches < secLimit) {
        sec = await fetchSecProfile(cik);
        secFetches += 1;
      }
      const sicLabels = labelsFromSic(sec?.sic, sec?.sicDescription);
      if (sicLabels) {
        toUpsert.push({
          ticker,
          company_name: sec?.company ?? secTitle ?? assetName,
          cik,
          sector: sicLabels.sector,
          industry: sicLabels.industry,
          naics_code: null,
          naics_name: null,
          sic_code: sec?.sic ?? null,
          sic_description: sec?.sicDescription ?? null,
          source: "sec_submissions",
          updated_at: new Date().toISOString(),
        });
        summary.fromSec += 1;
        continue;
      }

      // 3) Keyword heuristic on names
      const heuristic =
        labelsFromText(sec?.sicDescription) ||
        labelsFromText(sec?.company) ||
        labelsFromText(secTitle) ||
        labelsFromText(assetName);
      if (heuristic) {
        toUpsert.push({
          ticker,
          company_name: sec?.company ?? secTitle ?? assetName,
          cik,
          sector: heuristic.sector,
          industry: heuristic.industry,
          naics_code: null,
          naics_name: null,
          sic_code: sec?.sic ?? null,
          sic_description: sec?.sicDescription ?? null,
          source: "name_heuristic",
          updated_at: new Date().toISOString(),
        });
        summary.fromHeuristic += 1;
        continue;
      }

      // Still record a stub so we do not re-query endlessly
      toUpsert.push({
        ticker,
        company_name: sec?.company ?? secTitle ?? assetName,
        cik,
        sector: null,
        industry: null,
        naics_code: null,
        naics_name: null,
        sic_code: sec?.sic ?? null,
        sic_description: sec?.sicDescription ?? null,
        source: "pending",
        updated_at: new Date().toISOString(),
      });
    }

    const chunk = 100;
    for (let i = 0; i < toUpsert.length; i += chunk) {
      const slice = toUpsert.slice(i, i + chunk);
      const { error } = await supabase
        .from("ticker_profiles")
        .upsert(slice, { onConflict: "ticker" });
      if (error) {
        summary.errors += 1;
        summary.errorMessages.push(error.message);
      } else {
        summary.upserted += slice.length;
      }
    }

    if (summary.errors > 0 && summary.upserted === 0) {
      summary.status = "FAILED";
    }
    return summary;
  } catch (err) {
    summary.status = "FAILED";
    summary.errors += 1;
    summary.errorMessages.push(
      err instanceof Error ? err.message : String(err),
    );
    return summary;
  }
}
