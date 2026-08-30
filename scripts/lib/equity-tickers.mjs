/**
 * Only listed stocks/ETFs with a usable ticker should hit Alpaca.
 * Bonds, Treasuries, CDs, and blank tickers are skipped.
 */

const TICKER_RE = /^[A-Z]{1,5}(\.[A-Z])?$/;

const ASSET_SKIP = [
  "bond",
  "treasury",
  " municipal",
  "muni ",
  "note due",
  "notes due",
  "go utx",
  "certificate of deposit",
  "ctf dep",
  "act/365",
  "t-bill",
  "t bill",
  "ust ",
  "fnma",
  "gnma",
  "private placement",
  "limited partnership",
  "coupon",
];

export function normalizeTicker(ticker) {
  if (!ticker || typeof ticker !== "string") return null;
  const trimmed = ticker.trim().toUpperCase();
  return trimmed || null;
}

export function isLikelyListedEquity(ticker, asset) {
  const symbol = normalizeTicker(ticker);
  if (!symbol || !TICKER_RE.test(symbol)) return false;

  const name = (asset ?? "").toLowerCase();
  if (/%/.test(name) && /(due|mat |maturity|note|bond)/.test(name)) {
    return false;
  }
  return !ASSET_SKIP.some((needle) => name.includes(needle));
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}
