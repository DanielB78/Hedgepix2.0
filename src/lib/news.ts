import { createBrowserSupabase, hasPublicSupabaseConfig } from "@/lib/supabase";

export type NewsSectorMatch = {
  code: string;
  name: string;
  score: number | null;
};

export type NewsArticle = {
  id: string;
  source: string;
  title: string;
  url: string;
  published_at: string | null;
  domain: string | null;
  image_url: string | null;
  language: string | null;
  gdelt_id: string | null;
  source_hash: string;
  created_at: string;
  sector: string | null;
  sector_score: number | null;
  sector_1: string | null;
  sector_1_code: string | null;
  sector_1_score: number | null;
  sector_2: string | null;
  sector_2_code: string | null;
  sector_2_score: number | null;
  sector_3: string | null;
  sector_3_code: string | null;
  sector_3_score: number | null;
};

export type NewsFeedResult = {
  configured: boolean;
  error: string | null;
  articles: NewsArticle[];
};

const NEWS_LIMIT = 40;

const SELECT_COLUMNS_NAICS =
  "id, source, title, url, published_at, domain, image_url, language, gdelt_id, source_hash, created_at, sector, sector_score, sector_1, sector_1_code, sector_1_score, sector_2, sector_2_code, sector_2_score, sector_3, sector_3_code, sector_3_score";

const SELECT_COLUMNS_LEGACY =
  "id, source, title, url, published_at, domain, image_url, language, gdelt_id, source_hash, created_at, sector, sector_score";

export function articleSectorMatches(article: NewsArticle): NewsSectorMatch[] {
  const rows: Array<[string | null, string | null, number | null]> = [
    [article.sector_1_code, article.sector_1, article.sector_1_score],
    [article.sector_2_code, article.sector_2, article.sector_2_score],
    [article.sector_3_code, article.sector_3, article.sector_3_score],
  ];
  const out: NewsSectorMatch[] = [];
  for (const [code, name, score] of rows) {
    const c = code?.trim() || "";
    const n = name?.trim() || "";
    if (!c && !n) continue;
    out.push({
      code: c || n,
      name: n || c,
      score: typeof score === "number" && Number.isFinite(score) ? score : null,
    });
  }
  if (out.length === 0 && article.sector?.trim()) {
    out.push({
      code: article.sector.trim(),
      name: article.sector.trim(),
      score:
        typeof article.sector_score === "number" &&
        Number.isFinite(article.sector_score)
          ? article.sector_score
          : null,
    });
  }
  return out;
}

/** True if `sectorCode` appears anywhere in the article's top-3 matches. */
export function articleMatchesSector(
  article: NewsArticle,
  sectorCode: string,
): boolean {
  const needle = sectorCode.trim();
  if (!needle) return true;
  return articleSectorMatches(article).some((m) => m.code === needle);
}

export function collectSectorOptions(
  articles: NewsArticle[],
): Array<{ code: string; name: string }> {
  const byCode = new Map<string, string>();
  for (const article of articles) {
    for (const match of articleSectorMatches(article)) {
      if (!match.code) continue;
      if (!byCode.has(match.code)) {
        byCode.set(match.code, match.name);
      }
    }
  }
  return [...byCode.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}

export async function fetchRecentNewsArticles(
  limit = NEWS_LIMIT,
): Promise<NewsFeedResult> {
  if (!hasPublicSupabaseConfig()) {
    return {
      configured: false,
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
      articles: [],
    };
  }

  try {
    const supabase = createBrowserSupabase();
    let { data, error } = await supabase
      .from("news_articles")
      .select(SELECT_COLUMNS_NAICS)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    // Before the NAICS migration is applied, fall back to legacy columns.
    if (
      error &&
      (error.message.includes("sector_1") ||
        error.message.includes("schema cache"))
    ) {
      ({ data, error } = await supabase
        .from("news_articles")
        .select(SELECT_COLUMNS_LEGACY)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limit));
    }

    if (error) {
      return {
        configured: true,
        error: error.message,
        articles: [],
      };
    }

    const articles = (data ?? []).map((row) => ({
      sector_1: null,
      sector_1_code: null,
      sector_1_score: null,
      sector_2: null,
      sector_2_code: null,
      sector_2_score: null,
      sector_3: null,
      sector_3_code: null,
      sector_3_score: null,
      ...row,
    })) as NewsArticle[];

    return {
      configured: true,
      error: null,
      articles,
    };
  } catch (err) {
    return {
      configured: true,
      error: err instanceof Error ? err.message : String(err),
      articles: [],
    };
  }
}

export function formatNewsPublishedAt(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
