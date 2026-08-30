/**
 * Only listed stocks/ETFs with a usable ticker should hit Alpaca.
 * Direct bonds, Treasuries, CDs, and blank tickers are skipped.
 * Bond/Treasury ETFs (HYG, TLT, …) are listed products and should be priced.
 */

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
];

export function normalizeTicker(ticker) {
  if (!ticker || typeof ticker !== "string") return null;
  const trimmed = ticker.trim().toUpperCase();
  return trimmed || null;
}

export function isLikelyListedEquity(ticker, asset) {
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

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}
