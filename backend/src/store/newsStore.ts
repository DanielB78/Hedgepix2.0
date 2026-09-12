import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedNewsArticle } from "../news/gdelt.js";

export type NewsUpsertStats = {
  fetched: number;
  inserted: number;
  duplicatesSkipped: number;
  errors: number;
  errorMessages: string[];
};

export type NewsRetentionStats = {
  deleted: number;
  error: string | null;
};

function matchAt(
  article: NormalizedNewsArticle,
  index: 0 | 1 | 2,
): { name: string | null; code: string | null; score: number | null } {
  const m = article.sectors?.[index];
  if (!m) {
    if (index === 0 && article.sector) {
      return {
        name: article.sector,
        code: article.sector_code ?? null,
        score:
          typeof article.sector_score === "number" &&
          Number.isFinite(article.sector_score)
            ? article.sector_score
            : null,
      };
    }
    return { name: null, code: null, score: null };
  }
  return {
    name: m.name || null,
    code: m.code || null,
    score:
      typeof m.score === "number" && Number.isFinite(m.score) ? m.score : null,
  };
}

function toRow(article: NormalizedNewsArticle) {
  const s1 = matchAt(article, 0);
  const s2 = matchAt(article, 1);
  const s3 = matchAt(article, 2);
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
    // Legacy + rank-1 mirror
    sector: s1.name,
    sector_score: s1.score,
    sector_1: s1.name,
    sector_1_code: s1.code,
    sector_1_score: s1.score,
    sector_2: s2.name,
    sector_2_code: s2.code,
    sector_2_score: s2.score,
    sector_3: s3.name,
    sector_3_code: s3.code,
    sector_3_score: s3.score,
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
    let { error } = await supabase
      .from("news_articles")
      .upsert(slice, { onConflict: "source_hash", ignoreDuplicates: true });

    // If NAICS columns are not migrated yet, retry with legacy sector fields only.
    if (
      error &&
      (error.message.includes("sector_1") ||
        error.message.includes("schema cache"))
    ) {
      const legacy = slice.map((row) => ({
        source: row.source,
        title: row.title,
        url: row.url,
        published_at: row.published_at,
        domain: row.domain,
        image_url: row.image_url,
        language: row.language,
        gdelt_id: row.gdelt_id,
        source_hash: row.source_hash,
        raw_source: row.raw_source,
        sector: row.sector,
        sector_score: row.sector_score,
      }));
      ({ error } = await supabase
        .from("news_articles")
        .upsert(legacy, { onConflict: "source_hash", ignoreDuplicates: true }));
    }

    if (error) {
      stats.errors += 1;
      stats.errorMessages.push(error.message);
      continue;
    }
    stats.inserted += slice.length;
  }

  return stats;
}

/**
 * Delete news_articles older than `retentionDays` based on published_at.
 * Does not touch any other tables.
 */
export async function deleteNewsOlderThan(
  supabase: SupabaseClient,
  retentionDays = 3,
): Promise<NewsRetentionStats> {
  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("news_articles")
    .delete()
    .lt("published_at", cutoff)
    .select("id");
  if (error) {
    return { deleted: 0, error: error.message };
  }
  return { deleted: data?.length ?? 0, error: null };
}
