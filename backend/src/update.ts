import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { INSIDERWATCH_PROVIDER, loadConfig } from "./config.js";
import {
  loadInsiderWatchStockTrades,
  printInsiderWatchStats,
} from "./insiderwatch/load.js";
import {
  createSupabase,
  finishSyncRunFailed,
  finishSyncRunSuccess,
  getLastSuccessAt,
  startSyncRun,
  upsertTrades,
} from "./store/supabaseStore.js";
import { classifyNewsSectors } from "./news/classifySectors.js";
import { fetchGdeltArticles } from "./news/gdelt.js";
import {
  deleteNewsOlderThan,
  upsertNewsArticles,
} from "./store/newsStore.js";
import { checkNewsTickerAbnormalMoves } from "./store/tickerMoveStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type PriceSummary = {
  status: string;
  tickersChecked: number;
  tickersUpdated: number;
  newDailyBars: number;
  skippedUnsupported: number;
  skippedNoHistory: number;
  errors: number;
  errorMessages?: string[];
};

type NewsSummary = {
  status: "SUCCESS" | "FAILED";
  fetched: number;
  inserted: number;
  duplicatesSkipped: number;
  filteredBySource: number;
  sectorsLabeled: number;
  sectorStatus: "SUCCESS" | "SKIPPED" | "FAILED";
  pruned: number;
  tickerMovesStatus: "SUCCESS" | "SKIPPED" | "FAILED";
  tickerMovesChecked: number;
  tickerMovesUpserted: number;
  tickerMovesAbnormal: number;
  error: string | null;
};

async function syncGdeltNews(
  supabase: ReturnType<typeof createSupabase>,
): Promise<NewsSummary> {
  try {
    const fetchResult = await fetchGdeltArticles({ maxRecords: 100 });
    if (fetchResult.status === "FAILED") {
      return {
        status: "FAILED",
        fetched: 0,
        inserted: 0,
        duplicatesSkipped: 0,
        filteredBySource: 0,
        sectorsLabeled: 0,
        sectorStatus: "SKIPPED",
        pruned: 0,
        tickerMovesStatus: "SKIPPED",
        tickerMovesChecked: 0,
        tickerMovesUpserted: 0,
        tickerMovesAbnormal: 0,
        error: fetchResult.error,
      };
    }

    const articles = fetchResult.articles.map((a) => ({ ...a }));
    const { byHash, stats: sectorStats } = await classifyNewsSectors(
      articles.map((a) => ({ source_hash: a.source_hash, title: a.title })),
    );
    for (const article of articles) {
      const label = byHash.get(article.source_hash);
      if (!label) continue;
      article.sector = label.sector;
      article.sector_code = label.sector_code;
      article.sector_score = label.sector_score;
      article.sectors = label.sectors;
    }

    const upsert = await upsertNewsArticles(supabase, articles);
    if (upsert.errors > 0) {
      return {
        status: "FAILED",
        fetched: fetchResult.fetched,
        inserted: upsert.inserted,
        duplicatesSkipped: upsert.duplicatesSkipped,
        filteredBySource: fetchResult.filteredBySource,
        sectorsLabeled: sectorStats.labeled,
        sectorStatus: sectorStats.status,
        pruned: 0,
        tickerMovesStatus: "SKIPPED",
        tickerMovesChecked: 0,
        tickerMovesUpserted: 0,
        tickerMovesAbnormal: 0,
        error: upsert.errorMessages[0] ?? "News upsert failed",
      };
    }

    const retention = await deleteNewsOlderThan(supabase, 3);
    if (retention.error) {
      return {
        status: "FAILED",
        fetched: fetchResult.fetched,
        inserted: upsert.inserted,
        duplicatesSkipped: upsert.duplicatesSkipped,
        filteredBySource: fetchResult.filteredBySource,
        sectorsLabeled: sectorStats.labeled,
        sectorStatus: sectorStats.status,
        pruned: 0,
        tickerMovesStatus: "SKIPPED",
        tickerMovesChecked: 0,
        tickerMovesUpserted: 0,
        tickerMovesAbnormal: 0,
        error: retention.error,
      };
    }

    // News → NAICS → S&P 500 tickers → abnormal move check (≤24h window).
    const moves = await checkNewsTickerAbnormalMoves(supabase);

    return {
      status: "SUCCESS",
      fetched: fetchResult.fetched,
      inserted: upsert.inserted,
      duplicatesSkipped: upsert.duplicatesSkipped,
      filteredBySource: fetchResult.filteredBySource,
      sectorsLabeled: sectorStats.labeled,
      sectorStatus: sectorStats.status,
      pruned: retention.deleted,
      tickerMovesStatus: moves.status,
      tickerMovesChecked: moves.tickerChecks,
      tickerMovesUpserted: moves.upserted,
      tickerMovesAbnormal: moves.abnormalFlags,
      error:
        sectorStats.status === "FAILED"
          ? sectorStats.error
          : moves.status === "FAILED"
            ? moves.error
            : null,
    };
  } catch (err) {
    return {
      status: "FAILED",
      fetched: 0,
      inserted: 0,
      duplicatesSkipped: 0,
      filteredBySource: 0,
      sectorsLabeled: 0,
      sectorStatus: "SKIPPED",
      pruned: 0,
      tickerMovesStatus: "SKIPPED",
      tickerMovesChecked: 0,
      tickerMovesUpserted: 0,
      tickerMovesAbnormal: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function syncPricesAfterTrades(
  supabase: ReturnType<typeof createSupabase>,
): Promise<PriceSummary> {
  try {
    const modulePath = resolve(
      __dirname,
      "../../scripts/lib/sync-stock-prices.mjs",
    );
    const mod = (await import(pathToFileURL(modulePath).href)) as {
      syncStockPrices: (
        client: ReturnType<typeof createSupabase>,
        opts: { apiKey?: string; apiSecret?: string },
      ) => Promise<PriceSummary>;
    };
    return await mod.syncStockPrices(supabase, {
      apiKey: process.env.ALPACA_API_KEY,
      apiSecret: process.env.ALPACA_API_SECRET,
    });
  } catch (err) {
    return {
      status: "FAILED",
      tickersChecked: 0,
      tickersUpdated: 0,
      newDailyBars: 0,
      skippedUnsupported: 0,
      skippedNoHistory: 0,
      errors: 1,
      errorMessages: [err instanceof Error ? err.message : String(err)],
    };
  }
}

async function syncHoldingsAfterTrades(
  supabase: ReturnType<typeof createSupabase>,
): Promise<{ members: number; positions: number } | null> {
  try {
    const modulePath = resolve(
      __dirname,
      "../../scripts/lib/compute-holdings.mjs",
    );
    const mod = (await import(pathToFileURL(modulePath).href)) as {
      refreshListedEquityFlags: (
        client: ReturnType<typeof createSupabase>,
      ) => Promise<{ updated: number }>;
      syncMemberHoldings: (
        client: ReturnType<typeof createSupabase>,
      ) => Promise<{ members: number; positions: number }>;
    };
    await mod.refreshListedEquityFlags(supabase);
    return await mod.syncMemberHoldings(supabase);
  } catch (err) {
    console.error(
      `Holdings sync failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Ongoing updater: InsiderWatch CSV → stocks only → upsert → holdings → prices.
 * Historical backfill remains `npm run backfill-kadoa`.
 */
async function main(): Promise<void> {
  console.log("START UPDATE (InsiderWatch)");
  console.log("");

  let runId: string | null = null;
  let supabase: ReturnType<typeof createSupabase> | null = null;
  const provider = INSIDERWATCH_PROVIDER;

  try {
    const config = loadConfig();
    supabase = createSupabase(config);

    const lastSuccessAt = await getLastSuccessAt(supabase, provider);
    console.log(
      lastSuccessAt
        ? `Last InsiderWatch success: ${lastSuccessAt}`
        : `No prior InsiderWatch sync — using ${config.insiderwatchInitialDays}-day lookback (Kadoa history kept)`,
    );
    console.log(
      `Overlap days: ${config.insiderwatchOverlapDays} (filed_date filter)`,
    );
    console.log("");

    runId = await startSyncRun(supabase, provider, "manual");

    let loadResult;
    try {
      loadResult = await loadInsiderWatchStockTrades({
        lastSuccessAt,
        overlapDays: config.insiderwatchOverlapDays,
        initialLookbackDays: config.insiderwatchInitialDays,
      });
    } catch (downloadErr) {
      const message =
        downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
      console.error(`InsiderWatch download/parse failed: ${message}`);
      console.error("Existing Supabase data left untouched; last_success_at not advanced.");
      await finishSyncRunFailed(supabase, provider, runId, message);
      process.exitCode = 1;
      return;
    }

    const { trades, stats } = loadResult;
    console.log(
      `Upserting ${trades.length.toLocaleString("en-US")} stock trades…`,
    );
    const upsert = await upsertTrades(supabase, trades);

    printInsiderWatchStats(stats, {
      newCount: upsert.newCount,
      updatedCount: upsert.updatedCount,
      errors: upsert.errors,
    });

    if (upsert.errors > 0) {
      throw new Error(`Upsert completed with ${upsert.errors} chunk error(s)`);
    }

    // Advance sync timestamp only after a fully successful import.
    await finishSyncRunSuccess(supabase, provider, runId, {
      rowsReceived: stats.rowsDownloaded,
      rowsUpserted: upsert.newCount + upsert.updatedCount,
      latestDisclosure: stats.dateTo,
      latestTransaction: null,
      partialError: null,
    });

    console.log("Syncing missing stock price bars (Alpaca IEX)…");
    const prices = await syncPricesAfterTrades(supabase);
    console.log("STOCK PRICE DATA");
    console.log(`Status: ${prices.status}`);
    console.log(`Tickers checked: ${prices.tickersChecked}`);
    console.log(`Tickers updated: ${prices.tickersUpdated}`);
    console.log(`New daily bars: ${prices.newDailyBars}`);
    console.log(`Skipped unsupported assets: ${prices.skippedUnsupported}`);
    console.log(`Skipped (no Alpaca history): ${prices.skippedNoHistory}`);
    console.log(`Errors: ${prices.errors}`);
    console.log("");

    console.log("Recomputing member holdings…");
    const holdings = await syncHoldingsAfterTrades(supabase);
    console.log("MEMBER HOLDINGS");
    if (holdings) {
      console.log(`Members with positions: ${holdings.members}`);
      console.log(`Open positions: ${holdings.positions}`);
    } else {
      console.log("Status: FAILED");
    }
    console.log("");

    console.log("Fetching GDELT finance news…");
    const news = await syncGdeltNews(supabase);
    console.log("NEWS");
    if (news.status === "SUCCESS") {
      console.log(`GDELT articles fetched: ${news.fetched}`);
      console.log(`Off-allowlist sources skipped: ${news.filteredBySource}`);
      console.log(`New articles stored: ${news.inserted}`);
      console.log(`Duplicates skipped: ${news.duplicatesSkipped}`);
      console.log(
        `NAICS sector labels: ${news.sectorStatus} (${news.sectorsLabeled} titled)`,
      );
      console.log(`News older than 3 days deleted: ${news.pruned}`);
      console.log(
        `Ticker move checks: ${news.tickerMovesStatus} (checked=${news.tickerMovesChecked}, upserted=${news.tickerMovesUpserted}, abnormal=${news.tickerMovesAbnormal})`,
      );
      if (news.sectorStatus === "FAILED" && news.error) {
        console.log(`Sector note: ${news.error}`);
      }
      if (news.tickerMovesStatus === "FAILED" && news.error) {
        console.log(`Ticker move note: ${news.error}`);
      }
    } else {
      console.log("Status: FAILED");
      if (news.error) console.log(`Error: ${news.error}`);
      console.log(
        `GDELT articles fetched: ${news.fetched} (Congress/prices left unchanged)`,
      );
    }
    console.log("");

    console.log("========================================");
    console.log("UPDATE SUMMARY");
    console.log("========================================");
    console.log("Congress updates: SUCCESS");
    console.log(
      `Stock prices: ${prices.status === "FAILED" ? "FAILED" : "SUCCESS"}`,
    );
    console.log(`GDELT news: ${news.status}`);
    console.log("========================================");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`UPDATE FAILED: ${message}`);
    if (supabase && runId) {
      try {
        await finishSyncRunFailed(supabase, provider, runId, message);
      } catch (finishErr) {
        console.error(
          `Also failed to record sync failure: ${
            finishErr instanceof Error ? finishErr.message : String(finishErr)
          }`,
        );
      }
    }
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("update.ts") ||
    process.argv[1].endsWith("update.js"));

if (isDirectRun) {
  void main();
}
