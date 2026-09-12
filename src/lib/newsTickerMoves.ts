import { createBrowserSupabase, hasPublicSupabaseConfig } from "@/lib/supabase";
import type { NewsArticle } from "@/lib/news";
import { articleSectorMatches } from "@/lib/news";

export type NewsTickerMove = {
  article_id: string;
  ticker: string;
  matched_naics_codes: string[];
  event_return_pct: number | null;
  historical_typical_move_pct: number | null;
  abnormality_ratio: number | null;
  is_abnormal: boolean;
  window_hours: number | null;
  checked_at: string | null;
};

export type TrendingSectorBlock = {
  code: string;
  name: string;
  /** Sum of abnormality ratios for abnormal moves attributed to this sector. */
  score: number;
  abnormalCount: number;
  topTickers: Array<{
    ticker: string;
    eventReturnPct: number | null;
    abnormalityRatio: number | null;
  }>;
  articles: Array<{
    article: NewsArticle;
    /** Best abnormal (or highest-ratio) move for this article in this sector. */
    highlight: NewsTickerMove | null;
  }>;
};

const MOVE_SELECT =
  "article_id, ticker, matched_naics_codes, event_return_pct, historical_typical_move_pct, abnormality_ratio, is_abnormal, window_hours, checked_at";

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeMove(row: Record<string, unknown>): NewsTickerMove {
  const codesRaw = row.matched_naics_codes;
  const codes = Array.isArray(codesRaw)
    ? codesRaw.map((c) => String(c).trim()).filter(Boolean)
    : [];
  return {
    article_id: String(row.article_id ?? ""),
    ticker: String(row.ticker ?? "").toUpperCase(),
    matched_naics_codes: codes,
    event_return_pct: asNullableNumber(row.event_return_pct),
    historical_typical_move_pct: asNullableNumber(
      row.historical_typical_move_pct,
    ),
    abnormality_ratio: asNullableNumber(row.abnormality_ratio),
    is_abnormal: Boolean(row.is_abnormal),
    window_hours: asNullableNumber(row.window_hours),
    checked_at:
      typeof row.checked_at === "string" ? row.checked_at : null,
  };
}

/**
 * Load ticker-move rows for the given article ids (chunked).
 * Returns [] when the table is missing or empty.
 */
export async function fetchNewsTickerMovesForArticles(
  articleIds: string[],
): Promise<NewsTickerMove[]> {
  if (!hasPublicSupabaseConfig() || articleIds.length === 0) return [];

  try {
    const supabase = createBrowserSupabase();
    const out: NewsTickerMove[] = [];
    const chunkSize = 100;
    for (let i = 0; i < articleIds.length; i += chunkSize) {
      const slice = articleIds.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("news_article_ticker_moves")
        .select(MOVE_SELECT)
        .in("article_id", slice);
      if (error) {
        // Table may not exist yet on older deploys.
        if (
          error.message.includes("news_article_ticker_moves") ||
          error.message.includes("schema cache")
        ) {
          return [];
        }
        throw new Error(error.message);
      }
      for (const row of data ?? []) {
        out.push(normalizeMove(row as Record<string, unknown>));
      }
    }
    return out;
  } catch {
    return [];
  }
}

function sectorNameLookup(articles: NewsArticle[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const article of articles) {
    for (const match of articleSectorMatches(article)) {
      if (!match.code) continue;
      if (!names.has(match.code)) names.set(match.code, match.name || match.code);
    }
  }
  return names;
}

function articleCodes(article: NewsArticle): Set<string> {
  return new Set(
    articleSectorMatches(article)
      .map((m) => m.code)
      .filter(Boolean),
  );
}

/**
 * Moves that link an article to a sector: sector is on the article's top-3
 * and also on the move's matched NAICS codes (ticker↔sector mapping).
 */
export function movesForArticleSector(
  article: NewsArticle,
  sectorCode: string,
  moves: NewsTickerMove[],
): NewsTickerMove[] {
  const codes = articleCodes(article);
  if (!codes.has(sectorCode)) return [];
  return moves.filter(
    (m) =>
      m.article_id === article.id &&
      m.matched_naics_codes.includes(sectorCode),
  );
}

function pickHighlight(moves: NewsTickerMove[]): NewsTickerMove | null {
  if (moves.length === 0) return null;
  const ranked = [...moves].sort((a, b) => {
    const ab = a.is_abnormal === b.is_abnormal ? 0 : a.is_abnormal ? -1 : 1;
    if (ab !== 0) return ab;
    return (b.abnormality_ratio ?? 0) - (a.abnormality_ratio ?? 0);
  });
  return ranked[0] ?? null;
}

/**
 * Build trending sector blocks: sectors ranked by abnormal ticker activity
 * among related S&P 500 tickers for loaded articles.
 */
export function buildTrendingSectorBlocks(
  articles: NewsArticle[],
  moves: NewsTickerMove[],
): TrendingSectorBlock[] {
  const names = sectorNameLookup(articles);
  const articlesById = new Map(articles.map((a) => [a.id, a]));

  // sector → articleId → moves
  const bySector = new Map<string, Map<string, NewsTickerMove[]>>();

  for (const move of moves) {
    const article = articlesById.get(move.article_id);
    if (!article) continue;
    const aCodes = articleCodes(article);
    for (const code of move.matched_naics_codes) {
      if (!aCodes.has(code)) continue;
      let articleMap = bySector.get(code);
      if (!articleMap) {
        articleMap = new Map();
        bySector.set(code, articleMap);
      }
      const list = articleMap.get(article.id) ?? [];
      list.push(move);
      articleMap.set(article.id, list);
    }
  }

  const blocks: TrendingSectorBlock[] = [];

  for (const [code, articleMap] of bySector) {
    let score = 0;
    let abnormalCount = 0;
    const tickerBest = new Map<
      string,
      { eventReturnPct: number | null; abnormalityRatio: number | null }
    >();

    const articleEntries: TrendingSectorBlock["articles"] = [];

    for (const [articleId, articleMoves] of articleMap) {
      const article = articlesById.get(articleId);
      if (!article) continue;
      for (const m of articleMoves) {
        if (m.is_abnormal) {
          abnormalCount += 1;
          score += m.abnormality_ratio ?? 0;
        } else if (m.abnormality_ratio != null) {
          // Soft signal so sectors with large-but-not-flagged moves still rank.
          score += Math.min(m.abnormality_ratio, 1) * 0.1;
        }
        const prev = tickerBest.get(m.ticker);
        if (
          !prev ||
          (m.abnormality_ratio ?? 0) > (prev.abnormalityRatio ?? 0)
        ) {
          tickerBest.set(m.ticker, {
            eventReturnPct: m.event_return_pct,
            abnormalityRatio: m.abnormality_ratio,
          });
        }
      }
      articleEntries.push({
        article,
        highlight: pickHighlight(articleMoves),
      });
    }

    // Trending is only for sectors with at least one abnormal ticker move.
    if (abnormalCount === 0) continue;

    articleEntries.sort((a, b) => {
      const ar = a.highlight?.abnormality_ratio ?? 0;
      const br = b.highlight?.abnormality_ratio ?? 0;
      const ab =
        (b.highlight?.is_abnormal ? 1 : 0) - (a.highlight?.is_abnormal ? 1 : 0);
      if (ab !== 0) return ab;
      return br - ar;
    });

    const topTickers = [...tickerBest.entries()]
      .map(([ticker, v]) => ({
        ticker,
        eventReturnPct: v.eventReturnPct,
        abnormalityRatio: v.abnormalityRatio,
      }))
      .sort(
        (a, b) => (b.abnormalityRatio ?? 0) - (a.abnormalityRatio ?? 0),
      )
      .slice(0, 4);

    blocks.push({
      code,
      name: names.get(code) ?? code,
      score,
      abnormalCount,
      topTickers,
      articles: articleEntries,
    });
  }

  blocks.sort((a, b) => {
    if (b.abnormalCount !== a.abnormalCount) {
      return b.abnormalCount - a.abnormalCount;
    }
    return b.score - a.score;
  });

  return blocks;
}

/** Articles matching any of the selected sector codes (union). */
export function filterArticlesBySectors(
  articles: NewsArticle[],
  sectorCodes: string[],
): NewsArticle[] {
  const selected = new Set(sectorCodes.map((c) => c.trim()).filter(Boolean));
  if (selected.size === 0) return articles;
  return articles.filter((article) =>
    articleSectorMatches(article).some((m) => selected.has(m.code)),
  );
}

export function formatReturnPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatAbnormalityRatio(
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}×`;
}
