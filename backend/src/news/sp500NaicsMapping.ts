import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Editable mapping: backend/config/sp500-naics-mapping.json (from spreadsheet). */
export const SP500_NAICS_MAPPING_PATH = resolve(
  __dirname,
  "../../config/sp500-naics-mapping.json",
);

export type Sp500NaicsTickerEntry = {
  ticker: string;
  company: string;
  rank: number;
};

type MappingFile = {
  by_naics_code?: Record<string, Sp500NaicsTickerEntry[]>;
};

let cachedByCode: Map<string, Sp500NaicsTickerEntry[]> | null = null;

function normalizeNaicsCode(code: string | null | undefined): string | null {
  if (code == null) return null;
  const raw = String(code).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits || null;
}

export function loadSp500NaicsMapping(
  path = SP500_NAICS_MAPPING_PATH,
): Map<string, Sp500NaicsTickerEntry[]> {
  if (cachedByCode && path === SP500_NAICS_MAPPING_PATH) {
    return cachedByCode;
  }
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as MappingFile;
  const byCode = new Map<string, Sp500NaicsTickerEntry[]>();
  for (const [code, entries] of Object.entries(parsed.by_naics_code ?? {})) {
    const norm = normalizeNaicsCode(code);
    if (!norm || !Array.isArray(entries)) continue;
    const cleaned: Sp500NaicsTickerEntry[] = [];
    const seen = new Set<string>();
    for (const e of entries) {
      const ticker = String(e?.ticker ?? "")
        .trim()
        .toUpperCase();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);
      cleaned.push({
        ticker,
        company: String(e?.company ?? ""),
        rank: typeof e?.rank === "number" ? e.rank : 1,
      });
    }
    if (cleaned.length) byCode.set(norm, cleaned);
  }
  if (path === SP500_NAICS_MAPPING_PATH) {
    cachedByCode = byCode;
  }
  return byCode;
}

/** Reset cache (tests). */
export function resetSp500NaicsMappingCache(): void {
  cachedByCode = null;
}

/**
 * Unique S&P 500 tickers mapped to any of the given NAICS codes.
 * Returns ticker → matched codes.
 */
export function tickersForNaicsCodes(
  codes: Array<string | null | undefined>,
  mapping: Map<string, Sp500NaicsTickerEntry[]> = loadSp500NaicsMapping(),
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const seenCodes = new Set<string>();
  for (const raw of codes) {
    const code = normalizeNaicsCode(raw);
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);
    const entries = mapping.get(code);
    if (!entries) continue;
    for (const { ticker } of entries) {
      const existing = out.get(ticker);
      if (existing) {
        if (!existing.includes(code)) existing.push(code);
      } else {
        out.set(ticker, [code]);
      }
    }
  }
  return out;
}

/** Article top-3 sector codes (nulls filtered). */
export function articleNaicsCodes(article: {
  sector_1_code?: string | null;
  sector_2_code?: string | null;
  sector_3_code?: string | null;
  sector_code?: string | null;
}): string[] {
  const codes = [
    article.sector_1_code,
    article.sector_2_code,
    article.sector_3_code,
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of codes) {
    const n = normalizeNaicsCode(c);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  if (out.length === 0) {
    const legacy = normalizeNaicsCode(article.sector_code);
    if (legacy) out.push(legacy);
  }
  return out;
}
