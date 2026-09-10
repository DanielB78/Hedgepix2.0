import { createBrowserSupabase, hasPublicSupabaseConfig } from "@/lib/supabase";

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
};

export type NewsFeedResult = {
  configured: boolean;
  error: string | null;
  articles: NewsArticle[];
};

const NEWS_LIMIT = 10;

const SELECT_COLUMNS =
  "id, source, title, url, published_at, domain, image_url, language, gdelt_id, source_hash, created_at";

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
    const { data, error } = await supabase
      .from("news_articles")
      .select(SELECT_COLUMNS)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      return {
        configured: true,
        error: error.message,
        articles: [],
      };
    }

    return {
      configured: true,
      error: null,
      articles: (data ?? []) as NewsArticle[],
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
