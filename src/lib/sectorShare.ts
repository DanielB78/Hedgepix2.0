import type { CongressTrade } from "./types";
import {
  curatedIndustryChip,
  curatedSector,
  type IndustrySector,
} from "./tickerIndustry";

export type SectorShareSlice = {
  sector: IndustrySector;
  tradeCount: number;
  buyCount: number;
  saleCount: number;
  tickerCount: number;
  pct: number;
};

const SECTOR_ORDER: IndustrySector[] = [
  "Technology",
  "Financials",
  "Health Care",
  "Consumer",
  "Industrials",
  "Energy",
  "Real Estate",
  "Funds",
  "Other",
];

/** Soft palette for market-share bars. */
export const SECTOR_COLORS: Record<IndustrySector, string> = {
  Technology: "#0f766e",
  Financials: "#1d4ed8",
  "Health Care": "#be123c",
  Consumer: "#c2410c",
  Industrials: "#57534e",
  Energy: "#a16207",
  "Real Estate": "#0e7490",
  Funds: "#334155",
  Other: "#78716c",
};

/**
 * Weight sectors by disclosed trades (buys + sales).
 * Prefer curated industry→sector map; unknown tickers → Other.
 */
export function computeSectorShare(
  trades: CongressTrade[],
  options?: { purchasesOnly?: boolean },
): SectorShareSlice[] {
  const purchasesOnly = options?.purchasesOnly === true;
  const bySector = new Map<
    IndustrySector,
    { trades: number; buys: number; sales: number; tickers: Set<string> }
  >();

  for (const trade of trades) {
    const ticker = (trade.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;
    if (purchasesOnly && trade.transaction_type !== "purchase") continue;

    const sector = curatedSector(ticker) ?? "Other";
    let acc = bySector.get(sector);
    if (!acc) {
      acc = { trades: 0, buys: 0, sales: 0, tickers: new Set() };
      bySector.set(sector, acc);
    }
    acc.trades += 1;
    acc.tickers.add(ticker);
    if (trade.transaction_type === "purchase") acc.buys += 1;
    if (trade.transaction_type === "sale") acc.sales += 1;
  }

  const total = [...bySector.values()].reduce((s, a) => s + a.trades, 0);
  if (total === 0) return [];

  return SECTOR_ORDER.map((sector) => {
    const acc = bySector.get(sector);
    if (!acc || acc.trades === 0) return null;
    return {
      sector,
      tradeCount: acc.trades,
      buyCount: acc.buys,
      saleCount: acc.sales,
      tickerCount: acc.tickers.size,
      pct: (acc.trades / total) * 100,
    } satisfies SectorShareSlice;
  }).filter((row): row is SectorShareSlice => row != null);
}

export function mergeIndustryLabels(
  tickers: string[],
  existing: Record<string, string>,
): Record<string, string> {
  const out = { ...existing };
  for (const raw of tickers) {
    const ticker = raw.trim().toUpperCase();
    if (!ticker) continue;
    const curated = curatedIndustryChip(ticker);
    if (curated) out[ticker] = curated;
  }
  return out;
}

export function chamberScopeLabel(
  view: "house" | "senate" | "trending" | "feed" | "insiders",
): string {
  if (view === "house") return "House";
  if (view === "senate") return "Senate";
  if (view === "insiders") return "Insiders";
  return "Congress";
}
