/**
 * Centralized Feed scoring — buyer/ticker sector-overlap first.
 * Distinct multi-buyer clustering is context-only (near-zero weight).
 */

export const FEED_WEIGHTS = {
  // ── Highest: overlap strength (applied once per buyer/ticker) ──
  /** Direct exact industry-label match. */
  overlapDirect: 28,
  /** Semantic similarity ≥ 0.95. */
  overlapSemanticVeryHigh: 22,
  /** Semantic similarity 0.90–0.949. */
  overlapSemanticHigh: 16,
  /** Semantic similarity 0.85–0.899 (at/above configured threshold). */
  overlapSemanticModerate: 10,

  // ── Highest: same buyer repeated conviction ──
  /** Per additional buy beyond the first (same buyer+ticker). */
  repeatBuySamePerson: 6,
  /** Per consecutive-streak step beyond 1 (capped). */
  consecutiveStreakStep: 4,
  /** Per later buy at a lower reference market price. */
  averagingDownStep: 7,
  /** Per percentage point of decline from first→latest buy price. */
  declineSinceFirstBuy: 0.25,

  // ── High: weakness / size ──
  /** Per % point of relative underperformance vs sector (pref) or market. */
  relativeWeakness: 0.35,
  /** Per buy that occurred during a prior 20D downtrend. */
  downtrendBuy: 2.5,
  /** Flat when ticker current 20D return < 0. */
  currentDowntrend: 4,
  /** Per purchase with person size_ratio ≥ threshold. */
  unusuallyLargeBuy: 5,

  // ── Medium ──
  /** Average recency weight (0–1) × this. */
  recency: 8,
  /** (activity_ratio - 1) when > 1, capped. */
  unusualActivity: 2,

  // ── Insider path (no congressional overlap) ──
  /** Base for insider with ≥2 buys of same ticker. */
  insiderRepeatBase: 8,
  /** Small bonus for CEO/CFO/director title keywords. */
  insiderSeniorRole: 3,

  // ── Context only (must stay tiny) ──
  /** Near-zero so unrelated buyers cannot dominate. */
  distinctBuyerContext: 0.15,
} as const;

/** Soft caps on countable inputs before multiplying by weights. */
export const FEED_CAPS = {
  repeatBuySamePerson: 6,
  consecutiveStreakStep: 5,
  averagingDownStep: 5,
  declineSinceFirstBuyPct: 40,
  relativeWeaknessPct: 30,
  downtrendBuy: 6,
  unusuallyLargeBuy: 3,
  unusualActivityExcess: 4,
} as const;

/**
 * How buyer_ticker scores combine into a ticker score.
 * best = 100%, second = 40%, each additional capped contributor = 20%.
 */
export const FEED_TICKER_AGGREGATION = {
  bestWeight: 1.0,
  secondWeight: 0.4,
  additionalWeight: 0.2,
  /** Max additional buyers beyond best+second that contribute. */
  maxAdditional: 3,
  /** Minimum buyer_ticker score to count as an “additional strong” contributor. */
  additionalMinScore: 12,
} as const;

/** Semantic overlap similarity bands (inclusive lower bounds). */
export const FEED_OVERLAP_SIMILARITY_BANDS = {
  veryHigh: 0.95,
  high: 0.9,
  moderate: 0.85,
} as const;

export const FEED_UNUSUAL_SIZE_RATIO = 2.0;
export const FEED_ACTIVITY_BASELINE_FLOOR = 0.25;
export const FEED_TREND_TRADING_DAYS = 20;
export const FEED_STREAK_LOOKBACK_DAYS = 90;
export const FEED_HISTORY_LOOKBACK_DAYS = 730;

/**
 * Minimum buy occasions on a ticker for non-overlap (e.g. insider) patterns.
 * Overlap buyer/ticker pairs can surface with a single qualifying buy.
 */
export const FEED_MIN_BUY_OCCASIONS_NO_OVERLAP = 2;

export const FEED_RECENCY_DECAY: Array<{ maxAgeDays: number; weight: number }> =
  [
    { maxAgeDays: 7, weight: 1.0 },
    { maxAgeDays: 30, weight: 0.8 },
    { maxAgeDays: 90, weight: 0.5 },
    { maxAgeDays: Number.POSITIVE_INFINITY, weight: 0.25 },
  ];

export const MARKET_BENCHMARK_TICKERS = ["SPY", "QQQ"] as const;

export const SECTOR_BENCHMARK_ETFS: Record<string, string> = {
  Technology: "XLK",
  Financials: "XLF",
  Healthcare: "XLV",
  Energy: "XLE",
  Industrials: "XLI",
  Consumer: "XLY",
  "Communication / Media": "XLC",
  "Real Estate": "XLRE",
  Materials: "XLB",
  Utilities: "XLU",
};

export type FeedWeightKey = keyof typeof FEED_WEIGHTS;

export function recencyWeight(ageDays: number): number {
  for (const band of FEED_RECENCY_DECAY) {
    if (ageDays <= band.maxAgeDays) return band.weight;
  }
  return 0.25;
}

export function capCount(n: number, max: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max);
}

/** Map stored overlap to a base weight. */
export function overlapStrengthWeight(input: {
  hasOverlap: boolean;
  matchType: "direct" | "semantic" | "embedding" | null;
  similarity: number | null;
}): { weight: number; band: "direct" | "very_high" | "high" | "moderate" | "none" } {
  if (!input.hasOverlap) return { weight: 0, band: "none" };
  if (input.matchType === "direct") {
    return { weight: FEED_WEIGHTS.overlapDirect, band: "direct" };
  }
  const sim = input.similarity;
  if (sim != null && sim >= FEED_OVERLAP_SIMILARITY_BANDS.veryHigh) {
    return {
      weight: FEED_WEIGHTS.overlapSemanticVeryHigh,
      band: "very_high",
    };
  }
  if (sim != null && sim >= FEED_OVERLAP_SIMILARITY_BANDS.high) {
    return { weight: FEED_WEIGHTS.overlapSemanticHigh, band: "high" };
  }
  if (
    sim == null ||
    sim >= FEED_OVERLAP_SIMILARITY_BANDS.moderate ||
    input.matchType === "semantic" ||
    input.matchType === "embedding"
  ) {
    return {
      weight: FEED_WEIGHTS.overlapSemanticModerate,
      band: "moderate",
    };
  }
  return { weight: 0, band: "none" };
}
