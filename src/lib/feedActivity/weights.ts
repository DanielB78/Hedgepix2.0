/**
 * Tunable Feed ranking weights — keep in one place.
 */

export const FEED_WEIGHTS = {
  /** Per qualifying buy occasion (same person+ticker+tx date = 1). */
  buyOccasion: 1,
  /** Per person with 2+ buy occasions in the window. */
  repeatBuyer: 2,
  /** Per distinct congressional buyer with sector overlap. */
  overlapBuyer: 3,
  /** Per buy occasion that occurred during a prior 20D downtrend. */
  downtrendBuy: 1,
  /** Flat bonus when the ticker's current 20D return is negative. */
  currentDowntrend: 3,
} as const;

export type FeedWeightKey = keyof typeof FEED_WEIGHTS;

/** Trading-day window for current / pre-trade trend. */
export const FEED_TREND_TRADING_DAYS = 20;

/** Extra history beyond the selected disclosure window for buy-streak continuity. */
export const FEED_STREAK_LOOKBACK_DAYS = 90;

/** Minimum buy occasions for a ticker to appear in Feed. */
export const FEED_MIN_BUY_OCCASIONS = 2;
