import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAlpacaHourlyBars,
  type AlpacaHourlyBar,
} from "../news/alpacaHourlyBars.js";
import {
  ABNORMAL_MOVE_MULTIPLIER,
  BASELINE_LOOKBACK_DAYS,
  EVENT_WINDOW_MAX_MS,
  evaluateTickerMove,
} from "../news/abnormalMoves.js";
import {
  articleNaicsCodes,
  loadSp500NaicsMapping,
  tickersForNaicsCodes,
} from "../news/sp500NaicsMapping.js";

export type TickerMoveRow = {
  article_id: string;
  ticker: string;
  matched_naics_codes: string[];
  window_start: string;
  window_end: string;
  window_hours: number;
  start_price: number | null;
  end_price: number | null;
  event_return_pct: number | null;
  historical_typical_move_pct: number | null;
  abnormality_ratio: number | null;
  is_abnormal: boolean;
  checked_at: string;
  updated_at: string;
};

export type TickerMoveCheckStats = {
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  /** Alias fields expected by update.ts */
  tickerChecks: number;
  upserted: number;
  abnormalFlags: number;
  articlesConsidered: number;
  articlesChecked: number;
  skippedComplete: number;
  skippedNoSector: number;
  skippedNoTickers: number;
  skippedNoPrices: number;
  error: string | null;
  multiplier: number;
};

type ArticleRow = {
  id: string;
  published_at: string | null;
  sector_1_code: string | null;
  sector_2_code: string | null;
  sector_3_code: string | null;
};

function readAlpacaCreds(): { apiKey: string; apiSecret: string } | null {
  const apiKey = process.env.ALPACA_API_KEY?.trim();
  const apiSecret = process.env.ALPACA_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

export async function listArticlesForMoveCheck(
  supabase: SupabaseClient,
  now = new Date(),
): Promise<ArticleRow[]> {
  const lookbackMs = EVENT_WINDOW_MAX_MS + 2 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - lookbackMs).toISOString();
  const { data, error } = await supabase
    .from("news_articles")
    .select("id, published_at, sector_1_code, sector_2_code, sector_3_code")
    .gte("published_at", cutoff)
    .order("published_at", { ascending: false });
  if (error) {
    throw new Error(`listArticlesForMoveCheck: ${error.message}`);
  }
  return (data ?? []) as ArticleRow[];
}

async function loadCompletedPairs(
  supabase: SupabaseClient,
  articleIds: string[],
): Promise<Set<string>> {
  const completed = new Set<string>();
  if (articleIds.length === 0) return completed;
  for (let i = 0; i < articleIds.length; i += 100) {
    const slice = articleIds.slice(i, i + 100);
    const { data, error } = await supabase
      .from("news_article_ticker_moves")
      .select("article_id, ticker, window_start, window_end")
      .in("article_id", slice);
    if (error) {
      throw new Error(`loadCompletedPairs: ${error.message}`);
    }
    for (const row of data ?? []) {
      const start = Date.parse(String(row.window_start));
      const end = Date.parse(String(row.window_end));
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (end - start >= EVENT_WINDOW_MAX_MS - 60_000) {
        completed.add(`${row.article_id}::${String(row.ticker).toUpperCase()}`);
      }
    }
  }
  return completed;
}

async function upsertMoveRows(
  supabase: SupabaseClient,
  rows: TickerMoveRow[],
): Promise<{ upserted: number; error: string | null }> {
  if (rows.length === 0) return { upserted: 0, error: null };
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const slice = rows.slice(i, i + 50);
    const { error } = await supabase
      .from("news_article_ticker_moves")
      .upsert(slice, { onConflict: "article_id,ticker" });
    if (error) return { upserted, error: error.message };
    upserted += slice.length;
  }
  return { upserted, error: null };
}

/**
 * News → top-3 NAICS → S&P 500 tickers → abnormal move check (≤24h window).
 * Re-checks upsert the same (article_id, ticker) row until the window completes.
 */
export async function checkNewsTickerAbnormalMoves(
  supabase: SupabaseClient,
  opts?: { now?: Date; multiplier?: number },
): Promise<TickerMoveCheckStats> {
  const now = opts?.now ?? new Date();
  const multiplier = opts?.multiplier ?? ABNORMAL_MOVE_MULTIPLIER;

  const empty = (
    partial: Partial<TickerMoveCheckStats>,
  ): TickerMoveCheckStats => ({
    status: "SKIPPED",
    tickerChecks: 0,
    upserted: 0,
    abnormalFlags: 0,
    articlesConsidered: 0,
    articlesChecked: 0,
    skippedComplete: 0,
    skippedNoSector: 0,
    skippedNoTickers: 0,
    skippedNoPrices: 0,
    error: null,
    multiplier,
    ...partial,
  });

  const creds = readAlpacaCreds();
  if (!creds) {
    return empty({
      status: "SKIPPED",
      error: "Missing ALPACA_API_KEY / ALPACA_API_SECRET",
    });
  }

  let articles: ArticleRow[];
  try {
    articles = await listArticlesForMoveCheck(supabase, now);
  } catch (err) {
    return empty({
      status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const stats = empty({
    status: "SUCCESS",
    articlesConsidered: articles.length,
  });
  if (articles.length === 0) return stats;

  const mapping = loadSp500NaicsMapping();
  type WorkItem = {
    article: ArticleRow;
    publishedAt: Date;
    ticker: string;
    matchedCodes: string[];
  };
  const work: WorkItem[] = [];
  const tickerSet = new Set<string>();

  let completedPairs: Set<string>;
  try {
    completedPairs = await loadCompletedPairs(
      supabase,
      articles.map((a) => a.id),
    );
  } catch (err) {
    return empty({
      status: "FAILED",
      articlesConsidered: articles.length,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const checkedArticleIds = new Set<string>();

  for (const article of articles) {
    if (!article.published_at) continue;
    const publishedAt = new Date(article.published_at);
    if (Number.isNaN(publishedAt.getTime())) continue;

    const windowEnded =
      now.getTime() >= publishedAt.getTime() + EVENT_WINDOW_MAX_MS;

    const codes = articleNaicsCodes(article);
    if (codes.length === 0) {
      stats.skippedNoSector += 1;
      continue;
    }

    const tickerMap = tickersForNaicsCodes(codes, mapping);
    if (tickerMap.size === 0) {
      stats.skippedNoTickers += 1;
      continue;
    }

    let anyPending = false;
    for (const [ticker, matchedCodes] of tickerMap) {
      const key = `${article.id}::${ticker}`;
      if (windowEnded && completedPairs.has(key)) {
        stats.skippedComplete += 1;
        continue;
      }
      anyPending = true;
      work.push({ article, publishedAt, ticker, matchedCodes });
      tickerSet.add(ticker);
    }
    if (anyPending) checkedArticleIds.add(article.id);
  }

  stats.articlesChecked = checkedArticleIds.size;
  stats.tickerChecks = work.length;
  if (work.length === 0) return stats;

  const barStart = new Date(
    now.getTime() -
      (BASELINE_LOOKBACK_DAYS + 2) * 24 * 60 * 60 * 1000 -
      EVENT_WINDOW_MAX_MS,
  );

  let barsByTicker: Map<string, AlpacaHourlyBar[]>;
  try {
    barsByTicker = await fetchAlpacaHourlyBars(
      [...tickerSet],
      barStart,
      now,
      creds,
    );
  } catch (err) {
    return {
      ...stats,
      status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const checkedAt = now.toISOString();
  const rows: TickerMoveRow[] = [];

  for (const item of work) {
    const bars = barsByTicker.get(item.ticker) ?? [];
    const result = evaluateTickerMove(
      bars,
      item.publishedAt,
      now,
      multiplier,
    );
    if (!result.measurement) {
      stats.skippedNoPrices += 1;
      continue;
    }
    const { window, measurement, assessment } = result;
    if (assessment.isAbnormal) stats.abnormalFlags += 1;
    rows.push({
      article_id: item.article.id,
      ticker: item.ticker,
      matched_naics_codes: item.matchedCodes,
      window_start: window.windowStart.toISOString(),
      window_end: window.windowEnd.toISOString(),
      window_hours: window.windowHours,
      start_price: measurement.startPrice,
      end_price: measurement.endPrice,
      event_return_pct: measurement.eventReturnPct,
      historical_typical_move_pct: assessment.historicalTypicalMovePct,
      abnormality_ratio: assessment.abnormalityRatio,
      is_abnormal: assessment.isAbnormal,
      checked_at: checkedAt,
      updated_at: checkedAt,
    });
  }

  const upsert = await upsertMoveRows(supabase, rows);
  stats.upserted = upsert.upserted;
  if (upsert.error) {
    stats.status = "FAILED";
    stats.error = upsert.error;
  }
  return stats;
}
