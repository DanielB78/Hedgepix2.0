/**
 * Member industry labels ↔ ticker industry labels overlap detection.
 *
 * Stage 1: normalized exact match
 * Stage 2: BGE cosine similarity >= 0.95 (precomputed embeddings)
 *
 * policy_topics are never used for matching.
 */

export type SectorOverlapMatchType = "direct" | "embedding";

export type SectorOverlapResult = {
  has_sector_overlap: boolean;
  match_type: SectorOverlapMatchType | null;
  member_label: string | null;
  ticker_label: string | null;
  similarity: number | null;
};

export const SECTOR_OVERLAP_THRESHOLD = 0.95;
export const SECTOR_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5";

export function normalizeSectorLabel(label: string | null | undefined): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function emptySectorOverlap(): SectorOverlapResult {
  return {
    has_sector_overlap: false,
    match_type: null,
    member_label: null,
    ticker_label: null,
    similarity: null,
  };
}

export function detectSectorOverlap(
  memberLabels: string[],
  tickerLabels: string[],
  embeddingByNorm?: Map<string, Float32Array | number[]>,
): SectorOverlapResult {
  const members = [
    ...new Set(memberLabels.map((l) => l.trim()).filter(Boolean)),
  ];
  const tickers = [
    ...new Set(tickerLabels.map((l) => l.trim()).filter(Boolean)),
  ];

  if (members.length === 0 || tickers.length === 0) {
    return emptySectorOverlap();
  }

  // Stage 1 — direct normalized match
  const tickerNorm = new Map<string, string>();
  for (const t of tickers) {
    tickerNorm.set(normalizeSectorLabel(t), t);
  }
  for (const m of members) {
    const hit = tickerNorm.get(normalizeSectorLabel(m));
    if (hit) {
      return {
        has_sector_overlap: true,
        match_type: "direct",
        member_label: m,
        ticker_label: hit,
        similarity: 1,
      };
    }
  }

  // Stage 2 — embedding cosine (only when no direct match)
  if (!embeddingByNorm || embeddingByNorm.size === 0) {
    return emptySectorOverlap();
  }

  let bestScore = -1;
  let bestPair: { m: string; t: string; score: number } | null = null;
  for (const m of members) {
    const mv = embeddingByNorm.get(normalizeSectorLabel(m));
    if (!mv) continue;
    for (const t of tickers) {
      const tv = embeddingByNorm.get(normalizeSectorLabel(t));
      if (!tv) continue;
      const score = cosineSimilarity(mv, tv);
      if (score > bestScore) {
        bestScore = score;
        bestPair = { m, t, score };
      }
    }
  }

  if (!bestPair || bestPair.score < SECTOR_OVERLAP_THRESHOLD) {
    return emptySectorOverlap();
  }

  return {
    has_sector_overlap: true,
    match_type: "embedding",
    member_label: bestPair.m,
    ticker_label: bestPair.t,
    similarity: bestPair.score,
  };
}

export function cosineSimilarity(
  a: Float32Array | number[],
  b: Float32Array | number[],
): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na <= 0 || nb <= 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
