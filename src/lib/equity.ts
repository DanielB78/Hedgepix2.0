/** Client-side mirror of scripts/lib/equity-tickers.mjs for fallback filtering. */

const TICKER_RE = /^[A-Z]{1,5}(\.[A-Z])?$/;

const ASSET_ALLOW =
  /\b(etf|etn)\b|common stock|ordinary shares|class [a-z] common/i;

const ASSET_DENY = [
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
  /\b(?:call|put) option\b/i,
  /\b(?:cryptocurrency|crypto\b|bitcoin\b|ethereum\b)/i,
  /\breal estate\b/i,
  /\btreasury (?:bill|note|bond)\b/i,
];

export function normalizeTicker(ticker: string | null | undefined): string | null {
  if (!ticker || typeof ticker !== "string") return null;
  const trimmed = ticker.trim().toUpperCase();
  return trimmed || null;
}

export function isLikelyListedEquity(
  ticker: string | null | undefined,
  asset: string | null | undefined,
): boolean {
  const symbol = normalizeTicker(ticker);
  if (!symbol || !TICKER_RE.test(symbol)) return false;

  const name = asset ?? "";
  if (ASSET_ALLOW.test(name)) return true;

  const lower = name.toLowerCase();
  if (/%/.test(lower) && /(due|mat(?:urity)?|\bnote\b|\bbond\b)/.test(lower)) {
    return false;
  }
  return !ASSET_DENY.some((re) => re.test(name));
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
