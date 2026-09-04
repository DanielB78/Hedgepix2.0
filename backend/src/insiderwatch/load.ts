import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import type { CongressTrade } from "../types.js";
import {
  addUtcDays,
  parseFlexibleDate,
  utcTodayIso,
} from "../tradeIdentity.js";
import { parseCsv } from "./csv.js";
import {
  isInsiderWatchStockRow,
  normalizeChamber,
  toCongressTradeFromInsiderWatch,
} from "./normalize.js";
import type { InsiderWatchCsvRow, InsiderWatchLoadStats } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_INSIDERWATCH_CSV_URL =
  "https://insiderwatch.ai/api/data/congress-trades.csv";

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

export async function downloadInsiderWatchCsv(options?: {
  url?: string;
  filePath?: string;
}): Promise<string> {
  const filePath =
    options?.filePath?.trim() || process.env.INSIDERWATCH_CSV_PATH?.trim();
  if (filePath) {
    return readFile(filePath, "utf8");
  }

  const url =
    options?.url?.trim() ||
    process.env.INSIDERWATCH_CSV_URL?.trim() ||
    DEFAULT_INSIDERWATCH_CSV_URL;

  const response = await fetch(url, {
    headers: { Accept: "text/csv,text/plain,*/*" },
  });
  if (!response.ok) {
    throw new Error(
      `InsiderWatch CSV download failed: HTTP ${response.status} (${url})`,
    );
  }
  return response.text();
}

export function computeFiledCutoff(options: {
  lastSuccessAt: string | null;
  overlapDays: number;
  initialLookbackDays: number;
  now?: Date;
}): string {
  const today = options.now
    ? options.now.toISOString().slice(0, 10)
    : utcTodayIso();

  if (!options.lastSuccessAt) {
    return addUtcDays(today, -options.initialLookbackDays);
  }

  const successDay = options.lastSuccessAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(successDay)) {
    return addUtcDays(today, -options.initialLookbackDays);
  }
  return addUtcDays(successDay, -options.overlapDays);
}

export type LoadInsiderWatchResult = {
  trades: CongressTrade[];
  stats: InsiderWatchLoadStats;
};

export async function loadInsiderWatchStockTrades(options: {
  lastSuccessAt: string | null;
  overlapDays: number;
  initialLookbackDays: number;
  csvText?: string;
  url?: string;
  filePath?: string;
}): Promise<LoadInsiderWatchResult> {
  const csvText =
    options.csvText ??
    (await downloadInsiderWatchCsv({
      url: options.url,
      filePath: options.filePath,
    }));

  const cutoffFiledDate = computeFiledCutoff({
    lastSuccessAt: options.lastSuccessAt,
    overlapDays: options.overlapDays,
    initialLookbackDays: options.initialLookbackDays,
  });

  const isLikelyListedEquity = await loadEquityFn();
  const records = parseCsv(csvText);

  let rowsAfterDateFilter = 0;
  let houseSenateRows = 0;
  let stockRowsRetained = 0;
  let nonStockRowsIgnored = 0;
  let malformedRowsSkipped = 0;

  const members = new Set<string>();
  const tickers = new Set<string>();
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  const trades: CongressTrade[] = [];

  records.forEach((raw, index) => {
    const row = raw as InsiderWatchCsvRow;
    const filed = parseFlexibleDate(row.filed_date);
    if (!filed) {
      malformedRowsSkipped += 1;
      return;
    }
    if (filed < cutoffFiledDate) return;
    rowsAfterDateFilter += 1;

    const chamber = normalizeChamber(row.chamber);
    if (!chamber) {
      nonStockRowsIgnored += 1;
      return;
    }
    houseSenateRows += 1;

    if (!isInsiderWatchStockRow(row, isLikelyListedEquity)) {
      nonStockRowsIgnored += 1;
      return;
    }

    try {
      const trade = toCongressTradeFromInsiderWatch(row, index);
      trades.push(trade);
      stockRowsRetained += 1;
      members.add(trade.member);
      if (trade.ticker) tickers.add(trade.ticker);
      if (!dateFrom || trade.disclosureDate < dateFrom) {
        dateFrom = trade.disclosureDate;
      }
      if (!dateTo || trade.disclosureDate > dateTo) {
        dateTo = trade.disclosureDate;
      }
    } catch (err) {
      malformedRowsSkipped += 1;
      console.warn(
        `[insiderwatch] Skipping row ${index}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  return {
    trades,
    stats: {
      rowsDownloaded: records.length,
      rowsAfterDateFilter,
      houseSenateRows,
      stockRowsRetained,
      nonStockRowsIgnored,
      malformedRowsSkipped,
      members: members.size,
      uniqueTickers: tickers.size,
      dateFrom,
      dateTo,
      cutoffFiledDate,
      overlapDays: options.lastSuccessAt ? options.overlapDays : 0,
    },
  };
}

export function printInsiderWatchStats(
  stats: InsiderWatchLoadStats,
  upsert?: { newCount: number; updatedCount: number; errors: number },
): void {
  const fmt = (n: number) => n.toLocaleString("en-US");
  console.log("========================================");
  console.log("INSIDERWATCH UPDATE");
  console.log("========================================");
  console.log(`Rows downloaded:              ${fmt(stats.rowsDownloaded)}`);
  console.log(`Cutoff filed_date:            ${stats.cutoffFiledDate}`);
  if (stats.overlapDays > 0) {
    console.log(`Overlap days:                 ${stats.overlapDays}`);
  } else {
    console.log("First InsiderWatch sync:      recent lookback window");
  }
  console.log(`Rows after date filter:       ${fmt(stats.rowsAfterDateFilter)}`);
  console.log(`House/Senate rows:            ${fmt(stats.houseSenateRows)}`);
  console.log(`Stock rows retained:          ${fmt(stats.stockRowsRetained)}`);
  console.log(`Non-stock rows ignored:       ${fmt(stats.nonStockRowsIgnored)}`);
  console.log(`Malformed rows skipped:       ${fmt(stats.malformedRowsSkipped)}`);
  console.log(`Members:                      ${fmt(stats.members)}`);
  console.log(`Unique tickers:               ${fmt(stats.uniqueTickers)}`);
  console.log(
    `Disclosure date range:         ${stats.dateFrom ?? "—"} → ${stats.dateTo ?? "—"}`,
  );
  if (upsert) {
    console.log(`New rows inserted:            ${fmt(upsert.newCount)}`);
    console.log(
      `Existing rows matched/updated: ${fmt(upsert.updatedCount)}`,
    );
    console.log(`Errors:                       ${fmt(upsert.errors)}`);
  }
  console.log("========================================");
}
