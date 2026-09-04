import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CongressTrade } from "../types.js";
import { ensureKadoaDataset } from "./download.js";
import {
  chamberOfFiler,
  isHouseOrSenateFiler,
  isKadoaStockTrade,
  toCongressTradeFromKadoa,
} from "./normalize.js";
import type {
  KadoaFilerFile,
  KadoaLoadStats,
  KadoaTrade,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEquityFn(): Promise<
  (ticker: string | null, asset: string | null) => boolean
> {
  const modulePath = resolve(__dirname, "../../../scripts/lib/equity-tickers.mjs");
  const mod = (await import(pathToFileURL(modulePath).href)) as {
    isLikelyListedEquity: (
      ticker: string | null,
      asset: string | null,
    ) => boolean;
  };
  return mod.isLikelyListedEquity;
}

export type LoadKadoaResult = {
  trades: CongressTrade[];
  stats: KadoaLoadStats;
};

export async function loadKadoaCongressStockTrades(options?: {
  dataDir?: string;
  refresh?: boolean;
}): Promise<LoadKadoaResult> {
  const paths = await ensureKadoaDataset({
    dataDir: options?.dataDir,
    refresh: options?.refresh,
  });
  const isLikelyListedEquity = await loadEquityFn();

  const files = (await readdir(paths.filerDir)).filter((f) =>
    f.endsWith(".json"),
  );

  let kadoaRowsLoaded = 0;
  let houseSenateRows = 0;
  let executiveRowsSkipped = 0;
  let stockRowsRetained = 0;
  let nonStockRowsDiscarded = 0;
  let purchaseSaleSkipped = 0;

  const members = new Set<string>();
  const tickers = new Set<string>();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  const trades: CongressTrade[] = [];

  for (const file of files) {
    const raw = await readFile(join(paths.filerDir, file), "utf8");
    let parsed: KadoaFilerFile;
    try {
      parsed = JSON.parse(raw) as KadoaFilerFile;
    } catch {
      console.warn(`[kadoa] Skipping unreadable filer file: ${file}`);
      continue;
    }

    const filer = parsed.filer;
    const filerTrades: KadoaTrade[] = Array.isArray(parsed.trades)
      ? parsed.trades
      : [];
    kadoaRowsLoaded += filerTrades.length;

    if (!filer || !isHouseOrSenateFiler(filer)) {
      executiveRowsSkipped += filerTrades.length;
      continue;
    }

    const chamber = chamberOfFiler(filer);
    if (!chamber) {
      executiveRowsSkipped += filerTrades.length;
      continue;
    }

    houseSenateRows += filerTrades.length;

    for (const row of filerTrades) {
      const txn = (row.transaction_type ?? "").toLowerCase();
      const isPurchaseSale =
        txn.startsWith("purchase") ||
        txn.startsWith("sale") ||
        txn === "buy" ||
        txn === "sell";
      if (!isPurchaseSale) {
        purchaseSaleSkipped += 1;
        nonStockRowsDiscarded += 1;
        continue;
      }

      if (!isKadoaStockTrade(row, isLikelyListedEquity)) {
        nonStockRowsDiscarded += 1;
        continue;
      }

      try {
        const trade = toCongressTradeFromKadoa(row, filer, chamber);
        trades.push(trade);
        stockRowsRetained += 1;
        members.add(trade.member);
        if (trade.ticker) tickers.add(trade.ticker);
        if (
          trade.transactionDate &&
          (!dateFrom || trade.transactionDate < dateFrom)
        ) {
          dateFrom = trade.transactionDate;
        }
        if (
          trade.transactionDate &&
          (!dateTo || trade.transactionDate > dateTo)
        ) {
          dateTo = trade.transactionDate;
        }
      } catch (err) {
        nonStockRowsDiscarded += 1;
        console.warn(
          `[kadoa] Skipping trade ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return {
    trades,
    stats: {
      kadoaRowsLoaded,
      houseSenateRows,
      executiveRowsSkipped,
      stockRowsRetained,
      nonStockRowsDiscarded,
      purchaseSaleSkipped,
      members: members.size,
      uniqueTickers: tickers.size,
      dateFrom,
      dateTo,
    },
  };
}

export function printKadoaLoadStats(
  stats: KadoaLoadStats,
  extra?: { duplicatesSkipped?: number; newCount?: number; updatedCount?: number; cleared?: number },
): void {
  const fmt = (n: number) => n.toLocaleString("en-US");
  console.log("========================================");
  console.log("KADOA IMPORT SUMMARY");
  console.log("========================================");
  console.log(`Kadoa rows loaded:          ${fmt(stats.kadoaRowsLoaded)}`);
  console.log(`House/Senate rows:          ${fmt(stats.houseSenateRows)}`);
  console.log(`Executive rows skipped:     ${fmt(stats.executiveRowsSkipped)}`);
  console.log(`Stock rows retained:        ${fmt(stats.stockRowsRetained)}`);
  console.log(`Non-stock rows discarded:   ${fmt(stats.nonStockRowsDiscarded)}`);
  console.log(`  (incl. non purchase/sale: ${fmt(stats.purchaseSaleSkipped)})`);
  console.log(`Members imported:           ${fmt(stats.members)}`);
  console.log(`Unique tickers:             ${fmt(stats.uniqueTickers)}`);
  console.log(
    `Date range:                  ${stats.dateFrom ?? "—"} → ${stats.dateTo ?? "—"}`,
  );
  if (extra?.cleared != null) {
    console.log(`Prior rows cleared:         ${fmt(extra.cleared)}`);
  }
  if (extra?.newCount != null) {
    console.log(`New rows upserted:          ${fmt(extra.newCount)}`);
  }
  if (extra?.updatedCount != null) {
    console.log(`Rows updated:               ${fmt(extra.updatedCount)}`);
  }
  if (extra?.duplicatesSkipped != null) {
    console.log(`Duplicates skipped:         ${fmt(extra.duplicatesSkipped)}`);
  }
  console.log("========================================");
}
