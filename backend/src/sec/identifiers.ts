/**
 * CIK / ticker / CUSIP identifier helpers and SEC company ticker map.
 */
import { createHash } from "node:crypto";
import { secFetchJson } from "./edgarClient.js";

export function normalizeCik(value: string | number | null | undefined): string {
  if (value == null) return "";
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/^0+/, "") || "0";
}

export function padCik(cik: string): string {
  return normalizeCik(cik).padStart(10, "0");
}

export function normalizeTicker(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!t || t.length > 10) return null;
  return t;
}

export function normalizeCusip(value: string | null | undefined): string | null {
  if (!value) return null;
  const c = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length >= 8 ? c.slice(0, 9) : null;
}

export function sourceId(...parts: Array<string | number | null | undefined>): string {
  const raw = parts.map((p) => (p == null ? "" : String(p))).join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

export type CompanyTicker = {
  cik: string;
  ticker: string;
  title: string;
};

let tickerMapPromise: Promise<{
  byTicker: Map<string, CompanyTicker>;
  byCik: Map<string, CompanyTicker>;
  byTitle: Map<string, CompanyTicker>;
}> | null = null;

function normalizeTitleKey(title: string): string {
  return title
    .toUpperCase()
    .replace(/\b(INC|CORP|CORPORATION|CO|LTD|LLC|PLC|THE)\b/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 40);
}

export async function loadCompanyTickers() {
  if (!tickerMapPromise) {
    tickerMapPromise = (async () => {
      const url = "https://www.sec.gov/files/company_tickers.json";
      const raw = await secFetchJson<
        Record<string, { cik_str: number; ticker: string; title: string }>
      >(url);
      const byTicker = new Map<string, CompanyTicker>();
      const byCik = new Map<string, CompanyTicker>();
      const byTitle = new Map<string, CompanyTicker>();
      for (const row of Object.values(raw)) {
        const cik = normalizeCik(row.cik_str);
        const ticker = normalizeTicker(row.ticker);
        if (!cik || !ticker) continue;
        const entry = { cik, ticker, title: row.title };
        byTicker.set(ticker, entry);
        byCik.set(cik, entry);
        byTitle.set(normalizeTitleKey(row.title), entry);
      }
      return { byTicker, byCik, byTitle };
    })();
  }
  return tickerMapPromise;
}

export async function tickerForCik(cik: string | null | undefined): Promise<string | null> {
  if (!cik) return null;
  const map = await loadCompanyTickers();
  return map.byCik.get(normalizeCik(cik))?.ticker ?? null;
}

export async function resolveIssuerTicker(
  issuerName: string | null | undefined,
  explicitTicker?: string | null,
): Promise<string | null> {
  const direct = normalizeTicker(explicitTicker);
  if (direct) return direct;
  if (!issuerName) return null;
  const map = await loadCompanyTickers();
  const key = normalizeTitleKey(issuerName);
  return map.byTitle.get(key)?.ticker ?? null;
}

export function parseIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split("/");
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return null;
}

export function parseNumber(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** Parse SEC master.idx pipe-delimited lines. */
export type MasterIndexRow = {
  cik: string;
  companyName: string;
  formType: string;
  dateFiled: string;
  filename: string;
  accession: string;
};

export function parseMasterIndex(text: string): MasterIndexRow[] {
  const lines = text.split(/\r?\n/);
  const out: MasterIndexRow[] = [];
  let started = false;
  for (const line of lines) {
    if (!started) {
      if (line.includes("-----")) started = true;
      continue;
    }
    if (!line.trim()) continue;
    const parts = line.split("|");
    if (parts.length < 5) continue;
    const [cikRaw, companyName, formType, dateFiled, filename] = parts;
    const filenameClean = (filename ?? "").trim();
    const accessionMatch = filenameClean.match(/(\d{10}-\d{2}-\d{6})/);
    out.push({
      cik: normalizeCik(cikRaw),
      companyName: (companyName ?? "").trim(),
      formType: (formType ?? "").trim().toUpperCase(),
      dateFiled: parseIsoDate(dateFiled) ?? (dateFiled ?? "").trim(),
      filename: filenameClean,
      accession: accessionMatch?.[1] ?? "",
    });
  }
  return out;
}

export function masterIndexUrl(year: number, quarter: 1 | 2 | 3 | 4): string {
  return `https://www.sec.gov/Archives/edgar/full-index/${year}/QTR${quarter}/master.idx`;
}

export function yearQuartersFrom(fromYear: number, now = new Date()): Array<{
  year: number;
  quarter: 1 | 2 | 3 | 4;
}> {
  const out: Array<{ year: number; quarter: 1 | 2 | 3 | 4 }> = [];
  const endYear = now.getUTCFullYear();
  const endQ = (Math.floor(now.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  for (let y = fromYear; y <= endYear; y++) {
    for (const q of [1, 2, 3, 4] as const) {
      if (y === endYear && q > endQ) break;
      out.push({ year: y, quarter: q });
    }
  }
  return out;
}
