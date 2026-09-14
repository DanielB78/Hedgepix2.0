/**
 * S&P 500 ticker universe, derived from the NAICS mapping config used by
 * the news sector classifier. Used to scope 8-K / fundamentals / N-PORT
 * ingest to companies Hedgepix actually tracks.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTicker } from "./identifiers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Sp500NaicsMapping = {
  by_naics_code: Record<string, Array<{ ticker: string; company?: string; rank?: number }>>;
};

let cache: Set<string> | null = null;

export function loadSp500Tickers(): Set<string> {
  if (cache) return cache;
  const path = resolve(__dirname, "../../config/sp500-naics-mapping.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as Sp500NaicsMapping;
  const tickers = new Set<string>();
  for (const entries of Object.values(raw.by_naics_code ?? {})) {
    for (const entry of entries) {
      const ticker = normalizeTicker(entry.ticker);
      if (ticker) tickers.add(ticker);
    }
  }
  cache = tickers;
  return tickers;
}
