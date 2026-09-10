import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedNewsArticle } from "../news/gdelt.js";

export type NewsUpsertStats = {
  fetched: number;
  inserted: number;
  duplicatesSkipped: number;
  errors: number;
  errorMessages: string[];
};

function toRow(article: NormalizedNewsArticle) {
  return {
    source: article.source,
    title: article.title,
    url: article.url,
    published_at: article.published_at,
    domain: article.domain,
    image_url: article.image_url,
    language: article.language,
    gdelt_id: article.gdelt_id,
    source_hash: article.source_hash,
    raw_source: article.raw_source,
  };
}

export async function upsertNewsArticles(
  supabase: SupabaseClient,
  articles: NormalizedNewsArticle[],
): Promise<NewsUpsertStats> {
  const stats: NewsUpsertStats = {
    fetched: articles.length,
    inserted: 0,
    duplicatesSkipped: 0,
    errors: 0,
    errorMessages: [],
  };
  if (articles.length === 0) return stats;

  const hashes = articles.map((a) => a.source_hash);
  const existing = new Set<string>();
  const chunkSize = 100;
  for (let i = 0; i < hashes.length; i += chunkSize) {
    const slice = hashes.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("news_articles")
      .select("source_hash")
      .in("source_hash", slice);
    if (error) {
      stats.errors += 1;
      stats.errorMessages.push(error.message);
      return stats;
    }
    for (const row of data ?? []) {
      existing.add(String(row.source_hash));
    }
  }

  const fresh = articles.filter((a) => !existing.has(a.source_hash));
  stats.duplicatesSkipped = articles.length - fresh.length;

  for (let i = 0; i < fresh.length; i += 50) {
    const slice = fresh.slice(i, i + 50).map(toRow);
    const { error } = await supabase
      .from("news_articles")
      .upsert(slice, { onConflict: "source_hash", ignoreDuplicates: true });
    if (error) {
      stats.errors += 1;
      stats.errorMessages.push(error.message);
      continue;
    }
    stats.inserted += slice.length;
  }

  return stats;
}
