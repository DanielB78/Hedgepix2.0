/** Client-side mirror of scripts/lib/equity-tickers.mjs for fallback filtering. */

const TICKER_RE = /^[A-Z]{1,5}(\.[A-Z])?$/;

const ETF_TICKERS = new Set([
  "SPY", "QQQ", "IWM", "DIA", "VOO", "IVV", "VTI", "VEA", "VWO", "VT", "VXUS",
  "EEM", "EFA", "ACWI", "IWB", "IWF", "IWD", "IJH", "IJR", "MDY", "RSP",
  "XLF", "XLE", "XLK", "XLV", "XLI", "XLP", "XLU", "XLB", "XLRE", "XLC",
  "XBI", "XOP", "XME", "XRT", "KRE", "SMH", "SOXX", "IBB", "ITA", "IYT",
  "IYF", "IYH", "IYW", "IYE", "IYC", "IDU", "IGF", "IYR", "VNQ",
  "GLD", "SLV", "IAU", "GDX", "GDXJ", "USO", "UNG", "DBC", "DBA",
  "TLT", "IEF", "SHY", "IEI", "AGG", "BND", "BNDX", "LQD", "HYG", "JNK",
  "TIP", "TIPS", "EMB", "PCY", "MUB", "PFF",
  "ARKK", "ARKG", "ARKW", "ARKF", "ARKQ", "ARKX", "BOTZ",
  "TQQQ", "SQQQ", "UPRO", "SPXU", "TNA", "TZA", "SOXL", "SOXS", "TECL",
  "TECS", "LABU", "LABD", "FAS", "FAZ", "UDOW", "SDOW", "QLD", "QID",
  "SSO", "SDS", "SH", "PSQ", "DOG", "UVXY", "SVXY", "VXX", "VIXY",
  "BITO", "IBIT", "FBTC", "ETHA",
  "SCHD", "SCHB", "SCHX", "VIG", "VYM", "QUAL", "MTUM", "USMV", "SPL",
  "TBT", "OIH",
]);

const ASSET_ALLOW =
  /\bcommon stock\b|\bordinary shares\b|\bclass [a-z] common\b/i;

const ASSET_DENY = [
  /\b(etf|etn)\b/i,
  /exchange[\s-]*traded/i,
  /\bproshares\b/i,
  /\bdirexion\b/i,
  /\bishares\b/i,
  /\bspdr\b/i,
  /\bpowershares\b/i,
  /\bvaneck\b/i,
  /\bwisdomtree\b/i,
  /\bcertificate of deposit\b/i,
  /\bctf dep\b/i,
  /\bact\/365\b/i,
  /\bgo utx\b/i,
  /\bmunicipal\b/,
  /\bmuni\b/,
  /\bprivate placement\b/i,
  /\blimited partnership\b/i,
  /\bt-bills?\b/i,
  /\bt bills?\b/i,
  /\bfnma\b/i,
  /\bgnma\b/i,
  /\bnotes? due\b/i,
  /\bsuccessor agency\b/i,
  /\bmutual fund\b/i,
  /\bopen-?end fund\b/i,
  /\bindex (?:fund|adm|instl|admiral)\b/i,
  /\b(?:call|put) option\b/i,
  /\b(?:cryptocurrency|crypto\b|bitcoin\b|ethereum\b)/i,
  /\breal estate\b/i,
  /\btreasury (?:bill|note|bond)\b/i,
  /\bcorporate bond\b/i,
  /\bnon-?public\b/i,
];

export function normalizeTicker(ticker: string | null | undefined): string | null {
  if (!ticker || typeof ticker !== "string") return null;
  const trimmed = ticker.trim().toUpperCase();
  if (!trimmed || trimmed === "N/A" || trimmed === "NA" || trimmed === "NONE" || trimmed === "--") {
    return null;
  }
  return trimmed;
}

export function isLikelyListedEquity(
  ticker: string | null | undefined,
  asset: string | null | undefined,
): boolean {
  const symbol = normalizeTicker(ticker);
  if (!symbol || !TICKER_RE.test(symbol)) return false;
  if (ETF_TICKERS.has(symbol)) return false;

  const name = asset ?? "";
  if (ASSET_DENY.some((re) => re.test(name))) return false;

  const lower = name.toLowerCase();
  if (/%/.test(lower) && /(due|mat(?:urity)?|\bnote\b|\bbond\b)/.test(lower)) {
    return false;
  }

  if (ASSET_ALLOW.test(name)) return true;

  return true;
}

export function isListedEquityColumnMissing(message: string): boolean {
  return /is_listed_equity/i.test(message);
}

export function filterListedEquityRows<
  T extends { ticker?: string | null; asset?: string | null; is_listed_equity?: boolean | null },
>(rows: T[]): T[] {
  return rows.filter((row) => {
    if (row.is_listed_equity === true) return true;
    if (row.is_listed_equity === false) return false;
    return isLikelyListedEquity(row.ticker, row.asset);
  });
}
