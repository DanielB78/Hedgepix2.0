/**
 * Load congressional member industry labels and cached sector embeddings.
 * policy_topics are available but never used for sector-overlap matching.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createBrowserSupabase, hasPublicSupabaseConfig } from "./supabase";
import { getTickerIndustryLabel } from "./tickerIndustry";
import {
  SECTOR_EMBEDDING_MODEL,
  detectSectorOverlap,
  emptySectorOverlap,
  normalizeSectorLabel,
  type SectorOverlapResult,
} from "./sectorOverlap";

export type { SectorOverlapResult };

let embeddingsCache:
  | { modelId: string; byNorm: Map<string, Float32Array>; loadedAt: number }
  | null = null;

const EMBEDDINGS_TTL_MS = 10 * 60 * 1000;

function parseEmbedding(raw: unknown): Float32Array | null {
  if (!raw) return null;
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const n = Number(arr[i]);
    if (!Number.isFinite(n)) return null;
    out[i] = n;
  }
  return out;
}

function loadEmbeddingsFromFile(): Map<string, Float32Array> {
  const path = join(
    process.cwd(),
    "data/congress-sector/sector_label_embeddings.json",
  );
  if (!existsSync(path)) return new Map();
  try {
    const rows = JSON.parse(readFileSync(path, "utf8")) as Array<{
      normalized_label: string;
      embedding: number[];
      model_id?: string;
    }>;
    const map = new Map<string, Float32Array>();
    for (const row of rows) {
      if (row.model_id && row.model_id !== SECTOR_EMBEDDING_MODEL) continue;
      const vec = parseEmbedding(row.embedding);
      const key = normalizeSectorLabel(row.normalized_label);
      if (key && vec) map.set(key, vec);
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Cached BGE vectors keyed by normalized label. */
export async function loadSectorLabelEmbeddings(
  force = false,
): Promise<Map<string, Float32Array>> {
  if (
    !force &&
    embeddingsCache &&
    embeddingsCache.modelId === SECTOR_EMBEDDING_MODEL &&
    Date.now() - embeddingsCache.loadedAt < EMBEDDINGS_TTL_MS
  ) {
    return embeddingsCache.byNorm;
  }

  const byNorm = new Map<string, Float32Array>();

  if (hasPublicSupabaseConfig()) {
    try {
      const supabase = createBrowserSupabase();
      const pageSize = 1000;
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("sector_label_embeddings")
          .select("normalized_label, embedding, model_id")
          .eq("model_id", SECTOR_EMBEDDING_MODEL)
          .range(from, from + pageSize - 1);
        if (error) break;
        const rows = data ?? [];
        for (const row of rows) {
          const key = normalizeSectorLabel(row.normalized_label);
          const vec = parseEmbedding(row.embedding);
          if (key && vec) byNorm.set(key, vec);
        }
        if (rows.length < pageSize) break;
        from += pageSize;
      }
    } catch {
      // fall through to file
    }
  }

  if (byNorm.size === 0) {
    const fromFile = loadEmbeddingsFromFile();
    for (const [k, v] of fromFile) byNorm.set(k, v);
  }

  embeddingsCache = {
    modelId: SECTOR_EMBEDDING_MODEL,
    byNorm,
    loadedAt: Date.now(),
  };
  return byNorm;
}

/**
 * Resolve industry_labels for member slugs via congress_members + aliases.
 * Never returns policy_topics.
 */
export async function fetchMemberIndustryLabels(
  slugs: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const unique = [
    ...new Set(
      slugs.map((s) => s.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  if (unique.length === 0 || !hasPublicSupabaseConfig()) return out;

  const supabase = createBrowserSupabase();

  // Direct slug match on congress_members
  const { data: members } = await supabase
    .from("congress_members")
    .select("bioguide, member_slug")
    .in("member_slug", unique);

  const bioguideBySlug = new Map<string, string>();
  for (const row of members ?? []) {
    if (row.member_slug && row.bioguide) {
      bioguideBySlug.set(
        String(row.member_slug).toLowerCase(),
        String(row.bioguide),
      );
    }
  }

  // Alias table for fuzzy trade slugs
  const missing = unique.filter((s) => !bioguideBySlug.has(s));
  if (missing.length > 0) {
    const { data: aliases } = await supabase
      .from("congress_member_slug_aliases")
      .select("member_slug, bioguide")
      .in("member_slug", missing);
    for (const row of aliases ?? []) {
      if (row.member_slug && row.bioguide) {
        bioguideBySlug.set(
          String(row.member_slug).toLowerCase(),
          String(row.bioguide),
        );
      }
    }
  }

  const bioguides = [...new Set(bioguideBySlug.values())];
  if (bioguides.length === 0) return out;

  const labelsByBioguide = new Map<string, string[]>();
  const pageSize = 1000;
  // Fetch all labels for these bioguides (may be many rows)
  for (let i = 0; i < bioguides.length; i += 50) {
    const chunk = bioguides.slice(i, i + 50);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("congress_member_sector_labels")
        .select("bioguide, label")
        .in("bioguide", chunk)
        .range(from, from + pageSize - 1);
      if (error) break;
      const rows = data ?? [];
      for (const row of rows) {
        const bg = String(row.bioguide);
        const label = String(row.label ?? "").trim();
        if (!label) continue;
        const list = labelsByBioguide.get(bg) ?? [];
        list.push(label);
        labelsByBioguide.set(bg, list);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
  }

  for (const [slug, bioguide] of bioguideBySlug) {
    const labels = labelsByBioguide.get(bioguide) ?? [];
    out.set(slug, [...new Set(labels)].sort((a, b) => a.localeCompare(b)));
  }

  return out;
}

/** Curated ticker industry labels used for overlap (not broad sector buckets). */
export function tickerIndustryLabelsForOverlap(
  ticker: string | null | undefined,
): string[] {
  const row = getTickerIndustryLabel(ticker);
  if (!row) return [];
  const out: string[] = [];
  if (row.primary_industry?.trim()) out.push(row.primary_industry.trim());
  for (const label of row.industries ?? []) {
    if (label?.trim()) out.push(label.trim());
  }
  return [...new Set(out)];
}

export async function computeTradeSectorOverlaps(
  trades: Array<{
    id: string;
    member_slug: string | null;
    ticker: string | null;
  }>,
  memberLabels?: Map<string, string[]>,
): Promise<Record<string, SectorOverlapResult>> {
  const result: Record<string, SectorOverlapResult> = {};
  if (trades.length === 0) return result;

  const slugs = trades
    .map((t) => t.member_slug?.trim().toLowerCase() ?? "")
    .filter(Boolean);
  const labels =
    memberLabels ?? (await fetchMemberIndustryLabels(slugs));
  const embeddings = await loadSectorLabelEmbeddings();

  for (const trade of trades) {
    const slug = trade.member_slug?.trim().toLowerCase() ?? "";
    const member = slug ? labels.get(slug) ?? [] : [];
    const tickerLabels = tickerIndustryLabelsForOverlap(trade.ticker);
    const overlap = detectSectorOverlap(member, tickerLabels, embeddings);
    if (overlap.has_sector_overlap) {
      result[trade.id] = overlap;
    }
  }
  return result;
}

export function memberSectorsRecord(
  map: Map<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of map) out[k] = v;
  return out;
}

export { emptySectorOverlap, detectSectorOverlap, normalizeSectorLabel };
