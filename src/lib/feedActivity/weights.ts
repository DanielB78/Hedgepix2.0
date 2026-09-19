/**
 * Centralized Feed scoring config — weights, caps, thresholds, recency decay.
 * Do not scatter magic numbers elsewhere.
 */

export const FEED_WEIGHTS = {
  /** Capped contribution from buy occasions (scaled down so distinct buyers matter more). */
  buyOccasion: 0.5,
  /** Per distinct buyer. */
  distinctBuyer: 3,
  /** Per person with 2+ buy occasions in the window. */
  repeatBuyer: 2.5,
  /** Bonus for max consecutive buy streak (capped). */
  consecutiveStreak: 1,
  /** Per distinct congressional sector-overlap buyer. */
  overlapBuyer: 4,
  /** Per buy that occurred during a prior 20D downtrend (capped). */
  downtrendBuy: 0.75,
  /** Flat bonus when ticker current 20D return < 0. */
  currentDowntrend: 3,
  /** Per distinct buyer in last 14 days. */
  buyerCluster14d: 2,
  /** Per distinct buyer in last 30 days. */
  buyerCluster30d: 1.25,
  /** Per purchase with person-level size_ratio >= threshold. */
  unusuallyLargeBuy: 1.5,
  /** Per buyer who averaged down (latest buy price < prior buy price). */
  averagingDownBuyer: 2.5,
  /** Per percentage point of relative underperformance vs sector (or market). */
  relativeWeakness: 0.2,
  /** Multiplier on capped activity_ratio above 1. */
  unusualActivity: 2.5,
  /** Bonus from average recency weight of qualifying buys (0–1 scale × weight). */
  recency: 4,
  /** Per additional independent source type beyond the first. */
  crossSource: 2.5,
} as const;

/** Soft caps so one raw count cannot dominate. */
export const FEED_CAPS = {
  buyOccasion: 10,
  distinctBuyer: 8,
  repeatBuyer: 6,
  consecutiveStreak: 6,
  overlapBuyer: 6,
  downtrendBuy: 10,
  buyerCluster14d: 6,
  buyerCluster30d: 8,
  unusuallyLargeBuy: 5,
  averagingDownBuyer: 5,
  /** Max % points of relative weakness credited. */
  relativeWeaknessPct: 25,
  /** Max activity_ratio credited. */
  activityRatio: 6,
  crossSourceExtra: 2,
} as const;

/** Person trade-size ratio threshold for “unusually large”. */
export const FEED_UNUSUAL_SIZE_RATIO = 2.0;

/** Floor for historical activity baseline (avoids /0 and absurd ratios). */
export const FEED_ACTIVITY_BASELINE_FLOOR = 0.25;

/** Trading-day window for current / pre-trade / relative trend. */
export const FEED_TREND_TRADING_DAYS = 20;

/** Extra history beyond the selected disclosure window for buy-streak continuity. */
export const FEED_STREAK_LOOKBACK_DAYS = 90;

/** Extra history used for person size medians + ticker activity baselines. */
export const FEED_HISTORY_LOOKBACK_DAYS = 730;

/** Minimum buy occasions for a ticker to appear in Feed. */
export const FEED_MIN_BUY_OCCASIONS = 2;

/**
 * Recency decay by disclosure age (days).
 * Applied inside the selected Feed window only.
 */
export const FEED_RECENCY_DECAY: Array<{ maxAgeDays: number; weight: number }> =
  [
    { maxAgeDays: 7, weight: 1.0 },
    { maxAgeDays: 30, weight: 0.8 },
    { maxAgeDays: 90, weight: 0.5 },
    { maxAgeDays: Number.POSITIVE_INFINITY, weight: 0.25 },
  ];

export const MARKET_BENCHMARK_TICKERS = ["SPY", "QQQ"] as const;

/** General sector → sector ETF when bars exist; else cross-sectional sector proxy. */
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
